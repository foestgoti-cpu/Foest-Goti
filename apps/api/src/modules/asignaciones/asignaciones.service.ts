import type {
  AlertaAsignacionDto,
  AsignacionDto,
  BandejaQuery,
  ConflictoInteresDto,
  ConflictoInteresInput,
  EvaluadorCargaDto,
  EvaluadoresQuery,
  HistorialAsignacionDto,
  LiberarInput,
  MotivoLiberacion,
  Paginado,
  PaginacionQuery,
  ReasignarInput,
  ReasignarMasivoInput,
  ResultadoReasignacionMasivoDto,
  ResumenBandejaDto,
  TomarInput,
} from '@foest/shared';
import { AppError, auditar, logger, paginar, supabaseAdmin, type UsuarioAutenticado } from '../../shared';
import { configuracionService, diasHabilesEntre, fechaLocalBogota } from '../catalogos_configuracion';
import { alertarAdministradores, encolarNotificacion } from '../notificaciones';
import { postulacionService } from '../postulaciones/postulacion.service';
import type { ContextoAuditoria, ContextoPostulacion, FilaAsignacion, FilaBandeja } from './asignaciones.types';

/* ------------------------------------------------------------------------- */
/* Utilidades                                                                 */
/* ------------------------------------------------------------------------- */

const CLAVE_UMBRAL = 'ALERTA_ASIGNACION_SIN_MOVIMIENTO_DIAS_HABILES';
const UMBRAL_DEFECTO = 5;

