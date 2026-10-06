import type { SupabaseClient } from '@supabase/supabase-js';
import type { EstadoConvocatoria, EstadoPostulacion, Paginado } from '@foest/shared';
import { ESTADOS_POSTULACION_TERMINALES } from '@foest/shared';
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
import { configuracionService } from '../catalogos_configuracion';
import { encolarNotificacion } from '../notificaciones';
import {
  camposCalculados,
  cierreExclusivoDesdeFechaLocal,
  estaAbierta,
  fechaCierrePresentada,
  inicioDiaLocal,
  instanteCierrePresentado,
  diasRestantes,
  plazoVencido,
} from './convocatorias.fechas';
import type {
  ActualizarConvocatoriaInput,
  AmpliarInput,
  ArchivarInput,
  BeneficioOfertadoInput,
  ComiteInput,
  CrearConvocatoriaInput,
  DeshabilitarInput,
  ListarConvocatoriasQuery,
  VersionOpcionalInput,
} from './convocatorias.dto';
import type {
  AmpliacionRow,
  BeneficioOfertado,
  BeneficioRow,
  CambioEstadoRow,
  ConteoPostulaciones,
  ConvocatoriaDetalle,
  ConvocatoriaPublica,
  ConvocatoriaResumen,
  ConvocatoriaRow,
  ExpedienteAfectado,
  MiembroComite,
} from './convocatorias.types';

export { estaAbierta } from './convocatorias.fechas';

/** Contexto de auditoria que el controlador toma de la peticion (`contextoDesdeRequest(req)`). */
export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const SELECT_CONVOCATORIA = '*';
const SELECT_BENEFICIOS_OFERTADOS =
  'convocatoria_id, beneficio_id, cupos_estimados, presupuesto_asignado, valor_apoyo_referencial, beneficio:beneficio_id (id, codigo, nombre, categoria, descripcion, activo)';
const SELECT_CON_BENEFICIOS = `${SELECT_CONVOCATORIA}, convocatoria_beneficio (${SELECT_BENEFICIOS_OFERTADOS})`;

const ESTADOS_POSTULACION_EN_CURSO: EstadoPostulacion[] = ['BORRADOR', 'PENDIENTE', 'EN_EVALUACION', 'EN_CORRECCION'];

type OrigenCambio = 'ADMIN' | 'CRON' | 'TIEMPO_REAL';

// -----------------------------------------------------------------------------
// Utilidades internas
// -----------------------------------------------------------------------------

function fallo(mensaje: string, error: { message?: string } | null): never {
  throw AppError.interno(`${mensaje}: ${error?.message ?? 'sin detalle'}`);
}

function dbDe(user: UsuarioAutenticado): SupabaseClient {
  // El administrador opera con service_role (ya paso requirePermission); los demas con RLS.
  return user.rol === 'ADMINISTRADOR' ? supabaseAdmin : supabaseAsUser(user.token);
}

type FilaConBeneficios = ConvocatoriaRow & {
  convocatoria_beneficio?: Array<{
    cupos_estimados: number;
    presupuesto_asignado: number | string;
    valor_apoyo_referencial: number | string;
    beneficio: BeneficioRow | BeneficioRow[] | null;
  }> | null;
};

function unoDe<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function mapearBeneficios(fila: FilaConBeneficios): BeneficioOfertado[] {
  return (fila.convocatoria_beneficio ?? [])
    .map((cb) => {
      const b = unoDe(cb.beneficio);
      if (!b) return null;
      return {
        codigo: b.codigo,
        nombre: b.nombre,
        categoria: b.categoria,
        descripcion: b.descripcion,
        cupos_estimados: Number(cb.cupos_estimados),
        presupuesto_asignado: Number(cb.presupuesto_asignado),
        valor_apoyo_referencial: Number(cb.valor_apoyo_referencial),
      } satisfies BeneficioOfertado;
    })
    .filter((b): b is BeneficioOfertado => b !== null)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

function aResumen(fila: FilaConBeneficios, ahora = new Date()): ConvocatoriaResumen {
  const { convocatoria_beneficio: _omitido, ...base } = fila;
  return { ...(base as ConvocatoriaRow), ...camposCalculados(fila, ahora), beneficios: mapearBeneficios(fila) };
}

function aPublica(fila: FilaConBeneficios, ahora = new Date()): ConvocatoriaPublica {
  return {
    id: fila.id,
    nombre: fila.nombre,
    anio: fila.anio,
    semestre: fila.semestre,
    descripcion: fila.descripcion,
    fecha_apertura: fila.fecha_apertura,
    fecha_cierre: fechaCierrePresentada(fila.fecha_cierre_exclusiva),
    fecha_cierre_presentada: instanteCierrePresentado(fila.fecha_cierre_exclusiva),
    dias_restantes: diasRestantes(fila.fecha_cierre_exclusiva, ahora),
    beneficios: mapearBeneficios(fila).map(({ presupuesto_asignado: _p, ...b }) => b),
  };
}

function sinDatosInternos(resumen: ConvocatoriaResumen): ConvocatoriaResumen {
  return {
    ...resumen,
    motivo_suspension: null,
    recordatorio_cierre_enviado_en: null,
    creado_por: null,
    beneficios: resumen.beneficios.map((b) => ({ ...b, presupuesto_asignado: 0 })),
  };
}

/** Lecturas de configuracion delegadas a catalogos_configuracion (cache 60 s; defecto del catalogo si no hay fila). */
async function leerConfigInt(clave: string, defecto: number): Promise<number> {
  try {
    return await configuracionService.getEntero(clave, defecto);
  } catch (e) {
    logger.warn({ err: e, clave }, 'No fue posible leer la configuracion; se usa el valor por defecto');
    return defecto;
  }
}

async function leerConfigTexto(clave: string): Promise<string | null> {
  try {
    const v = await configuracionService.get(clave);
    return v && v.trim() !== '' ? v : null;
  } catch (e) {
    logger.warn({ err: e, clave }, 'No fue posible leer la configuracion');
    return null;
  }
}

/**
 * Alcance del funcionario: convocatorias en cuyo comite participa o participo
 * (se conserva la visibilidad de solo lectura historica). RLS permite a cualquier
 * autenticado leer las abiertas, por eso el servicio aplica el alcance explicitamente.
 */
async function idsComiteDe(funcionarioId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from('asignacion_funcionario').select('convocatoria_id').eq('funcionario_id', funcionarioId);
  if (error) fallo('No fue posible consultar el comite del funcionario', error);
  return [...new Set(((data ?? []) as Array<{ convocatoria_id: string }>).map((a) => a.convocatoria_id))];
}

async function cargarAdmin(id: string): Promise<FilaConBeneficios | null> {
  const { data, error } = await supabaseAdmin.from('convocatoria').select(SELECT_CON_BENEFICIOS).eq('id', id).maybeSingle();
  if (error) fallo('No fue posible consultar la convocatoria', error);
  return (data as FilaConBeneficios | null) ?? null;
}

async function cargarAdminOFallar(id: string): Promise<FilaConBeneficios> {
  const fila = await cargarAdmin(id);
  if (!fila) throw AppError.noEncontrado();
  return fila;
}

/** Bloqueo optimista: `UPDATE ... WHERE id = ? AND version = ?`; sin fila afectada -> 409. */
async function actualizarConVersion(
  id: string,
  versionEsperada: number,
  cambios: Partial<ConvocatoriaRow>,
): Promise<FilaConBeneficios> {
  const { data, error } = await supabaseAdmin
    .from('convocatoria')
    .update({ ...cambios, version: versionEsperada + 1 })
    .eq('id', id)
    .eq('version', versionEsperada)
    .select(SELECT_CON_BENEFICIOS)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw AppError.conflicto('CONVOCATORIA_DUPLICADA', 'Ya existe una convocatoria para ese anio y semestre');
    }
    fallo('No fue posible actualizar la convocatoria', error);
  }
  if (!data) {
    throw AppError.conflicto('VERSION_DESACTUALIZADA', 'La convocatoria fue modificada por otro usuario; recargue e intente de nuevo');
  }
  return data as FilaConBeneficios;
}

