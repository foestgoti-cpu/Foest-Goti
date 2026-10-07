import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CAMPOS_OBLIGATORIOS_PERFIL,
  esMenorDeEdad,
  type Paginado,
  type PaginacionQuery,
} from '@foest/shared';
import {
  AppError,
  auditar,
  logger,
  paginar,
  rangoSupabase,
  supabaseAdmin,
  supabaseAsUser,
  type EventoAuditoria,
  type UsuarioAutenticado,
} from '../../shared';
import { encolarNotificacion } from '../notificaciones';
import { env } from '../../config/env';
import type {
  ActualizarFuncionario,
  CambiarEstadoCuenta,
  CorregirDocumento,
  CrearFuncionario,
  ListarBeneficiariosQuery,
  ListarFuncionariosQuery,
  ListarHabeasDataQuery,
  PerfilBeneficiarioEntrada,
  ResolverHabeasData,
  SolicitudHabeasDataEntrada,
} from './accounts.dto';
import type {
  AcudienteFila,
  AdministradorCuenta,
  BeneficiarioCuenta,
  BeneficiarioFila,
  ConsentimientoFila,
  FuncionarioCuenta,
  FuncionarioDetalle,
  PendientesFuncionario,
  PerfilBeneficiario,
  SolicitudHabeasData,
  UsuarioFila,
} from './accounts.types';

/** Contexto de auditoria que el controlador toma de la peticion. */
export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const ESTADOS_NO_TERMINALES = ['PENDIENTE', 'EN_EVALUACION', 'EN_CORRECCION'] as const;
const ESTADOS_PENDIENTES_EVALUACION = ['PENDIENTE', 'EN_EVALUACION'] as const;
/** Duracion de bloqueo en Supabase Auth al deshabilitar una cuenta (~100 anios). */
const BAN_INDEFINIDO = '876600h';

function fallo(mensaje: string, error: { message: string } | null): never {
  throw AppError.interno(`${mensaje}: ${error?.message ?? 'sin detalle'}`);
}

/** Traduce los errores de Supabase Auth al invitar a codigos de la plataforma (409 / 422 / 429 / 500). */
function traducirErrorAuth(error: { message: string; status?: number } | null, contexto: string): AppError {
  const msg = error?.message ?? '';
  if (/already|registered|exists/i.test(msg)) {
    return AppError.conflicto('CORREO_EXISTENTE', 'Ya existe una cuenta con ese correo electronico');
  }
  if (/invalid/i.test(msg) && /email/i.test(msg)) {
    return AppError.datosInvalidos('CORREO_INVALIDO', 'Supabase Auth rechazo el correo electronico indicado (dominio no entregable)', [
      { path: 'email', message: 'Correo no valido para envio' },
    ]);
  }
  if (/rate limit/i.test(msg) || error?.status === 429) {
    return new AppError(429, 'LIMITE_CORREOS', 'Se alcanzo el limite de correos de invitacion del proveedor; intente mas tarde');
  }
  return AppError.interno(`${contexto}: ${msg || 'sin detalle'}`);
}

/** Escapa comodines y comas para usar texto libre en filtros `or(...ilike...)`. */
function patronBusqueda(q: string): string {
  return `%${q.replace(/[%_,()]/g, ' ').trim()}%`;
}

/** Bloquea/desbloquea la cuenta en Supabase Auth (revoca el acceso de las sesiones vigentes). */
/**
 * Correo informativo CUENTA_DESHABILITADA. La invitacion (INVITACION_FUNCIONARIO) NO se encola
 * aqui: la envia Supabase Auth (inviteUserByEmail) con su propio enlace de un solo uso y la
 * plantilla exige `enlace_accion`, que este servicio no conoce; encolarla duplicaria el correo.
 * El correo no debe bloquear la operacion de negocio.
 */
async function avisarCuentaDeshabilitada(usuarioId: string): Promise<void> {
  try {
    await encolarNotificacion({
      usuario_id: usuarioId,
      tipo: 'CUENTA_DESHABILITADA',
      titulo: 'Su cuenta fue deshabilitada',
      mensaje: 'Su cuenta en la plataforma FOEST fue deshabilitada por el Equipo FOEST. Si considera que se trata de un error, comuniquese con el Equipo FOEST.',
      entidad: 'USUARIO',
      entidad_id: usuarioId,
      clave_dedup: `CUENTA_DESHABILITADA:${usuarioId}:${Date.now()}`,
      correo: true,
    });
  } catch (e) {
    logger.warn({ err: e, usuarioId }, 'No fue posible encolar el aviso de cuenta deshabilitada');
  }
}

async function fijarBloqueoAuth(usuarioId: string, bloquear: boolean): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(usuarioId, {
    ban_duration: bloquear ? BAN_INDEFINIDO : 'none',
  });
  if (error) fallo('No fue posible actualizar la cuenta en Supabase Auth', error);
}

async function obtenerUsuario(id: string): Promise<UsuarioFila | null> {
  const { data, error } = await supabaseAdmin.from('usuario').select('*').eq('id', id).maybeSingle();
  if (error) fallo('No fue posible consultar el usuario', error);
  return (data as UsuarioFila | null) ?? null;
}

