import type {
  AccionOtorgamiento,
  CodigoBeneficio,
  CuentaPagoEnmascaradaDto,
  CupoBeneficioDto,
  DesembolsoDto,
  EventoOtorgamientoDto,
  MiOtorgamientoDto,
  OtorgamientoDetalleDto,
  OtorgamientoDto,
  Paginado,
  ResultadoPagoDto,
} from '@foest/shared';
import { FIRMA_SEGUIMIENTO } from '@foest/shared';
import { AppError, auditar, logger, paginar, rangoSupabase, supabaseAdmin, type UsuarioAutenticado } from '../../shared';
import { auditarFueraDeTx } from '../auditoria/auditoria.cola';
import { esDiaHabil, fechaLocalBogota } from '../catalogos_configuracion';
import { alertarAdministradores, encolarNotificacion } from '../notificaciones';
import { descifrarNumero, enmascarar } from '../postulaciones/datos-pago.service';
import { calcularCupos } from './seguimiento_beneficios.cupos';
import { esEsquemaAusente, rpc } from './seguimiento_beneficios.db';
import type {
  AnularDesembolsoInput,
  CambioEstadoOtorgamientoInput,
  CumplirOtorgamientoInput,
  FiltrosOtorgamientosInput,
  PagarDesembolsoInput,
  ProgramarDesembolsoInput,
} from './seguimiento_beneficios.dto';
import type {
  ContextoAuditoria,
  CrearOtorgamientoEntrada,
  CuentaPagoRow,
  DecisionOtorgamiento,
  DesembolsoRow,
  EventoRow,
  OtorgamientoRow,
} from './seguimiento_beneficios.types';

/**
 * Servicio de seguimiento de beneficios (docs/modules/seguimiento_beneficios.md).
 *
 * - La atomicidad (estado + evento + anulacion de desembolsos) vive en funciones SQL de la migracion 0018
 *   (`fn_*`, solo service_role); aqui se orquestan, se auditan y se notifica.
 * - El descifrado de la cuenta de pago ocurre SOLO en este modulo (registro de pagos), siempre con auditoria
 *   LECTURA_SENSIBLE. La API nunca devuelve la cuenta completa: solo enmascarada.
 * - Excederse en cupo o presupuesto NO bloquea el dictamen; solo alerta y exige confirmar el primer desembolso.
 * - La plataforma NO diligencia el pagare: revocar solo registra la perdida del apoyo, notifica y audita.
 */

const URL_BENEFICIARIO = '/beneficiario/beneficios';
const URL_ADMIN = '/admin/seguimiento';

const SELECT_LISTA =
  'id, postulacion_id, convocatoria_id, beneficiario_id, beneficio_codigo, monto_aprobado, estado, cuenta_pago_id, excede_cupo, excede_presupuesto, version, otorgado_en, estado_cambiado_en, creado_en, actualizado_en';

interface OtorgamientoConRelaciones extends OtorgamientoRow {
  convocatoria: { nombre: string | null } | null;
  beneficiario: { nombres: string | null; apellidos: string | null; numero_documento: string | null; usuario_id?: string } | null;
  beneficio: { nombre: string | null } | null;
}

const ACCION_AUDITORIA: Record<AccionOtorgamiento, string> = {
  SUSPENDER: 'SUSPENDER',
  REACTIVAR: 'REACTIVAR',
  REVOCAR: 'REVOCAR',
  CUMPLIR: 'CUMPLIR',
};

// ---------------------------------------------------------------------------
// Conversiones
// ---------------------------------------------------------------------------
function num(v: number | string | null | undefined): number {
  return v === null || v === undefined ? 0 : Number(v);
}

export function aDesembolsoDto(d: DesembolsoRow): DesembolsoDto {
  return {
    id: d.id,
    otorgamiento_id: d.otorgamiento_id,
    estado: d.estado,
    monto: num(d.monto),
    concepto: d.concepto,
    fecha_programada: d.fecha_programada,
    fecha_pago: d.fecha_pago,
    referencia_pago: d.estado === 'PAGADO' ? d.referencia : null,
    motivo_anulacion: d.motivo_anulacion,
    confirmar_excedente: d.confirmar_excedente,
    creado_en: d.creado_en,
    actualizado_en: d.actualizado_en,
  };
}