function verificarVersion(fila: ConvocatoriaRow, version?: number): number {
  if (version !== undefined && version !== fila.version) {
    throw AppError.conflicto('VERSION_DESACTUALIZADA', 'La convocatoria fue modificada por otro usuario; recargue e intente de nuevo', {
      version_actual: fila.version,
    });
  }
  return fila.version;
}

async function registrarCambioEstado(
  convocatoriaId: string,
  desde: EstadoConvocatoria | null,
  hasta: EstadoConvocatoria,
  origen: OrigenCambio,
  actorId: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin.from('convocatoria_cambio_estado').insert({
    convocatoria_id: convocatoriaId,
    estado_desde: desde,
    estado_hasta: hasta,
    origen,
    actor_id: actorId,
  });
  if (error) fallo('No fue posible registrar el cambio de estado', error);
}

async function resolverBeneficios(lista: BeneficioOfertadoInput[]): Promise<Array<BeneficioOfertadoInput & { beneficio_id: string }>> {
  if (lista.length === 0) return [];
  const codigos = lista.map((b) => b.codigo);
  const { data, error } = await supabaseAdmin.from('beneficio').select('id, codigo, activo').in('codigo', codigos);
  if (error) fallo('No fue posible consultar el catalogo de beneficios', error);
  const porCodigo = new Map((data ?? []).map((b) => [b.codigo as string, b as { id: string; codigo: string; activo: boolean }]));
  const invalidos = codigos.filter((c) => !porCodigo.get(c)?.activo);
  if (invalidos.length > 0) {
    throw AppError.datosInvalidos('BENEFICIO_INVALIDO', 'Uno o mas beneficios no existen o estan inactivos', { codigos: invalidos });
  }
  return lista.map((b) => ({ ...b, beneficio_id: porCodigo.get(b.codigo)!.id }));
}

async function reemplazarBeneficios(convocatoriaId: string, lista: BeneficioOfertadoInput[]): Promise<void> {
  const resueltos = await resolverBeneficios(lista);
  const { error: errDel } = await supabaseAdmin.from('convocatoria_beneficio').delete().eq('convocatoria_id', convocatoriaId);
  if (errDel) fallo('No fue posible actualizar los beneficios ofertados', errDel);
  if (resueltos.length === 0) return;
  const { error } = await supabaseAdmin.from('convocatoria_beneficio').insert(
    resueltos.map((b) => ({
      convocatoria_id: convocatoriaId,
      beneficio_id: b.beneficio_id,
      cupos_estimados: b.cupos_estimados,
      presupuesto_asignado: b.presupuesto_asignado,
      valor_apoyo_referencial: b.valor_apoyo_referencial,
    })),
  );
  if (error) fallo('No fue posible registrar los beneficios ofertados', error);
}

async function contarPostulacionesPorEstado(convocatoriaId: string): Promise<ConteoPostulaciones> {
  const { data, error } = await supabaseAdmin.from('postulacion').select('estado').eq('convocatoria_id', convocatoriaId);
  if (error) fallo('No fue posible consultar las postulaciones de la convocatoria', error);
  const conteo: ConteoPostulaciones = {};
  for (const p of (data ?? []) as Array<{ estado: EstadoPostulacion }>) {
    conteo[p.estado] = (conteo[p.estado] ?? 0) + 1;
  }
  return conteo;
}

async function listarAmpliaciones(convocatoriaId: string): Promise<AmpliacionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('ampliacion_convocatoria')
    .select('*')
    .eq('convocatoria_id', convocatoriaId)
    .order('fecha_ampliacion', { ascending: false });
  if (error) fallo('No fue posible consultar las ampliaciones', error);
  return (data ?? []) as AmpliacionRow[];
}

async function listarCambiosEstado(convocatoriaId: string): Promise<CambioEstadoRow[]> {
  const { data, error } = await supabaseAdmin
    .from('convocatoria_cambio_estado')
    .select('*')
    .eq('convocatoria_id', convocatoriaId)
    .order('registrado_en', { ascending: false });
  if (error) fallo('No fue posible consultar el historial de estados', error);
  return (data ?? []) as CambioEstadoRow[];
}

type FilaComite = {
  funcionario_id: string;
  asignado_en: string;
  usuario:
    | { email: string; activo: boolean; funcionario: { nombres: string; apellidos: string; cargo: string | null } | Array<{ nombres: string; apellidos: string; cargo: string | null }> | null }
    | Array<{ email: string; activo: boolean; funcionario: unknown }>
    | null;
};