async function versionConsentimientoVigente(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('configuracion_sistema')
    .select('valor')
    .eq('clave', 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE')
    .maybeSingle();
  if (error) fallo('No fue posible consultar la configuracion', error);
  const v = Number.parseInt(String((data as { valor?: string | null } | null)?.valor ?? '1'), 10);
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

/** Calcula `es_menor`, `perfil_completo` y los campos faltantes a partir de las filas. */
export function evaluarPerfil(
  beneficiario: BeneficiarioFila | null,
  acudiente: AcudienteFila | null,
  consentimientoAceptado: boolean,
): { es_menor: boolean; perfil_completo: boolean; campos_faltantes: string[] } {
  const faltantes: string[] = [];
  if (!beneficiario) {
    return { es_menor: false, perfil_completo: false, campos_faltantes: [...CAMPOS_OBLIGATORIOS_PERFIL, 'consentimiento'] };
  }
  for (const campo of CAMPOS_OBLIGATORIOS_PERFIL) {
    const v = (beneficiario as unknown as Record<string, unknown>)[campo];
    if (v === null || v === undefined || v === '') faltantes.push(campo);
  }
  const es_menor = esMenorDeEdad(beneficiario.fecha_nacimiento);
  if (es_menor) {
    const completo =
      acudiente &&
      acudiente.tipo_documento &&
      acudiente.numero_documento &&
      acudiente.nombres &&
      acudiente.apellidos &&
      acudiente.parentesco &&
      acudiente.celular &&
      acudiente.correo;
    if (!completo) faltantes.push('acudiente');
  }
  if (!consentimientoAceptado) faltantes.push('consentimiento');
  return { es_menor, perfil_completo: faltantes.length === 0, campos_faltantes: faltantes };
}

// =============================================================================
// Funcionarios
// =============================================================================

/**
 * Expedientes que el funcionario tiene ASIGNADOS (modulo asignaciones, tabla postulacion_asignacion):
 * son los que resuelve la reasignacion masiva. `null` si la tabla aun no existe (migracion 0016 sin aplicar).
 */
async function contarAsignacionesActivasFuncionario(usuarioId: string): Promise<PendientesFuncionario | null> {
  try {
    const { data, error, count } = await supabaseAdmin
      .from('postulacion_asignacion')
      .select('id, postulacion_id, postulacion:postulacion_id (convocatoria_id, estado, convocatoria:convocatoria_id (nombre))', { count: 'exact' })
      .eq('funcionario_id', usuarioId)
      .eq('estado', 'ACTIVA')
      .order('asignada_en', { ascending: true })
      .limit(50);
    if (error) return null;
    const filas = (data ?? []) as unknown as Array<{
      postulacion_id: string;
      postulacion: { convocatoria_id: string; estado: string; convocatoria: { nombre: string } | null } | null;
    }>;
    const convocatorias = new Set(filas.map((f) => f.postulacion?.convocatoria_id).filter((c): c is string => Boolean(c)));
    return {
      asignaciones_activas: convocatorias.size,
      pendientes: count ?? filas.length,
      expedientes: filas.map((f) => ({
        postulacion_id: f.postulacion_id,
        convocatoria_id: f.postulacion?.convocatoria_id ?? '',
        convocatoria_nombre: f.postulacion?.convocatoria?.nombre ?? null,
        estado: f.postulacion?.estado ?? 'EN_EVALUACION',
      })),
    };
  } catch {
    return null;
  }
}

async function contarPendientesFuncionario(usuarioId: string): Promise<PendientesFuncionario> {
  const porExpediente = await contarAsignacionesActivasFuncionario(usuarioId);
  if (porExpediente) return porExpediente;
  const { data: asignaciones, error: errAsig } = await supabaseAdmin
    .from('asignacion_funcionario')
    .select('convocatoria_id')
    .eq('funcionario_id', usuarioId)
    .is('retirado_en', null);
  if (errAsig) fallo('No fue posible consultar las asignaciones', errAsig);
  const convocatorias = [...new Set(((asignaciones ?? []) as Array<{ convocatoria_id: string }>).map((a) => a.convocatoria_id))];
  if (convocatorias.length === 0) return { asignaciones_activas: 0, pendientes: 0, expedientes: [] };

  const { data: postulaciones, error: errPost, count } = await supabaseAdmin
    .from('postulacion')
    .select('id, convocatoria_id, estado', { count: 'exact' })
    .in('convocatoria_id', convocatorias)
    .in('estado', [...ESTADOS_PENDIENTES_EVALUACION])
    .order('creado_en', { ascending: true })
    .limit(50);
  if (errPost) fallo('No fue posible consultar las postulaciones pendientes', errPost);

  const { data: convs, error: errConv } = await supabaseAdmin.from('convocatoria').select('id, nombre').in('id', convocatorias);
  if (errConv) fallo('No fue posible consultar las convocatorias', errConv);
  const nombres = new Map(((convs ?? []) as Array<{ id: string; nombre: string }>).map((c) => [c.id, c.nombre]));

  const expedientes = ((postulaciones ?? []) as Array<{ id: string; convocatoria_id: string; estado: string }>).map((p) => ({
    postulacion_id: p.id,
    convocatoria_id: p.convocatoria_id,
    convocatoria_nombre: nombres.get(p.convocatoria_id) ?? null,
    estado: p.estado,
  }));
  return { asignaciones_activas: convocatorias.length, pendientes: count ?? expedientes.length, expedientes };
}

async function obtenerFuncionarioCuenta(id: string): Promise<FuncionarioCuenta> {
  const { data, error } = await supabaseAdmin.from('funcionario_cuenta').select('*').eq('id', id).maybeSingle();
  if (error) fallo('No fue posible consultar el funcionario', error);
  if (!data) throw AppError.noEncontrado();
  return data as FuncionarioCuenta;
}

export const funcionariosService = {
  async listar(query: ListarFuncionariosQuery): Promise<Paginado<FuncionarioCuenta>> {
    const { desde, hasta } = rangoSupabase(query);
    let q = supabaseAdmin.from('funcionario_cuenta').select('*', { count: 'exact' });
    if (query.q) {
      const p = patronBusqueda(query.q);
      q = q.or(`nombres.ilike.${p},apellidos.ilike.${p},email.ilike.${p},cargo.ilike.${p}`);
    }
    if (query.estado) q = q.eq('activo', query.estado === 'ACTIVO');
    if (query.dependencia) q = q.eq('dependencia', query.dependencia);
    const { data, error, count } = await q.order('apellidos').order('nombres').range(desde, hasta);
    if (error) fallo('No fue posible listar los funcionarios', error);
    return paginar((data ?? []) as FuncionarioCuenta[], query, count ?? 0);
  },

  async dependencias(): Promise<string[]> {
    const { data, error } = await supabaseAdmin.from('funcionario').select('dependencia').not('dependencia', 'is', null);
    if (error) fallo('No fue posible listar las dependencias', error);
    const set = new Set(((data ?? []) as Array<{ dependencia: string | null }>).map((d) => d.dependencia).filter((d): d is string => Boolean(d)));
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  },

  async detalle(id: string): Promise<FuncionarioDetalle> {
    const cuenta = await obtenerFuncionarioCuenta(id);
    const pendientes = await contarPendientesFuncionario(cuenta.usuario_id);
    return { ...cuenta, pendientes };
  },

  /** Alta por invitacion (DECISIONES section 19): inviteUserByEmail + app_metadata.rol = FUNCIONARIO + fila funcionario. */
  async invitar(ctx: ContextoAuditoria, dto: CrearFuncionario): Promise<FuncionarioCuenta> {
    const { data: existente, error: errExiste } = await supabaseAdmin.from('usuario').select('id').eq('email', dto.email).maybeSingle();
    if (errExiste) fallo('No fue posible verificar el correo', errExiste);
    if (existente) throw AppError.conflicto('CORREO_EXISTENTE', 'Ya existe una cuenta con ese correo electronico');

    const { data: invitacion, error: errInv } = await supabaseAdmin.auth.admin.inviteUserByEmail(dto.email, {
      data: { nombres: dto.nombres, apellidos: dto.apellidos, rol_invitado: 'FUNCIONARIO' },
      redirectTo: `${env.WEB_ORIGIN}/invitacion`,
    });
    if (errInv || !invitacion?.user) {
      throw traducirErrorAuth(errInv, 'No fue posible enviar la invitacion');
    }
    const usuarioId = invitacion.user.id;

    const { error: errRol } = await supabaseAdmin.auth.admin.updateUserById(usuarioId, { app_metadata: { rol: 'FUNCIONARIO' } });
    if (errRol) fallo('No fue posible fijar el rol del funcionario', errRol);

    // El trigger on_auth_user_updated sincroniza el rol; se asegura por si el trigger no corrio.
    const { error: errUsuario } = await supabaseAdmin
      .from('usuario')
      .upsert({ id: usuarioId, email: dto.email, rol: 'FUNCIONARIO', activo: true }, { onConflict: 'id' });
    if (errUsuario) fallo('No fue posible registrar el perfil de cuenta', errUsuario);

    const { data: funcionario, error: errFunc } = await supabaseAdmin
      .from('funcionario')
      .insert({
        usuario_id: usuarioId,
        nombres: dto.nombres,
        apellidos: dto.apellidos,
        cargo: dto.cargo,
        dependencia: dto.dependencia,
        invitado_en: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (errFunc || !funcionario) fallo('No fue posible crear el funcionario', errFunc);

    await auditar({
      ...ctx,
      accion: 'FUNCIONARIO_CREADO',
      entidad: 'FUNCIONARIO',
      entidad_id: (funcionario as { id: string }).id,
      datos_despues: { usuario_id: usuarioId, ...dto },
      metadatos: { invitacion: 'ENVIADA' },
    });
    return obtenerFuncionarioCuenta((funcionario as { id: string }).id);
  },

  async actualizar(ctx: ContextoAuditoria, id: string, dto: ActualizarFuncionario): Promise<FuncionarioCuenta> {
    const antes = await obtenerFuncionarioCuenta(id);
    const { error } = await supabaseAdmin.from('funcionario').update(dto).eq('id', id);
    if (error) fallo('No fue posible actualizar el funcionario', error);
    const despues = await obtenerFuncionarioCuenta(id);
    await auditar({
      ...ctx,
      accion: 'FUNCIONARIO_ACTUALIZADO',
      entidad: 'FUNCIONARIO',
      entidad_id: id,
      datos_antes: { nombres: antes.nombres, apellidos: antes.apellidos, cargo: antes.cargo, dependencia: antes.dependencia },
      datos_despues: dto,
    });
    return despues;
  },

  /**
   * Activa o deshabilita. Regla REASSIGNMENT_REQUIRED: deshabilitar con expedientes
   * PENDIENTE/EN_EVALUACION en sus convocatorias asignadas -> 409 ASIGNACIONES_PENDIENTES
   * (salvo `forzar: true`). Deshabilitar: usuario.activo=false (authenticate() rechaza) + bloqueo en Auth.
   */
  async cambiarEstado(ctx: ContextoAuditoria, id: string, dto: CambiarEstadoCuenta): Promise<FuncionarioCuenta> {
    const cuenta = await obtenerFuncionarioCuenta(id);
    if (cuenta.activo === dto.activo) {
      throw AppError.conflicto('ESTADO_SIN_CAMBIO', dto.activo ? 'El funcionario ya esta activo' : 'El funcionario ya esta deshabilitado');
    }
    let pendientes: PendientesFuncionario | null = null;
    if (!dto.activo) {
      pendientes = await contarPendientesFuncionario(cuenta.usuario_id);
      if (pendientes.pendientes > 0 && !dto.forzar) {
        throw AppError.conflicto(
          'ASIGNACIONES_PENDIENTES',
          `El funcionario tiene ${pendientes.pendientes} expediente(s) pendiente(s) en ${pendientes.asignaciones_activas} convocatoria(s); reasigne antes de deshabilitar`,
          { regla: 'REASSIGNMENT_REQUIRED', ...pendientes },
        );
      }
    }
    const { error } = await supabaseAdmin.from('usuario').update({ activo: dto.activo }).eq('id', cuenta.usuario_id);
    if (error) fallo('No fue posible cambiar el estado de la cuenta', error);
    await fijarBloqueoAuth(cuenta.usuario_id, !dto.activo);
    if (!dto.activo) await avisarCuentaDeshabilitada(cuenta.usuario_id);
    await auditar({
      ...ctx,
      accion: dto.activo ? 'FUNCIONARIO_REACTIVADO' : 'FUNCIONARIO_DESHABILITADO',
      entidad: 'FUNCIONARIO',
      entidad_id: id,
      datos_antes: { activo: cuenta.activo },
      datos_despues: { activo: dto.activo },
      metadatos: { motivo: dto.motivo, forzado: Boolean(dto.forzar), pendientes: pendientes?.pendientes ?? 0 },
    });
    return obtenerFuncionarioCuenta(id);
  },

  /** Reenvia la invitacion si el funcionario aun no ha iniciado sesion. */
  async reenviarInvitacion(ctx: ContextoAuditoria, id: string): Promise<{ reenviada: true }> {
    const cuenta = await obtenerFuncionarioCuenta(id);
    if (!cuenta.activo) throw AppError.conflicto('CUENTA_DESHABILITADA', 'No es posible invitar a una cuenta deshabilitada');
    const { data: authUser, error: errAuth } = await supabaseAdmin.auth.admin.getUserById(cuenta.usuario_id);
    if (errAuth) fallo('No fue posible consultar la cuenta en Supabase Auth', errAuth);
    if (authUser?.user?.last_sign_in_at || !cuenta.invitacion_pendiente) {
      throw AppError.conflicto('INVITACION_YA_ACEPTADA', 'El funcionario ya acepto la invitacion e inicio sesion');
    }
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(cuenta.email, {
      data: { nombres: cuenta.nombres, apellidos: cuenta.apellidos, rol_invitado: 'FUNCIONARIO' },
      redirectTo: `${env.WEB_ORIGIN}/invitacion`,
    });
    if (error) throw traducirErrorAuth(error, 'No fue posible reenviar la invitacion');
    await supabaseAdmin.from('funcionario').update({ invitacion_reenviada_en: new Date().toISOString() }).eq('id', id);
    await auditar({ ...ctx, accion: 'INVITACION_REENVIADA', entidad: 'FUNCIONARIO', entidad_id: id });
    return { reenviada: true };
  },
};

// =============================================================================
// Administradores
// =============================================================================

export const administradoresService = {
  async listar(query: PaginacionQuery): Promise<Paginado<AdministradorCuenta>> {
    const { desde, hasta } = rangoSupabase(query);
    const { data, error, count } = await supabaseAdmin
      .from('usuario')
      .select('id, email, activo, ultimo_login, creado_en', { count: 'exact' })
      .eq('rol', 'ADMINISTRADOR')
      .order('email')
      .range(desde, hasta);
    if (error) fallo('No fue posible listar los administradores', error);
    return paginar((data ?? []) as AdministradorCuenta[], query, count ?? 0);
  },

  /** Protege la propia cuenta (AUTODESHABILITACION_NO_PERMITIDA) y al ultimo administrador activo (ULTIMO_ADMINISTRADOR). */
  async cambiarEstado(ctx: ContextoAuditoria, actor: UsuarioAutenticado, id: string, dto: CambiarEstadoCuenta): Promise<AdministradorCuenta> {
    const usuario = await obtenerUsuario(id);
    if (!usuario || usuario.rol !== 'ADMINISTRADOR') throw AppError.noEncontrado();
    if (!dto.activo) {
      // La proteccion del ultimo administrador prevalece sobre la de la propia cuenta.
      const { count, error } = await supabaseAdmin
        .from('usuario')
        .select('id', { count: 'exact', head: true })
        .eq('rol', 'ADMINISTRADOR')
        .eq('activo', true)
        .neq('id', id);
      if (error) fallo('No fue posible contar los administradores activos', error);
      if ((count ?? 0) === 0) {
        throw AppError.conflicto('ULTIMO_ADMINISTRADOR', 'No es posible deshabilitar al unico administrador activo');
      }
      if (id === actor.id) {
        throw AppError.conflicto('AUTODESHABILITACION_NO_PERMITIDA', 'No puede deshabilitar su propia cuenta');
      }
    }
    if (usuario.activo === dto.activo) {
      throw AppError.conflicto('ESTADO_SIN_CAMBIO', dto.activo ? 'La cuenta ya esta activa' : 'La cuenta ya esta deshabilitada');
    }
    const { error: errUpd } = await supabaseAdmin.from('usuario').update({ activo: dto.activo }).eq('id', id);
    if (errUpd) fallo('No fue posible cambiar el estado de la cuenta', errUpd);
    await fijarBloqueoAuth(id, !dto.activo);
    if (!dto.activo) await avisarCuentaDeshabilitada(id);
    await auditar({
      ...ctx,
      accion: dto.activo ? 'ADMINISTRADOR_REACTIVADO' : 'ADMINISTRADOR_DESHABILITADO',
      entidad: 'USUARIO',
      entidad_id: id,
      datos_antes: { activo: usuario.activo },
      datos_despues: { activo: dto.activo },
      metadatos: { motivo: dto.motivo },
    });
    const despues = await obtenerUsuario(id);
    return {
      id,
      email: despues?.email ?? usuario.email,
      activo: despues?.activo ?? dto.activo,
      ultimo_login: despues?.ultimo_login ?? null,
      creado_en: despues?.creado_en ?? usuario.creado_en,
    };
  },
};

// =============================================================================
// Beneficiarios
// =============================================================================

async function cargarPerfil(db: SupabaseClient, usuarioId: string): Promise<PerfilBeneficiario> {
  const usuario = await obtenerUsuario(usuarioId);
  if (!usuario) throw AppError.noEncontrado();
  const { data: beneficiario, error } = await db.from('beneficiario').select('*').eq('usuario_id', usuarioId).maybeSingle();
  if (error) fallo('No fue posible consultar el perfil', error);
  let acudiente: AcudienteFila | null = null;
  if (beneficiario) {
    const { data: ac, error: errAc } = await db.from('acudiente').select('*').eq('beneficiario_id', (beneficiario as BeneficiarioFila).id).maybeSingle();
    if (errAc) fallo('No fue posible consultar el acudiente', errAc);
    acudiente = (ac as AcudienteFila | null) ?? null;
  }
  const version = await versionConsentimientoVigente();
  const { data: consent, error: errCons } = await supabaseAdmin
    .from('consentimiento_datos')
    .select('aceptado_en')
    .eq('usuario_id', usuarioId)
    .eq('version_texto', version)
    .order('aceptado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errCons) fallo('No fue posible consultar el consentimiento', errCons);
  const aceptado = Boolean(consent);
  const ev = evaluarPerfil((beneficiario as BeneficiarioFila | null) ?? null, acudiente, aceptado);
  return {
    beneficiario: (beneficiario as BeneficiarioFila | null) ?? null,
    acudiente,
    email: usuario.email,
    activo: usuario.activo,
    ...ev,
    consentimiento_vigente: { version, aceptado, aceptado_en: (consent as { aceptado_en: string } | null)?.aceptado_en ?? null },
  };
}

async function beneficiarioPorId(id: string): Promise<BeneficiarioFila> {
  const { data, error } = await supabaseAdmin.from('beneficiario').select('*').eq('id', id).maybeSingle();
  if (error) fallo('No fue posible consultar el beneficiario', error);
  if (!data) throw AppError.noEncontrado();
  return data as BeneficiarioFila;
}

/**
 * Alcance del funcionario sobre un beneficiario: asignacion activa propia sobre una
 * postulacion del beneficiario (tabla postulacion_asignacion del modulo asignaciones);
 * si esa tabla aun no existe, se usa el comite activo de la convocatoria (asignacion_funcionario).
 */
async function funcionarioTieneAlcance(funcionarioUsuarioId: string, beneficiarioId: string): Promise<boolean> {
  const { data: postulaciones, error } = await supabaseAdmin
    .from('postulacion')
    .select('id, convocatoria_id')
    .eq('beneficiario_id', beneficiarioId)
    .neq('estado', 'BORRADOR');
  if (error) fallo('No fue posible consultar las postulaciones', error);
  const lista = (postulaciones ?? []) as Array<{ id: string; convocatoria_id: string }>;
  if (lista.length === 0) return false;

  const { count, error: errPA } = await supabaseAdmin
    .from('postulacion_asignacion')
    .select('id', { count: 'exact', head: true })
    .eq('funcionario_id', funcionarioUsuarioId)
    .in('postulacion_id', lista.map((p) => p.id));
  if (!errPA) return (count ?? 0) > 0;

  const { count: enComite, error: errComite } = await supabaseAdmin
    .from('asignacion_funcionario')
    .select('id', { count: 'exact', head: true })
    .eq('funcionario_id', funcionarioUsuarioId)
    .is('retirado_en', null)
    .in('convocatoria_id', [...new Set(lista.map((p) => p.convocatoria_id))]);
  if (errComite) fallo('No fue posible verificar el alcance', errComite);
  return (enComite ?? 0) > 0;
}

export const beneficiariosService = {
  async perfilPropio(user: UsuarioAutenticado): Promise<PerfilBeneficiario> {
    return cargarPerfil(supabaseAsUser(user.token), user.id);
  },

  /**
   * PUT /beneficiarios/me. El documento solo se fija la primera vez; cambiarlo
   * despues es una accion del Administrador (422 DOCUMENTO_NO_EDITABLE).
   * Calcula es_menor y perfil_completo en el servidor.
   */
  async actualizarPerfilPropio(ctx: ContextoAuditoria, user: UsuarioAutenticado, dto: PerfilBeneficiarioEntrada): Promise<PerfilBeneficiario> {
    const db = supabaseAsUser(user.token);
    const actual = await cargarPerfil(db, user.id);
    if (actual.beneficiario?.anonimizado) throw AppError.conflicto('PERFIL_ANONIMIZADO', 'El perfil fue anonimizado y no admite cambios');
    const previo = actual.beneficiario;
    if (
      previo?.numero_documento &&
      (previo.numero_documento !== dto.numero_documento || (previo.tipo_documento && previo.tipo_documento !== dto.tipo_documento))
    ) {
      throw AppError.datosInvalidos(
        'DOCUMENTO_NO_EDITABLE',
        'El tipo y numero de documento no se pueden cambiar desde el perfil; solicite la correccion a la administracion',
        [{ path: 'numero_documento', message: 'Campo no editable' }],
      );
    }
    if (!previo?.numero_documento) {
      const { data: dup, error: errDup } = await supabaseAdmin
        .from('beneficiario')
        .select('id')
        .eq('numero_documento', dto.numero_documento)
        .neq('usuario_id', user.id)
        .maybeSingle();
      if (errDup) fallo('No fue posible verificar el documento', errDup);
      if (dup) throw AppError.conflicto('DOCUMENTO_DUPLICADO', 'Ya existe un beneficiario registrado con ese numero de documento');
    }

    const es_menor = esMenorDeEdad(dto.fecha_nacimiento);
    if (es_menor && !dto.acudiente) {
      throw AppError.datosInvalidos('ACUDIENTE_REQUERIDO', 'Por ser menor de edad debe registrar los datos de su acudiente', [
        { path: 'acudiente', message: 'Obligatorio para menores de edad' },
      ]);
    }
    const { acudiente, ...campos } = dto;
    const fila = {
      usuario_id: user.id,
      ...campos,
      celular_2: campos.celular_2 ?? null,
      sisben_categoria: campos.sisben_categoria ?? null,
      sisben_puntaje: campos.sisben_puntaje ?? null,
      es_menor,
    };
    const { data: guardado, error } = await db.from('beneficiario').upsert(fila, { onConflict: 'usuario_id' }).select('*').single();
    if (error || !guardado) {
      if (error?.code === '23505') throw AppError.conflicto('DOCUMENTO_DUPLICADO', 'Ya existe un beneficiario registrado con ese numero de documento');
      fallo('No fue posible guardar el perfil', error);
    }
    const beneficiarioId = (guardado as BeneficiarioFila).id;
    if (acudiente) {
      const { error: errAc } = await db
        .from('acudiente')
        .upsert({ beneficiario_id: beneficiarioId, ...acudiente }, { onConflict: 'beneficiario_id' });
      if (errAc) fallo('No fue posible guardar el acudiente', errAc);
    }
    // Recalcular perfil_completo con el consentimiento vigente y persistirlo (derivado, no editable por el titular).
    const nuevo = await cargarPerfil(db, user.id);
    if (nuevo.beneficiario && nuevo.beneficiario.perfil_completo !== nuevo.perfil_completo) {
      const { error: errPC } = await supabaseAdmin.from('beneficiario').update({ perfil_completo: nuevo.perfil_completo }).eq('id', beneficiarioId);
      if (errPC) fallo('No fue posible actualizar el indicador de perfil completo', errPC);
      nuevo.beneficiario.perfil_completo = nuevo.perfil_completo;
    }
    await auditar({
      ...ctx,
      accion: 'PERFIL_ACTUALIZADO',
      entidad: 'BENEFICIARIO',
      entidad_id: beneficiarioId,
      datos_antes: previo,
      datos_despues: { ...fila, acudiente: acudiente ?? null },
      metadatos: { perfil_completo: nuevo.perfil_completo, es_menor },
    });
    return nuevo;
  },

  async consentimientosPropios(user: UsuarioAutenticado): Promise<{ version_vigente: number; aceptada: boolean; historial: ConsentimientoFila[] }> {
    const db = supabaseAsUser(user.token);
    const version = await versionConsentimientoVigente();
    const { data, error } = await db
      .from('consentimiento_datos')
      .select('id, usuario_id, version_texto, aceptado_en, ip, es_menor_al_aceptar')
      .eq('usuario_id', user.id)
      .order('aceptado_en', { ascending: false });
    if (error) fallo('No fue posible consultar los consentimientos', error);
    const historial = (data ?? []) as ConsentimientoFila[];
    return { version_vigente: version, aceptada: historial.some((c) => c.version_texto === version), historial };
  },

  /** Registra la aceptacion de la version vigente (inmutable; para menores guarda los datos del acudiente). */
  async aceptarConsentimiento(ctx: ContextoAuditoria, user: UsuarioAutenticado): Promise<{ version: number; aceptado_en: string }> {
    const db = supabaseAsUser(user.token);
    const version = await versionConsentimientoVigente();
    const perfil = await cargarPerfil(db, user.id);
    if (perfil.consentimiento_vigente.aceptado) {
      return { version, aceptado_en: perfil.consentimiento_vigente.aceptado_en ?? new Date().toISOString() };
    }
    const ac = perfil.acudiente;
    const { data, error } = await db
      .from('consentimiento_datos')
      .insert({
        usuario_id: user.id,
        version_texto: version,
        ip: ctx.ip ?? null,
        es_menor_al_aceptar: perfil.es_menor,
        acudiente_nombre: perfil.es_menor && ac ? `${ac.nombres ?? ''} ${ac.apellidos ?? ''}`.trim() : null,
        acudiente_tipo_documento: perfil.es_menor && ac ? ac.tipo_documento : null,
        acudiente_numero_documento: perfil.es_menor && ac ? ac.numero_documento : null,
        acudiente_correo: perfil.es_menor && ac ? ac.correo : null,
      })
      .select('aceptado_en')
      .single();
    if (error || !data) fallo('No fue posible registrar el consentimiento', error);
    if (perfil.beneficiario) {
      const ev = evaluarPerfil(perfil.beneficiario, perfil.acudiente, true);
      if (ev.perfil_completo !== perfil.beneficiario.perfil_completo) {
        await supabaseAdmin.from('beneficiario').update({ perfil_completo: ev.perfil_completo }).eq('id', perfil.beneficiario.id);
      }
    }
    await auditar({ ...ctx, accion: 'CONSENTIMIENTO_ACEPTADO', entidad: 'USUARIO', entidad_id: user.id, metadatos: { version } });
    return { version, aceptado_en: (data as { aceptado_en: string }).aceptado_en };
  },

  /** Derecho de acceso: datos del titular (perfil, acudiente, consentimientos, postulaciones). Audita EXPORTACION. */
  async exportarDatosPropios(ctx: ContextoAuditoria, user: UsuarioAutenticado) {
    const db = supabaseAsUser(user.token);
    const perfil = await cargarPerfil(db, user.id);
    const consentimientos = await this.consentimientosPropios(user);
    let postulaciones: unknown[] = [];
    if (perfil.beneficiario) {
      const { data } = await db
        .from('postulacion')
        .select('id, convocatoria_id, tipo_solicitud, estado, ciclo, enviada_en, creado_en')
        .eq('beneficiario_id', perfil.beneficiario.id);
      postulaciones = data ?? [];
    }
    await auditar({ ...ctx, accion: 'EXPORTACION', entidad: 'BENEFICIARIO', entidad_id: perfil.beneficiario?.id ?? user.id, metadatos: { alcance: 'DATOS_TITULAR' } });
    return { generado_en: new Date().toISOString(), cuenta: { email: perfil.email }, perfil: perfil.beneficiario, acudiente: perfil.acudiente, consentimientos: consentimientos.historial, postulaciones };
  },

  async listar(query: ListarBeneficiariosQuery): Promise<Paginado<BeneficiarioCuenta>> {
    const { desde, hasta } = rangoSupabase(query);
    let q = supabaseAdmin.from('beneficiario_cuenta').select('*', { count: 'exact' });
    if (query.q) {
      const p = patronBusqueda(query.q);
      q = q.or(`nombres.ilike.${p},apellidos.ilike.${p},email.ilike.${p},numero_documento.ilike.${p}`);
    }
    if (query.estado) q = q.eq('activo', query.estado === 'ACTIVO');
    const { data, error, count } = await q.order('apellidos', { nullsFirst: false }).order('nombres').range(desde, hasta);
    if (error) fallo('No fue posible listar los beneficiarios', error);
    return paginar((data ?? []) as BeneficiarioCuenta[], query, count ?? 0);
  },

  /** Lectura por id: admin global; funcionario solo con alcance (si no, 404). Siempre LECTURA_SENSIBLE. */
  async detalle(ctx: ContextoAuditoria, user: UsuarioAutenticado, id: string): Promise<PerfilBeneficiario> {
    const beneficiario = await beneficiarioPorId(id);
    if (user.rol === 'FUNCIONARIO') {
      const ok = await funcionarioTieneAlcance(user.id, id);
      if (!ok) throw AppError.noEncontrado();
    } else if (user.rol !== 'ADMINISTRADOR') {
      throw AppError.noEncontrado();
    }
    const perfil = await cargarPerfil(supabaseAdmin, beneficiario.usuario_id);
    await auditar({ ...ctx, accion: 'LECTURA_SENSIBLE', entidad: 'BENEFICIARIO', entidad_id: id, metadatos: { via: 'GET /beneficiarios/:id' } });
    return perfil;
  },

  async cambiarEstado(ctx: ContextoAuditoria, id: string, dto: CambiarEstadoCuenta): Promise<BeneficiarioCuenta> {
    const beneficiario = await beneficiarioPorId(id);
    const usuario = await obtenerUsuario(beneficiario.usuario_id);
    if (!usuario) throw AppError.noEncontrado();
    if (usuario.activo === dto.activo) {
      throw AppError.conflicto('ESTADO_SIN_CAMBIO', dto.activo ? 'La cuenta ya esta activa' : 'La cuenta ya esta deshabilitada');
    }
    const { error } = await supabaseAdmin.from('usuario').update({ activo: dto.activo }).eq('id', usuario.id);
    if (error) fallo('No fue posible cambiar el estado de la cuenta', error);
    await fijarBloqueoAuth(usuario.id, !dto.activo);
    if (!dto.activo) await avisarCuentaDeshabilitada(usuario.id);
    await auditar({
      ...ctx,
      accion: dto.activo ? 'BENEFICIARIO_REACTIVADO' : 'BENEFICIARIO_DESHABILITADO',
      entidad: 'BENEFICIARIO',
      entidad_id: id,
      datos_antes: { activo: usuario.activo },
      datos_despues: { activo: dto.activo },
      metadatos: { motivo: dto.motivo },
    });
    const { data } = await supabaseAdmin.from('beneficiario_cuenta').select('*').eq('id', id).maybeSingle();
    return (data as BeneficiarioCuenta | null) ?? ({ ...beneficiario, email: usuario.email, activo: dto.activo, ultimo_login: usuario.ultimo_login } as BeneficiarioCuenta);
  },

  /** Correccion de documento por el Administrador con motivo; unicidad -> 409 DOCUMENTO_DUPLICADO; auditoria antes/despues. */
  async corregirDocumento(ctx: ContextoAuditoria, id: string, dto: CorregirDocumento): Promise<BeneficiarioFila> {
    const antes = await beneficiarioPorId(id);
    if (antes.anonimizado) throw AppError.conflicto('PERFIL_ANONIMIZADO', 'El perfil fue anonimizado y no admite cambios');
    const tipo = dto.tipo_documento ?? antes.tipo_documento;
    if (antes.numero_documento === dto.numero_documento && antes.tipo_documento === tipo) {
      throw AppError.conflicto('ESTADO_SIN_CAMBIO', 'El documento indicado es igual al actual');
    }
    const { data: dup, error: errDup } = await supabaseAdmin
      .from('beneficiario')
      .select('id')
      .eq('numero_documento', dto.numero_documento)
      .neq('id', id)
      .maybeSingle();
    if (errDup) fallo('No fue posible verificar el documento', errDup);
    if (dup) throw AppError.conflicto('DOCUMENTO_DUPLICADO', 'Ya existe otro beneficiario con ese numero de documento');
    const { data, error } = await supabaseAdmin
      .from('beneficiario')
      .update({ numero_documento: dto.numero_documento, tipo_documento: tipo })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) {
      if (error?.code === '23505') throw AppError.conflicto('DOCUMENTO_DUPLICADO', 'Ya existe otro beneficiario con ese numero de documento');
      fallo('No fue posible corregir el documento', error);
    }
    await auditar({
      ...ctx,
      accion: 'DOCUMENTO_IDENTIDAD_CORREGIDO',
      entidad: 'BENEFICIARIO',
      entidad_id: id,
      datos_antes: { tipo_documento: antes.tipo_documento, numero_documento: antes.numero_documento },
      datos_despues: { tipo_documento: tipo, numero_documento: dto.numero_documento },
      metadatos: { motivo: dto.motivo },
    });
    return data as BeneficiarioFila;
  },
};

// =============================================================================
// Habeas data
// =============================================================================

async function tienePostulacionesNoTerminales(beneficiarioId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('postulacion')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', beneficiarioId)
    .in('estado', [...ESTADOS_NO_TERMINALES]);
  if (error) fallo('No fue posible consultar las postulaciones', error);
  return count ?? 0;
}

/** Anonimizacion irreversible del titular (supresion aprobada). Conserva snapshots y auditoria bajo retencion. */
async function anonimizar(ctx: ContextoAuditoria, usuarioId: string): Promise<void> {
  const usuario = await obtenerUsuario(usuarioId);
  if (!usuario) throw AppError.noEncontrado();
  const { data: ben } = await supabaseAdmin.from('beneficiario').select('id, anonimizado').eq('usuario_id', usuarioId).maybeSingle();
  const marca = usuarioId.replace(/-/g, '').slice(0, 12).toUpperCase();
  const ahora = new Date().toISOString();
  if (ben && !(ben as { anonimizado: boolean }).anonimizado) {
    const benId = (ben as { id: string }).id;
    const { error: errAc } = await supabaseAdmin.from('acudiente').delete().eq('beneficiario_id', benId);
    if (errAc) fallo('No fue posible anonimizar el acudiente', errAc);
    const { error: errBen } = await supabaseAdmin
      .from('beneficiario')
      .update({
        tipo_documento: null,
        numero_documento: `ANON-${marca}`,
        expedido_en: null,
        nombres: 'ANONIMIZADO',
        apellidos: 'ANONIMIZADO',
        fecha_nacimiento: null,
        genero: null,
        estado_civil: null,
        direccion: null,
        sector: null,
        celular_1: null,
        celular_2: null,
        correo_notificacion_2: null,
        estrato: null,
        sisben_categoria: null,
        sisben_puntaje: null,
        perfil_completo: false,
        anonimizado: true,
        anonimizado_en: ahora,
      })
      .eq('id', benId);
    if (errBen) fallo('No fue posible anonimizar el perfil', errBen);
  }
  const emailAnon = `anonimizado+${marca.toLowerCase()}@anonimizado.foest.invalid`;
  const { error: errAuth } = await supabaseAdmin.auth.admin.updateUserById(usuarioId, {
    email: emailAnon,
    email_confirm: true,
    ban_duration: BAN_INDEFINIDO,
    user_metadata: {},
  });
  if (errAuth) fallo('No fue posible anonimizar la cuenta en Supabase Auth', errAuth);
  const { error: errUsr } = await supabaseAdmin.from('usuario').update({ activo: false, email: emailAnon }).eq('id', usuarioId);
  if (errUsr) fallo('No fue posible desactivar la cuenta', errUsr);
  await auditar({
    ...ctx,
    accion: 'ANONIMIZACION',
    entidad: 'USUARIO',
    entidad_id: usuarioId,
    datos_antes: { email: usuario.email, activo: usuario.activo },
    datos_despues: { email: emailAnon, activo: false },
    metadatos: { retencion: 'snapshots, formatos, hashes y auditoria se conservan segun RETENCION_DOCUMENTOS_ANIOS' },
  });
}

export const habeasDataService = {
  async radicar(ctx: ContextoAuditoria, user: UsuarioAutenticado, dto: SolicitudHabeasDataEntrada): Promise<SolicitudHabeasData> {
    const db = supabaseAsUser(user.token);
    if (dto.tipo === 'SUPRESION') {
      const { data: ben } = await supabaseAdmin.from('beneficiario').select('id').eq('usuario_id', user.id).maybeSingle();
      if (ben) {
        const n = await tienePostulacionesNoTerminales((ben as { id: string }).id);
        if (n > 0) {
          throw AppError.conflicto('SUPRESION_NO_PROCEDE', 'No es posible suprimir sus datos mientras tenga postulaciones en tramite', { postulaciones_en_tramite: n });
        }
      }
    }
    const { data: abierta, error: errAb } = await db
      .from('solicitud_habeas_data')
      .select('id')
      .eq('usuario_id', user.id)
      .eq('tipo', dto.tipo)
      .eq('estado', 'RADICADA')
      .maybeSingle();
    if (errAb) fallo('No fue posible verificar solicitudes previas', errAb);
    if (abierta) throw AppError.conflicto('SOLICITUD_EN_TRAMITE', 'Ya tiene una solicitud de este tipo pendiente de respuesta');
    const { data, error } = await db
      .from('solicitud_habeas_data')
      .insert({ usuario_id: user.id, tipo: dto.tipo, detalle: dto.detalle })
      .select('*')
      .single();
    if (error || !data) {
      if (error?.code === '23505') throw AppError.conflicto('SOLICITUD_EN_TRAMITE', 'Ya tiene una solicitud de este tipo pendiente de respuesta');
      fallo('No fue posible radicar la solicitud', error);
    }
    await auditar({ ...ctx, accion: 'HABEAS_DATA_RADICADA', entidad: 'SOLICITUD_HABEAS_DATA', entidad_id: (data as SolicitudHabeasData).id, metadatos: { tipo: dto.tipo } });
    return data as SolicitudHabeasData;
  },

  async propias(user: UsuarioAutenticado): Promise<SolicitudHabeasData[]> {
    const { data, error } = await supabaseAsUser(user.token)
      .from('solicitud_habeas_data')
      .select('*')
      .eq('usuario_id', user.id)
      .order('creada_en', { ascending: false });
    if (error) fallo('No fue posible consultar sus solicitudes', error);
    return (data ?? []) as SolicitudHabeasData[];
  },

  async bandeja(query: ListarHabeasDataQuery): Promise<Paginado<SolicitudHabeasData>> {
    const { desde, hasta } = rangoSupabase(query);
    let q = supabaseAdmin.from('solicitud_habeas_data').select('*', { count: 'exact' });
    if (query.estado) q = q.eq('estado', query.estado);
    const { data, error, count } = await q.order('creada_en', { ascending: false }).range(desde, hasta);
    if (error) fallo('No fue posible consultar la bandeja', error);
    const filas = (data ?? []) as SolicitudHabeasData[];
    const ids = [...new Set(filas.map((f) => f.usuario_id))];
    if (ids.length > 0) {
      const { data: usuarios } = await supabaseAdmin.from('usuario').select('id, email').in('id', ids);
      const { data: bens } = await supabaseAdmin.from('beneficiario').select('usuario_id, nombres, apellidos').in('usuario_id', ids);
      const emails = new Map(((usuarios ?? []) as Array<{ id: string; email: string }>).map((u) => [u.id, u.email]));
      const nombres = new Map(
        ((bens ?? []) as Array<{ usuario_id: string; nombres: string | null; apellidos: string | null }>).map((b) => [
          b.usuario_id,
          `${b.nombres ?? ''} ${b.apellidos ?? ''}`.trim() || null,
        ]),
      );
      for (const f of filas) {
        f.email = emails.get(f.usuario_id) ?? '';
        f.nombre = nombres.get(f.usuario_id) ?? null;
      }
    }
    return paginar(filas, query, count ?? 0);
  },

  /** Resuelve. APROBAR + SUPRESION ejecuta la anonimizacion (409 SUPRESION_NO_PROCEDE si hay postulaciones en tramite). */
  async resolver(ctx: ContextoAuditoria, actor: UsuarioAutenticado, id: string, dto: ResolverHabeasData): Promise<SolicitudHabeasData> {
    const { data, error } = await supabaseAdmin.from('solicitud_habeas_data').select('*').eq('id', id).maybeSingle();
    if (error) fallo('No fue posible consultar la solicitud', error);
    if (!data) throw AppError.noEncontrado();
    const solicitud = data as SolicitudHabeasData;
    if (solicitud.estado !== 'RADICADA') throw AppError.conflicto('SOLICITUD_YA_RESUELTA', 'La solicitud ya fue resuelta');

    if (dto.decision === 'APROBAR' && solicitud.tipo === 'SUPRESION') {
      const { data: ben } = await supabaseAdmin.from('beneficiario').select('id').eq('usuario_id', solicitud.usuario_id).maybeSingle();
      if (ben) {
        const n = await tienePostulacionesNoTerminales((ben as { id: string }).id);
        if (n > 0) {
          throw AppError.conflicto('SUPRESION_NO_PROCEDE', 'El titular tiene postulaciones en tramite; la supresion no procede', { postulaciones_en_tramite: n });
        }
      }
      await anonimizar(ctx, solicitud.usuario_id);
    }
    const { data: resuelta, error: errUpd } = await supabaseAdmin
      .from('solicitud_habeas_data')
      .update({
        estado: dto.decision === 'APROBAR' ? 'RESUELTA' : 'RECHAZADA',
        motivo_resolucion: dto.motivo,
        resuelta_por: actor.id,
        resuelta_en: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (errUpd || !resuelta) fallo('No fue posible resolver la solicitud', errUpd);
    await auditar({
      ...ctx,
      accion: 'HABEAS_DATA_RESUELTA',
      entidad: 'SOLICITUD_HABEAS_DATA',
      entidad_id: id,
      datos_antes: { estado: 'RADICADA' },
      datos_despues: { estado: (resuelta as SolicitudHabeasData).estado },
      metadatos: { tipo: solicitud.tipo, decision: dto.decision, motivo: dto.motivo },
    });
    return resuelta as SolicitudHabeasData;
  },
};