function aCuentaEnmascarada(c: Pick<CuentaPagoRow, 'tipo' | 'entidad' | 'ultimos4'> | null): CuentaPagoEnmascaradaDto | null {
  if (!c) return null;
  return { tipo: c.tipo, entidad: c.entidad, numero_enmascarado: enmascarar(c.ultimos4 ?? '****') };
}

function aEventoDto(e: EventoRow): EventoOtorgamientoDto {
  return {
    id: e.id,
    tipo: e.tipo,
    estado_anterior: e.estado_anterior,
    estado_nuevo: e.estado_nuevo,
    motivo: e.motivo,
    actor_id: e.actor_id,
    ocurrido_en: e.ocurrido_en,
  };
}

function nombreCompleto(b: { nombres: string | null; apellidos: string | null } | null): string | null {
  if (!b) return null;
  const n = `${b.nombres ?? ''} ${b.apellidos ?? ''}`.trim();
  return n || null;
}

interface SumasDesembolsos {
  pagado: number;
  programado: number;
}

function aOtorgamientoDto(o: OtorgamientoConRelaciones, sumas: SumasDesembolsos | undefined): OtorgamientoDto {
  return {
    id: o.id,
    postulacion_id: o.postulacion_id,
    convocatoria_id: o.convocatoria_id,
    convocatoria_nombre: o.convocatoria?.nombre ?? null,
    beneficiario_id: o.beneficiario_id,
    beneficiario_nombre: nombreCompleto(o.beneficiario),
    beneficiario_documento: o.beneficiario?.numero_documento ?? null,
    beneficio_codigo: o.beneficio_codigo,
    beneficio_nombre: o.beneficio?.nombre ?? null,
    estado: o.estado,
    monto_aprobado: num(o.monto_aprobado),
    monto_desembolsado: sumas?.pagado ?? 0,
    monto_programado: sumas?.programado ?? 0,
    excede_cupo: o.excede_cupo,
    excede_presupuesto: o.excede_presupuesto,
    version: o.version,
    otorgado_en: o.otorgado_en,
    estado_cambiado_en: o.estado_cambiado_en,
  };
}

