import type { SupabaseClient } from '@supabase/supabase-js';
import { BENEFICIOS_CATALOGO, type EstadoPostulacion } from '@foest/shared';
import { AppError, logger, supabaseAdmin, supabaseAsUser, type UsuarioAutenticado } from '../../shared';
import { presentarEstado, tituloHito, TEXTO_ESTADO_DESEMBOLSO, TEXTO_ESTADO_DOCUMENTO, TEXTO_ESTADO_OTORGAMIENTO, type EstadoDocumentoPublico } from './estados.presentacion';
import { limpiarCamposActor, serializarObservacionPublica, type ObservacionPublica } from './observacion.publica';
import {
  consultaObligatoria,
  consultaOpcional,
  diasHasta,
  estaAbierta,
  textoCierre,
  textoFecha,
  textoFechaHora,
} from './supabase.util';
import type {
  AccionPendienteDto,
  ConvocatoriaPublicaDto,
  CertificadoLaborSocialDescargaDto,
  DescargaDto,
  DescargasDto,
  DocumentoChecklistDto,
  DocumentosDto,
  FilaBeneficiario,
  FilaConvocatoria,
  FilaEnvio,
  FilaHistorial,
  FilaPostulacion,
  HitoDto,
  LineaTiempoDto,
  OtorgamientoDto,
  OtorgamientosDto,
  PostulacionResumenDto,
  ResultadoBeneficioDto,
  ResumenDto,
} from './beneficiario_dashboard.types';

/**
 * Servicio del portal del beneficiario (solo lectura).
 *
 * - Tablas de 0001_base.sql (postulacion, postulacion_envio, historial_estado_postulacion,
 *   postulacion_beneficio, notificacion, beneficiario, beneficio, convocatoria abierta)
 *   se leen con `supabaseAsUser(token)`: RLS limita a lo propio.
 * - `configuracion_sistema` (RECORDATORIO_BORRADOR_DIAS, FECHA_PROXIMA_APERTURA_ESTIMADA)
 *   y las convocatorias YA CERRADAS de las postulaciones propias no son visibles por RLS
 *   para el beneficiario; se leen con `supabaseAdmin` restringiendo por ids propios y
 *   devolviendo solo campos no sensibles (lectura de sistema).
 * - Tablas de modulos construidos en paralelo (documento, revision*, formato_generado,
 *   otorgamiento, desembolso, cuenta_pago) se consultan como OPCIONALES: si no existen,
 *   la seccion vuelve vacia con `pendiente_modulo: true`.
 * - Toda respuesta pasa por `limpiarCamposActor` (anonimato del evaluador).
 */

const COLS_POSTULACION =
  'id, beneficiario_id, convocatoria_id, tipo_solicitud, estado, ciclo, version, aprobacion_parcial, fecha_limite_subsanacion, enviada_en, correccion_vigente, creado_en, actualizado_en';
const COLS_CONVOCATORIA = 'id, anio, semestre, nombre, descripcion, fecha_apertura, fecha_cierre_exclusiva, estado';
const DIAS_RECIENTE_INFO = 30;
const RECORDATORIO_BORRADOR_DIAS_DEFECTO = 5;
const PRIORIDAD_ORDEN: Record<AccionPendienteDto['prioridad'], number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

interface Configuracion {
  recordatorioBorradorDias: number;
  proximaAperturaEstimada: string | null;
}

interface Contexto {
  user: UsuarioAutenticado;
  db: SupabaseClient;
  ahora: Date;
}

function contexto(user: UsuarioAutenticado): Contexto {
  return { user, db: supabaseAsUser(user.token), ahora: new Date() };
}

function nombreBeneficio(codigo: string, catalogo: Map<string, string>): string {
  return catalogo.get(codigo) ?? BENEFICIOS_CATALOGO.find((b) => b.codigo === codigo)?.nombre ?? codigo;
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/* ------------------------------ Lecturas base ------------------------------ */

async function obtenerBeneficiario(ctx: Contexto): Promise<FilaBeneficiario | null> {
  const { data, error } = await ctx.db
    .from('beneficiario')
    .select('id, usuario_id, nombres, apellidos, perfil_completo, es_menor')
    .eq('usuario_id', ctx.user.id)
    .maybeSingle();
  if (error) throw AppError.interno(`No fue posible consultar el perfil del beneficiario: ${error.message}`);
  return (data as FilaBeneficiario | null) ?? null;
}

/** Postulacion propia o 404 (oculta existencia). Verificacion explicita ademas de RLS. */
async function obtenerPostulacionPropia(ctx: Contexto, beneficiarioId: string | null, postulacionId: string): Promise<FilaPostulacion> {
  if (!beneficiarioId) throw AppError.noEncontrado();
  const { data, error } = await ctx.db.from('postulacion').select(COLS_POSTULACION).eq('id', postulacionId).maybeSingle();
  if (error) throw AppError.interno(`No fue posible consultar la postulacion: ${error.message}`);
  const fila = data as FilaPostulacion | null;
  if (!fila || fila.beneficiario_id !== beneficiarioId) throw AppError.noEncontrado();
  return fila;
}

async function listarPostulacionesPropias(ctx: Contexto, beneficiarioId: string): Promise<FilaPostulacion[]> {
  return consultaObligatoria<FilaPostulacion>(
    'las postulaciones',
    ctx.db.from('postulacion').select(COLS_POSTULACION).eq('beneficiario_id', beneficiarioId).order('creado_en', { ascending: false }),
  );
}

async function leerConfiguracion(): Promise<Configuracion> {
  const salida: Configuracion = { recordatorioBorradorDias: RECORDATORIO_BORRADOR_DIAS_DEFECTO, proximaAperturaEstimada: null };
  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_sistema')
      .select('clave, valor')
      .in('clave', ['RECORDATORIO_BORRADOR_DIAS', 'FECHA_PROXIMA_APERTURA_ESTIMADA']);
    if (error) throw error;
    for (const fila of (data ?? []) as Array<{ clave: string; valor: string | null }>) {
      if (fila.clave === 'RECORDATORIO_BORRADOR_DIAS') {
        const n = Number.parseInt(fila.valor ?? '', 10);
        if (Number.isFinite(n) && n > 0) salida.recordatorioBorradorDias = n;
      } else if (fila.clave === 'FECHA_PROXIMA_APERTURA_ESTIMADA' && fila.valor && fila.valor.trim() !== '') {
        salida.proximaAperturaEstimada = fila.valor.trim();
      }
    }
  } catch (e) {
    logger.warn({ err: e }, 'No fue posible leer configuracion_sistema; se usan valores por defecto');
  }
  return salida;
}

