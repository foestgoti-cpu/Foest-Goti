import {
  CODIGOS_BENEFICIO,
  esEstadoTerminal,
  RESULTADOS_DOCUMENTO_CUMPLIDOS,
  type AdvertenciaDictamenDto,
  type AlcanceExpediente,
  type BeneficioExpedienteDto,
  type ChequeoGuardadoDto,
  type ChequeoVigenteDto,
  type CodigoBeneficio,
  type DictamenRespuestaDto,
  type DocumentoExpedienteDto,
  type EstadoPostulacion,
  type ExpedienteEvaluacionDto,
  type HistorialRevisionesDto,
  type MotivoTransicion,
  type ResultadoDictamen,
  type RevisionBeneficioDto,
  type RevisionHistorialDto,
  type Rol,
} from '@foest/shared';
import { AppError, auditar, logger, supabaseAdmin, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { auditarFueraDeTx } from '../auditoria/auditoria.cola';
import { esDiaHabil, fechaLocalBogota, finDeDia, sumarDiasHabiles, configuracionService } from '../catalogos_configuracion';
import { alertarAdministradores, encolarNotificacion } from '../notificaciones';
import { enmascarar } from '../postulaciones/datos-pago.service';
import { postulacionService } from '../postulaciones/postulacion.service';
import type { CorreccionVigente } from '../postulaciones/postulaciones.types';
import { errorDesdeSql } from '../postulaciones/postulacion.state-machine';
import { liberarAsignacionActiva, obtenerAsignacionActiva, registrarMovimiento, tieneAsignacionActiva } from '../asignaciones';
import { aChequeoItemDto, aRevisionBeneficioDto, aRevisionHistorialDto, numeroONulo, observacionPublicaDictamen } from './evaluacion.serializer';
import type { ChequeoInput, DictamenInput } from './evaluacion.dto';
import type {
  PostulacionEvalRow,
  RequisitosPostulacion,
  RevisionBeneficioRow,
  RevisionDocumentoRow,
  RevisionRow,
  TipoExigible,
} from './evaluacion.types';
import { agruparTipos, obligatoriosPorBeneficio, obtenerRequisitos } from './ports/documentos.port';
import { horasLaborSocial } from './ports/labor-social.port';
import { crearOtorgamiento } from './ports/otorgamientos.port';

/**
 * Servicio de evaluacion (docs/modules/evaluacion.md).
 *
 * Atomicidad: supabase-js no expone transacciones multi-sentencia. El dictamen se ejecuta asi:
 *   1. validaciones (lecturas)
 *   2. `fn_registrar_dictamen` (UNA transaccion SQL: revision + detalle + cierre + observacion publica)
 *   3. `postulacionService.transicionar` (unico punto de cambio de estado)
 *      - si falla, `fn_reabrir_dictamen` revierte el paso 2 (la revision vuelve a borrador).
 *   4. efectos posteriores (liberar asignacion, otorgamientos, notificacion, auditoria): un fallo se registra
 *      y se alerta, pero no revierte el dictamen ya firme.
 *
 * NOTA JURIDICA (no implementado): campo `recurso_estado` de POSTULACION (o tabla RECURSO propia) para el
 * recurso de reposicion y la firma del acto administrativo. Ver el recuadro "Punto abierto para el area
 * juridica" de docs/modules/evaluacion.md y el encabezado de supabase/migrations/0017_evaluacion.sql.
 */

export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const COLUMNAS_POSTULACION =
  'id, beneficiario_id, convocatoria_id, tipo_solicitud, estado, ciclo, version, aprobacion_parcial, fecha_limite_subsanacion, enviada_en, datos_formulario, correccion_vigente';

const ESTADO_POR_RESULTADO = {
  APROBAR: { estado: 'APROBADA', motivo: 'DICTAMEN_APROBADO', notificacion: 'POSTULACION_APROBADA', dedup: 'POSTULACION_APROBADA' },
  RECHAZAR: { estado: 'RECHAZADA', motivo: 'DICTAMEN_RECHAZADO', notificacion: 'POSTULACION_RECHAZADA', dedup: 'POSTULACION_RECHAZADA' },
  CORRECCION: { estado: 'EN_CORRECCION', motivo: 'DICTAMEN_CORRECCION', notificacion: 'CORRECCION_SOLICITADA', dedup: 'POSTULACION_EN_CORRECCION' },
} as const satisfies Record<ResultadoDictamen, { estado: EstadoPostulacion; motivo: MotivoTransicion; notificacion: string; dedup: string }>;

// ---------------------------------------------------------------------------
// Acceso a datos
// ---------------------------------------------------------------------------
function errorDesdeSqlEvaluacion(mensaje: string | undefined): AppError {
  const texto = mensaje ?? '';
  if (/Could not find the function public\.fn_/i.test(texto)) {
    return new AppError(503, 'MIGRACION_PENDIENTE', 'Falta aplicar la migracion 0017_evaluacion.sql (funciones SQL del modulo)');
  }
  const codigo = texto.split(':')[0]?.trim() ?? '';
  switch (codigo) {
    case 'BENEFICIOS_INCOMPLETOS':
    case 'BENEFICIO_NO_SOLICITADO':
      return AppError.datosInvalidos(codigo, texto);
    case 'REVISION_INMUTABLE':
      return AppError.conflicto(codigo, texto);
    default:
      return errorDesdeSql(texto);
  }
}

async function cargarPostulacion(id: string): Promise<PostulacionEvalRow> {
  const { data, error } = await supabaseAdmin.from('postulacion').select(COLUMNAS_POSTULACION).eq('id', id).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
  if (!data) throw AppError.noEncontrado();
  return data as PostulacionEvalRow;
}

async function beneficiosSolicitados(postulacionId: string): Promise<CodigoBeneficio[]> {
  const { data, error } = await supabaseAdmin.from('postulacion_beneficio').select('beneficio_codigo').eq('postulacion_id', postulacionId);
  if (error) throw AppError.interno(`No fue posible cargar los beneficios solicitados: ${error.message}`);
  return ((data ?? []) as Array<{ beneficio_codigo: CodigoBeneficio }>)
    .map((f) => f.beneficio_codigo)
    .filter((c) => (CODIGOS_BENEFICIO as readonly string[]).includes(c));
}

interface ReferenciaBeneficio {
  nombre: string | null;
  valor_apoyo_referencial: number | null;
}

async function referenciasBeneficios(convocatoriaId: string): Promise<Map<string, ReferenciaBeneficio>> {
  const mapa = new Map<string, ReferenciaBeneficio>();
  const { data, error } = await supabaseAdmin
    .from('convocatoria_beneficio')
    .select('valor_apoyo_referencial, beneficio:beneficio_id (codigo, nombre)')
    .eq('convocatoria_id', convocatoriaId);
  if (error) {
    logger.warn({ err: error }, 'No fue posible cargar los valores referenciales de la convocatoria');
    return mapa;
  }
  type Fila = { valor_apoyo_referencial: number | string | null; beneficio: { codigo: string; nombre: string } | Array<{ codigo: string; nombre: string }> | null };
  for (const f of (data ?? []) as Fila[]) {
    const b = Array.isArray(f.beneficio) ? f.beneficio[0] : f.beneficio;
    if (b) mapa.set(b.codigo, { nombre: b.nombre, valor_apoyo_referencial: numeroONulo(f.valor_apoyo_referencial) });
  }
  return mapa;
}

async function cargarRevisiones(postulacionId: string): Promise<RevisionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('revision')
    .select('*')
    .eq('postulacion_id', postulacionId)
    .order('ciclo', { ascending: true })
    .order('iniciada_en', { ascending: true });
  if (error) {
    if (esEsquemaAusente(error)) throw new AppError(503, 'MIGRACION_PENDIENTE', 'Falta aplicar la migracion 0017_evaluacion.sql');
    throw AppError.interno(`No fue posible cargar las revisiones: ${error.message}`);
  }
  return (data ?? []) as RevisionRow[];
}