async function listarComiteActivo(convocatoriaId: string): Promise<MiembroComite[]> {
  const { data, error } = await supabaseAdmin
    .from('asignacion_funcionario')
    .select('funcionario_id, asignado_en, usuario:funcionario_id (email, activo, funcionario (nombres, apellidos, cargo))')
    .eq('convocatoria_id', convocatoriaId)
    .is('retirado_en', null)
    .order('asignado_en', { ascending: true });
  if (error) fallo('No fue posible consultar el comite', error);
  return ((data ?? []) as unknown as FilaComite[]).map((f) => {
    const u = unoDe(f.usuario as FilaComite['usuario'] & object) as
      | { email: string; activo: boolean; funcionario: unknown }
      | null;
    const perfil = unoDe((u?.funcionario ?? null) as { nombres: string; apellidos: string; cargo: string | null } | null);
    return {
      funcionario_id: f.funcionario_id,
      email: u?.email ?? '',
      nombres: perfil?.nombres ?? null,
      apellidos: perfil?.apellidos ?? null,
      cargo: perfil?.cargo ?? null,
      activo: u?.activo ?? false,
      asignado_en: f.asignado_en,
    };
  });
}

/**
 * Cierre oportunista (idempotente): si una HABILITADA/SUSPENDIDA ya vencio se
 * marca CERRADA con bloqueo por version. Devuelve la fila vigente.
 */
async function sincronizarSiVencida(fila: FilaConBeneficios, origen: OrigenCambio = 'TIEMPO_REAL'): Promise<FilaConBeneficios> {
  if ((fila.estado !== 'HABILITADA' && fila.estado !== 'SUSPENDIDA') || !plazoVencido(fila)) return fila;
  const { data, error } = await supabaseAdmin
    .from('convocatoria')
    .update({ estado: 'CERRADA', version: fila.version + 1 })
    .eq('id', fila.id)
    .eq('version', fila.version)
    .in('estado', ['HABILITADA', 'SUSPENDIDA'])
    .select(SELECT_CON_BENEFICIOS)
    .maybeSingle();
  if (error) fallo('No fue posible cerrar la convocatoria vencida', error);
  if (!data) {
    // Otra instancia la cerro primero: se relee.
    return (await cargarAdmin(fila.id)) ?? fila;
  }
  await registrarCambioEstado(fila.id, fila.estado, 'CERRADA', origen, null);
  await auditar({
    actor_tipo: 'SISTEMA',
    accion: 'CERRAR',
    entidad: 'CONVOCATORIA',
    entidad_id: fila.id,
    datos_antes: { estado: fila.estado, version: fila.version },
    datos_despues: { estado: 'CERRADA', version: fila.version + 1 },
    metadatos: { origen },
  });
  return data as FilaConBeneficios;
}

// -----------------------------------------------------------------------------
// Cache corta para la vista publica (60 s)
// -----------------------------------------------------------------------------
const CACHE_PUBLICO_MS = 60_000;
let cachePublico: { en: number; datos: FilaConBeneficios[] } | null = null;

function invalidarCachePublico(): void {
  cachePublico = null;
}

async function convocatoriasAbiertasCrudas(): Promise<FilaConBeneficios[]> {
  const ahora = Date.now();
  if (cachePublico && ahora - cachePublico.en < CACHE_PUBLICO_MS) return cachePublico.datos;
  const nowIso = new Date(ahora).toISOString();
  const { data, error } = await supabaseAdmin
    .from('convocatoria')
    .select(SELECT_CON_BENEFICIOS)
    .eq('estado', 'HABILITADA')
    .lte('fecha_apertura', nowIso)
    .gt('fecha_cierre_exclusiva', nowIso)
    .order('fecha_cierre_exclusiva', { ascending: true });
  if (error) fallo('No fue posible consultar las convocatorias publicas', error);
  const datos = (data ?? []) as FilaConBeneficios[];
  cachePublico = { en: ahora, datos };
  return datos;
}