async function convocatoriaAbierta(ctx: Contexto): Promise<FilaConvocatoria | null> {
  const ahoraIso = ctx.ahora.toISOString();
  const filas = await consultaObligatoria<FilaConvocatoria>(
    'la convocatoria abierta',
    ctx.db
      .from('convocatoria')
      .select(COLS_CONVOCATORIA)
      .eq('estado', 'HABILITADA')
      .lte('fecha_apertura', ahoraIso)
      .gt('fecha_cierre_exclusiva', ahoraIso)
      .order('fecha_apertura', { ascending: false })
      .limit(1),
  );
  const c = filas.find((f) => estaAbierta(f, ctx.ahora));
  return c ?? null;
}

/** Convocatorias de las postulaciones propias (incluidas cerradas: lectura de sistema por ids propios). */
async function convocatoriasDe(ctx: Contexto, ids: string[]): Promise<Map<string, FilaConvocatoria>> {
  const mapa = new Map<string, FilaConvocatoria>();
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return mapa;
  const filas = await consultaObligatoria<FilaConvocatoria>(
    'las convocatorias de sus postulaciones',
    supabaseAdmin.from('convocatoria').select(COLS_CONVOCATORIA).in('id', unicos),
  );
  for (const f of filas) mapa.set(f.id, f);
  return mapa;
}

async function proximaAperturaProgramada(ctx: Contexto): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('convocatoria')
      .select('fecha_apertura')
      .in('estado', ['BORRADOR', 'HABILITADA'])
      .gt('fecha_apertura', ctx.ahora.toISOString())
      .order('fecha_apertura', { ascending: true })
      .limit(1);
    if (error) throw error;
    const fila = (data ?? [])[0] as { fecha_apertura: string } | undefined;
    return fila?.fecha_apertura ?? null;
  } catch (e) {
    logger.warn({ err: e }, 'No fue posible consultar la proxima convocatoria programada');
    return null;
  }
}

async function catalogoBeneficios(ctx: Contexto): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    const { data } = await ctx.db.from('beneficio').select('codigo, nombre');
    const filas = (data ?? []) as Array<{ codigo: string; nombre: string }>;
    for (const b of filas) mapa.set(b.codigo, b.nombre);
  } catch {
    /* se usa el catalogo compartido como respaldo */
  }
  return mapa;
}

async function contarNotificaciones(ctx: Contexto): Promise<{ no_leidas: number; criticas_no_leidas: number }> {
  const base = () => ctx.db.from('notificacion').select('id', { count: 'exact', head: true }).eq('usuario_id', ctx.user.id).eq('leida', false);
  const [todas, criticas] = await Promise.all([base(), base().eq('severidad', 'CRITICA')]);
  if (todas.error) throw AppError.interno(`No fue posible contar notificaciones: ${todas.error.message}`);
  if (criticas.error) throw AppError.interno(`No fue posible contar notificaciones criticas: ${criticas.error.message}`);
  return { no_leidas: todas.count ?? 0, criticas_no_leidas: criticas.count ?? 0 };
}

/* ------------------------------- Presentacion ------------------------------ */

function presentarConvocatoria(c: FilaConvocatoria, ahora: Date): ConvocatoriaPublicaDto {
  return {
    id: c.id,
    nombre: c.nombre,
    anio: c.anio,
    semestre: c.semestre,
    descripcion: c.descripcion ?? '',
    fecha_apertura: c.fecha_apertura,
    fecha_cierre_exclusiva: c.fecha_cierre_exclusiva,
    fecha_cierre_texto: textoCierre(c.fecha_cierre_exclusiva),
    dias_restantes: Math.max(0, diasHasta(c.fecha_cierre_exclusiva, ahora)),
  };
}

function presentarPostulacion(p: FilaPostulacion, convocatorias: Map<string, FilaConvocatoria>): PostulacionResumenDto {
  const e = presentarEstado(p.estado, p.aprobacion_parcial);
  const c = convocatorias.get(p.convocatoria_id);
  return {
    id: p.id,
    convocatoria: c ? { id: c.id, nombre: c.nombre, anio: c.anio, semestre: c.semestre } : null,
    tipo_solicitud: p.tipo_solicitud,
    estado: p.estado,
    estado_texto: e.texto,
    estado_descripcion: e.descripcion,
    requiere_accion: e.requiere_accion,
    terminal: e.terminal,
    ciclo: p.ciclo,
    aprobacion_parcial: Boolean(p.aprobacion_parcial),
    fecha_limite_subsanacion: p.fecha_limite_subsanacion,
    fecha_limite_subsanacion_texto: textoFechaHora(p.fecha_limite_subsanacion),
    enviada_en: p.enviada_en,
    actualizado_en: p.actualizado_en,
  };
}