function esEsquemaAusente(error: { code?: string; message: string }): boolean {
  return ['42P01', 'PGRST205'].includes(error.code ?? '') || /does not exist|schema cache/i.test(error.message);
}

async function cargarDetalles(
  revisionIds: string[],
): Promise<{ documentos: Map<string, RevisionDocumentoRow[]>; beneficios: Map<string, RevisionBeneficioRow[]> }> {
  const documentos = new Map<string, RevisionDocumentoRow[]>();
  const beneficios = new Map<string, RevisionBeneficioRow[]>();
  if (revisionIds.length === 0) return { documentos, beneficios };
  const [rd, rb] = await Promise.all([
    supabaseAdmin.from('revision_documento').select('*').in('revision_id', revisionIds),
    supabaseAdmin.from('revision_beneficio').select('*').in('revision_id', revisionIds),
  ]);
  if (rd.error) throw AppError.interno(`No fue posible cargar el chequeo documental: ${rd.error.message}`);
  if (rb.error) throw AppError.interno(`No fue posible cargar las decisiones por beneficio: ${rb.error.message}`);
  for (const f of (rd.data ?? []) as RevisionDocumentoRow[]) documentos.set(f.revision_id, [...(documentos.get(f.revision_id) ?? []), f]);
  for (const f of (rb.data ?? []) as RevisionBeneficioRow[]) beneficios.set(f.revision_id, [...(beneficios.get(f.revision_id) ?? []), f]);
  return { documentos, beneficios };
}

/** id de tipo -> codigo. Tolerante: si el catalogo no existe devuelve un mapa vacio (se muestra el id). */
async function cargarTipos(): Promise<Map<string, { codigo: string; nombre: string }>> {
  const mapa = new Map<string, { codigo: string; nombre: string }>();
  const { data, error } = await supabaseAdmin.from('tipo_documento').select('id, codigo, nombre');
  if (error) return mapa;
  for (const f of (data ?? []) as Array<{ id: string; codigo: string; nombre: string }>) mapa.set(f.id, { codigo: f.codigo, nombre: f.nombre });
  return mapa;
}