/** Codigo legible del expediente, sin relacion derivable con el documento de identidad. */
export function codigoExpediente(anio: number, semestre: number, postulacionId: string): string {
  return `FOEST-${anio}-${semestre}-${postulacionId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function esErrorDeEsquema(error: { message?: string; code?: string } | null | undefined): boolean {
  const texto = error?.message ?? '';
  return (
    error?.code === 'PGRST202' ||
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    error?.code === '42883' ||
    /Could not find the (function|table)|does not exist/i.test(texto)
  );
}

function fallo(mensaje: string, error: { message?: string; code?: string } | null | undefined): never {
  if (esErrorDeEsquema(error)) {
    throw new AppError(503, 'MIGRACION_PENDIENTE', 'Falta aplicar la migracion 0016_asignaciones.sql');
  }
  throw AppError.interno(`${mensaje}: ${error?.message ?? 'sin detalle'}`);
}

/** Traduce los errores `CODIGO: detalle` lanzados por las funciones SQL de asignaciones. */
function errorDesdeSql(error: { message?: string; code?: string }): AppError {
  if (esErrorDeEsquema(error)) {
    return new AppError(503, 'MIGRACION_PENDIENTE', 'Falta aplicar la migracion 0016_asignaciones.sql');
  }
  const texto = error.message ?? '';
  const codigo = texto.split(':')[0]?.trim() ?? '';
  const detalle = texto.includes(':') ? texto.slice(texto.indexOf(':') + 1).trim() : texto;
  switch (codigo) {
    case 'NO_ENCONTRADO':
      return AppError.noEncontrado();
    case 'YA_ASIGNADA':
      return AppError.conflicto('YA_ASIGNADA', 'El expediente ya fue tomado por otro funcionario');
    case 'SIN_ASIGNACION_ACTIVA':
      return AppError.conflicto('SIN_ASIGNACION_ACTIVA', detalle);
    case 'ASIGNACION_INMUTABLE':
      return AppError.conflicto('ASIGNACION_INMUTABLE', detalle);
    case 'DESTINO_INVALIDO':
      return AppError.datosInvalidos('DESTINO_INVALIDO', detalle);
    default:
      return AppError.interno(`Error en la operacion de asignacion: ${texto || 'sin detalle'}`);
  }
}

/** Envia una notificacion interna sin que su fallo afecte la operacion de negocio. */
async function notificar(input: Parameters<typeof encolarNotificacion>[0]): Promise<void> {
  try {
    await encolarNotificacion({ canal: 'APP', ...input });
  } catch (e) {
    logger.error({ err: e, tipo: input.tipo }, 'No fue posible crear la notificacion de asignaciones');
  }
}

function aLocal(iso: string): string {
  return fechaLocalBogota(new Date(iso));
}

async function diasHabilesDesde(iso: string | null): Promise<number> {
  if (!iso) return 0;
  try {
    return await diasHabilesEntre(aLocal(iso), fechaLocalBogota());
  } catch (e) {
    logger.warn({ err: e }, 'No fue posible calcular los dias habiles');
    return 0;
  }
}

interface FilaPostulacionContexto {
  id: string;
  estado: ContextoPostulacion['estado'];
  version: number;
  ciclo: number;
  tipo_solicitud: ContextoPostulacion['tipo_solicitud'];
  convocatoria_id: string;
  convocatoria: { nombre: string; anio: number; semestre: number } | null;
  beneficiario: { usuario_id: string | null } | null;
}

/** Carga el contexto minimo de una postulacion o responde 404. */
async function cargarPostulacion(id: string): Promise<ContextoPostulacion> {
  const { data, error } = await supabaseAdmin
    .from('postulacion')
    .select('id, estado, version, ciclo, tipo_solicitud, convocatoria_id, convocatoria:convocatoria_id (nombre, anio, semestre), beneficiario:beneficiario_id (usuario_id)')
    .eq('id', id)
    .maybeSingle();
  if (error) fallo('No fue posible consultar la postulacion', error);
  if (!data) throw AppError.noEncontrado();
  const p = data as unknown as FilaPostulacionContexto;
  const conv = p.convocatoria ?? { nombre: '', anio: 0, semestre: 0 };
  return {
    id: p.id,
    estado: p.estado,
    version: p.version,
    ciclo: p.ciclo,
    tipo_solicitud: p.tipo_solicitud,
    convocatoria_id: p.convocatoria_id,
    convocatoria_nombre: conv.nombre,
    convocatoria_anio: conv.anio,
    convocatoria_semestre: conv.semestre,
    beneficiario_usuario_id: p.beneficiario?.usuario_id ?? null,
    codigo_expediente: codigoExpediente(conv.anio, conv.semestre, p.id),
  };
}

async function activaDe(postulacionId: string): Promise<FilaAsignacion | null> {
  const { data, error } = await supabaseAdmin
    .from('postulacion_asignacion')
    .select('*')
    .eq('postulacion_id', postulacionId)
    .eq('estado', 'ACTIVA')
    .maybeSingle();
  if (error) fallo('No fue posible consultar la asignacion', error);
  return (data as FilaAsignacion | null) ?? null;
}

/** Marca LIBERADA la asignacion ACTIVA indicada (condicion de estado: idempotente). */
async function marcarLiberada(asignacionId: string, motivo: MotivoLiberacion, actorId: string | null, observacion: string | null): Promise<FilaAsignacion | null> {
  const ahora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('postulacion_asignacion')
    .update({ estado: 'LIBERADA', motivo_liberacion: motivo, liberada_en: ahora, liberada_por: actorId, observacion_liberacion: observacion, ultimo_movimiento_en: ahora })
    .eq('id', asignacionId)
    .eq('estado', 'ACTIVA')
    .select('*')
    .maybeSingle();
  if (error) fallo('No fue posible liberar la asignacion', error);
  return (data as FilaAsignacion | null) ?? null;
}

function aAsignacionDto(fila: FilaAsignacion, ctx: ContextoPostulacion, postulacion?: { estado: ContextoPostulacion['estado']; version: number }): AsignacionDto {
  return {
    id: fila.id,
    postulacion_id: fila.postulacion_id,
    codigo_expediente: ctx.codigo_expediente,
    funcionario_id: fila.funcionario_id,
    estado: fila.estado,
    motivo_liberacion: fila.motivo_liberacion,
    origen: fila.origen,
    asignada_en: fila.asignada_en,
    liberada_en: fila.liberada_en,
    ultimo_movimiento_en: fila.ultimo_movimiento_en,
    postulacion_estado: postulacion?.estado ?? ctx.estado,
    postulacion_version: postulacion?.version ?? ctx.version,
  };
}

async function nombresFuncionarios(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return mapa;
  const { data, error } = await supabaseAdmin.from('funcionario').select('usuario_id, nombres, apellidos').in('usuario_id', unicos);
  if (error) fallo('No fue posible consultar los funcionarios', error);
  for (const f of (data ?? []) as Array<{ usuario_id: string; nombres: string; apellidos: string }>) {
    mapa.set(f.usuario_id, `${f.nombres} ${f.apellidos}`.trim());
  }
  return mapa;
}

function actorTransicion(user: UsuarioAutenticado, ctx: ContextoAuditoria) {
  return {
    actor: { tipo: user.rol === 'ADMINISTRADOR' ? ('ADMINISTRADOR' as const) : ('FUNCIONARIO' as const), id: user.id },
    contexto: { ip: ctx.ip ?? null, user_agent: ctx.user_agent ?? null, request_id: ctx.request_id ?? null, actor_rol: user.rol === 'ADMINISTRADOR' ? ('ADMINISTRADOR' as const) : ('FUNCIONARIO' as const) },
  };
}

function exigirVersion(ctx: ContextoPostulacion, version: number | undefined): void {
  if (version != null && version !== ctx.version) {
    throw AppError.conflicto('VERSION_CONFLICTO', 'La postulacion fue modificada; recargue para continuar', { version_actual: ctx.version });
  }
}

/* ------------------------------------------------------------------------- */
/* Servicio                                                                   */
/* ------------------------------------------------------------------------- */

export const asignacionesService = {
  /** Pool PENDIENTE del comite del funcionario (sin conflicto) + sus asignaciones ACTIVAS. Lista blanca de campos. */
  async bandeja(user: UsuarioAutenticado, query: BandejaQuery): Promise<Paginado<ResumenBandejaDto>> {
    const { data, error } = await supabaseAdmin.rpc('fn_asignacion_bandeja', {
      p_funcionario: user.id,
      p_vista: query.vista,
      p_convocatoria: query.convocatoria_id ?? null,
      p_tipo: query.tipo_solicitud ?? null,
      p_beneficio: query.beneficio ?? null,
      p_limit: query.page_size,
      p_offset: (query.page - 1) * query.page_size,
    });
    if (error) fallo('No fue posible consultar la bandeja', error);
    const filas = (data ?? []) as FilaBandeja[];
    const resumenes: ResumenBandejaDto[] = [];
    for (const f of filas) {
      resumenes.push({
        postulacion_id: f.postulacion_id,
        codigo_expediente: codigoExpediente(f.convocatoria_anio, f.convocatoria_semestre, f.postulacion_id),
        convocatoria_id: f.convocatoria_id,
        convocatoria_nombre: f.convocatoria_nombre,
        tipo_solicitud: f.tipo_solicitud,
        beneficios_solicitados: (f.beneficios ?? []) as ResumenBandejaDto['beneficios_solicitados'],
        estado: f.estado,
        ciclo: f.ciclo,
        enviada_en: f.enviada_en,
        dias_habiles_en_espera: await diasHabilesDesde(f.enviada_en),
        asignacion: f.asignacion_estado ? { estado: f.asignacion_estado, titular: 'yo', asignada_en: f.asignada_en } : null,
        version: f.version,
      });
    }
    const total = filas.length > 0 ? Number(filas[0]?.total ?? filas.length) : 0;
    return paginar(resumenes, { page: query.page, page_size: query.page_size }, total);
  },

  /** Toma un expediente del pool: crea ACTIVA y transiciona PENDIENTE -> EN_EVALUACION. */
  async tomar(user: UsuarioAutenticado, ctx: ContextoAuditoria, postulacionId: string, input: TomarInput): Promise<AsignacionDto> {
    const antes = await cargarPostulacion(postulacionId);
    exigirVersion(antes, input.version);

    const { data, error } = await supabaseAdmin.rpc('fn_asignacion_tomar', {
      p_postulacion_id: postulacionId,
      p_funcionario_id: user.id,
      p_asignada_por: user.id,
      p_origen: 'TOMA',
    });
    if (error) throw errorDesdeSql(error);
    const asignacion = data as FilaAsignacion;

    let post: { estado: ContextoPostulacion['estado']; version: number };
    try {
      const t = actorTransicion(user, ctx);
      const fila = await postulacionService.transicionar(postulacionId, 'EN_EVALUACION', {
        actor: t.actor,
        motivo: 'TOMA',
        versionEsperada: input.version ?? null,
        contexto: t.contexto,
      });
      post = { estado: fila.estado, version: fila.version };
    } catch (e) {
      // La transicion fallo: se retira la asignacion recien creada para no dejar un expediente sin estado coherente.
      await supabaseAdmin.from('postulacion_asignacion').delete().eq('id', asignacion.id);
      throw e;
    }

    await auditar({
      ...ctx,
      accion: 'TOMAR',
      entidad: 'ASIGNACION',
      entidad_id: asignacion.id,
      datos_despues: { postulacion_id: postulacionId, funcionario_id: user.id, estado: 'ACTIVA', ciclo: asignacion.ciclo },
      metadatos: { codigo_expediente: antes.codigo_expediente },
    });

    // El beneficiario solo ve "en revision"; nunca quien evalua.
    if (antes.beneficiario_usuario_id) {
      await notificar({
        usuario_id: antes.beneficiario_usuario_id,
        tipo: 'POSTULACION_EN_REVISION',
        titulo: 'Su postulacion esta en revision',
        mensaje: 'Su postulacion esta siendo revisada por el Equipo FOEST.',
        entidad: 'POSTULACION',
        entidad_id: postulacionId,
        url_destino: `/beneficiario/postulaciones/${postulacionId}`,
        clave_dedup: `POSTULACION_EN_REVISION:${postulacionId}:${antes.ciclo}`,
        canal: 'AMBOS',
      });
    }
    return aAsignacionDto(asignacion, antes, post);
  },

  /** El titular libera: EN_EVALUACION -> PENDIENTE; la asignacion queda LIBERADA (voluntaria). */
  async liberar(user: UsuarioAutenticado, ctx: ContextoAuditoria, postulacionId: string, input: LiberarInput): Promise<AsignacionDto> {
    const activa = await activaDe(postulacionId);
    if (!activa || activa.funcionario_id !== user.id) throw AppError.noEncontrado();
    const antes = await cargarPostulacion(postulacionId);
    exigirVersion(antes, input.version);

    const t = actorTransicion(user, ctx);
    const fila = await postulacionService.transicionar(postulacionId, 'PENDIENTE', {
      actor: t.actor,
      motivo: 'LIBERACION',
      observaciones: input.motivo ?? null,
      versionEsperada: input.version ?? null,
      contexto: t.contexto,
    });
    const liberada = (await marcarLiberada(activa.id, 'LIBERACION_VOLUNTARIA', user.id, input.motivo ?? null)) ?? { ...activa, estado: 'LIBERADA' as const };
    await auditar({
      ...ctx,
      accion: 'LIBERAR',
      entidad: 'ASIGNACION',
      entidad_id: activa.id,
      datos_antes: { estado: 'ACTIVA' },
      datos_despues: { estado: 'LIBERADA', motivo_liberacion: 'LIBERACION_VOLUNTARIA', postulacion_id: postulacionId },
      metadatos: { codigo_expediente: antes.codigo_expediente },
    });
    return aAsignacionDto(liberada, antes, { estado: fila.estado, version: fila.version });
  },

  /** Declara impedimento: libera (si es titular), registra el conflicto y excluye de forma permanente. */
  async declararConflicto(user: UsuarioAutenticado, ctx: ContextoAuditoria, postulacionId: string, input: ConflictoInteresInput): Promise<ConflictoInteresDto> {
    const antes = await cargarPostulacion(postulacionId);
    const activa = await activaDe(postulacionId);
    const esTitular = activa?.funcionario_id === user.id;
    if (esTitular) exigirVersion(antes, input.version);

    let estado = antes.estado;
    if (esTitular) {
      const t = actorTransicion(user, ctx);
      const fila = await postulacionService.transicionar(postulacionId, 'PENDIENTE', {
        actor: t.actor,
        motivo: 'CONFLICTO_INTERES',
        observaciones: input.motivo,
        versionEsperada: input.version ?? null,
        contexto: t.contexto,
      });
      estado = fila.estado;
    }
    const { data, error } = await supabaseAdmin.rpc('fn_asignacion_declarar_conflicto', {
      p_postulacion_id: postulacionId,
      p_funcionario_id: user.id,
      p_motivo: input.motivo,
    });
    if (error) throw errorDesdeSql(error);
    const resultado = data as { asignacion_liberada: boolean; declarado_en: string };

    await auditar({
      ...ctx,
      accion: 'CONFLICTO_INTERES',
      entidad: 'ASIGNACION',
      entidad_id: activa?.id ?? postulacionId,
      datos_despues: { postulacion_id: postulacionId, funcionario_id: user.id, asignacion_liberada: resultado.asignacion_liberada },
      metadatos: { codigo_expediente: antes.codigo_expediente, motivo: input.motivo },
    });
    // Se avisa a la administracion; nunca al beneficiario.
    await alertarAdministradores(
      'Conflicto de interes declarado',
      `Un funcionario declaro conflicto de interes sobre el expediente ${antes.codigo_expediente}. El expediente volvio al pool.`,
      `CONFLICTO_INTERES:${postulacionId}:${user.id}`,
      '/admin/asignaciones',
    );
    return { postulacion_id: postulacionId, declarado_en: resultado.declarado_en, postulacion_estado: estado };
  },

  /** Reasignacion individual (administrador): la postulacion sigue EN_EVALUACION con el nuevo titular. */
  async reasignar(user: UsuarioAutenticado, ctx: ContextoAuditoria, postulacionId: string, input: ReasignarInput): Promise<AsignacionDto> {
    const antes = await cargarPostulacion(postulacionId);
    exigirVersion(antes, input.version);
    const { data, error } = await supabaseAdmin.rpc('fn_asignacion_reasignar', {
      p_postulacion_id: postulacionId,
      p_destino_id: input.funcionario_id,
      p_actor_id: user.id,
      p_origen: 'REASIGNACION_ADMIN',
      p_observacion: input.motivo,
    });
    if (error) throw errorDesdeSql(error);
    const r = data as { anterior_id: string; anterior_funcionario_id: string; nueva: FilaAsignacion };

    await auditar({
      ...ctx,
      accion: 'REASIGNAR',
      entidad: 'ASIGNACION',
      entidad_id: r.nueva.id,
      datos_antes: { asignacion_id: r.anterior_id, funcionario_id: r.anterior_funcionario_id },
      datos_despues: { asignacion_id: r.nueva.id, funcionario_id: input.funcionario_id, postulacion_id: postulacionId },
      metadatos: { motivo: input.motivo, codigo_expediente: antes.codigo_expediente },
    });
    await notificar({
      usuario_id: r.anterior_funcionario_id,
      tipo: 'ASIGNACION_REASIGNADA',
      titulo: 'Expediente reasignado',
      mensaje: `El expediente ${antes.codigo_expediente} fue reasignado a otro evaluador por la administracion.`,
      entidad: 'ASIGNACION',
      entidad_id: r.anterior_id,
      url_destino: '/funcionario/bandeja',
      clave_dedup: `ASIGNACION_REASIGNADA:${r.anterior_id}`,
    });
    await notificar({
      usuario_id: input.funcionario_id,
      tipo: 'ASIGNACION_NUEVA',
      titulo: 'Nuevo expediente asignado',
      mensaje: `La administracion le asigno el expediente ${antes.codigo_expediente}.`,
      entidad: 'ASIGNACION',
      entidad_id: r.nueva.id,
      url_destino: '/funcionario/bandeja',
      clave_dedup: `ASIGNACION_NUEVA:${r.nueva.id}`,
    });
    return aAsignacionDto(r.nueva, antes);
  },

  /** Reasignacion masiva (administrador). Sin destino devuelve todo al pool. Idempotente. */
  async reasignarMasivo(user: UsuarioAutenticado, ctx: ContextoAuditoria, input: ReasignarMasivoInput): Promise<ResultadoReasignacionMasivoDto> {
    const { data: origen, error: errOrigen } = await supabaseAdmin.from('usuario').select('id, rol, activo').eq('id', input.funcionario_origen_id).maybeSingle();
    if (errOrigen) fallo('No fue posible consultar el funcionario de origen', errOrigen);
    if (!origen || (origen as { rol: string }).rol !== 'FUNCIONARIO') throw AppError.noEncontrado();
    const origenActivo = (origen as { activo: boolean }).activo;

    if (input.funcionario_destino_id) {
      if (input.funcionario_destino_id === input.funcionario_origen_id) {
        throw AppError.datosInvalidos('DESTINO_INVALIDO', 'El funcionario de destino debe ser distinto del de origen');
      }
      const { data: destino, error: errDestino } = await supabaseAdmin.from('usuario').select('id, rol, activo').eq('id', input.funcionario_destino_id).maybeSingle();
      if (errDestino) fallo('No fue posible consultar el funcionario de destino', errDestino);
      const d = destino as { rol: string; activo: boolean } | null;
      if (!d || d.rol !== 'FUNCIONARIO' || !d.activo) {
        throw AppError.datosInvalidos('DESTINO_INVALIDO', 'El funcionario de destino debe ser un funcionario activo');
      }
    }

    const { data: activas, error } = await supabaseAdmin
      .from('postulacion_asignacion')
      .select('*')
      .eq('funcionario_id', input.funcionario_origen_id)
      .eq('estado', 'ACTIVA')
      .order('asignada_en', { ascending: true });
    if (error) fallo('No fue posible consultar las asignaciones activas', error);

    const resultado: ResultadoReasignacionMasivoDto = { procesadas: 0, reasignadas: 0, devueltas_al_pool: 0, omitidas: [] };
    const t = actorTransicion(user, ctx);
    for (const activa of (activas ?? []) as FilaAsignacion[]) {
      resultado.procesadas += 1;
      let codigo = activa.postulacion_id;
      try {
        const post = await cargarPostulacion(activa.postulacion_id);
        codigo = post.codigo_expediente;
        if (input.funcionario_destino_id) {
          const { error: errR } = await supabaseAdmin.rpc('fn_asignacion_reasignar', {
            p_postulacion_id: activa.postulacion_id,
            p_destino_id: input.funcionario_destino_id,
            p_actor_id: user.id,
            p_origen: 'REASIGNACION_MASIVA',
            p_observacion: input.motivo ?? null,
          });
          if (errR) throw errorDesdeSql(errR);
          resultado.reasignadas += 1;
        } else {
          await postulacionService.transicionar(activa.postulacion_id, 'PENDIENTE', {
            actor: t.actor,
            motivo: 'REASIGNACION',
            observaciones: input.motivo ?? null,
            contexto: t.contexto,
          });
          await marcarLiberada(activa.id, origenActivo ? 'REASIGNACION' : 'DESHABILITACION', user.id, input.motivo ?? null);
          resultado.devueltas_al_pool += 1;
        }
      } catch (e) {
        if (e instanceof AppError && e.status === 503) throw e;
        const motivo = e instanceof AppError ? e.message : 'No fue posible procesar la asignacion';
        resultado.omitidas.push({ postulacion_id: activa.postulacion_id, codigo_expediente: codigo, motivo });
      }
    }

    await auditar({
      ...ctx,
      accion: 'REASIGNAR',
      entidad: 'ASIGNACION',
      entidad_id: input.funcionario_origen_id,
      datos_antes: { funcionario_id: input.funcionario_origen_id },
      datos_despues: { funcionario_id: input.funcionario_destino_id ?? null },
      metadatos: {
        masivo: true,
        motivo: input.motivo ?? null,
        procesadas: resultado.procesadas,
        reasignadas: resultado.reasignadas,
        devueltas_al_pool: resultado.devueltas_al_pool,
        omitidas: resultado.omitidas.length,
      },
    });
    if (resultado.reasignadas + resultado.devueltas_al_pool > 0) {
      const movidas = resultado.reasignadas + resultado.devueltas_al_pool;
      await notificar({
        usuario_id: input.funcionario_origen_id,
        tipo: 'ASIGNACION_REASIGNADA',
        titulo: 'Expedientes reasignados',
        mensaje: `La administracion reasigno ${movidas} expediente(s) que tenia a su cargo.`,
        entidad: 'ASIGNACION',
        url_destino: '/funcionario/bandeja',
        clave_dedup: `REASIGNACION_MASIVA:${input.funcionario_origen_id}:${Date.now()}`,
      });
      if (input.funcionario_destino_id && resultado.reasignadas > 0) {
        await notificar({
          usuario_id: input.funcionario_destino_id,
          tipo: 'ASIGNACION_NUEVA',
          titulo: 'Nuevos expedientes asignados',
          mensaje: `La administracion le asigno ${resultado.reasignadas} expediente(s).`,
          entidad: 'ASIGNACION',
          url_destino: '/funcionario/bandeja',
          clave_dedup: `REASIGNACION_MASIVA_DESTINO:${input.funcionario_destino_id}:${Date.now()}`,
        });
      }
    }
    if (resultado.omitidas.length > 0) {
      await alertarAdministradores(
        'Reasignacion masiva con expedientes omitidos',
        `La reasignacion masiva omitio ${resultado.omitidas.length} expediente(s). Revise las alertas de asignaciones y reasignelos individualmente.`,
        `REASIGNACION_OMITIDOS:${input.funcionario_origen_id}:${Date.now()}`,
        '/admin/asignaciones',
      );
    }
    return resultado;
  },

  /** Historial de asignaciones, liberaciones y conflictos. Administrador: todo; titular: solo lo propio. */
  async historial(user: UsuarioAutenticado, ctx: ContextoAuditoria, postulacionId: string): Promise<HistorialAsignacionDto[]> {
    const post = await cargarPostulacion(postulacionId);
    const esAdmin = user.rol === 'ADMINISTRADOR';
    const { data: asigs, error } = await supabaseAdmin
      .from('postulacion_asignacion')
      .select('*')
      .eq('postulacion_id', postulacionId)
      .order('asignada_en', { ascending: true });
    if (error) fallo('No fue posible consultar el historial', error);
    const { data: conflictos, error: errC } = await supabaseAdmin.from('conflicto_interes').select('*').eq('postulacion_id', postulacionId);
    if (errC) fallo('No fue posible consultar los conflictos de interes', errC);

    const todas = (asigs ?? []) as FilaAsignacion[];
    const confs = (conflictos ?? []) as Array<{ id: string; funcionario_id: string; motivo: string; declarado_en: string }>;
    const propias = todas.filter((a) => a.funcionario_id === user.id);
    if (!esAdmin && propias.length === 0) throw AppError.noEncontrado();

    const visiblesA = esAdmin ? todas : propias;
    const visiblesC = esAdmin ? confs : confs.filter((c) => c.funcionario_id === user.id);
    const nombres = esAdmin ? await nombresFuncionarios([...visiblesA.map((a) => a.funcionario_id), ...visiblesC.map((c) => c.funcionario_id)]) : new Map<string, string>();

    const eventos: HistorialAsignacionDto[] = [];
    for (const a of visiblesA) {
      eventos.push({
        id: `${a.id}:asignada`,
        evento: 'ASIGNADA',
        funcionario_id: a.funcionario_id,
        funcionario_nombre: nombres.get(a.funcionario_id) ?? null,
        ciclo: a.ciclo,
        origen: a.origen,
        motivo_liberacion: null,
        motivo: null,
        actor_id: esAdmin ? a.asignada_por : null,
        ocurrido_en: a.asignada_en,
      });
      if (a.liberada_en) {
        eventos.push({
          id: `${a.id}:liberada`,
          evento: 'LIBERADA',
          funcionario_id: a.funcionario_id,
          funcionario_nombre: nombres.get(a.funcionario_id) ?? null,
          ciclo: a.ciclo,
          origen: a.origen,
          motivo_liberacion: a.motivo_liberacion,
          motivo: a.observacion_liberacion,
          actor_id: esAdmin ? a.liberada_por : null,
          ocurrido_en: a.liberada_en,
        });
      }
    }
    for (const c of visiblesC) {
      eventos.push({
        id: c.id,
        evento: 'CONFLICTO_INTERES',
        funcionario_id: c.funcionario_id,
        funcionario_nombre: nombres.get(c.funcionario_id) ?? null,
        ciclo: null,
        origen: null,
        motivo_liberacion: null,
        motivo: c.motivo,
        actor_id: c.funcionario_id,
        ocurrido_en: c.declarado_en,
      });
    }
    eventos.sort((x, y) => x.ocurrido_en.localeCompare(y.ocurrido_en));

    if (esAdmin) {
      await auditar({
        ...ctx,
        accion: 'LECTURA_SENSIBLE',
        entidad: 'ASIGNACION',
        entidad_id: postulacionId,
        metadatos: { vista: 'historial_asignaciones', codigo_expediente: post.codigo_expediente },
      });
    }
    return eventos;
  },

  /** Asignaciones ACTIVAS sin movimiento > umbral (dias habiles), o con titular inactivo / fuera del comite. */
  async detectarSinMovimiento(): Promise<{ alertas: AlertaAsignacionDto[]; umbral: number }> {
    let umbral = UMBRAL_DEFECTO;
    try {
      umbral = await configuracionService.getEntero(CLAVE_UMBRAL, UMBRAL_DEFECTO);
    } catch (e) {
      logger.warn({ err: e }, 'No fue posible leer el umbral de alerta de asignaciones; se usa el valor por defecto');
    }
    const { data, error } = await supabaseAdmin
      .from('postulacion_asignacion')
      .select('*, postulacion:postulacion_id (convocatoria_id, convocatoria:convocatoria_id (nombre, anio, semestre)), titular:funcionario_id (activo)')
      .eq('estado', 'ACTIVA');
    if (error) fallo('No fue posible consultar las asignaciones activas', error);
    type Fila = FilaAsignacion & {
      postulacion: { convocatoria_id: string; convocatoria: { nombre: string; anio: number; semestre: number } | null } | null;
      titular: { activo: boolean } | null;
    };
    const filas = (data ?? []) as unknown as Fila[];
    if (filas.length === 0) return { alertas: [], umbral };

    const { data: comites, error: errComite } = await supabaseAdmin.from('asignacion_funcionario').select('convocatoria_id, funcionario_id').is('retirado_en', null);
    if (errComite) fallo('No fue posible consultar los comites', errComite);
    const enComite = new Set(((comites ?? []) as Array<{ convocatoria_id: string; funcionario_id: string }>).map((c) => `${c.convocatoria_id}:${c.funcionario_id}`));
    const nombres = await nombresFuncionarios(filas.map((f) => f.funcionario_id));

    const alertas: AlertaAsignacionDto[] = [];
    for (const f of filas) {
      const convocatoriaId = f.postulacion?.convocatoria_id ?? '';
      const conv = f.postulacion?.convocatoria ?? { nombre: '', anio: 0, semestre: 0 };
      const activo = f.titular?.activo ?? true;
      const dentro = enComite.has(`${convocatoriaId}:${f.funcionario_id}`);
      const dias = await diasHabilesDesde(f.ultimo_movimiento_en);
      const sinMovimiento = dias > umbral;
      if (!sinMovimiento && activo && dentro) continue;
      alertas.push({
        asignacion_id: f.id,
        postulacion_id: f.postulacion_id,
        codigo_expediente: codigoExpediente(conv.anio, conv.semestre, f.postulacion_id),
        convocatoria_id: convocatoriaId,
        convocatoria_nombre: conv.nombre,
        funcionario_id: f.funcionario_id,
        funcionario_nombre: nombres.get(f.funcionario_id) ?? '',
        funcionario_activo: activo,
        en_comite: dentro,
        asignada_en: f.asignada_en,
        ultimo_movimiento_en: f.ultimo_movimiento_en,
        dias_habiles_sin_movimiento: dias,
        prioridad: !activo || !dentro ? 'ALTA' : 'NORMAL',
        motivo: !activo ? 'TITULAR_INACTIVO' : !dentro ? 'FUERA_DE_COMITE' : 'SIN_MOVIMIENTO',
      });
    }
    alertas.sort((a, b) => (a.prioridad === b.prioridad ? b.dias_habiles_sin_movimiento - a.dias_habiles_sin_movimiento : a.prioridad === 'ALTA' ? -1 : 1));
    return { alertas, umbral };
  },

  async alertas(_user: UsuarioAutenticado, ctx: ContextoAuditoria, page: PaginacionQuery): Promise<Paginado<AlertaAsignacionDto>> {
    const { alertas } = await this.detectarSinMovimiento();
    const desde = (page.page - 1) * page.page_size;
    await auditar({ ...ctx, accion: 'LECTURA_SENSIBLE', entidad: 'ASIGNACION', metadatos: { vista: 'alertas_asignaciones', total: alertas.length } });
    return paginar(alertas.slice(desde, desde + page.page_size), page, alertas.length);
  },

  /** Funcionarios activos de los comites con su carga ACTIVA (selector de reasignacion). */
  async evaluadores(query: EvaluadoresQuery): Promise<EvaluadorCargaDto[]> {
    let convocatoriaPostulacion: string | null = null;
    if (query.postulacion_id) convocatoriaPostulacion = (await cargarPostulacion(query.postulacion_id)).convocatoria_id;

    let consulta = supabaseAdmin.from('asignacion_funcionario').select('convocatoria_id, funcionario_id').is('retirado_en', null);
    if (query.convocatoria_id) consulta = consulta.eq('convocatoria_id', query.convocatoria_id);
    const { data: miembros, error } = await consulta;
    if (error) fallo('No fue posible consultar los comites', error);
    const porFuncionario = new Map<string, string[]>();
    for (const m of (miembros ?? []) as Array<{ convocatoria_id: string; funcionario_id: string }>) {
      porFuncionario.set(m.funcionario_id, [...(porFuncionario.get(m.funcionario_id) ?? []), m.convocatoria_id]);
    }
    const ids = [...porFuncionario.keys()];
    if (ids.length === 0) return [];

    const { data: usuarios, error: errU } = await supabaseAdmin.from('usuario').select('id, email, activo').in('id', ids).eq('rol', 'FUNCIONARIO').eq('activo', true);
    if (errU) fallo('No fue posible consultar los funcionarios', errU);
    const activos = (usuarios ?? []) as Array<{ id: string; email: string; activo: boolean }>;
    const nombres = await nombresFuncionarios(activos.map((u) => u.id));

    const { data: cargas, error: errA } = await supabaseAdmin.from('postulacion_asignacion').select('funcionario_id').eq('estado', 'ACTIVA').in('funcionario_id', activos.map((u) => u.id));
    if (errA) fallo('No fue posible consultar la carga de los funcionarios', errA);
    const conteo = new Map<string, number>();
    for (const c of (cargas ?? []) as Array<{ funcionario_id: string }>) conteo.set(c.funcionario_id, (conteo.get(c.funcionario_id) ?? 0) + 1);

    let excluidos = new Set<string>();
    if (query.postulacion_id) {
      const { data: confs, error: errC } = await supabaseAdmin.from('conflicto_interes').select('funcionario_id').eq('postulacion_id', query.postulacion_id);
      if (errC) fallo('No fue posible consultar los conflictos de interes', errC);
      excluidos = new Set(((confs ?? []) as Array<{ funcionario_id: string }>).map((c) => c.funcionario_id));
    }

    return activos
      .map((u): EvaluadorCargaDto => {
        const convocatorias = porFuncionario.get(u.id) ?? [];
        const base: EvaluadorCargaDto = {
          funcionario_id: u.id,
          nombre: nombres.get(u.id) ?? u.email,
          email: u.email,
          activo: u.activo,
          convocatoria_ids: convocatorias,
          asignaciones_activas: conteo.get(u.id) ?? 0,
        };
        if (query.postulacion_id) {
          base.excluido = excluidos.has(u.id);
          base.en_comite_postulacion = convocatoriaPostulacion ? convocatorias.includes(convocatoriaPostulacion) : false;
        }
        return base;
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },

  /* ----- API para otros modulos (apps/api/src/modules/asignaciones/index.ts) ----- */

  async tieneAsignacionActiva(funcionarioId: string, postulacionId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from('postulacion_asignacion')
      .select('id', { count: 'exact', head: true })
      .eq('postulacion_id', postulacionId)
      .eq('funcionario_id', funcionarioId)
      .eq('estado', 'ACTIVA');
    if (error) fallo('No fue posible verificar la asignacion', error);
    return (count ?? 0) > 0;
  },

  async obtenerAsignacionActiva(postulacionId: string): Promise<{ id: string; funcionario_id: string } | null> {
    const fila = await activaDe(postulacionId);
    return fila ? { id: fila.id, funcionario_id: fila.funcionario_id } : null;
  },

  async esFuncionarioExcluido(funcionarioId: string, postulacionId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from('conflicto_interes')
      .select('id', { count: 'exact', head: true })
      .eq('postulacion_id', postulacionId)
      .eq('funcionario_id', funcionarioId);
    if (error) fallo('No fue posible verificar el conflicto de interes', error);
    return (count ?? 0) > 0;
  },

  /** Tiene el funcionario alguna asignacion (activa o liberada) sobre la postulacion. */
  async tuvoAsignacion(funcionarioId: string, postulacionId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from('postulacion_asignacion')
      .select('id', { count: 'exact', head: true })
      .eq('postulacion_id', postulacionId)
      .eq('funcionario_id', funcionarioId);
    if (error) fallo('No fue posible verificar la asignacion', error);
    return (count ?? 0) > 0;
  },

  /** Cierra la asignacion ACTIVA sin cambiar el estado de la postulacion (lo hace quien invoca). No-op si no hay. */
  async liberarAsignacionActiva(postulacionId: string, motivo: MotivoLiberacion, actorId: string | null): Promise<void> {
    const activa = await activaDe(postulacionId);
    if (!activa) return;
    await marcarLiberada(activa.id, motivo, actorId, null);
  },

  /** Registra actividad del titular (chequeo, consulta con escritura, dictamen). */
  async registrarMovimiento(postulacionId: string, funcionarioId?: string): Promise<void> {
    let q = supabaseAdmin.from('postulacion_asignacion').update({ ultimo_movimiento_en: new Date().toISOString() }).eq('postulacion_id', postulacionId).eq('estado', 'ACTIVA');
    if (funcionarioId) q = q.eq('funcionario_id', funcionarioId);
    const { error } = await q;
    if (error) fallo('No fue posible registrar el movimiento', error);
  },

  /** Hook de postulaciones: el beneficiario desistio; la asignacion ACTIVA se cierra (la postulacion ya es DESISTIDA). */
  async liberarPorDesistimiento(postulacionId: string): Promise<void> {
    const activa = await activaDe(postulacionId);
    if (!activa) return;
    await marcarLiberada(activa.id, 'DESISTIMIENTO', null, null);
    await auditar({
      actor_tipo: 'SISTEMA',
      accion: 'LIBERAR',
      entidad: 'ASIGNACION',
      entidad_id: activa.id,
      datos_antes: { estado: 'ACTIVA' },
      datos_despues: { estado: 'LIBERADA', motivo_liberacion: 'DESISTIMIENTO', postulacion_id: postulacionId },
    });
    await notificar({
      usuario_id: activa.funcionario_id,
      tipo: 'ASIGNACION_REASIGNADA',
      titulo: 'Expediente cerrado por desistimiento',
      mensaje: 'Uno de los expedientes a su cargo fue desistido y ya no requiere evaluacion.',
      entidad: 'ASIGNACION',
      entidad_id: activa.id,
      url_destino: '/funcionario/bandeja',
      clave_dedup: `ASIGNACION_DESISTIDA:${activa.id}`,
    });
  },

  /**
   * Hook de convocatorias al retirar a un funcionario del comite. `MANTENER` solo informa las
   * asignaciones ACTIVAS afectadas (quedan "fuera de comite" y en alertas). `LIBERAR` las cierra
   * con motivo CAMBIO_COMITE y devuelve las postulaciones al pool.
   */
  async sincronizarComite(convocatoriaId: string, funcionarioId: string, accion: 'LIBERAR' | 'MANTENER'): Promise<{ liberadas: number; afectadas: string[] }> {
    const { data, error } = await supabaseAdmin
      .from('postulacion_asignacion')
      .select('id, postulacion_id, postulacion:postulacion_id!inner (convocatoria_id)')
      .eq('funcionario_id', funcionarioId)
      .eq('estado', 'ACTIVA')
      .eq('postulacion.convocatoria_id', convocatoriaId);
    if (error) {
      // Sin la migracion aplicada no hay asignaciones por expediente que sincronizar.
      if (esErrorDeEsquema(error)) return { liberadas: 0, afectadas: [] };
      fallo('No fue posible consultar las asignaciones del funcionario', error);
    }
    const filas = (data ?? []) as unknown as Array<{ id: string; postulacion_id: string }>;
    const afectadas = filas.map((f) => f.postulacion_id);
    if (accion === 'MANTENER' || filas.length === 0) return { liberadas: 0, afectadas };

    let liberadas = 0;
    for (const f of filas) {
      try {
        await postulacionService.transicionar(f.postulacion_id, 'PENDIENTE', {
          actor: { tipo: 'SISTEMA' },
          motivo: 'LIBERACION',
          observaciones: 'Cambio de comite de la convocatoria',
        });
        await marcarLiberada(f.id, 'CAMBIO_COMITE', null, 'Cambio de comite de la convocatoria');
        liberadas += 1;
      } catch (e) {
        logger.error({ err: e, postulacion_id: f.postulacion_id }, 'No fue posible liberar una asignacion por cambio de comite');
      }
    }
    if (liberadas > 0) {
      await auditar({
        actor_tipo: 'SISTEMA',
        accion: 'LIBERAR',
        entidad: 'ASIGNACION',
        entidad_id: convocatoriaId,
        datos_despues: { funcionario_id: funcionarioId, motivo_liberacion: 'CAMBIO_COMITE', liberadas },
        metadatos: { postulaciones: afectadas },
      });
      await notificar({
        usuario_id: funcionarioId,
        tipo: 'COMITE_CAMBIADO',
        titulo: 'Cambio de comite',
        mensaje: `Fue retirado del comite de una convocatoria; ${liberadas} expediente(s) a su cargo volvieron al pool.`,
        entidad: 'ASIGNACION',
        url_destino: '/funcionario/bandeja',
        clave_dedup: `COMITE_LIBERADAS:${convocatoriaId}:${funcionarioId}:${Date.now()}`,
      });
    }
    return { liberadas, afectadas };
  },
};