function observacionDeCorreccion(p: FilaPostulacion): ObservacionPublica | null {
  const cv = objeto(p.correccion_vigente);
  if (!cv) return null;
  return serializarObservacionPublica({
    fecha: p.actualizado_en,
    texto: typeof cv.observaciones === 'string' ? cv.observaciones : typeof cv.texto === 'string' ? cv.texto : null,
    campos_observados: cv.campos_observados,
    documentos_observados: cv.documentos_observados,
  });
}

/* --------------------------- Acciones pendientes --------------------------- */

interface OtorgamientoCrudo {
  id: string;
  postulacion_id: string;
  beneficiario_id?: string;
  beneficio_codigo: string;
  estado: string;
  monto_aprobado: number | string | null;
  otorgado_en: string | null;
  creado_en?: string | null;
  cuenta_pago_id?: string | null;
}

interface DesembolsoCrudo {
  id: string;
  otorgamiento_id: string;
  estado: string;
  monto: number | string | null;
  fecha_programada: string | null;
  fecha_pago: string | null;
  referencia: string | null;
  concepto: string | null;
  actualizado_en?: string | null;
  creado_en?: string | null;
}

function esReciente(fecha: string | null | undefined, ahora: Date): boolean {
  if (!fecha) return false;
  const dias = -diasHasta(fecha, ahora);
  return dias >= 0 && dias <= DIAS_RECIENTE_INFO;
}

function calcularAcciones(args: {
  ahora: Date;
  config: Configuracion;
  postulaciones: FilaPostulacion[];
  convocatorias: Map<string, FilaConvocatoria>;
  criticasNoLeidas: number;
  otorgamientos: OtorgamientoCrudo[];
  desembolsos: DesembolsoCrudo[];
  catalogo: Map<string, string>;
}): AccionPendienteDto[] {
  const acciones: AccionPendienteDto[] = [];
  const { ahora, config } = args;

  for (const p of args.postulaciones) {
    if (p.estado === 'BORRADOR') {
      const c = args.convocatorias.get(p.convocatoria_id);
      if (!c || !estaAbierta(c, ahora)) continue;
      const dias = diasHasta(c.fecha_cierre_exclusiva, ahora);
      if (dias > config.recordatorioBorradorDias) continue;
      const ultimoDia = dias <= 1;
      acciones.push({
        tipo: 'BORRADOR_POR_VENCER',
        prioridad: ultimoDia ? 'ALTA' : 'MEDIA',
        postulacion_id: p.id,
        titulo: ultimoDia ? 'Su borrador vence hoy' : `Su borrador vence en ${dias} dias`,
        descripcion: `La convocatoria ${c.nombre} cierra el ${textoCierre(c.fecha_cierre_exclusiva)}. Complete y envie su postulacion antes de esa fecha.`,
        fecha_limite: c.fecha_cierre_exclusiva,
        fecha_limite_texto: textoCierre(c.fecha_cierre_exclusiva),
        accion_url: `/beneficiario/postulaciones/${p.id}`,
        etiqueta_accion: 'Completar postulacion',
      });
    } else if (p.estado === 'EN_CORRECCION') {
      if (!p.fecha_limite_subsanacion || new Date(p.fecha_limite_subsanacion) <= ahora) continue;
      const obs = observacionDeCorreccion(p);
      const partes: string[] = [];
      if (obs && obs.documentos_observados.length > 0) partes.push(`Documentos por corregir: ${obs.documentos_observados.join(', ')}.`);
      if (obs && obs.campos_observados.length > 0) partes.push(`Campos por corregir: ${obs.campos_observados.join(', ')}.`);
      if (partes.length === 0) partes.push('Revise las observaciones del Equipo FOEST en la linea de tiempo de su expediente.');
      acciones.push({
        tipo: 'DOCUMENTOS_POR_CORREGIR',
        prioridad: 'ALTA',
        postulacion_id: p.id,
        titulo: 'Tiene documentos o datos por corregir',
        descripcion: `${partes.join(' ')} Plazo: ${textoFechaHora(p.fecha_limite_subsanacion)} (hora de Colombia).`,
        fecha_limite: p.fecha_limite_subsanacion,
        fecha_limite_texto: textoFechaHora(p.fecha_limite_subsanacion),
        accion_url: `/beneficiario/postulaciones/${p.id}/subsanar`,
        etiqueta_accion: 'Subsanar ahora',
      });
    }
  }

  if (args.criticasNoLeidas > 0) {
    acciones.push({
      tipo: 'NOTIFICACION_CRITICA',
      prioridad: 'ALTA',
      postulacion_id: null,
      titulo: args.criticasNoLeidas === 1 ? 'Tiene 1 notificacion importante sin leer' : `Tiene ${args.criticasNoLeidas} notificaciones importantes sin leer`,
      descripcion: 'Revise su centro de notificaciones: hay mensajes que requieren su atencion.',
      fecha_limite: null,
      fecha_limite_texto: null,
      accion_url: '/beneficiario/notificaciones',
      etiqueta_accion: 'Ver notificaciones',
    });
  }

  for (const o of args.otorgamientos) {
    if (!esReciente(o.otorgado_en ?? o.creado_en, ahora)) continue;
    acciones.push({
      tipo: 'OTORGAMIENTO_INFO',
      prioridad: 'BAJA',
      postulacion_id: o.postulacion_id,
      titulo: `Nuevo otorgamiento: ${nombreBeneficio(o.beneficio_codigo, args.catalogo)}`,
      descripcion: 'Se registro un otorgamiento a su favor. Consulte el detalle y los desembolsos programados.',
      fecha_limite: null,
      fecha_limite_texto: null,
      accion_url: '/beneficiario#otorgamientos',
      etiqueta_accion: 'Ver otorgamientos',
    });
  }

  for (const d of args.desembolsos) {
    if (d.estado !== 'PROGRAMADO' && d.estado !== 'PAGADO') continue;
    const fecha = d.estado === 'PAGADO' ? d.fecha_pago ?? d.actualizado_en : d.fecha_programada ?? d.creado_en;
    if (!esReciente(d.actualizado_en ?? d.creado_en ?? fecha, ahora) && !esReciente(fecha, ahora)) continue;
    acciones.push({
      tipo: 'DESEMBOLSO_INFO',
      prioridad: 'BAJA',
      postulacion_id: null,
      titulo: d.estado === 'PAGADO' ? 'Desembolso pagado' : 'Desembolso programado',
      descripcion:
        d.estado === 'PAGADO'
          ? `Se registro el pago de un desembolso${d.fecha_pago ? ` el ${textoFecha(d.fecha_pago)}` : ''}.`
          : `Hay un desembolso programado${d.fecha_programada ? ` para el ${textoFecha(d.fecha_programada)}` : ''}.`,
      fecha_limite: null,
      fecha_limite_texto: null,
      accion_url: '/beneficiario#otorgamientos',
      etiqueta_accion: 'Ver desembolsos',
    });
  }

  return acciones.sort((a, b) => {
    const dp = PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad];
    if (dp !== 0) return dp;
    const fa = a.fecha_limite ? new Date(a.fecha_limite).getTime() : Number.MAX_SAFE_INTEGER;
    const fb = b.fecha_limite ? new Date(b.fecha_limite).getTime() : Number.MAX_SAFE_INTEGER;
    return fa - fb;
  });
}