function sumarDesembolsos(filas: Array<Pick<DesembolsoRow, 'otorgamiento_id' | 'estado' | 'monto'>>): Map<string, SumasDesembolsos> {
  const mapa = new Map<string, SumasDesembolsos>();
  for (const d of filas) {
    const s = mapa.get(d.otorgamiento_id) ?? { pagado: 0, programado: 0 };
    if (d.estado === 'PAGADO') s.pagado += num(d.monto);
    else if (d.estado === 'PROGRAMADO') s.programado += num(d.monto);
    mapa.set(d.otorgamiento_id, s);
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Acceso a datos
// ---------------------------------------------------------------------------
async function cargarOtorgamientoRow(id: string): Promise<OtorgamientoRow> {
  const { data, error } = await supabaseAdmin.from('otorgamiento').select(SELECT_LISTA).eq('id', id).maybeSingle();
  if (error) {
    if (esEsquemaAusente(error as { code?: string })) throw new AppError(503, 'MIGRACION_PENDIENTE', 'El modulo de seguimiento de beneficios aun no esta disponible (migracion 0018 pendiente)');
    throw AppError.interno(`No fue posible cargar el otorgamiento: ${error.message}`);
  }
  if (!data) throw AppError.noEncontrado('OTORGAMIENTO_NO_ENCONTRADO', 'Otorgamiento no encontrado');
  return data as unknown as OtorgamientoRow;
}

async function cargarDesembolsoRow(id: string): Promise<DesembolsoRow> {
  const { data, error } = await supabaseAdmin.from('desembolso').select('*').eq('id', id).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar el desembolso: ${error.message}`);
  if (!data) throw AppError.noEncontrado('DESEMBOLSO_NO_ENCONTRADO', 'Desembolso no encontrado');
  return data as unknown as DesembolsoRow;
}

async function nombreBeneficio(codigo: string): Promise<string> {
  const { data } = await supabaseAdmin.from('beneficio').select('nombre').eq('codigo', codigo).maybeSingle();
  return (data as { nombre?: string } | null)?.nombre ?? codigo;
}

/** Cuenta de pago ENMASCARADA del otorgamiento (cuenta_pago o, en su defecto, datos_pago_st sin el numero). */
async function cuentaEnmascarada(o: Pick<OtorgamientoRow, 'cuenta_pago_id' | 'postulacion_id' | 'beneficio_codigo'>): Promise<CuentaPagoEnmascaradaDto | null> {
  if (o.cuenta_pago_id) {
    const { data } = await supabaseAdmin.from('cuenta_pago').select('tipo, entidad, ultimos4').eq('id', o.cuenta_pago_id).maybeSingle();
    if (data) return aCuentaEnmascarada(data as CuentaPagoRow);
  }
  if (o.beneficio_codigo !== 'ST') return null;
  const { data } = await supabaseAdmin.from('datos_pago_st').select('tipo, entidad, ultimos4').eq('postulacion_id', o.postulacion_id).maybeSingle();
  return aCuentaEnmascarada((data as CuentaPagoRow | null) ?? null);
}

async function armarDetalle(id: string): Promise<OtorgamientoDetalleDto> {
  const { data, error } = await supabaseAdmin
    .from('otorgamiento')
    .select(`${SELECT_LISTA}, convocatoria:convocatoria_id (nombre), beneficiario:beneficiario_id (nombres, apellidos, numero_documento), beneficio:beneficio_codigo (nombre)`)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (esEsquemaAusente(error as { code?: string })) throw new AppError(503, 'MIGRACION_PENDIENTE', 'El modulo de seguimiento de beneficios aun no esta disponible (migracion 0018 pendiente)');
    throw AppError.interno(`No fue posible cargar el otorgamiento: ${error.message}`);
  }
  if (!data) throw AppError.noEncontrado('OTORGAMIENTO_NO_ENCONTRADO', 'Otorgamiento no encontrado');
  const o = data as unknown as OtorgamientoConRelaciones;

  const [des, ev] = await Promise.all([
    supabaseAdmin.from('desembolso').select('*').eq('otorgamiento_id', id).order('creado_en', { ascending: true }),
    supabaseAdmin.from('otorgamiento_evento').select('id, otorgamiento_id, tipo, estado_anterior, estado_nuevo, motivo, actor_id, ocurrido_en').eq('otorgamiento_id', id).order('ocurrido_en', { ascending: true }),
  ]);
  if (des.error) throw AppError.interno(`No fue posible cargar los desembolsos: ${des.error.message}`);
  if (ev.error) throw AppError.interno(`No fue posible cargar los eventos: ${ev.error.message}`);
  const desembolsos = (des.data ?? []) as unknown as DesembolsoRow[];
  const sumas = sumarDesembolsos(desembolsos).get(id);
  return {
    ...aOtorgamientoDto(o, sumas),
    cuenta_pago: await cuentaEnmascarada(o),
    desembolsos: desembolsos.map(aDesembolsoDto),
    eventos: ((ev.data ?? []) as unknown as EventoRow[]).map(aEventoDto),
  };
}

// ---------------------------------------------------------------------------
// Notificaciones (un fallo al notificar nunca revierte la operacion)
// ---------------------------------------------------------------------------
async function notificarBeneficiario(
  beneficiarioId: string,
  args: {
    tipo: 'OTORGAMIENTO_REGISTRADO' | 'OTORGAMIENTO_SUSPENDIDO' | 'OTORGAMIENTO_REVOCADO' | 'DESEMBOLSO_PAGADO';
    titulo: string;
    mensaje: string;
    otorgamientoId: string;
    claveDedup: string;
    soloApp?: boolean;
  },
): Promise<void> {
  try {
    const { data } = await supabaseAdmin.from('beneficiario').select('usuario_id, correo_notificacion_2').eq('id', beneficiarioId).maybeSingle();
    const b = data as { usuario_id: string; correo_notificacion_2: string | null } | null;
    if (!b) return;
    await encolarNotificacion({
      usuario_id: b.usuario_id,
      tipo: args.tipo,
      titulo: args.titulo,
      mensaje: `${args.mensaje} ${FIRMA_SEGUIMIENTO}.`,
      entidad: 'OTORGAMIENTO',
      entidad_id: args.otorgamientoId,
      url_destino: URL_BENEFICIARIO,
      clave_dedup: args.claveDedup,
      canal: args.soloApp ? 'APP' : 'AMBOS',
      destinatarios_extra: b.correo_notificacion_2 ? [b.correo_notificacion_2] : undefined,
    });
  } catch (e) {
    logger.error({ err: e, otorgamiento_id: args.otorgamientoId, tipo: args.tipo }, 'No fue posible notificar al beneficiario');
  }
}

/** Descifra la cuenta de pago (solo para validar que es legible), audita LECTURA_SENSIBLE y devuelve la version enmascarada. */
export async function verificarCuentaParaPago(
  ctx: ContextoAuditoria,
  o: Pick<OtorgamientoRow, 'id' | 'postulacion_id' | 'beneficio_codigo'>,
  desembolsoId: string | null,
  finalidad: string,
): Promise<CuentaPagoEnmascaradaDto | null> {
  if (o.beneficio_codigo !== 'ST') return null;
  const { data, error } = await supabaseAdmin
    .from('datos_pago_st')
    .select('tipo, entidad, numero_cifrado, ultimos4, clave_version')
    .eq('postulacion_id', o.postulacion_id)
    .maybeSingle();
  if (error) throw AppError.interno(`No fue posible leer los datos de pago: ${error.message}`);
  const fila = data as { tipo: string; entidad: string | null; numero_cifrado: string; ultimos4: string; clave_version: string } | null;
  if (!fila) throw AppError.datosInvalidos('CUENTA_PAGO_FALTANTE', 'El beneficiario no tiene datos de pago registrados para el subsidio de transporte');
  try {
    // El valor en claro nunca sale de esta funcion: solo se comprueba que el dato es legible con la clave vigente.
    const numero = descifrarNumero(fila.numero_cifrado);
    if (numero.length < 4) throw new Error('Dato de pago invalido');
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.error({ otorgamiento_id: o.id }, 'No fue posible descifrar los datos de pago');
    throw new AppError(503, 'CIFRADO_NO_DISPONIBLE', 'No fue posible leer los datos de pago del beneficiario');
  }
  await auditar({
    ...ctx,
    accion: 'LECTURA_SENSIBLE',
    entidad: 'DESEMBOLSO',
    entidad_id: desembolsoId,
    metadatos: { finalidad, campo: 'datos_pago_st', otorgamiento_id: o.id, clave_version: fila.clave_version },
  });
  return aCuentaEnmascarada({ tipo: fila.tipo, entidad: fila.entidad, ultimos4: fila.ultimos4 });
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------
export const seguimientoService = {
  // ----- Creacion (invocada por evaluacion tras el dictamen) -----
  async crearOtorgamiento(input: CrearOtorgamientoEntrada): Promise<{ creado: boolean; id?: string }> {
    let r: { creado: boolean; id: string; beneficiario_id?: string; excede_cupo?: boolean; excede_presupuesto?: boolean };
    try {
      r = await rpc('fn_crear_otorgamiento', {
        p_postulacion_id: input.postulacion_id,
        p_beneficio_codigo: input.beneficio_codigo,
        p_convocatoria_id: input.convocatoria_id,
        p_monto: input.monto_aprobado,
        p_revision_id: input.revision_id ?? null,
      });
    } catch (e) {
      if (e instanceof AppError && e.code === 'MIGRACION_PENDIENTE') {
        logger.warn({ postulacion_id: input.postulacion_id, beneficio: input.beneficio_codigo }, 'Migracion 0018 no aplicada: el otorgamiento no se creo');
        return { creado: false };
      }
      throw e;
    }
    if (!r.creado) return { creado: false, id: r.id };

    const nombre = await nombreBeneficio(input.beneficio_codigo);
    try {
      await auditarFueraDeTx({
        actor_tipo: 'SISTEMA',
        accion: 'CREAR',
        entidad: 'OTORGAMIENTO',
        entidad_id: r.id,
        datos_despues: { estado: 'ACTIVO', beneficio_codigo: input.beneficio_codigo, monto_aprobado: input.monto_aprobado },
        metadatos: { postulacion_id: input.postulacion_id, convocatoria_id: input.convocatoria_id, excede_cupo: Boolean(r.excede_cupo), excede_presupuesto: Boolean(r.excede_presupuesto) },
      });
    } catch (e) {
      logger.error({ err: e, otorgamiento_id: r.id }, 'No fue posible auditar la creacion del otorgamiento');
    }
    if (r.beneficiario_id) {
      await notificarBeneficiario(r.beneficiario_id, {
        tipo: 'OTORGAMIENTO_REGISTRADO',
        titulo: 'Se registro su apoyo',
        mensaje: `Se registro a su favor el beneficio ${nombre}. Consulte el detalle y los desembolsos en el portal.`,
        otorgamientoId: r.id,
        claveDedup: `OTORGAMIENTO_REGISTRADO:${r.id}`,
      });
    }
    if (r.excede_cupo || r.excede_presupuesto) {
      const que = [r.excede_cupo ? 'los cupos estimados' : null, r.excede_presupuesto ? 'el presupuesto asignado' : null].filter(Boolean).join(' y ');
      await alertarAdministradores(
        'Beneficio por encima del cupo o presupuesto',
        `El otorgamiento de ${nombre} supera ${que}. Revise la ocupacion; el primer desembolso exigira confirmar el excedente.`,
        `OTORGAMIENTO_EXCEDE:${r.id}`,
        `${URL_ADMIN}/cupos`,
      ).catch(() => undefined);
    }
    return { creado: true, id: r.id };
  },

  async crearOtorgamientos(postulacionId: string, decisiones: DecisionOtorgamiento[]): Promise<{ creados: number }> {
    const { data, error } = await supabaseAdmin.from('postulacion').select('convocatoria_id').eq('id', postulacionId).maybeSingle();
    if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
    if (!data) throw AppError.noEncontrado('POSTULACION_NO_ENCONTRADA', 'Postulacion no encontrada');
    const convocatoriaId = (data as { convocatoria_id: string }).convocatoria_id;
    let creados = 0;
    for (const d of decisiones) {
      const r = await seguimientoService.crearOtorgamiento({
        postulacion_id: postulacionId,
        beneficio_codigo: d.beneficio_codigo,
        convocatoria_id: convocatoriaId,
        monto_aprobado: d.monto_aprobado,
        revision_id: d.revision_id ?? null,
      });
      if (r.creado) creados += 1;
    }
    return { creados };
  },

  // ----- Consultas administrativas -----
  async listar(filtros: FiltrosOtorgamientosInput): Promise<Paginado<OtorgamientoDto>> {
    const { desde, hasta } = rangoSupabase(filtros);
    const unionBeneficiario = filtros.q ? 'beneficiario:beneficiario_id!inner' : 'beneficiario:beneficiario_id';
    let consulta = supabaseAdmin
      .from('otorgamiento')
      .select(`${SELECT_LISTA}, convocatoria:convocatoria_id (nombre), ${unionBeneficiario} (nombres, apellidos, numero_documento), beneficio:beneficio_codigo (nombre)`, { count: 'exact' });
    if (filtros.convocatoria_id) consulta = consulta.eq('convocatoria_id', filtros.convocatoria_id);
    if (filtros.beneficio) consulta = consulta.eq('beneficio_codigo', filtros.beneficio);
    if (filtros.estado) consulta = consulta.eq('estado', filtros.estado);
    if (filtros.q) {
      const q = filtros.q.replace(/[%,()]/g, ' ').trim();
      if (q) consulta = consulta.or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,numero_documento.ilike.%${q}%`, { referencedTable: 'beneficiario' });
    }
    const { data, error, count } = await consulta.order('creado_en', { ascending: false }).range(desde, hasta);
    if (error) {
      if (esEsquemaAusente(error as { code?: string })) throw new AppError(503, 'MIGRACION_PENDIENTE', 'El modulo de seguimiento de beneficios aun no esta disponible (migracion 0018 pendiente)');
      throw AppError.interno(`No fue posible consultar los otorgamientos: ${error.message}`);
    }
    const filas = (data ?? []) as unknown as OtorgamientoConRelaciones[];
    let sumas = new Map<string, SumasDesembolsos>();
    if (filas.length > 0) {
      const { data: des, error: errDes } = await supabaseAdmin.from('desembolso').select('otorgamiento_id, estado, monto').in('otorgamiento_id', filas.map((f) => f.id));
      if (errDes) throw AppError.interno(`No fue posible consultar los desembolsos: ${errDes.message}`);
      sumas = sumarDesembolsos((des ?? []) as unknown as DesembolsoRow[]);
    }
    return paginar(
      filas.map((f) => aOtorgamientoDto(f, sumas.get(f.id))),
      filtros,
      count ?? 0,
    );
  },

  /** Detalle administrativo: lectura auditada (LECTURA_SENSIBLE); la cuenta de pago va enmascarada. */
  async detalle(ctx: ContextoAuditoria, id: string): Promise<OtorgamientoDetalleDto> {
    const dto = await armarDetalle(id);
    await auditar({
      ...ctx,
      accion: 'LECTURA_SENSIBLE',
      entidad: 'OTORGAMIENTO',
      entidad_id: id,
      metadatos: { vista: 'detalle_administrativo', beneficio_codigo: dto.beneficio_codigo },
    });
    return dto;
  },

  async cupos(convocatoriaId?: string): Promise<CupoBeneficioDto[]> {
    const cupos = await calcularCupos(convocatoriaId);
    return cupos.map(({ convocatoria_estado: _estado, ...c }) => c);
  },

  // ----- Cambios de estado (suspender / reactivar / revocar / cumplir) -----
  async cambiarEstado(
    user: UsuarioAutenticado,
    ctx: ContextoAuditoria,
    id: string,
    accion: AccionOtorgamiento,
    input: CambioEstadoOtorgamientoInput | CumplirOtorgamientoInput,
  ): Promise<OtorgamientoDetalleDto> {
    const forzar = 'forzar' in input ? Boolean(input.forzar) : false;
    const r = await rpc<{
      id: string;
      beneficiario_id: string;
      beneficio_codigo: string;
      estado_anterior: string;
      estado_nuevo: string;
      version: number;
      desembolsos_anulados: number;
    }>('fn_cambiar_estado_otorgamiento', {
      p_id: id,
      p_accion: accion,
      p_motivo: input.motivo,
      p_actor: user.id,
      p_version: input.version ?? null,
      p_forzar: forzar,
    });

    await auditar({
      ...ctx,
      accion: ACCION_AUDITORIA[accion],
      entidad: 'OTORGAMIENTO',
      entidad_id: id,
      datos_antes: { estado: r.estado_anterior },
      datos_despues: { estado: r.estado_nuevo },
      metadatos: { motivo: input.motivo, desembolsos_anulados: r.desembolsos_anulados, forzar, beneficio_codigo: r.beneficio_codigo },
    });

    const nombre = await nombreBeneficio(r.beneficio_codigo);
    const clave = `OTORGAMIENTO_${r.estado_nuevo}:${id}:${r.version}`;
    if (accion === 'SUSPENDER') {
      await notificarBeneficiario(r.beneficiario_id, {
        tipo: 'OTORGAMIENTO_SUSPENDIDO',
        titulo: 'Su apoyo fue suspendido',
        mensaje: `El beneficio ${nombre} fue suspendido temporalmente y no se programaran ni pagaran desembolsos mientras dure la suspension. Para mas informacion comuniquese con el FOEST.`,
        otorgamientoId: id,
        claveDedup: clave,
      });
    } else if (accion === 'REVOCAR') {
      // Plantilla fija: el motivo detallado es interno. La plataforma no diligencia el pagare ni gestiona el cobro.
      await notificarBeneficiario(r.beneficiario_id, {
        tipo: 'OTORGAMIENTO_REVOCADO',
        titulo: 'Su apoyo fue revocado',
        mensaje: `El beneficio ${nombre} fue revocado. Los desembolsos que estaban programados fueron anulados. Para conocer el procedimiento aplicable comuniquese con el FOEST.`,
        otorgamientoId: id,
        claveDedup: clave,
      });
    } else if (accion === 'REACTIVAR') {
      await notificarBeneficiario(r.beneficiario_id, {
        tipo: 'OTORGAMIENTO_REGISTRADO',
        titulo: 'Su apoyo fue reactivado',
        mensaje: `El beneficio ${nombre} fue reactivado y los desembolsos programados se reanudan.`,
        otorgamientoId: id,
        claveDedup: clave,
        soloApp: true,
      });
    } else {
      await notificarBeneficiario(r.beneficiario_id, {
        tipo: 'OTORGAMIENTO_REGISTRADO',
        titulo: 'Su apoyo se dio por cumplido',
        mensaje: `El beneficio ${nombre} se ejecuto por completo y quedo en estado cumplido.`,
        otorgamientoId: id,
        claveDedup: clave,
        soloApp: true,
      });
    }
    return armarDetalle(id);
  },

  // ----- Desembolsos -----
  async programarDesembolso(user: UsuarioAutenticado, ctx: ContextoAuditoria, otorgamientoId: string, input: ProgramarDesembolsoInput): Promise<DesembolsoDto> {
    const hoy = fechaLocalBogota();
    if (input.fecha_programada < hoy) {
      throw AppError.datosInvalidos('FECHA_PROGRAMADA_INVALIDA', 'La fecha programada no puede ser anterior a hoy');
    }
    if (!(await esDiaHabil(input.fecha_programada))) {
      throw AppError.datosInvalidos('FECHA_PROGRAMADA_INVALIDA', 'La fecha programada debe ser un dia habil');
    }
    const r = await rpc<{ id: string; beneficiario_id: string; excedente_confirmado: boolean }>('fn_programar_desembolso', {
      p_otorgamiento_id: otorgamientoId,
      p_monto: input.monto,
      p_fecha_programada: input.fecha_programada,
      p_concepto: input.concepto ?? null,
      p_actor: user.id,
      p_confirmar: Boolean(input.confirmar_excedente),
      p_motivo_excedente: input.motivo_excedente ?? null,
    });
    await auditar({
      ...ctx,
      accion: 'DESEMBOLSAR',
      entidad: 'DESEMBOLSO',
      entidad_id: r.id,
      datos_despues: { estado: 'PROGRAMADO', monto: input.monto, fecha_programada: input.fecha_programada },
      metadatos: { fase: 'PROGRAMADO', otorgamiento_id: otorgamientoId, excedente_confirmado: r.excedente_confirmado, motivo_excedente: r.excedente_confirmado ? input.motivo_excedente ?? null : null },
    });
    await notificarBeneficiario(r.beneficiario_id, {
      tipo: 'OTORGAMIENTO_REGISTRADO',
      titulo: 'Desembolso programado',
      mensaje: `Se programo un desembolso para el ${input.fecha_programada}. Consulte el detalle en el portal.`,
      otorgamientoId,
      claveDedup: `DESEMBOLSO_PROGRAMADO:${r.id}`,
      soloApp: true,
    });
    return aDesembolsoDto(await cargarDesembolsoRow(r.id));
  },

  async pagarDesembolso(user: UsuarioAutenticado, ctx: ContextoAuditoria, desembolsoId: string, input: PagarDesembolsoInput): Promise<ResultadoPagoDto> {
    const hoy = fechaLocalBogota();
    if (input.fecha_pago > hoy) {
      throw AppError.datosInvalidos('FECHA_PAGO_INVALIDA', 'La fecha de pago no puede ser posterior a hoy');
    }
    const d = await cargarDesembolsoRow(desembolsoId);
    const o = await cargarOtorgamientoRow(d.otorgamiento_id);
    if (d.estado !== 'PROGRAMADO') throw AppError.conflicto('DESEMBOLSO_ESTADO_INVALIDO', 'Solo se puede pagar un desembolso programado');
    if (o.estado !== 'ACTIVO') throw AppError.conflicto('OTORGAMIENTO_ESTADO_INVALIDO', 'El otorgamiento no esta activo; no es posible registrar pagos');

    const cuenta = await verificarCuentaParaPago(ctx, o, desembolsoId, 'REGISTRO_PAGO');
    const r = await rpc<{ id: string; beneficiario_id: string; monto: number }>('fn_pagar_desembolso', {
      p_id: desembolsoId,
      p_referencia: input.referencia_pago,
      p_fecha_pago: input.fecha_pago,
      p_actor: user.id,
      p_carga_id: null,
    });
    await auditar({
      ...ctx,
      accion: 'DESEMBOLSAR',
      entidad: 'DESEMBOLSO',
      entidad_id: desembolsoId,
      datos_antes: { estado: 'PROGRAMADO' },
      datos_despues: { estado: 'PAGADO', monto: num(r.monto), fecha_pago: input.fecha_pago, referencia: input.referencia_pago },
      metadatos: { fase: 'PAGADO', otorgamiento_id: o.id, cuenta_descifrada: cuenta !== null },
    });
    await notificarBeneficiario(r.beneficiario_id, {
      tipo: 'DESEMBOLSO_PAGADO',
      titulo: 'Se registro un pago a su favor',
      mensaje: `Se registro el pago de un desembolso del ${input.fecha_pago}. Consulte la referencia en el portal.`,
      otorgamientoId: o.id,
      claveDedup: `DESEMBOLSO_PAGADO:${desembolsoId}`,
    });
    return { desembolso: aDesembolsoDto(await cargarDesembolsoRow(desembolsoId)), cuenta_pago: cuenta };
  },

  async anularDesembolso(user: UsuarioAutenticado, ctx: ContextoAuditoria, desembolsoId: string, input: AnularDesembolsoInput): Promise<DesembolsoDto> {
    const r = await rpc<{ id: string; otorgamiento_id: string }>('fn_anular_desembolso', { p_id: desembolsoId, p_motivo: input.motivo, p_actor: user.id });
    await auditar({
      ...ctx,
      accion: 'ANULAR',
      entidad: 'DESEMBOLSO',
      entidad_id: desembolsoId,
      datos_antes: { estado: 'PROGRAMADO' },
      datos_despues: { estado: 'ANULADO' },
      metadatos: { motivo: input.motivo, otorgamiento_id: r.otorgamiento_id },
    });
    return aDesembolsoDto(await cargarDesembolsoRow(desembolsoId));
  },

  // ----- Vista del beneficiario -----
  async misOtorgamientos(user: UsuarioAutenticado, id?: string): Promise<MiOtorgamientoDto[]> {
    const { data: ben, error: errBen } = await supabaseAdmin.from('beneficiario').select('id').eq('usuario_id', user.id).maybeSingle();
    if (errBen) throw AppError.interno(`No fue posible cargar el perfil: ${errBen.message}`);
    if (!ben) {
      if (id) throw AppError.noEncontrado();
      return [];
    }
    const beneficiarioId = (ben as { id: string }).id;
    let consulta = supabaseAdmin
      .from('otorgamiento')
      .select(`${SELECT_LISTA}, convocatoria:convocatoria_id (nombre), beneficio:beneficio_codigo (nombre)`)
      .eq('beneficiario_id', beneficiarioId);
    if (id) consulta = consulta.eq('id', id);
    const { data, error } = await consulta.order('creado_en', { ascending: false });
    if (error) {
      if (esEsquemaAusente(error as { code?: string })) {
        if (id) throw AppError.noEncontrado();
        return [];
      }
      throw AppError.interno(`No fue posible consultar los otorgamientos: ${error.message}`);
    }
    const filas = (data ?? []) as unknown as Array<OtorgamientoRow & { convocatoria: { nombre: string | null } | null; beneficio: { nombre: string | null } | null }>;
    if (id && filas.length === 0) throw AppError.noEncontrado();
    if (filas.length === 0) return [];

    const { data: des, error: errDes } = await supabaseAdmin
      .from('desembolso')
      .select('id, otorgamiento_id, estado, monto, concepto, fecha_programada, fecha_pago, referencia')
      .in('otorgamiento_id', filas.map((f) => f.id))
      .neq('estado', 'ANULADO')
      .order('creado_en', { ascending: true });
    if (errDes) throw AppError.interno(`No fue posible consultar los desembolsos: ${errDes.message}`);
    const desembolsos = (des ?? []) as unknown as DesembolsoRow[];
    const sumas = sumarDesembolsos(desembolsos);

    const salida: MiOtorgamientoDto[] = [];
    for (const f of filas) {
      salida.push({
        id: f.id,
        postulacion_id: f.postulacion_id,
        convocatoria_nombre: f.convocatoria?.nombre ?? null,
        beneficio_codigo: f.beneficio_codigo as CodigoBeneficio,
        beneficio_nombre: f.beneficio?.nombre ?? null,
        estado: f.estado,
        monto_aprobado: num(f.monto_aprobado),
        monto_desembolsado: sumas.get(f.id)?.pagado ?? 0,
        otorgado_en: f.otorgado_en,
        cuenta_pago: await cuentaEnmascarada(f),
        desembolsos: desembolsos
          .filter((d) => d.otorgamiento_id === f.id)
          .map((d) => ({
            id: d.id,
            estado: d.estado,
            monto: num(d.monto),
            concepto: d.concepto,
            fecha_programada: d.fecha_programada,
            fecha_pago: d.fecha_pago,
            referencia_pago: d.estado === 'PAGADO' ? d.referencia : null,
          })),
      });
    }
    return salida;
  },

  // Utilidades compartidas con la carga masiva
  cargarOtorgamientoRow,
};