async function nombresFuncionarios(ids: string[]): Promise<Map<string, { id: string; nombres: string | null; apellidos: string | null }>> {
  const mapa = new Map<string, { id: string; nombres: string | null; apellidos: string | null }>();
  if (ids.length === 0) return mapa;
  const { data, error } = await supabaseAdmin.from('funcionario').select('usuario_id, nombres, apellidos').in('usuario_id', ids);
  if (error) {
    logger.warn({ err: error }, 'No fue posible cargar los nombres de los evaluadores');
    return mapa;
  }
  for (const f of (data ?? []) as Array<{ usuario_id: string; nombres: string | null; apellidos: string | null }>) {
    mapa.set(f.usuario_id, { id: f.usuario_id, nombres: f.nombres, apellidos: f.apellidos });
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------
function exigirEvaluable(p: PostulacionEvalRow, versionEnviada: number): void {
  if (esEstadoTerminal(p.estado)) {
    throw AppError.conflicto('TRANSICION_INVALIDA', `La postulacion esta en estado terminal ${p.estado}`);
  }
  if (p.estado !== 'EN_EVALUACION') {
    throw AppError.conflicto('TRANSICION_INVALIDA', `Solo se evalua una postulacion EN_EVALUACION (estado actual ${p.estado})`);
  }
  if (p.version !== versionEnviada) {
    throw AppError.conflicto('VERSION_CONFLICTO', 'La postulacion fue modificada; recargue el expediente para continuar', { version_actual: p.version });
  }
}

async function opcionesSubsanacion(): Promise<{ dias: number; diasMax: number; hoy: string; sugerida: string; maxima: string }> {
  const dias = await configuracionService.getEntero('SUBSANACION_DIAS_HABILES', 5);
  const diasMax = await configuracionService.getEntero('SUBSANACION_DIAS_HABILES_MAX', 10);
  const hoy = fechaLocalBogota();
  const [sugerida, maxima] = await Promise.all([sumarDiasHabiles(hoy, dias), sumarDiasHabiles(hoy, Math.max(diasMax, dias))]);
  return { dias, diasMax, hoy, sugerida, maxima };
}

async function resolverFechaLimite(fechaSolicitada: string | undefined): Promise<{ fecha: string; instante: string }> {
  const o = await opcionesSubsanacion();
  const fecha = fechaSolicitada ?? o.sugerida;
  if (fechaSolicitada) {
    let habil: boolean;
    try {
      habil = await esDiaHabil(fechaSolicitada);
    } catch {
      throw AppError.datosInvalidos('FECHA_LIMITE_INVALIDA', 'La fecha limite de subsanacion no es valida', { fecha_limite_subsanacion: fechaSolicitada });
    }
    if (fechaSolicitada < o.hoy) {
      throw AppError.datosInvalidos('FECHA_LIMITE_INVALIDA', 'La fecha limite de subsanacion no puede estar en el pasado', { fecha_limite_subsanacion: fechaSolicitada });
    }
    if (!habil) {
      throw AppError.datosInvalidos('FECHA_LIMITE_INVALIDA', 'La fecha limite de subsanacion debe ser un dia habil', { fecha_limite_subsanacion: fechaSolicitada });
    }
    if (fechaSolicitada > o.maxima) {
      throw AppError.datosInvalidos(
        'FECHA_LIMITE_INVALIDA',
        `La fecha limite supera el maximo permitido (${o.diasMax} dias habiles: ${o.maxima})`,
        { fecha_limite_subsanacion: fechaSolicitada, maximo: o.maxima },
      );
    }
  }
  // El plazo cierra a las 23:59:59 America/Bogota.
  return { fecha, instante: finDeDia(fecha).toISOString() };
}

function validarBeneficiosContraSolicitados(input: DictamenInput, solicitados: CodigoBeneficio[]): void {
  const enviados = input.beneficios.map((b) => b.codigo);
  const noSolicitados = enviados.filter((c) => !solicitados.includes(c));
  if (noSolicitados.length > 0) {
    throw AppError.datosInvalidos('BENEFICIO_NO_SOLICITADO', 'Hay beneficios que la postulacion no solicito', { beneficios: noSolicitados });
  }
  if (input.resultado === 'CORRECCION') return;
  const faltantes = solicitados.filter((c) => !enviados.includes(c));
  if (faltantes.length > 0) {
    throw AppError.datosInvalidos('BENEFICIOS_INCOMPLETOS', 'Debe decidir cada beneficio solicitado', { faltantes });
  }
}

interface Pendiente {
  beneficio: string;
  tipo_codigo: string;
  resultado: string | null;
}

function documentosObligatoriosPendientes(
  aprobados: string[],
  requisitos: RequisitosPostulacion,
  items: RevisionDocumentoRow[],
): Pendiente[] {
  const codigoDeTipo = new Map<string, string>();
  for (const r of requisitos.requisitos) codigoDeTipo.set(r.tipo_id, r.tipo_codigo);
  const porTipo = new Map<string, RevisionDocumentoRow>();
  for (const i of items) {
    const codigo = codigoDeTipo.get(i.tipo_id);
    if (codigo) porTipo.set(codigo, i);
  }
  const obligatorios = obligatoriosPorBeneficio(requisitos.requisitos);
  const pendientes: Pendiente[] = [];
  for (const beneficio of aprobados) {
    for (const tipo of obligatorios.get(beneficio) ?? []) {
      const item = porTipo.get(tipo);
      if (!item || !RESULTADOS_DOCUMENTO_CUMPLIDOS.includes(item.resultado)) {
        pendientes.push({ beneficio, tipo_codigo: tipo, resultado: item?.resultado ?? null });
      }
    }
  }
  return pendientes;
}

function textoFecha(fechaLocal: string): string {
  const [a, m, d] = fechaLocal.split('-');
  return `${d}/${m}/${a}`;
}

async function auditarSeguro(evento: EventoAuditoria): Promise<void> {
  try {
    await auditar(evento);
  } catch (e) {
    logger.error({ err: e, accion: evento.accion }, 'No fue posible auditar; se reencola');
    try {
      await auditarFueraDeTx(evento);
    } catch (e2) {
      logger.error({ err: e2, accion: evento.accion }, 'No fue posible encolar la auditoria pendiente');
    }
  }
}

function esAdmin(user: UsuarioAutenticado): boolean {
  return (user.rol as Rol) === 'ADMINISTRADOR';
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------
export const evaluacionService = {
  /** GET /evaluacion/postulaciones/:id - expediente completo (alcance ya verificado por requireExpedienteScope). */
  async obtenerExpediente(
    user: UsuarioAutenticado,
    ctx: ContextoAuditoria,
    id: string,
    alcance: AlcanceExpediente | undefined,
  ): Promise<ExpedienteEvaluacionDto> {
    const p = await cargarPostulacion(id);
    const admin = esAdmin(user);

    const [convocatoria, solicitados, envio, tipos, requisitos, revisiones, referencias, subsanacion] = await Promise.all([
      supabaseAdmin.from('convocatoria').select('nombre').eq('id', p.convocatoria_id).maybeSingle(),
      beneficiosSolicitados(id),
      supabaseAdmin
        .from('postulacion_envio')
        .select('ciclo, datos_formulario, perfil_snapshot')
        .eq('postulacion_id', id)
        .order('ciclo', { ascending: false })
        .limit(1)
        .maybeSingle(),
      cargarTipos(),
      obtenerRequisitos(id),
      cargarRevisiones(id),
      referenciasBeneficios(p.convocatoria_id),
      opcionesSubsanacion(),
    ]);
    const envioFila = (envio.data ?? null) as { ciclo: number; datos_formulario: Record<string, unknown>; perfil_snapshot: Record<string, unknown> } | null;

    // Ciclo vigente: el envio del ciclo actual; si no hay, el ultimo.
    let formulario: Record<string, unknown> = p.datos_formulario ?? {};
    let perfil: Record<string, unknown> | null = null;
    if (envioFila) {
      formulario = envioFila.datos_formulario ?? formulario;
      perfil = envioFila.perfil_snapshot ?? null;
    }

    // Documentos exigibles y soportes
    const exigibles: TipoExigible[] = agruparTipos(requisitos.requisitos);
    const soportePorTipo = new Map(requisitos.documentos.map((d) => [d.tipo_id, d]));
    const codigoDeTipo = (tipoId: string): string =>
      tipos.get(tipoId)?.codigo ?? requisitos.requisitos.find((r) => r.tipo_id === tipoId)?.tipo_codigo ?? tipoId;

    // Chequeo vigente y decisiones previas
    const decididas = revisiones.filter((r) => r.decidida_en);
    const delCiclo = revisiones.filter((r) => r.ciclo === p.ciclo);
    let chequeoRev: RevisionRow | undefined;
    if (admin) {
      chequeoRev = [...delCiclo].reverse().find((r) => r.decidida_en) ?? delCiclo[delCiclo.length - 1];
    } else {
      chequeoRev = [...delCiclo].reverse().find((r) => r.funcionario_id === user.id);
    }
    let previas = decididas.filter((r) => r.id !== chequeoRev?.id);
    if (!admin && alcance !== 'ESCRITURA') previas = previas.filter((r) => r.funcionario_id === user.id);

    const detalles = await cargarDetalles([...previas.map((r) => r.id), ...(chequeoRev ? [chequeoRev.id] : [])]);
    const itemsChequeo = chequeoRev ? detalles.documentos.get(chequeoRev.id) ?? [] : [];
    const itemPorTipo = new Map(itemsChequeo.map((i) => [i.tipo_id, i]));

    const nombresEv = admin ? await nombresFuncionarios([...new Set(previas.map((r) => r.funcionario_id))]) : new Map();

    const documentos: DocumentoExpedienteDto[] = exigibles.map((t) => {
      const soporte = soportePorTipo.get(t.tipo_id);
      const item = itemPorTipo.get(t.tipo_id);
      return {
        tipo_codigo: t.tipo_codigo,
        tipo_nombre: t.tipo_nombre,
        obligatorio: t.beneficios_obligatorios.length > 0,
        beneficios_obligatorios: t.beneficios_obligatorios,
        beneficios_opcionales: t.beneficios_opcionales,
        documento: soporte ? { documento_id: soporte.documento_id, version: soporte.version, estado_carga: soporte.estado_carga } : null,
        resultado: item?.resultado ?? null,
        observacion: item?.observacion_especifica ?? null,
      };
    });
    // Soportes cargados de un tipo que ya no figura en los requisitos (carga voluntaria): se muestran como no obligatorios.
    for (const s of requisitos.documentos) {
      if (documentos.some((d) => d.tipo_codigo === s.tipo_codigo)) continue;
      const item = itemPorTipo.get(s.tipo_id);
      documentos.push({
        tipo_codigo: s.tipo_codigo,
        tipo_nombre: tipos.get(s.tipo_id)?.nombre ?? s.tipo_codigo,
        obligatorio: false,
        beneficios_obligatorios: [],
        beneficios_opcionales: [],
        documento: { documento_id: s.documento_id, version: s.version, estado_carga: s.estado_carga },
        resultado: item?.resultado ?? null,
        observacion: item?.observacion_especifica ?? null,
      });
    }

    const obligatorios = obligatoriosPorBeneficio(requisitos.requisitos);
    const beneficios: BeneficioExpedienteDto[] = solicitados.map((codigo) => ({
      codigo,
      nombre: referencias.get(codigo)?.nombre ?? null,
      valor_apoyo_referencial: referencias.get(codigo)?.valor_apoyo_referencial ?? null,
      documentos_obligatorios: obligatorios.get(codigo) ?? [],
    }));

    // Datos de pago ENMASCARADOS (el numero cifrado nunca sale de la API).
    let datosPago: ExpedienteEvaluacionDto['datos_pago'] = null;
    if (solicitados.includes('ST')) {
      const { data } = await supabaseAdmin.from('datos_pago_st').select('tipo, entidad, ultimos4').eq('postulacion_id', id).maybeSingle();
      const fila = data as { tipo: string; entidad: string; ultimos4: string } | null;
      if (fila) datosPago = { tipo: fila.tipo, entidad: fila.entidad, numero_enmascarado: enmascarar(fila.ultimos4) };
    }

    const labor = await horasLaborSocial(p.beneficiario_id);

    const chequeo: ChequeoVigenteDto = {
      revision_id: chequeoRev?.id ?? null,
      ciclo: p.ciclo,
      iniciada_en: chequeoRev?.iniciada_en ?? null,
      decidida_en: chequeoRev?.decidida_en ?? null,
      items: itemsChequeo.map((i) => aChequeoItemDto(i, codigoDeTipo)),
    };

    const decisionesPrevias: RevisionHistorialDto[] = previas.map((r) =>
      aRevisionHistorialDto(r, detalles.documentos.get(r.id) ?? [], detalles.beneficios.get(r.id) ?? [], {
        esAdmin: admin,
        usuarioId: user.id,
        nombreFuncionario: (fid) => nombresEv.get(fid) ?? { id: fid, nombres: null, apellidos: null },
        codigoDeTipo,
      }),
    );

    await auditar({
      ...ctx,
      accion: 'LECTURA_SENSIBLE',
      entidad: 'POSTULACION',
      entidad_id: id,
      metadatos: { vista: 'expediente_evaluacion', alcance: alcance ?? null, ciclo: p.ciclo },
    });

    return {
      postulacion: {
        id: p.id,
        convocatoria_id: p.convocatoria_id,
        convocatoria_nombre: (convocatoria.data as { nombre: string } | null)?.nombre ?? null,
        tipo_solicitud: p.tipo_solicitud,
        estado: p.estado,
        ciclo: p.ciclo,
        version: p.version,
        aprobacion_parcial: p.aprobacion_parcial,
        fecha_limite_subsanacion: p.fecha_limite_subsanacion,
        enviada_en: p.enviada_en,
      },
      modo: alcance === 'ESCRITURA' && p.estado === 'EN_EVALUACION' ? 'ESCRITURA' : 'LECTURA',
      formulario,
      perfil_snapshot: perfil,
      beneficios,
      documentos_disponibles: requisitos.disponible,
      documentos,
      chequeo,
      decisiones_previas: decisionesPrevias,
      labor_social: labor,
      datos_pago: datosPago,
      subsanacion: {
        dias_habiles: subsanacion.dias,
        dias_habiles_max: subsanacion.diasMax,
        fecha_limite_sugerida: subsanacion.sugerida,
        fecha_limite_maxima: subsanacion.maxima,
      },
    };
  },

  /** PUT /evaluacion/postulaciones/:id/chequeo - guarda el chequeo por TIPO de documento (idempotente). */
  async guardarChequeo(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string, input: ChequeoInput): Promise<ChequeoGuardadoDto> {
    const p = await cargarPostulacion(id);
    if (!(await tieneAsignacionActiva(user.id, id))) throw AppError.noEncontrado();
    exigirEvaluable(p, input.version);

    const requisitos = await obtenerRequisitos(id);
    if (!requisitos.disponible) {
      throw new AppError(503, 'DOCUMENTOS_NO_DISPONIBLE', 'El modulo de documentos no esta disponible; no es posible guardar el chequeo documental');
    }
    const tipos = new Map(agruparTipos(requisitos.requisitos).map((t) => [t.tipo_codigo, t]));
    const soportes = new Map(requisitos.documentos.map((d) => [d.tipo_codigo, d]));

    const errores: Array<{ tipo_codigo: string; codigo: string; mensaje: string }> = [];
    const items = input.items.flatMap((item) => {
      const tipo = tipos.get(item.tipo_codigo);
      if (!tipo) {
        errores.push({
          tipo_codigo: item.tipo_codigo,
          codigo: 'TIPO_DOCUMENTO_NO_APLICABLE',
          mensaje: 'El tipo no corresponde a ningun beneficio solicitado ni al tipo de tramite',
        });
        return [];
      }
      const soporte = soportes.get(item.tipo_codigo);
      if (item.resultado === 'PRESENTA' && (!soporte || soporte.estado_carga !== 'DISPONIBLE')) {
        errores.push({
          tipo_codigo: item.tipo_codigo,
          codigo: 'DOCUMENTO_NO_DISPONIBLE',
          mensaje: soporte ? 'El soporte aun no esta disponible (escaneo o archivo rechazado); no puede marcarse como presentado' : 'El soporte no fue cargado; no puede marcarse como presentado',
        });
        return [];
      }
      return [
        {
          tipo_id: tipo.tipo_id,
          resultado: item.resultado,
          observacion: item.observacion ?? null,
          documento_id: soporte?.documento_id ?? null,
          documento_version: soporte?.version ?? null,
        },
      ];
    });
    if (errores.length > 0) {
      const code = errores.every((e) => e.codigo === errores[0]?.codigo) ? (errores[0]?.codigo as string) : 'CHEQUEO_INVALIDO';
      throw AppError.datosInvalidos(code, 'El chequeo documental contiene errores', { items: errores });
    }

    const asignacion = await obtenerAsignacionActiva(id);
    const { data, error } = await supabaseAdmin.rpc('fn_guardar_chequeo', {
      p_postulacion_id: id,
      p_funcionario_id: user.id,
      p_version: input.version,
      p_items: items,
      p_asignacion_id: asignacion?.id ?? null,
    });
    if (error) throw errorDesdeSqlEvaluacion(error.message);
    const revisionId = (data as { revision_id: string }).revision_id;

    try {
      await registrarMovimiento(id, user.id);
    } catch (e) {
      logger.warn({ err: e }, 'No fue posible registrar el movimiento de la asignacion tras el chequeo');
    }

    await auditar({
      ...ctx,
      accion: 'ACTUALIZAR',
      entidad: 'REVISION_DOCUMENTO',
      entidad_id: revisionId,
      metadatos: { evento: 'CHEQUEO_GUARDADO', postulacion_id: id, ciclo: p.ciclo, items: items.length },
    });

    const detalles = await cargarDetalles([revisionId]);
    const filas = detalles.documentos.get(revisionId) ?? [];
    const tipoCodigo = new Map(requisitos.requisitos.map((r) => [r.tipo_id, r.tipo_codigo]));
    const { data: rev } = await supabaseAdmin.from('revision').select('iniciada_en, decidida_en').eq('id', revisionId).maybeSingle();
    const r = rev as { iniciada_en: string; decidida_en: string | null } | null;
    return {
      postulacion_id: id,
      version: p.version,
      chequeo: {
        revision_id: revisionId,
        ciclo: p.ciclo,
        iniciada_en: r?.iniciada_en ?? null,
        decidida_en: r?.decidida_en ?? null,
        items: filas.map((f) => aChequeoItemDto(f, (t) => tipoCodigo.get(t) ?? t)),
      },
    };
  },

  /** POST /evaluacion/postulaciones/:id/dictamen - dictamen unico con decision por beneficio. */
  async dictaminar(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string, input: DictamenInput): Promise<DictamenRespuestaDto> {
    const p = await cargarPostulacion(id);
    if (!(await tieneAsignacionActiva(user.id, id))) throw AppError.noEncontrado();
    exigirEvaluable(p, input.version);

    const solicitados = await beneficiosSolicitados(id);
    validarBeneficiosContraSolicitados(input, solicitados);

    const requisitos = await obtenerRequisitos(id);
    const aprobados = input.beneficios.filter((b) => b.decision === 'APROBADO').map((b) => b.codigo);

    if (input.resultado === 'APROBAR') {
      if (!requisitos.disponible) {
        logger.warn({ postulacion_id: id }, 'PROVISIONAL(documentos): requisitos documentales no disponibles; no se valida la obligatoriedad de soportes');
      } else {
        const revisiones = await cargarRevisiones(id);
        const propia = [...revisiones].reverse().find((r) => r.ciclo === p.ciclo && r.funcionario_id === user.id && !r.decidida_en);
        const detalles = await cargarDetalles(propia ? [propia.id] : []);
        const pendientes = documentosObligatoriosPendientes(aprobados, requisitos, propia ? detalles.documentos.get(propia.id) ?? [] : []);
        if (pendientes.length > 0) {
          throw AppError.datosInvalidos(
            'DOCUMENTOS_OBLIGATORIOS_PENDIENTES',
            'Hay documentos obligatorios sin calificar como presentados para los beneficios que intenta aprobar',
            { pendientes },
          );
        }
      }
    }

    const advertencias: AdvertenciaDictamenDto[] = [];
    if (aprobados.length > 0) {
      const referencias = await referenciasBeneficios(p.convocatoria_id);
      for (const b of input.beneficios) {
        const ref = referencias.get(b.codigo)?.valor_apoyo_referencial;
        if (b.decision === 'APROBADO' && ref != null && ref > 0 && (b.monto_aprobado ?? 0) > ref) {
          advertencias.push({
            codigo: 'MONTO_EXCEDE_REFERENCIAL',
            beneficio: b.codigo,
            mensaje: `El monto aprobado para ${b.codigo} excede el valor de apoyo referencial de la convocatoria`,
          });
        }
      }
    }

    let fechaLimite: { fecha: string; instante: string } | null = null;
    if (input.resultado === 'CORRECCION') fechaLimite = await resolverFechaLimite(input.fecha_limite_subsanacion);

    const beneficios: RevisionBeneficioDto[] =
      input.resultado === 'CORRECCION'
        ? []
        : input.beneficios.map((b) => ({
            codigo: b.codigo,
            decision: b.decision,
            motivo: (b.motivo ?? '').trim() || null,
            monto_aprobado: b.decision === 'APROBADO' ? (b.monto_aprobado ?? null) : null,
          }));
    const campos = input.campos_observados ?? [];
    const docsObservados = input.documentos_observados ?? [];
    const observaciones = input.observaciones.trim() || null;
    const destino = ESTADO_POR_RESULTADO[input.resultado];
    const asignacion = await obtenerAsignacionActiva(id);

    // --- Paso 1: registro atomico (revision + detalle + cierre + observacion publica) ---
    const publicaInicial = observacionPublicaDictamen({
      ciclo: p.ciclo,
      resultado: input.resultado,
      observaciones,
      campos_observados: campos,
      documentos_observados: docsObservados,
      fecha_limite_subsanacion: fechaLimite?.instante ?? null,
      beneficios,
      decidida_en: new Date().toISOString(),
    });
    const { data: reg, error: errReg } = await supabaseAdmin.rpc('fn_registrar_dictamen', {
      p_postulacion_id: id,
      p_funcionario_id: user.id,
      p_version: input.version,
      p_resultado: input.resultado,
      p_observaciones: observaciones,
      p_campos_observados: campos,
      p_documentos_observados: docsObservados,
      p_fecha_limite: fechaLimite?.instante ?? null,
      p_beneficios: beneficios.map((b) => ({ codigo: b.codigo, decision: b.decision, motivo: b.motivo, monto_aprobado: b.monto_aprobado })),
      p_correccion_publica: publicaInicial,
      p_asignacion_id: asignacion?.id ?? null,
    });
    if (errReg) throw errorDesdeSqlEvaluacion(errReg.message);
    const registro = reg as {
      revision_id: string;
      ciclo: number;
      decidida_en: string;
      aprobacion_parcial: boolean;
      convocatoria_id: string;
      beneficiario_usuario_id: string | null;
      correccion_previa: Record<string, unknown> | null;
    };

    // --- Paso 2: cambio de estado (unico punto: postulacionService.transicionar) ---
    const publica = observacionPublicaDictamen({
      ciclo: p.ciclo,
      resultado: input.resultado,
      observaciones,
      campos_observados: campos,
      documentos_observados: docsObservados,
      fecha_limite_subsanacion: fechaLimite?.instante ?? null,
      beneficios,
      decidida_en: registro.decidida_en,
    });
    let actualizada;
    try {
      actualizada = await postulacionService.transicionar(id, destino.estado, {
        actor: { tipo: 'FUNCIONARIO', id: user.id },
        motivo: destino.motivo,
        observaciones,
        versionEsperada: input.version,
        payload: {
          aprobacion_parcial: registro.aprobacion_parcial,
          ...(fechaLimite ? { fecha_limite_subsanacion: fechaLimite.instante } : {}),
          correccion_vigente: { ...publica } as unknown as CorreccionVigente,
        },
        contexto: { ip: ctx.ip ?? null, user_agent: ctx.user_agent ?? null, request_id: ctx.request_id ?? null, actor_rol: 'FUNCIONARIO' },
      });
    } catch (e) {
      const { error: errReabrir } = await supabaseAdmin.rpc('fn_reabrir_dictamen', {
        p_revision_id: registro.revision_id,
        p_version_registro: input.version,
        p_correccion_previa: registro.correccion_previa,
      });
      if (errReabrir) logger.error({ err: errReabrir, revision_id: registro.revision_id }, 'No fue posible revertir el dictamen tras el fallo de la transicion');
      throw e;
    }

    // --- Paso 3: efectos posteriores (el dictamen ya es firme) ---
    try {
      await liberarAsignacionActiva(id, 'DICTAMEN_EMITIDO', user.id);
    } catch (e) {
      logger.error({ err: e, postulacion_id: id }, 'No fue posible liberar la asignacion tras el dictamen');
    }

    if (input.resultado === 'APROBAR') {
      for (const b of beneficios.filter((x) => x.decision === 'APROBADO')) {
        try {
          await crearOtorgamiento({
            postulacion_id: id,
            beneficio_codigo: b.codigo as CodigoBeneficio,
            convocatoria_id: p.convocatoria_id,
            monto_aprobado: b.monto_aprobado as number,
            revision_id: registro.revision_id,
          });
        } catch (e) {
          logger.error({ err: e, postulacion_id: id, beneficio: b.codigo }, 'No fue posible crear el otorgamiento');
          advertencias.push({ codigo: 'OTORGAMIENTO_NO_CREADO', beneficio: b.codigo as CodigoBeneficio, mensaje: `No fue posible crear el otorgamiento de ${b.codigo}` });
          await alertarAdministradores(
            'Otorgamiento pendiente de crear',
            `La postulacion ${id} fue aprobada pero no se pudo crear el otorgamiento del beneficio ${b.codigo}. Revise y regularice manualmente.`,
            `otorgamiento-pendiente:${id}:${b.codigo}`,
          ).catch(() => undefined);
        }
      }
    }

    await notificarBeneficiario({
      usuarioId: registro.beneficiario_usuario_id,
      postulacionId: id,
      resultado: input.resultado,
      parcial: registro.aprobacion_parcial,
      ciclo: p.ciclo,
      versionNueva: actualizada.version,
      fechaLimite: fechaLimite?.fecha ?? null,
      observaciones,
    });

    await auditarSeguro({
      ...ctx,
      accion: 'DICTAMINAR',
      entidad: 'REVISION',
      entidad_id: registro.revision_id,
      datos_despues: {
        postulacion_id: id,
        ciclo: p.ciclo,
        resultado: input.resultado,
        estado: destino.estado,
        aprobacion_parcial: registro.aprobacion_parcial,
        beneficios: beneficios.map((b) => ({ codigo: b.codigo, decision: b.decision, monto_aprobado: b.monto_aprobado })),
        fecha_limite_subsanacion: fechaLimite?.instante ?? null,
      },
    });

    return {
      revision_id: registro.revision_id,
      postulacion_id: id,
      ciclo: p.ciclo,
      resultado: input.resultado,
      estado: actualizada.estado,
      version: actualizada.version,
      aprobacion_parcial: actualizada.aprobacion_parcial,
      fecha_limite_subsanacion: actualizada.fecha_limite_subsanacion,
      decidida_en: registro.decidida_en,
      beneficios,
      advertencias,
    };
  },

  /** GET /evaluacion/postulaciones/:id/historial-revisiones */
  async historial(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string): Promise<HistorialRevisionesDto> {
    await cargarPostulacion(id);
    const admin = esAdmin(user);
    const revisiones = (await cargarRevisiones(id)).filter((r) => r.decidida_en);
    let visibles = revisiones;
    if (!admin && !(await tieneAsignacionActiva(user.id, id))) visibles = revisiones.filter((r) => r.funcionario_id === user.id);

    const [detalles, tipos, nombres] = await Promise.all([
      cargarDetalles(visibles.map((r) => r.id)),
      cargarTipos(),
      admin ? nombresFuncionarios([...new Set(visibles.map((r) => r.funcionario_id))]) : Promise.resolve(new Map()),
    ]);

    const data = visibles.map((r) =>
      aRevisionHistorialDto(r, detalles.documentos.get(r.id) ?? [], detalles.beneficios.get(r.id) ?? [], {
        esAdmin: admin,
        usuarioId: user.id,
        nombreFuncionario: (fid) => nombres.get(fid) ?? { id: fid, nombres: null, apellidos: null },
        codigoDeTipo: (t) => tipos.get(t)?.codigo ?? t,
      }),
    );

    await auditar({
      ...ctx,
      accion: 'LECTURA_SENSIBLE',
      entidad: 'REVISION',
      entidad_id: id,
      metadatos: { vista: 'historial_revisiones', evento: 'HISTORIAL_REVISIONES_CONSULTADO', revisiones: data.length },
    });
    return { postulacion_id: id, data };
  },
};

// ---------------------------------------------------------------------------
// Notificacion al beneficiario (plantillas fijas firmadas "Equipo FOEST"; sin datos del evaluador)
// ---------------------------------------------------------------------------
async function notificarBeneficiario(a: {
  usuarioId: string | null;
  postulacionId: string;
  resultado: ResultadoDictamen;
  parcial: boolean;
  ciclo: number;
  versionNueva: number;
  fechaLimite: string | null;
  observaciones: string | null;
}): Promise<void> {
  if (!a.usuarioId) return;
  const destino = ESTADO_POR_RESULTADO[a.resultado];
  try {
    let titulo: string;
    let mensaje: string;
    const payload: Record<string, string | number | boolean | null> = {};
    if (a.resultado === 'APROBAR') {
      titulo = 'Su postulacion fue aprobada';
      mensaje = a.parcial ? 'Su postulacion fue aprobada parcialmente. Revise el resultado por beneficio.' : 'Su postulacion fue aprobada. Felicitaciones.';
      payload.parcial = a.parcial;
    } else if (a.resultado === 'RECHAZAR') {
      titulo = 'Su postulacion no fue aprobada';
      mensaje = 'Su postulacion no fue aprobada. Revise las observaciones del Equipo FOEST.';
    } else {
      titulo = 'Su postulacion requiere correcciones';
      mensaje = `El Equipo FOEST solicito correcciones a su postulacion. Plazo: ${a.fechaLimite ? textoFecha(a.fechaLimite) : 'ver detalle'}.`;
      payload.fecha_limite_texto = a.fechaLimite ? textoFecha(a.fechaLimite) : 'ver detalle en el portal';
      payload.observacion = a.observaciones;
    }
    await encolarNotificacion({
      usuario_id: a.usuarioId,
      tipo: destino.notificacion as 'POSTULACION_APROBADA' | 'POSTULACION_RECHAZADA' | 'CORRECCION_SOLICITADA',
      titulo,
      mensaje,
      entidad: 'POSTULACION',
      entidad_id: a.postulacionId,
      url_destino: `/beneficiario/postulaciones/${a.postulacionId}`,
      // La notificacion in-app la crea fn_transicionar_postulacion con esta misma clave; aqui solo se encola el correo.
      clave_dedup: `${destino.dedup}:${a.postulacionId}:${a.ciclo}:${a.versionNueva}`,
      canal: 'CORREO',
      payload,
    });
  } catch (e) {
    logger.error({ err: e, postulacion_id: a.postulacionId }, 'No fue posible encolar la notificacion del dictamen');
  }
}