/* ----------------------------- Linea de tiempo ----------------------------- */

interface RevisionCruda {
  id: string;
  postulacion_id: string;
  ciclo: number;
  resultado: string | null;
  observaciones: string | null;
  campos_observados: unknown;
  documentos_observados: unknown;
  decidida_en: string | null;
}

function construirHitos(p: FilaPostulacion, historial: FilaHistorial[], revisiones: Map<number, RevisionCruda>): HitoDto[] {
  const filas = historial.length > 0 ? historial : sintetizarHistorial(p);
  const hitos: HitoDto[] = [];
  let ultimoEstadoVisible: EstadoPostulacion | null = null;

  for (const h of filas) {
    // Movimiento interno (liberacion / reasignacion): no se expone.
    if (h.estado_anterior === 'EN_EVALUACION' && h.estado_nuevo === 'PENDIENTE') continue;
    if (h.estado_nuevo === 'EN_EVALUACION' && ultimoEstadoVisible === 'EN_EVALUACION') continue;

    const presentado = presentarEstado(h.estado_nuevo, h.estado_nuevo === 'APROBADA' && p.aprobacion_parcial);
    let observacion: ObservacionPublica | null = null;
    const esDictamen = h.estado_nuevo === 'EN_CORRECCION' || h.estado_nuevo === 'RECHAZADA' || h.estado_nuevo === 'APROBADA';
    if (esDictamen) {
      const rev = revisiones.get(h.ciclo);
      observacion = serializarObservacionPublica({
        fecha: h.cambiado_en,
        texto: h.observaciones ?? rev?.observaciones ?? null,
        campos_observados: rev?.campos_observados ?? (h.estado_nuevo === 'EN_CORRECCION' && h.ciclo === p.ciclo ? objeto(p.correccion_vigente)?.campos_observados : undefined),
        documentos_observados:
          rev?.documentos_observados ?? (h.estado_nuevo === 'EN_CORRECCION' && h.ciclo === p.ciclo ? objeto(p.correccion_vigente)?.documentos_observados : undefined),
      });
    } else if (h.estado_nuevo === 'DESISTIDA' && h.observaciones) {
      observacion = serializarObservacionPublica({ fecha: h.cambiado_en, texto: h.observaciones });
    }

    hitos.push({
      id: h.id,
      fecha: h.cambiado_en,
      fecha_texto: textoFechaHora(h.cambiado_en) ?? h.cambiado_en,
      ciclo: h.ciclo,
      estado: h.estado_nuevo,
      titulo: tituloHito(h.estado_nuevo, h.ciclo, p.aprobacion_parcial),
      descripcion: presentado.descripcion,
      observacion,
      actual: false,
    });
    ultimoEstadoVisible = h.estado_nuevo;
  }

  const ultimo = hitos[hitos.length - 1];
  if (ultimo) ultimo.actual = true;
  return hitos;
}

function sintetizarHistorial(p: FilaPostulacion): FilaHistorial[] {
  const filas: FilaHistorial[] = [
    {
      id: `${p.id}:creacion`,
      postulacion_id: p.id,
      ciclo: 0,
      estado_anterior: null,
      estado_nuevo: 'BORRADOR',
      motivo: 'CREACION',
      observaciones: null,
      cambiado_en: p.creado_en,
    },
  ];
  if (p.estado !== 'BORRADOR') {
    if (p.enviada_en) {
      filas.push({
        id: `${p.id}:envio`,
        postulacion_id: p.id,
        ciclo: Math.max(1, p.ciclo),
        estado_anterior: 'BORRADOR',
        estado_nuevo: 'PENDIENTE',
        motivo: 'ENVIO',
        observaciones: null,
        cambiado_en: p.enviada_en,
      });
    }
    if (p.estado !== 'PENDIENTE') {
      filas.push({
        id: `${p.id}:actual`,
        postulacion_id: p.id,
        ciclo: p.ciclo,
        estado_anterior: 'PENDIENTE',
        estado_nuevo: p.estado,
        motivo: 'ESTADO_ACTUAL',
        observaciones: null,
        cambiado_en: p.actualizado_en,
      });
    }
  }
  return filas;
}

/* --------------------------------- Servicio -------------------------------- */