// -----------------------------------------------------------------------------
// Servicio
// -----------------------------------------------------------------------------
export const convocatoriasService = {
  // ---- Catalogo ---------------------------------------------------------------
  async listarBeneficios(user: UsuarioAutenticado): Promise<BeneficioRow[]> {
    const db = dbDe(user);
    const { data, error } = await db.from('beneficio').select('id, codigo, nombre, categoria, descripcion, activo').eq('activo', true).order('codigo');
    if (error) fallo('No fue posible consultar el catalogo de beneficios', error);
    return (data ?? []) as BeneficioRow[];
  },

  // ---- Lectura ----------------------------------------------------------------
  async listar(
    user: UsuarioAutenticado,
    query: ListarConvocatoriasQuery,
  ): Promise<Paginado<ConvocatoriaResumen> & { proxima_apertura_estimada: string | null }> {
    const db = dbDe(user);
    const ahora = new Date();
    const nowIso = ahora.toISOString();
    const { desde, hasta } = rangoSupabase(query);
    let q = db.from('convocatoria').select(SELECT_CON_BENEFICIOS, { count: 'exact' });
    const soloAbiertas = user.rol === 'BENEFICIARIO' || query.abiertas === true;
    if (soloAbiertas) {
      q = q.eq('estado', 'HABILITADA').lte('fecha_apertura', nowIso).gt('fecha_cierre_exclusiva', nowIso);
    } else if (query.estado) {
      q = q.eq('estado', query.estado);
    }
    if (query.anio !== undefined) q = q.eq('anio', query.anio);
    if (query.semestre !== undefined) q = q.eq('semestre', query.semestre);
    if (user.rol === 'FUNCIONARIO') {
      const ids = await idsComiteDe(user.id);
      if (ids.length === 0) return { ...paginar([], query, 0), proxima_apertura_estimada: await leerConfigTexto('FECHA_PROXIMA_APERTURA_ESTIMADA') };
      q = q.in('id', ids);
    }
    const { data, error, count } = await q.order('anio', { ascending: false }).order('semestre', { ascending: false }).range(desde, hasta);
    if (error) fallo('No fue posible consultar las convocatorias', error);
    const filas = (data ?? []) as FilaConBeneficios[];
    let resumenes = filas.map((f) => aResumen(f, ahora));
    if (user.rol === 'BENEFICIARIO') resumenes = resumenes.map(sinDatosInternos);

    if (user.rol !== 'BENEFICIARIO' && resumenes.length > 0) {
      const ids = resumenes.map((r) => r.id);
      const { data: posts } = await supabaseAdmin.from('postulacion').select('convocatoria_id').in('convocatoria_id', ids).neq('estado', 'BORRADOR');
      const conteo = new Map<string, number>();
      for (const p of (posts ?? []) as Array<{ convocatoria_id: string }>) conteo.set(p.convocatoria_id, (conteo.get(p.convocatoria_id) ?? 0) + 1);
      resumenes = resumenes.map((r) => ({ ...r, postulaciones_total: conteo.get(r.id) ?? 0 }));
    }

    const hayAbiertas = resumenes.some((r) => r.abierta);
    const proxima = hayAbiertas ? null : await leerConfigTexto('FECHA_PROXIMA_APERTURA_ESTIMADA');
    return { ...paginar(resumenes, query, count ?? 0), proxima_apertura_estimada: proxima };
  },

  async obtener(user: UsuarioAutenticado, id: string): Promise<ConvocatoriaDetalle | ConvocatoriaResumen> {
    const db = dbDe(user);
    const { data, error } = await db.from('convocatoria').select(SELECT_CON_BENEFICIOS).eq('id', id).maybeSingle();
    if (error) fallo('No fue posible consultar la convocatoria', error);
    let fila = (data as FilaConBeneficios | null) ?? null;
    if (!fila) throw AppError.noEncontrado(); // ajena / no visible (RLS) -> 404
    if (user.rol === 'FUNCIONARIO' && !(await idsComiteDe(user.id)).includes(id)) throw AppError.noEncontrado();
    fila = await sincronizarSiVencida(fila);

    if (user.rol === 'BENEFICIARIO') {
      if (!estaAbierta(fila)) throw AppError.noEncontrado();
      return sinDatosInternos(aResumen(fila));
    }
    const [ampliaciones, cambios_estado, postulaciones_por_estado, comite] = await Promise.all([
      listarAmpliaciones(id),
      listarCambiosEstado(id),
      contarPostulacionesPorEstado(id),
      user.rol === 'ADMINISTRADOR' ? listarComiteActivo(id) : Promise.resolve([] as MiembroComite[]),
    ]);
    const total = Object.values(postulaciones_por_estado).reduce((a, b) => a + (b ?? 0), 0);
    return { ...aResumen(fila), postulaciones_total: total, ampliaciones, cambios_estado, comite, postulaciones_por_estado };
  },

  // ---- Publico ----------------------------------------------------------------
  async listarPublicas(): Promise<{ data: ConvocatoriaPublica[]; proxima_apertura_estimada: string | null }> {
    const ahora = new Date();
    const filas = (await convocatoriasAbiertasCrudas()).filter((f) => estaAbierta(f, ahora));
    const proxima = filas.length === 0 ? await leerConfigTexto('FECHA_PROXIMA_APERTURA_ESTIMADA') : null;
    return { data: filas.map((f) => aPublica(f, ahora)), proxima_apertura_estimada: proxima };
  },

  async obtenerPublica(id: string): Promise<ConvocatoriaPublica> {
    const ahora = new Date();
    const fila = (await convocatoriasAbiertasCrudas()).find((f) => f.id === id && estaAbierta(f, ahora));
    if (!fila) throw AppError.noEncontrado();
    return aPublica(fila, ahora);
  },

  // ---- Escritura (ADMINISTRADOR) ---------------------------------------------
  async crear(user: UsuarioAutenticado, dto: CrearConvocatoriaInput, ctx: ContextoAuditoria): Promise<ConvocatoriaDetalle> {
    const resueltos = await resolverBeneficios(dto.beneficios);
    const fila = {
      anio: dto.anio,
      semestre: dto.semestre,
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      fecha_apertura: inicioDiaLocal(dto.fecha_apertura).toISOString(),
      fecha_cierre_exclusiva: cierreExclusivoDesdeFechaLocal(dto.fecha_cierre).toISOString(),
      estado: 'BORRADOR' as const,
      version: 0,
      creado_por: user.id,
    };
    const { data, error } = await supabaseAdmin.from('convocatoria').insert(fila).select(SELECT_CONVOCATORIA).single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw AppError.conflicto('CONVOCATORIA_DUPLICADA', `Ya existe una convocatoria para el periodo ${dto.anio}-${dto.semestre}`);
      }
      fallo('No fue posible crear la convocatoria', error);
    }
    const creada = data as ConvocatoriaRow;
    if (resueltos.length > 0) {
      const { error: errB } = await supabaseAdmin.from('convocatoria_beneficio').insert(
        resueltos.map((b) => ({
          convocatoria_id: creada.id,
          beneficio_id: b.beneficio_id,
          cupos_estimados: b.cupos_estimados,
          presupuesto_asignado: b.presupuesto_asignado,
          valor_apoyo_referencial: b.valor_apoyo_referencial,
        })),
      );
      if (errB) fallo('No fue posible registrar los beneficios ofertados', errB);
    }
    await registrarCambioEstado(creada.id, null, 'BORRADOR', 'ADMIN', user.id);
    await auditar({ ...ctx, accion: 'CREAR', entidad: 'CONVOCATORIA', entidad_id: creada.id, datos_despues: { ...creada, beneficios: dto.beneficios } });
    return (await this.obtener(user, creada.id)) as ConvocatoriaDetalle;
  },

  async actualizar(user: UsuarioAutenticado, id: string, dto: ActualizarConvocatoriaInput, ctx: ContextoAuditoria): Promise<ConvocatoriaDetalle> {
    const actual = await cargarAdminOFallar(id);
    const version = verificarVersion(actual, dto.version);

    const cambios: Partial<ConvocatoriaRow> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion;

    const tocaEstructura =
      dto.anio !== undefined || dto.semestre !== undefined || dto.fecha_apertura !== undefined || dto.fecha_cierre !== undefined;
    const tocaBeneficios = dto.beneficios !== undefined;

    if (actual.estado === 'BORRADOR') {
      if (dto.anio !== undefined) cambios.anio = dto.anio;
      if (dto.semestre !== undefined) cambios.semestre = dto.semestre;
      const apertura = dto.fecha_apertura ?? camposCalculados(actual).fecha_apertura_local;
      const cierre = dto.fecha_cierre ?? camposCalculados(actual).fecha_cierre;
      if (cierre < apertura) {
        throw AppError.datosInvalidos('FECHAS_INVALIDAS', 'La fecha de cierre debe ser igual o posterior a la fecha de apertura');
      }
      if (dto.fecha_apertura !== undefined) cambios.fecha_apertura = inicioDiaLocal(dto.fecha_apertura).toISOString();
      if (dto.fecha_cierre !== undefined) cambios.fecha_cierre_exclusiva = cierreExclusivoDesdeFechaLocal(dto.fecha_cierre).toISOString();
    } else if (actual.estado === 'HABILITADA' || actual.estado === 'SUSPENDIDA') {
      // Solo nombre, descripcion y valores informativos (nunca fechas ni periodo; las fechas cambian por `ampliar`).
      if (tocaEstructura) {
        throw AppError.conflicto('ESTADO_NO_EDITABLE', 'Con la convocatoria habilitada solo se pueden editar nombre, descripcion y valores referenciales; el plazo se cambia con una ampliacion');
      }
      if (tocaBeneficios) {
        const ofertados = new Set(mapearBeneficios(actual).map((b) => b.codigo));
        const nuevos = dto.beneficios!.map((b) => b.codigo);
        const mismoConjunto = nuevos.length === ofertados.size && nuevos.every((c) => ofertados.has(c));
        if (!mismoConjunto) {
          throw AppError.conflicto('ESTADO_NO_EDITABLE', 'Con la convocatoria habilitada no se pueden agregar ni retirar beneficios');
        }
      }
    } else {
      throw AppError.conflicto('ESTADO_NO_EDITABLE', `Una convocatoria en estado ${actual.estado} no se puede editar`);
    }

    const actualizada = await actualizarConVersion(id, version, cambios);
    if (tocaBeneficios) await reemplazarBeneficios(id, dto.beneficios!);
    invalidarCachePublico();
    await auditar({
      ...ctx,
      accion: 'ACTUALIZAR',
      entidad: 'CONVOCATORIA',
      entidad_id: id,
      datos_antes: { ...actual, beneficios: mapearBeneficios(actual) },
      datos_despues: { ...actualizada, beneficios: dto.beneficios ?? mapearBeneficios(actual) },
    });
    return (await this.obtener(user, id)) as ConvocatoriaDetalle;
  },

  async habilitar(user: UsuarioAutenticado, id: string, dto: VersionOpcionalInput, ctx: ContextoAuditoria): Promise<ConvocatoriaDetalle> {
    const actual = await cargarAdminOFallar(id);
    const version = verificarVersion(actual, dto.version);
    if (actual.estado !== 'BORRADOR') {
      throw AppError.conflicto('TRANSICION_INVALIDA', `Solo se puede habilitar una convocatoria en BORRADOR (estado actual: ${actual.estado})`);
    }
    if (mapearBeneficios(actual).length === 0) {
      throw AppError.datosInvalidos('SIN_BENEFICIOS', 'La convocatoria debe ofertar al menos un beneficio');
    }
    const comite = await listarComiteActivo(id);
    if (comite.length === 0) {
      throw AppError.datosInvalidos('SIN_COMITE', 'La convocatoria debe tener al menos un funcionario en el comite');
    }
    if (plazoVencido(actual)) {
      throw AppError.datosInvalidos('FECHA_CIERRE_VENCIDA', 'La fecha de cierre debe ser futura');
    }
    const actualizada = await actualizarConVersion(id, version, { estado: 'HABILITADA', motivo_suspension: null });
    await registrarCambioEstado(id, 'BORRADOR', 'HABILITADA', 'ADMIN', user.id);
    invalidarCachePublico();
    await auditar({ ...ctx, accion: 'HABILITAR', entidad: 'CONVOCATORIA', entidad_id: id, datos_antes: { estado: 'BORRADOR', version }, datos_despues: { estado: 'HABILITADA', version: actualizada.version } });
    return (await this.obtener(user, id)) as ConvocatoriaDetalle;
  },

  async deshabilitar(
    user: UsuarioAutenticado,
    id: string,
    dto: DeshabilitarInput,
    ctx: ContextoAuditoria,
  ): Promise<{ convocatoria: ConvocatoriaDetalle; afectadas: { borradores: number; en_curso: number; notificados: number } }> {
    const actual = await sincronizarSiVencida(await cargarAdminOFallar(id));
    const version = verificarVersion(actual, dto.version);
    if (actual.estado !== 'HABILITADA') {
      throw AppError.conflicto('TRANSICION_INVALIDA', `Solo se puede suspender una convocatoria HABILITADA (estado actual: ${actual.estado})`);
    }
    const minimo = await leerConfigInt('AMPLIACION_MOTIVO_MIN_CARACTERES', 15);
    if (dto.motivo.length < minimo) {
      throw AppError.datosInvalidos('MOTIVO_INSUFICIENTE', `El motivo debe tener al menos ${minimo} caracteres`);
    }
    const actualizada = await actualizarConVersion(id, version, { estado: 'SUSPENDIDA', motivo_suspension: dto.motivo });
    await registrarCambioEstado(id, 'HABILITADA', 'SUSPENDIDA', 'ADMIN', user.id);
    invalidarCachePublico();

    // Conteos y aviso a beneficiarios con borrador (plantilla neutral).
    const conteo = await contarPostulacionesPorEstado(id);
    const borradores = conteo.BORRADOR ?? 0;
    const en_curso = (conteo.PENDIENTE ?? 0) + (conteo.EN_EVALUACION ?? 0) + (conteo.EN_CORRECCION ?? 0);
    let notificados = 0;
    if (borradores > 0) {
      const { data: conBorrador } = await supabaseAdmin
        .from('postulacion')
        .select('id, beneficiario:beneficiario_id (usuario_id)')
        .eq('convocatoria_id', id)
        .eq('estado', 'BORRADOR');
      for (const p of (conBorrador ?? []) as Array<{ id: string; beneficiario: { usuario_id: string } | Array<{ usuario_id: string }> | null }>) {
        const usuarioId = unoDe(p.beneficiario)?.usuario_id;
        if (!usuarioId) continue;
        // Buzon + correo (outbox) via el modulo notificaciones; idempotente por clave_dedup.
        try {
          const r = await encolarNotificacion({
            usuario_id: usuarioId,
            tipo: 'CONVOCATORIA_SUSPENDIDA',
            titulo: 'Convocatoria suspendida temporalmente',
            mensaje: `La convocatoria ${actual.nombre} fue suspendida temporalmente por el FOEST. Su borrador se conserva y podra enviarlo cuando la convocatoria sea rehabilitada.`,
            entidad: 'CONVOCATORIA',
            entidad_id: id,
            url_destino: '/beneficiario/postulaciones',
            severidad: 'ADVERTENCIA',
            clave_dedup: `CONVOCATORIA_SUSPENDIDA:${id}:${actualizada.version}`,
            correo: true,
            payload: { convocatoria_nombre: actual.nombre },
          });
          if (!r.duplicada) notificados += 1;
        } catch (e) {
          logger.warn({ err: e }, 'No fue posible notificar la suspension');
        }
      }
    }
    await auditar({
      ...ctx,
      accion: 'DESHABILITAR',
      entidad: 'CONVOCATORIA',
      entidad_id: id,
      datos_antes: { estado: 'HABILITADA', version },
      datos_despues: { estado: 'SUSPENDIDA', version: actualizada.version, motivo: dto.motivo },
      metadatos: { borradores, en_curso, notificados },
    });
    return { convocatoria: (await this.obtener(user, id)) as ConvocatoriaDetalle, afectadas: { borradores, en_curso, notificados } };
  },

  async rehabilitar(user: UsuarioAutenticado, id: string, dto: VersionOpcionalInput, ctx: ContextoAuditoria): Promise<ConvocatoriaDetalle> {
    const actual = await sincronizarSiVencida(await cargarAdminOFallar(id));
    const version = verificarVersion(actual, dto.version);
    if (actual.estado !== 'SUSPENDIDA') {
      if (actual.estado === 'CERRADA') {
        throw AppError.conflicto('CONVOCATORIA_VENCIDA', 'El plazo de la convocatoria ya vencio; para reabrirla debe registrar una ampliacion con motivo');
      }
      throw AppError.conflicto('TRANSICION_INVALIDA', `Solo se puede rehabilitar una convocatoria SUSPENDIDA (estado actual: ${actual.estado})`);
    }
    const actualizada = await actualizarConVersion(id, version, { estado: 'HABILITADA', motivo_suspension: null });
    await registrarCambioEstado(id, 'SUSPENDIDA', 'HABILITADA', 'ADMIN', user.id);
    invalidarCachePublico();
    await auditar({ ...ctx, accion: 'REHABILITAR', entidad: 'CONVOCATORIA', entidad_id: id, datos_antes: { estado: 'SUSPENDIDA', version, motivo_suspension: actual.motivo_suspension }, datos_despues: { estado: 'HABILITADA', version: actualizada.version } });
    return (await this.obtener(user, id)) as ConvocatoriaDetalle;
  },

  async ampliar(user: UsuarioAutenticado, id: string, dto: AmpliarInput, ctx: ContextoAuditoria): Promise<ConvocatoriaDetalle> {
    const actual = await sincronizarSiVencida(await cargarAdminOFallar(id));
    const version = verificarVersion(actual, dto.version);
    if (actual.estado === 'ARCHIVADA') {
      throw AppError.conflicto('CONVOCATORIA_ARCHIVADA', 'Una convocatoria archivada no se puede ampliar ni reabrir');
    }
    if (actual.estado === 'BORRADOR') {
      throw AppError.conflicto('TRANSICION_INVALIDA', 'En BORRADOR las fechas se editan directamente; la ampliacion aplica a convocatorias habilitadas, suspendidas o cerradas');
    }
    const minimo = await leerConfigInt('AMPLIACION_MOTIVO_MIN_CARACTERES', 15);
    if (dto.motivo.length < minimo) {
      throw AppError.datosInvalidos('MOTIVO_INSUFICIENTE', `El motivo debe tener al menos ${minimo} caracteres`);
    }
    const nuevaExclusiva = cierreExclusivoDesdeFechaLocal(dto.fecha_cierre_nueva);
    const ahora = new Date();
    if (nuevaExclusiva.getTime() <= ahora.getTime()) {
      throw AppError.datosInvalidos('FECHA_NO_FUTURA', 'La nueva fecha de cierre debe ser futura');
    }
    const vigente = new Date(actual.fecha_cierre_exclusiva);
    if (actual.estado !== 'CERRADA' && nuevaExclusiva.getTime() <= vigente.getTime()) {
      throw AppError.datosInvalidos('FECHA_ANTERIOR_A_VIGENTE', 'La nueva fecha de cierre debe ser posterior al cierre vigente');
    }
    const tipo = actual.estado === 'CERRADA' ? 'REAPERTURA' : 'PRORROGA';
    const estadoNuevo: EstadoConvocatoria = tipo === 'REAPERTURA' ? 'HABILITADA' : actual.estado;

    const actualizada = await actualizarConVersion(id, version, {
      fecha_cierre_exclusiva: nuevaExclusiva.toISOString(),
      recordatorio_cierre_enviado_en: null,
      estado: estadoNuevo,
      ...(tipo === 'REAPERTURA' ? { motivo_suspension: null } : {}),
    });
    const { error: errA } = await supabaseAdmin.from('ampliacion_convocatoria').insert({
      convocatoria_id: id,
      tipo,
      fecha_cierre_anterior: actual.fecha_cierre_exclusiva,
      fecha_cierre_nueva: nuevaExclusiva.toISOString(),
      estado_anterior: actual.estado,
      admin_id: user.id,
      motivo: dto.motivo,
    });
    if (errA) fallo('No fue posible registrar la ampliacion', errA);
    if (tipo === 'REAPERTURA') await registrarCambioEstado(id, 'CERRADA', 'HABILITADA', 'ADMIN', user.id);
    invalidarCachePublico();
    await auditar({
      ...ctx,
      accion: 'AMPLIAR',
      entidad: 'CONVOCATORIA',
      entidad_id: id,
      datos_antes: { estado: actual.estado, fecha_cierre_exclusiva: actual.fecha_cierre_exclusiva, version },
      datos_despues: { estado: estadoNuevo, fecha_cierre_exclusiva: nuevaExclusiva.toISOString(), version: actualizada.version },
      metadatos: { tipo, motivo: dto.motivo },
    });
    return (await this.obtener(user, id)) as ConvocatoriaDetalle;
  },

  async archivar(user: UsuarioAutenticado, id: string, dto: ArchivarInput, ctx: ContextoAuditoria): Promise<ConvocatoriaDetalle> {
    const actual = await sincronizarSiVencida(await cargarAdminOFallar(id));
    const version = verificarVersion(actual, dto.version);
    if (actual.estado !== 'CERRADA') {
      throw AppError.conflicto('TRANSICION_INVALIDA', `Solo se puede archivar una convocatoria CERRADA (estado actual: ${actual.estado})`);
    }
    const conteo = await contarPostulacionesPorEstado(id);
    const enCurso: ConteoPostulaciones = {};
    for (const e of ESTADOS_POSTULACION_EN_CURSO) if ((conteo[e] ?? 0) > 0) enCurso[e] = conteo[e];
    if (Object.keys(enCurso).length > 0) {
      throw AppError.conflicto('POSTULACIONES_EN_CURSO', 'No se puede archivar: existen postulaciones que no estan en estado terminal', {
        por_estado: enCurso,
        estados_terminales: ESTADOS_POSTULACION_TERMINALES,
      });
    }
    const actualizada = await actualizarConVersion(id, version, { estado: 'ARCHIVADA' });
    await registrarCambioEstado(id, 'CERRADA', 'ARCHIVADA', 'ADMIN', user.id);
    await auditar({ ...ctx, accion: 'ARCHIVAR', entidad: 'CONVOCATORIA', entidad_id: id, datos_antes: { estado: 'CERRADA', version }, datos_despues: { estado: 'ARCHIVADA', version: actualizada.version } });
    return (await this.obtener(user, id)) as ConvocatoriaDetalle;
  },

  // ---- Comite -----------------------------------------------------------------
  async listarComite(_user: UsuarioAutenticado, id: string): Promise<MiembroComite[]> {
    await cargarAdminOFallar(id);
    return listarComiteActivo(id);
  },

  async definirComite(
    user: UsuarioAutenticado,
    id: string,
    dto: ComiteInput,
    ctx: ContextoAuditoria,
  ): Promise<{ comite: MiembroComite[]; agregados: string[]; retirados: string[]; expedientes_afectados: ExpedienteAfectado[]; asignaciones: ComiteInput['asignaciones'] | null }> {
    const actual = await cargarAdminOFallar(id);
    if (actual.estado === 'ARCHIVADA') {
      throw AppError.conflicto('CONVOCATORIA_ARCHIVADA', 'Una convocatoria archivada es de solo lectura');
    }

    // Solo usuarios con rol FUNCIONARIO y activos (estado leido de accounts: public.usuario).
    if (dto.funcionario_ids.length > 0) {
      const { data: usuarios, error } = await supabaseAdmin.from('usuario').select('id, rol, activo').in('id', dto.funcionario_ids);
      if (error) fallo('No fue posible validar los funcionarios', error);
      const validos = new Set(
        ((usuarios ?? []) as Array<{ id: string; rol: string; activo: boolean }>).filter((u) => u.rol === 'FUNCIONARIO' && u.activo).map((u) => u.id),
      );
      const invalidos = dto.funcionario_ids.filter((f) => !validos.has(f));
      if (invalidos.length > 0) {
        throw AppError.datosInvalidos('FUNCIONARIO_INVALIDO', 'Uno o mas usuarios no son funcionarios activos', { funcionario_ids: invalidos });
      }
    }

    const comiteActual = await listarComiteActivo(id);
    const actuales = new Set(comiteActual.map((m) => m.funcionario_id));
    const deseados = new Set(dto.funcionario_ids);
    const agregados = dto.funcionario_ids.filter((f) => !actuales.has(f));
    const retirados = [...actuales].filter((f) => !deseados.has(f));

    // Expedientes en curso de la convocatoria (PENDIENTE / EN_EVALUACION).
    const { data: enCurso, error: errP } = await supabaseAdmin
      .from('postulacion')
      .select('id, estado')
      .eq('convocatoria_id', id)
      .in('estado', ['PENDIENTE', 'EN_EVALUACION']);
    if (errP) fallo('No fue posible consultar los expedientes en curso', errP);
    const expedientes = (enCurso ?? []) as Array<{ id: string; estado: EstadoPostulacion }>;
    const enEvaluacion = expedientes.filter((p) => p.estado === 'EN_EVALUACION').map((p) => p.id);

    if (deseados.size === 0 && actual.estado === 'HABILITADA' && expedientes.length > 0) {
      throw AppError.conflicto('COMITE_VACIO', 'No se puede dejar vacio el comite de una convocatoria habilitada con expedientes en curso', {
        expedientes_en_curso: expedientes.length,
      });
    }

    // TODO(asignaciones): cuando exista el modulo `asignaciones`, reemplazar esta
    // deteccion por `asignacion.service.sincronizarComite(convocatoriaId, retirados, dto.asignaciones)`,
    // que devuelve las asignaciones ACTIVA de cada retirado (POSTULACION_ASIGNACION) y las
    // libera con motivo CAMBIO_COMITE (LIBERAR) o las marca "fuera de comite" (MANTENER).
    // Mientras tanto, se consideran afectadas las postulaciones EN_EVALUACION de la convocatoria.
    const expedientes_afectados: ExpedienteAfectado[] =
      retirados.length > 0 && enEvaluacion.length > 0 ? retirados.map((f) => ({ funcionario_id: f, postulacion_ids: enEvaluacion })) : [];
    if (expedientes_afectados.length > 0 && !dto.asignaciones) {
      throw AppError.conflicto(
        'ASIGNACIONES_PENDIENTES',
        'Uno o mas funcionarios retirados tienen expedientes en evaluacion; indique asignaciones: LIBERAR o MANTENER',
        { expedientes_afectados },
      );
    }

    const ahoraIso = new Date().toISOString();
    if (retirados.length > 0) {
      const { error } = await supabaseAdmin
        .from('asignacion_funcionario')
        .update({ retirado_en: ahoraIso })
        .eq('convocatoria_id', id)
        .is('retirado_en', null)
        .in('funcionario_id', retirados);
      if (error) fallo('No fue posible retirar funcionarios del comite', error);
    }
    if (agregados.length > 0) {
      const { error } = await supabaseAdmin
        .from('asignacion_funcionario')
        .insert(agregados.map((f) => ({ convocatoria_id: id, funcionario_id: f, asignado_por: user.id })));
      if (error) fallo('No fue posible agregar funcionarios al comite', error);
    }
    await auditar({
      ...ctx,
      accion: 'ACTUALIZAR',
      entidad: 'ASIGNACION_FUNCIONARIO',
      entidad_id: id,
      datos_antes: { comite: [...actuales] },
      datos_despues: { comite: dto.funcionario_ids },
      metadatos: { agregados, retirados, asignaciones: dto.asignaciones ?? null, expedientes_afectados },
    });
    return { comite: await listarComiteActivo(id), agregados, retirados, expedientes_afectados, asignaciones: dto.asignaciones ?? null };
  },

  // ---- Integracion con `postulaciones` ---------------------------------------
  /**
   * Devuelve la convocatoria si esta abierta en este instante; si no existe -> 404;
   * si existe pero no esta abierta -> 409 CONVOCATORIA_NO_ABIERTA. Cierra de forma
   * oportunista las vencidas.
   */
  async obtenerConvocatoriaAbierta(id: string): Promise<ConvocatoriaResumen> {
    const fila = await sincronizarSiVencida(await cargarAdminOFallar(id));
    if (!estaAbierta(fila)) {
      throw AppError.conflicto('CONVOCATORIA_NO_ABIERTA', 'La convocatoria no se encuentra abierta', { estado: fila.estado });
    }
    return aResumen(fila);
  },

  // ---- Jobs (invocados desde convocatorias.jobs.ts) ---------------------------
  /** Cierra todas las HABILITADA/SUSPENDIDA vencidas. Idempotente; devuelve los ids cerrados. */
  async sincronizarCierreVencidas(origen: OrigenCambio = 'CRON'): Promise<string[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('convocatoria')
      .select(SELECT_CON_BENEFICIOS)
      .in('estado', ['HABILITADA', 'SUSPENDIDA'])
      .lte('fecha_cierre_exclusiva', nowIso);
    if (error) fallo('No fue posible consultar convocatorias vencidas', error);
    const cerradas: string[] = [];
    for (const fila of (data ?? []) as FilaConBeneficios[]) {
      const resultado = await sincronizarSiVencida(fila, origen);
      if (resultado.estado === 'CERRADA' && fila.estado !== 'CERRADA') cerradas.push(fila.id);
    }
    if (cerradas.length > 0) invalidarCachePublico();
    return cerradas;
  },

  /**
   * Recordatorio de cierre: una sola vez por convocatoria HABILITADA cuando faltan
   * <= ALERTA_CIERRE_DIAS dias. Notifica a administradores activos y al comite.
   */
  async recordarCierreProximo(): Promise<string[]> {
    const dias = await leerConfigInt('ALERTA_CIERRE_DIAS', 7);
    const ahora = new Date();
    const limite = new Date(ahora.getTime() + dias * 86_400_000).toISOString();
    const { data, error } = await supabaseAdmin
      .from('convocatoria')
      .select(SELECT_CONVOCATORIA)
      .eq('estado', 'HABILITADA')
      .is('recordatorio_cierre_enviado_en', null)
      .gt('fecha_cierre_exclusiva', ahora.toISOString())
      .lte('fecha_cierre_exclusiva', limite);
    if (error) fallo('No fue posible consultar convocatorias por cerrar', error);
    const filas = (data ?? []) as ConvocatoriaRow[];
    if (filas.length === 0) return [];

    const { data: admins } = await supabaseAdmin.from('usuario').select('id').eq('rol', 'ADMINISTRADOR').eq('activo', true);
    const adminIds = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);
    const notificadas: string[] = [];
    for (const c of filas) {
      const comite = await listarComiteActivo(c.id);
      const destinatarios = new Set<string>([...adminIds, ...comite.filter((m) => m.activo).map((m) => m.funcionario_id)]);
      const fechaCierre = fechaCierrePresentada(c.fecha_cierre_exclusiva);
      const restantes = diasRestantes(c.fecha_cierre_exclusiva, ahora);
      for (const usuarioId of destinatarios) {
        // Buzon + correo (outbox) via el modulo notificaciones; idempotente por clave_dedup.
        try {
          await encolarNotificacion({
            usuario_id: usuarioId,
            tipo: 'CONVOCATORIA_POR_CERRAR',
            titulo: 'Convocatoria proxima a cerrar',
            mensaje: `La convocatoria ${c.nombre} (${c.anio}-${c.semestre}) cierra el ${fechaCierre} a las 23:59. Faltan ${restantes} dia(s).`,
            entidad: 'CONVOCATORIA',
            entidad_id: c.id,
            url_destino: adminIds.includes(usuarioId) ? `/admin/convocatorias/${c.id}` : '/funcionario/convocatorias',
            severidad: 'ADVERTENCIA',
            clave_dedup: `CONVOCATORIA_POR_CERRAR:${c.id}:${c.fecha_cierre_exclusiva}`,
            correo: true,
            payload: { convocatoria_nombre: c.nombre, fecha_cierre_texto: fechaCierre, dias_restantes: restantes },
          });
        } catch (e) {
          logger.warn({ err: e, convocatoria: c.id }, 'No fue posible crear la notificacion de cierre');
        }
      }
      const { error: errU } = await supabaseAdmin
        .from('convocatoria')
        .update({ recordatorio_cierre_enviado_en: ahora.toISOString() })
        .eq('id', c.id)
        .is('recordatorio_cierre_enviado_en', null);
      if (errU) logger.warn({ err: errU, convocatoria: c.id }, 'No fue posible marcar el recordatorio de cierre');
      await auditar({
        actor_tipo: 'SISTEMA',
        accion: 'NOTIFICAR',
        entidad: 'CONVOCATORIA',
        entidad_id: c.id,
        metadatos: { tipo: 'CONVOCATORIA_POR_CERRAR', destinatarios: destinatarios.size, dias_restantes: restantes },
      });
      notificadas.push(c.id);
    }
    return notificadas;
  },

  /** Solo para pruebas y jobs: limpia la cache publica. */
  __invalidarCachePublico: invalidarCachePublico,
};

/** Atajo exportado para `postulaciones` (convocatorias.md: `estaAbierta` + `obtenerConvocatoriaAbierta`). */
export const obtenerConvocatoriaAbierta = (id: string) => convocatoriasService.obtenerConvocatoriaAbierta(id);