export const beneficiarioDashboardService = {
  async resumen(user: UsuarioAutenticado): Promise<ResumenDto> {
    const ctx = contexto(user);
    const [beneficiario, config, abierta, notificaciones, catalogo] = await Promise.all([
      obtenerBeneficiario(ctx),
      leerConfiguracion(),
      convocatoriaAbierta(ctx),
      contarNotificaciones(ctx),
      catalogoBeneficios(ctx),
    ]);

    const postulaciones = beneficiario ? await listarPostulacionesPropias(ctx, beneficiario.id) : [];
    const convocatorias = await convocatoriasDe(
      ctx,
      postulaciones.map((p) => p.convocatoria_id),
    );
    if (abierta) convocatorias.set(abierta.id, abierta);

    // Otorgamientos y desembolsos (modulo seguimiento_beneficios: opcional)
    let otorgamientos: OtorgamientoCrudo[] = [];
    let desembolsos: DesembolsoCrudo[] = [];
    let pendienteOtorgamientos = false;
    if (beneficiario) {
      const ro = await consultaOpcional<OtorgamientoCrudo>(
        'los otorgamientos',
        ctx.db
          .from('otorgamiento')
          .select('id, postulacion_id, beneficio_codigo, estado, monto_aprobado, otorgado_en, creado_en')
          .eq('beneficiario_id', beneficiario.id)
          .order('creado_en', { ascending: false })
          .limit(20),
      );
      pendienteOtorgamientos = ro.pendiente;
      otorgamientos = ro.data;
      if (!ro.pendiente && otorgamientos.length > 0) {
        const rd = await consultaOpcional<DesembolsoCrudo>(
          'los desembolsos',
          ctx.db
            .from('desembolso')
            .select('id, otorgamiento_id, estado, monto, fecha_programada, fecha_pago, referencia, concepto, creado_en, actualizado_en')
            .in(
              'otorgamiento_id',
              otorgamientos.map((o) => o.id),
            )
            .order('creado_en', { ascending: false })
            .limit(20),
        );
        desembolsos = rd.data;
      }
    }

    const presentadas = postulaciones.map((p) => presentarPostulacion(p, convocatorias));
    const enAbierta = abierta ? presentadas.find((p) => p.convocatoria?.id === abierta.id) ?? null : null;
    const noTerminal = presentadas.find((p) => !p.terminal) ?? null;
    const postulacionActual = enAbierta ?? noTerminal ?? presentadas[0] ?? null;

    let proximaApertura: string | null = null;
    let mensaje = '';
    if (abierta) {
      mensaje = `La convocatoria ${abierta.nombre} esta abierta hasta el ${textoCierre(abierta.fecha_cierre_exclusiva)}.`;
    } else {
      proximaApertura = config.proximaAperturaEstimada ?? (await proximaAperturaProgramada(ctx));
      mensaje = proximaApertura
        ? `En este momento no hay convocatoria abierta. La proxima apertura esta estimada para el ${textoFecha(proximaApertura) ?? proximaApertura}.`
        : 'En este momento no hay convocatoria abierta. Le avisaremos por este medio y por correo cuando se publique la proxima.';
    }

    const acciones = calcularAcciones({
      ahora: ctx.ahora,
      config,
      postulaciones,
      convocatorias,
      criticasNoLeidas: notificaciones.criticas_no_leidas,
      otorgamientos,
      desembolsos,
      catalogo,
    });

    const nombre = beneficiario?.nombres?.trim() ? beneficiario.nombres.trim().split(/\s+/)[0] ?? null : null;

    const dto: ResumenDto = {
      saludo: { nombre, perfil_completo: Boolean(beneficiario?.perfil_completo), tiene_perfil: Boolean(beneficiario) },
      convocatoria_abierta: abierta ? presentarConvocatoria(abierta, ctx.ahora) : null,
      proxima_apertura_estimada: proximaApertura,
      proxima_apertura_texto: proximaApertura ? textoFecha(proximaApertura) : null,
      mensaje_convocatoria: mensaje,
      postulacion_actual: postulacionActual,
      puede_iniciar_postulacion: Boolean(abierta) && !enAbierta,
      postulaciones: presentadas,
      acciones_pendientes: acciones,
      notificaciones,
      pendiente_modulo: { otorgamientos: pendienteOtorgamientos },
      generado_en: ctx.ahora.toISOString(),
    };
    return limpiarCamposActor(dto);
  },

  async lineaTiempo(user: UsuarioAutenticado, postulacionId: string): Promise<LineaTiempoDto> {
    const ctx = contexto(user);
    const beneficiario = await obtenerBeneficiario(ctx);
    const p = await obtenerPostulacionPropia(ctx, beneficiario?.id ?? null, postulacionId);

    const [historial, envios, convocatorias, catalogo] = await Promise.all([
      consultaObligatoria<FilaHistorial>(
        'el historial de la postulacion',
        ctx.db
          .from('historial_estado_postulacion')
          .select('id, postulacion_id, ciclo, estado_anterior, estado_nuevo, motivo, observaciones, cambiado_en')
          .eq('postulacion_id', p.id)
          .order('cambiado_en', { ascending: true }),
      ),
      consultaObligatoria<FilaEnvio>(
        'los envios de la postulacion',
        ctx.db.from('postulacion_envio').select('id, postulacion_id, ciclo, enviado_en').eq('postulacion_id', p.id).order('ciclo', { ascending: true }),
      ),
      convocatoriasDe(ctx, [p.convocatoria_id]),
      catalogoBeneficios(ctx),
    ]);

    // Dictamenes (modulo evaluacion: opcional). Solo revisiones decididas.
    const rr = await consultaOpcional<RevisionCruda>(
      'las revisiones',
      ctx.db
        .from('revision')
        .select('id, postulacion_id, ciclo, resultado, observaciones, campos_observados, documentos_observados, decidida_en')
        .eq('postulacion_id', p.id)
        .order('ciclo', { ascending: true }),
    );
    const revisiones = new Map<number, RevisionCruda>();
    for (const r of rr.data) if (r.decidida_en) revisiones.set(r.ciclo, r);

    let resultadoPorBeneficio: ResultadoBeneficioDto[] = [];
    const ultima = [...revisiones.values()].sort((a, b) => b.ciclo - a.ciclo)[0];
    if (ultima && (p.estado === 'APROBADA' || p.estado === 'RECHAZADA')) {
      const rb = await consultaOpcional<{ beneficio_codigo: string; decision: 'APROBADO' | 'RECHAZADO'; motivo: string | null; monto_aprobado: number | string | null }>(
        'el resultado por beneficio',
        ctx.db.from('revision_beneficio').select('beneficio_codigo, decision, motivo, monto_aprobado').eq('revision_id', ultima.id),
      );
      resultadoPorBeneficio = rb.data.map((b) => ({
        beneficio_codigo: b.beneficio_codigo,
        beneficio_nombre: nombreBeneficio(b.beneficio_codigo, catalogo),
        decision: b.decision,
        decision_texto: b.decision === 'APROBADO' ? 'Aprobado' : 'No aprobado',
        motivo_publico: b.decision === 'RECHAZADO' ? b.motivo ?? null : null,
        monto_aprobado: b.decision === 'APROBADO' && b.monto_aprobado !== null ? Number(b.monto_aprobado) : null,
      }));
    }

    const dto: LineaTiempoDto = {
      postulacion: presentarPostulacion(p, convocatorias),
      hitos: construirHitos(p, historial, revisiones),
      ciclos: envios.map((e) => ({ ciclo: e.ciclo, enviado_en: e.enviado_en, enviado_en_texto: textoFechaHora(e.enviado_en) ?? e.enviado_en })),
      resultado_por_beneficio: resultadoPorBeneficio,
      pendiente_modulo: { evaluacion: rr.pendiente },
    };
    return limpiarCamposActor(dto);
  },

  async documentos(user: UsuarioAutenticado, postulacionId: string): Promise<DocumentosDto> {
    const ctx = contexto(user);
    const beneficiario = await obtenerBeneficiario(ctx);
    const p = await obtenerPostulacionPropia(ctx, beneficiario?.id ?? null, postulacionId);

    interface DocCrudo {
      id: string;
      tipo_id: string;
      estado_carga: string | null;
      eliminado: boolean | null;
    }
    interface TipoCrudo {
      id: string;
      codigo: string | null;
      nombre: string | null;
    }
    interface RevDocCruda {
      tipo_id: string;
      documento_id: string | null;
      resultado: 'PRESENTA' | 'NO_PRESENTA' | 'NO_APLICA';
      observacion_especifica: string | null;
      verificado_en: string | null;
    }

    const rd = await consultaOpcional<DocCrudo>(
      'los documentos',
      ctx.db.from('documento').select('id, tipo_id, estado_carga, eliminado').eq('postulacion_id', p.id),
    );
    const documentos = rd.data.filter((d) => !d.eliminado);

    // Chequeo documental del ultimo ciclo (revision decidida del ciclo actual).
    const rr = await consultaOpcional<RevisionCruda>(
      'las revisiones',
      ctx.db.from('revision').select('id, postulacion_id, ciclo, resultado, observaciones, campos_observados, documentos_observados, decidida_en').eq('postulacion_id', p.id).eq('ciclo', p.ciclo),
    );
    const revisionActual = rr.data.filter((r) => r.decidida_en).sort((a, b) => (a.decidida_en! < b.decidida_en! ? 1 : -1))[0];
    let chequeos: RevDocCruda[] = [];
    if (revisionActual) {
      const rc = await consultaOpcional<RevDocCruda>(
        'el chequeo documental',
        ctx.db.from('revision_documento').select('tipo_id, documento_id, resultado, observacion_especifica, verificado_en').eq('revision_id', revisionActual.id),
      );
      chequeos = rc.data;
    }

    // Requisitos (obligatoriedad) segun beneficios solicitados y tipo de tramite: opcional.
    const beneficios = await consultaObligatoria<{ beneficio_codigo: string }>(
      'los beneficios de la postulacion',
      ctx.db.from('postulacion_beneficio').select('beneficio_codigo').eq('postulacion_id', p.id),
    );
    const obligatorios = new Map<string, boolean>();
    if (beneficios.length > 0) {
      const rq = await consultaOpcional<{ tipo_id: string; obligatorio: boolean }>(
        'los requisitos documentales',
        ctx.db
          .from('requisito_documento')
          .select('tipo_id, obligatorio')
          .in(
            'beneficio_codigo',
            beneficios.map((b) => b.beneficio_codigo),
          )
          .eq('tipo_tramite', p.tipo_solicitud),
      );
      for (const r of rq.data) obligatorios.set(r.tipo_id, Boolean(obligatorios.get(r.tipo_id)) || Boolean(r.obligatorio));
    }

    const tipoIds = new Set<string>([...documentos.map((d) => d.tipo_id), ...chequeos.map((c) => c.tipo_id), ...obligatorios.keys()]);
    const tipos = new Map<string, TipoCrudo>();
    if (tipoIds.size > 0) {
      const rt = await consultaOpcional<TipoCrudo>('los tipos de documento', ctx.db.from('tipo_documento').select('id, codigo, nombre').in('id', [...tipoIds]));
      for (const t of rt.data) tipos.set(t.id, t);
    }

    const chequeoPorTipo = new Map(chequeos.map((c) => [c.tipo_id, c]));
    const docPorTipo = new Map(documentos.map((d) => [d.tipo_id, d]));

    const lista: DocumentoChecklistDto[] = [...tipoIds].map((tipoId) => {
      const doc = docPorTipo.get(tipoId);
      const chk = chequeoPorTipo.get(tipoId);
      const tipo = tipos.get(tipoId);
      let estado: EstadoDocumentoPublico;
      let observacion: ObservacionPublica | null = null;
      if (doc && doc.estado_carga && doc.estado_carga !== 'DISPONIBLE') {
        estado = doc.estado_carga === 'RECHAZADO_ARCHIVO' ? 'ARCHIVO_RECHAZADO' : 'PROCESANDO';
      } else if (chk) {
        estado = chk.resultado === 'PRESENTA' ? 'APROBADO' : chk.resultado === 'NO_PRESENTA' ? 'POR_CORREGIR' : 'NO_APLICA';
        if (chk.resultado === 'NO_PRESENTA' && chk.observacion_especifica) {
          observacion = serializarObservacionPublica({ fecha: chk.verificado_en ?? revisionActual?.decidida_en ?? null, texto: chk.observacion_especifica });
        }
      } else if (doc) {
        estado = 'PENDIENTE';
      } else {
        estado = 'SIN_CARGAR';
      }
      return {
        tipo_id: tipoId,
        tipo_codigo: tipo?.codigo ?? null,
        tipo_nombre: tipo?.nombre ?? tipo?.codigo ?? 'Documento',
        documento_id: doc?.id ?? null,
        estado,
        estado_texto: TEXTO_ESTADO_DOCUMENTO[estado],
        observacion,
        obligatorio: obligatorios.get(tipoId) ?? false,
      };
    });
    lista.sort((a, b) => Number(b.obligatorio) - Number(a.obligatorio) || a.tipo_nombre.localeCompare(b.tipo_nombre, 'es'));

    const dto: DocumentosDto = {
      postulacion_id: p.id,
      ciclo: p.ciclo,
      documentos: lista,
      pendiente_modulo: { documentos: rd.pendiente, evaluacion: rr.pendiente },
    };
    return limpiarCamposActor(dto);
  },

  async descargas(user: UsuarioAutenticado): Promise<DescargasDto> {
    const ctx = contexto(user);
    const beneficiario = await obtenerBeneficiario(ctx);
    const postulaciones = beneficiario ? await listarPostulacionesPropias(ctx, beneficiario.id) : [];
    const ids = postulaciones.map((p) => p.id);

    interface FormatoCrudo {
      id: string;
      tipo: string;
      postulacion_id: string;
      estado: string;
      vigente: boolean | null;
      generado_en: string | null;
    }
    let descargas: DescargaDto[] = [];
    let pendienteFormatos = false;
    if (ids.length > 0) {
      const rf = await consultaOpcional<FormatoCrudo>(
        'los formatos generados',
        ctx.db.from('formato_generado').select('id, tipo, postulacion_id, estado, vigente, generado_en').in('postulacion_id', ids).order('generado_en', { ascending: false }),
      );
      pendienteFormatos = rf.pendiente;
      const nombres: Record<string, string> = {
        'GE-F041': 'Formulario de inscripcion (GE-F041)',
        'GE-F043': 'Pagare y carta de instrucciones (GE-F043)',
        'GE-F038': 'Certificado de labor social (GE-F038)',
      };
      descargas = rf.data
        .filter((f) => f.estado !== 'FALLIDO' || f.vigente)
        .map((f) => {
          const estado: DescargaDto['estado'] = f.estado === 'GENERANDO' ? 'GENERANDO' : f.estado === 'FALLIDO' ? 'FALLIDO' : f.vigente ? 'VIGENTE' : 'DESACTUALIZADO';
          const textos: Record<DescargaDto['estado'], string> = {
            VIGENTE: 'Vigente',
            DESACTUALIZADO: 'Desactualizado: debe regenerarlo y firmarlo de nuevo',
            GENERANDO: 'Generando',
            FALLIDO: 'Fallo la generacion',
          };
          return {
            id: f.id,
            tipo: f.tipo,
            nombre: nombres[f.tipo] ?? f.tipo,
            postulacion_id: f.postulacion_id,
            estado,
            estado_texto: textos[estado],
            generado_en: f.generado_en,
            url_descarga: `/formatos/${f.id}/descarga`,
          };
        });
    }

    // Certificados GE-F038 (modulo labor_social): ultima emision DEFINITIVA de cada certificado, leida con RLS del titular.
    const certificadosLaborSocial: CertificadoLaborSocialDescargaDto[] = [];
    let pendienteLaborSocial = false;
    if (beneficiario) {
      interface CertificadoCrudo {
        id: string;
        semestre_academico: string;
        estado: CertificadoLaborSocialDescargaDto['estado'];
        total_horas_acumuladas: number | string | null;
      }
      interface EmisionCruda {
        certificado_id: string;
        emitido_en: string;
      }
      const rc = await consultaOpcional<CertificadoCrudo>(
        'los certificados de labor social',
        ctx.db
          .from('certificado_labor_social')
          .select('id, semestre_academico, estado, total_horas_acumuladas')
          .eq('beneficiario_id', beneficiario.id)
          .order('semestre_academico', { ascending: false }),
      );
      pendienteLaborSocial = rc.pendiente;
      if (!rc.pendiente && rc.data.length > 0) {
        const re = await consultaOpcional<EmisionCruda>(
          'las emisiones de labor social',
          ctx.db
            .from('labor_social_emision')
            .select('certificado_id, emitido_en')
            .in('certificado_id', rc.data.map((c) => c.id))
            .order('emitido_en', { ascending: false }),
        );
        pendienteLaborSocial = re.pendiente;
        const ultima = new Map<string, string>();
        for (const e of re.data) if (!ultima.has(e.certificado_id)) ultima.set(e.certificado_id, e.emitido_en);
        const textos = { EN_PROCESO: 'En proceso', COMPLETADO: 'Completado', PRESENTADO: 'Presentado' } as const;
        for (const c of rc.data) {
          const emitido = ultima.get(c.id);
          if (!emitido) continue;
          certificadosLaborSocial.push({
            id: c.id,
            semestre: c.semestre_academico,
            estado: c.estado,
            estado_texto: textos[c.estado] ?? c.estado,
            emitido_en: emitido,
            horas: Number(c.total_horas_acumuladas ?? 0),
            url_descarga: `/labor-social/${c.id}/certificado.pdf`,
          });
        }
      }
    }

    const dto: DescargasDto = {
      descargas,
      certificados_labor_social: certificadosLaborSocial,
      pendiente_modulo: { formatos: pendienteFormatos, labor_social: pendienteLaborSocial },
    };
    return limpiarCamposActor(dto);
  },

  async otorgamientos(user: UsuarioAutenticado): Promise<OtorgamientosDto> {
    const ctx = contexto(user);
    const beneficiario = await obtenerBeneficiario(ctx);
    if (!beneficiario) return { otorgamientos: [], pendiente_modulo: { seguimiento: false } };

    const catalogo = await catalogoBeneficios(ctx);
    const ro = await consultaOpcional<OtorgamientoCrudo>(
      'los otorgamientos',
      ctx.db
        .from('otorgamiento')
        .select('id, postulacion_id, beneficio_codigo, estado, monto_aprobado, otorgado_en, creado_en, cuenta_pago_id')
        .eq('beneficiario_id', beneficiario.id)
        .order('creado_en', { ascending: false }),
    );
    if (ro.pendiente) return { otorgamientos: [], pendiente_modulo: { seguimiento: true } };

    const ids = ro.data.map((o) => o.id);
    let desembolsos: DesembolsoCrudo[] = [];
    const motivos = new Map<string, string>();
    const cuentas = new Map<string, { tipo: string; entidad: string | null; ultimos4: string }>();
    if (ids.length > 0) {
      const [rd, re] = await Promise.all([
        consultaOpcional<DesembolsoCrudo>(
          'los desembolsos',
          ctx.db
            .from('desembolso')
            .select('id, otorgamiento_id, estado, monto, fecha_programada, fecha_pago, referencia, concepto, creado_en, actualizado_en')
            .in('otorgamiento_id', ids)
            .order('creado_en', { ascending: true }),
        ),
        consultaOpcional<{ otorgamiento_id: string; estado_nuevo: string; motivo: string | null; ocurrido_en: string }>(
          'los eventos de otorgamiento',
          ctx.db.from('otorgamiento_evento').select('otorgamiento_id, estado_nuevo, motivo, ocurrido_en').in('otorgamiento_id', ids).order('ocurrido_en', { ascending: true }),
        ),
      ]);
      desembolsos = rd.data;
      for (const e of re.data) if (e.motivo) motivos.set(`${e.otorgamiento_id}:${e.estado_nuevo}`, e.motivo);

      const cuentaIds = [...new Set(ro.data.map((o) => o.cuenta_pago_id).filter((c): c is string => Boolean(c)))];
      if (cuentaIds.length > 0) {
        // Solo campos enmascarados: nunca numero_cifrado ni datos completos (DECISIONES seccion 12).
        const rc = await consultaOpcional<{ id: string; tipo: string; entidad: string | null; ultimos4: string | null }>(
          'las cuentas de pago',
          ctx.db.from('cuenta_pago').select('id, tipo, entidad, ultimos4').in('id', cuentaIds),
        );
        for (const c of rc.data) cuentas.set(c.id, { tipo: c.tipo, entidad: c.entidad, ultimos4: c.ultimos4 ?? '****' });
      }
    }

    const lista: OtorgamientoDto[] = ro.data.map((o) => ({
      id: o.id,
      postulacion_id: o.postulacion_id,
      beneficio_codigo: o.beneficio_codigo,
      beneficio_nombre: nombreBeneficio(o.beneficio_codigo, catalogo),
      estado: o.estado,
      estado_texto: TEXTO_ESTADO_OTORGAMIENTO[o.estado] ?? o.estado,
      monto_aprobado: o.monto_aprobado !== null && o.monto_aprobado !== undefined ? Number(o.monto_aprobado) : null,
      otorgado_en: o.otorgado_en ?? o.creado_en ?? null,
      motivo_publico: o.estado === 'SUSPENDIDO' || o.estado === 'REVOCADO' ? motivos.get(`${o.id}:${o.estado}`) ?? null : null,
      cuenta_pago: o.cuenta_pago_id ? cuentas.get(o.cuenta_pago_id) ?? null : null,
      desembolsos: desembolsos
        .filter((d) => d.otorgamiento_id === o.id)
        .map((d) => {
          const fecha = d.estado === 'PAGADO' ? d.fecha_pago ?? d.fecha_programada : d.fecha_programada;
          return {
            id: d.id,
            fecha: fecha ?? null,
            fecha_texto: textoFecha(fecha),
            estado: d.estado,
            estado_texto: TEXTO_ESTADO_DESEMBOLSO[d.estado] ?? d.estado,
            monto: d.monto !== null && d.monto !== undefined ? Number(d.monto) : null,
            referencia_pago: d.estado === 'PAGADO' ? d.referencia ?? null : null,
            concepto: d.concepto ?? null,
          };
        }),
    }));

    return limpiarCamposActor({ otorgamientos: lista, pendiente_modulo: { seguimiento: false } });
  },
};
