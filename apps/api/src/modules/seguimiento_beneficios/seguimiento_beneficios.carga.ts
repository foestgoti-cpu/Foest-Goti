import { createHash } from 'node:crypto';
import {
  CARGA_PAGOS_MAX_FILAS,
  type CodigoBeneficio,
  COLUMNAS_CSV_PAGOS,
  COLUMNAS_CSV_PAGOS_OBLIGATORIAS,
  FIRMA_SEGUIMIENTO,
  UuidSchema,
  type ColumnaCsvPagos,
  type FilaCargaPagosResultado,
  type ResultadoCargaPagosDto,
} from '@foest/shared';
import { AppError, auditar, logger, supabaseAdmin, type UsuarioAutenticado } from '../../shared';
import { fechaLocalBogota } from '../catalogos_configuracion';
import { alertarAdministradores, encolarNotificacion } from '../notificaciones';
import { parsearCsv } from './seguimiento_beneficios.csv';
import { enBloques, esEsquemaAusente, rpc } from './seguimiento_beneficios.db';
import type { CargaMasivaPagosInput } from './seguimiento_beneficios.dto';
import { verificarCuentaParaPago } from './seguimiento_beneficios.service';
import type { ContextoAuditoria } from './seguimiento_beneficios.types';

/**
 * Carga masiva de pagos por CSV (docs/modules/seguimiento_beneficios.md, "Carga masiva CSV").
 * Columnas: otorgamiento_id | (postulacion_id + beneficio_codigo), desembolso_id (opcional), monto, fecha_pago, referencia.
 *  - dry_run (por defecto): valida fila por fila y reporta; no escribe nada.
 *  - Aplicar: dry_run=false + confirmar=true. TODO O NADA en una transaccion SQL (fn_aplicar_carga_pagos).
 *  - El mismo archivo (SHA-256) no se aplica dos veces.
 *  - Sin desembolso_id se usa el PROGRAMADO mas antiguo del otorgamiento con el mismo monto; si no hay, se programa y
 *    se paga (respetando que la suma no supere el monto aprobado).
 */

interface OtorgamientoCarga {
  id: string;
  postulacion_id: string;
  beneficiario_id: string;
  beneficio_codigo: CodigoBeneficio;
  estado: string;
  monto_aprobado: number | string;
  excede_cupo: boolean;
  excede_presupuesto: boolean;
}

interface DesembolsoCarga {
  id: string;
  otorgamiento_id: string;
  estado: string;
  monto: number | string;
}

interface EstadoOtorgamientoCarga {
  otorgamiento: OtorgamientoCarga;
  /** Suma de desembolsos no anulados (incluye los que esta carga creara). */
  suma: number;
  /** Cantidad de desembolsos no anulados (incluye los que esta carga creara). */
  previos: number;
  programados: DesembolsoCarga[];
  todos: Map<string, DesembolsoCarga>;
}

const COLUMNAS_PERMITIDAS = new Set<string>(COLUMNAS_CSV_PAGOS);

function errorCsv(mensaje: string, details?: unknown): AppError {
  return AppError.datosInvalidos('CSV_INVALIDO', mensaje, details);
}

function parsearMonto(crudo: string): number | null {
  let t = crudo.replace(/[\s$]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

function fechaValida(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

interface FilaLeida {
  fila: number;
  errores: string[];
  otorgamiento_id: string | null;
  postulacion_id: string | null;
  beneficio_codigo: string | null;
  desembolso_id: string | null;
  monto: number | null;
  fecha_pago: string | null;
  referencia: string | null;
}

function leerFilas(contenido: string, hoy: string): FilaLeida[] {
  let csv;
  try {
    csv = parsearCsv(contenido);
  } catch (e) {
    throw errorCsv(e instanceof Error ? e.message : 'El archivo CSV no es valido');
  }
  const { cabecera, filas } = csv;
  if (cabecera.length === 0) throw errorCsv('El archivo CSV esta vacio');
  const desconocidas = cabecera.filter((c) => !COLUMNAS_PERMITIDAS.has(c));
  if (desconocidas.length > 0) throw errorCsv(`Columnas no reconocidas: ${desconocidas.join(', ')}`, { permitidas: COLUMNAS_CSV_PAGOS });
  if (new Set(cabecera).size !== cabecera.length) throw errorCsv('La cabecera tiene columnas repetidas');
  const faltantes = COLUMNAS_CSV_PAGOS_OBLIGATORIAS.filter((c) => !cabecera.includes(c));
  if (faltantes.length > 0) throw errorCsv(`Faltan columnas obligatorias: ${faltantes.join(', ')}`);
  if (!cabecera.includes('otorgamiento_id') && !(cabecera.includes('postulacion_id') && cabecera.includes('beneficio_codigo'))) {
    throw errorCsv('Incluya la columna otorgamiento_id o, en su lugar, postulacion_id y beneficio_codigo');
  }
  if (filas.length === 0) throw errorCsv('El archivo CSV no contiene filas de datos');
  if (filas.length > CARGA_PAGOS_MAX_FILAS) throw errorCsv(`El archivo supera el maximo de ${CARGA_PAGOS_MAX_FILAS} filas`);

  const idx = (c: ColumnaCsvPagos): number => cabecera.indexOf(c);
  const valor = (f: { valores: string[] }, c: ColumnaCsvPagos): string => (idx(c) >= 0 ? (f.valores[idx(c)] ?? '').trim() : '');

  const vistas = new Set<string>();
  return filas.map((f) => {
    const errores: string[] = [];
    const otorgamientoId = valor(f, 'otorgamiento_id');
    const postulacionId = valor(f, 'postulacion_id');
    const beneficio = valor(f, 'beneficio_codigo').toUpperCase();
    const desembolsoId = valor(f, 'desembolso_id');
    const montoCrudo = valor(f, 'monto');
    const fechaPago = valor(f, 'fecha_pago');
    const referencia = valor(f, 'referencia');

    if (f.valores.length > cabecera.length) errores.push('La fila tiene mas columnas que la cabecera');
    if (otorgamientoId && !UuidSchema.safeParse(otorgamientoId).success) errores.push('otorgamiento_id no es un identificador valido');
    if (!otorgamientoId) {
      if (!postulacionId || !beneficio) errores.push('Indique otorgamiento_id o postulacion_id y beneficio_codigo');
      else if (!UuidSchema.safeParse(postulacionId).success) errores.push('postulacion_id no es un identificador valido');
    }
    if (desembolsoId && !UuidSchema.safeParse(desembolsoId).success) errores.push('desembolso_id no es un identificador valido');
    const monto = parsearMonto(montoCrudo);
    if (monto === null) errores.push('monto invalido (numero mayor que cero con maximo dos decimales)');
    if (!fechaValida(fechaPago)) errores.push('fecha_pago invalida (formato AAAA-MM-DD)');
    else if (fechaPago > hoy) errores.push('fecha_pago no puede ser posterior a hoy');
    if (referencia.length < 3 || referencia.length > 100) errores.push('referencia obligatoria (3 a 100 caracteres)');
    else if (vistas.has(referencia)) errores.push('referencia repetida dentro del archivo');
    vistas.add(referencia);

    return {
      fila: f.fila,
      errores,
      otorgamiento_id: otorgamientoId || null,
      postulacion_id: postulacionId || null,
      beneficio_codigo: beneficio || null,
      desembolso_id: desembolsoId || null,
      monto,
      fecha_pago: fechaPago || null,
      referencia: referencia || null,
    };
  });
}

async function cargarOtorgamientos(filas: FilaLeida[]): Promise<{ porId: Map<string, OtorgamientoCarga>; porClave: Map<string, OtorgamientoCarga> }> {
  const cols = 'id, postulacion_id, beneficiario_id, beneficio_codigo, estado, monto_aprobado, excede_cupo, excede_presupuesto';
  const porId = new Map<string, OtorgamientoCarga>();
  const porClave = new Map<string, OtorgamientoCarga>();
  const ids = [...new Set(filas.map((f) => f.otorgamiento_id).filter((v): v is string => Boolean(v)).filter((v) => UuidSchema.safeParse(v).success))];
  const posts = [...new Set(filas.filter((f) => !f.otorgamiento_id).map((f) => f.postulacion_id).filter((v): v is string => Boolean(v)).filter((v) => UuidSchema.safeParse(v).success))];
  const registrar = (o: OtorgamientoCarga): void => {
    porId.set(o.id, o);
    porClave.set(`${o.postulacion_id}:${o.beneficio_codigo}`, o);
  };
  for (const bloque of enBloques(ids)) {
    const { data, error } = await supabaseAdmin.from('otorgamiento').select(cols).in('id', bloque);
    if (error) throw AppError.interno(`No fue posible consultar los otorgamientos: ${error.message}`);
    ((data ?? []) as unknown as OtorgamientoCarga[]).forEach(registrar);
  }
  for (const bloque of enBloques(posts)) {
    const { data, error } = await supabaseAdmin.from('otorgamiento').select(cols).in('postulacion_id', bloque);
    if (error) throw AppError.interno(`No fue posible consultar los otorgamientos: ${error.message}`);
    ((data ?? []) as unknown as OtorgamientoCarga[]).forEach(registrar);
  }
  return { porId, porClave };
}

export async function procesarCargaMasiva(user: UsuarioAutenticado, ctx: ContextoAuditoria, input: CargaMasivaPagosInput): Promise<ResultadoCargaPagosDto> {
  const hoy = fechaLocalBogota();
  const sha = createHash('sha256').update(input.contenido_csv, 'utf8').digest('hex');
  const filas = leerFilas(input.contenido_csv, hoy);

  const { data: previa, error: errPrevia } = await supabaseAdmin.from('carga_pagos').select('id').eq('archivo_sha256', sha).maybeSingle();
  if (errPrevia) {
    if (esEsquemaAusente(errPrevia as { code?: string })) throw new AppError(503, 'MIGRACION_PENDIENTE', 'El modulo de seguimiento de beneficios aun no esta disponible (migracion 0018 pendiente)');
    throw AppError.interno(`No fue posible verificar la carga: ${errPrevia.message}`);
  }
  const yaAplicada = Boolean(previa);

  const { porId, porClave } = await cargarOtorgamientos(filas);
  const otorgamientos = [...porId.values()];

  // Desembolsos existentes de los otorgamientos involucrados
  const estados = new Map<string, EstadoOtorgamientoCarga>();
  for (const bloque of enBloques(otorgamientos.map((o) => o.id))) {
    const { data, error } = await supabaseAdmin.from('desembolso').select('id, otorgamiento_id, estado, monto').in('otorgamiento_id', bloque).order('fecha_programada', { ascending: true, nullsFirst: false }).order('creado_en', { ascending: true });
    if (error) throw AppError.interno(`No fue posible consultar los desembolsos: ${error.message}`);
    for (const d of (data ?? []) as unknown as DesembolsoCarga[]) {
      const o = porId.get(d.otorgamiento_id);
      if (!o) continue;
      const e: EstadoOtorgamientoCarga = estados.get(o.id) ?? { otorgamiento: o, suma: 0, previos: 0, programados: [], todos: new Map() };
      e.todos.set(d.id, d);
      if (d.estado !== 'ANULADO') {
        e.suma += Number(d.monto);
        e.previos += 1;
      }
      if (d.estado === 'PROGRAMADO') e.programados.push(d);
      estados.set(o.id, e);
    }
  }
  for (const o of otorgamientos) if (!estados.has(o.id)) estados.set(o.id, { otorgamiento: o, suma: 0, previos: 0, programados: [], todos: new Map() });

  // Referencias ya usadas por desembolsos PAGADOS
  const referencias = [...new Set(filas.map((f) => f.referencia).filter((v): v is string => Boolean(v)))];
  const usadas = new Set<string>();
  for (const bloque of enBloques(referencias)) {
    const { data, error } = await supabaseAdmin.from('desembolso').select('referencia').eq('estado', 'PAGADO').in('referencia', bloque);
    if (error) throw AppError.interno(`No fue posible verificar las referencias: ${error.message}`);
    for (const r of (data ?? []) as Array<{ referencia: string }>) usadas.add(r.referencia);
  }

  // Cuentas de pago de los ST
  const postulacionesST = otorgamientos.filter((o) => o.beneficio_codigo === 'ST').map((o) => o.postulacion_id);
  const conCuenta = new Set<string>();
  for (const bloque of enBloques(postulacionesST)) {
    const { data, error } = await supabaseAdmin.from('datos_pago_st').select('postulacion_id').in('postulacion_id', bloque);
    if (error) throw AppError.interno(`No fue posible verificar los datos de pago: ${error.message}`);
    for (const r of (data ?? []) as Array<{ postulacion_id: string }>) conCuenta.add(r.postulacion_id);
  }

  const usados = new Set<string>();
  const resultado: FilaCargaPagosResultado[] = [];
  const aplicar: Array<{ fila: number; otorgamiento_id: string; desembolso_id: string | null; monto: number; fecha_pago: string; referencia: string; beneficiario_id: string }> = [];

  for (const f of filas) {
    const errores = [...f.errores];
    let otorgamiento: OtorgamientoCarga | undefined;
    if (f.errores.length === 0 || f.otorgamiento_id || f.postulacion_id) {
      otorgamiento = f.otorgamiento_id ? porId.get(f.otorgamiento_id) : f.postulacion_id && f.beneficio_codigo ? porClave.get(`${f.postulacion_id}:${f.beneficio_codigo}`) : undefined;
      const identificable = f.otorgamiento_id ? UuidSchema.safeParse(f.otorgamiento_id).success : Boolean(f.postulacion_id && f.beneficio_codigo && UuidSchema.safeParse(f.postulacion_id).success);
      if (!otorgamiento && identificable) errores.push('No existe el otorgamiento indicado');
    }
    let desembolsoId: string | null = null;

    if (otorgamiento) {
      const e = estados.get(otorgamiento.id) as EstadoOtorgamientoCarga;
      if (otorgamiento.estado !== 'ACTIVO') errores.push(`El otorgamiento esta ${otorgamiento.estado}; solo se registran pagos de otorgamientos ACTIVO`);
      if (otorgamiento.beneficio_codigo === 'ST' && !conCuenta.has(otorgamiento.postulacion_id)) errores.push('El beneficiario no tiene datos de pago registrados (CUENTA_PAGO_FALTANTE)');
      if (f.referencia && usadas.has(f.referencia)) errores.push('La referencia ya fue utilizada en otro desembolso pagado');

      if (f.monto !== null && otorgamiento.estado === 'ACTIVO') {
        if (f.desembolso_id) {
          const d = e.todos.get(f.desembolso_id);
          if (!d) errores.push('El desembolso indicado no pertenece al otorgamiento');
          else if (d.estado !== 'PROGRAMADO') errores.push(`El desembolso indicado esta ${d.estado}; solo se paga un desembolso PROGRAMADO`);
          else if (usados.has(d.id)) errores.push('El desembolso indicado ya se usa en otra fila del archivo');
          else if (Number(d.monto) !== f.monto) errores.push(`El monto no coincide con el desembolso programado (${Number(d.monto)})`);
          else desembolsoId = d.id;
        } else {
          const d = e.programados.find((x) => !usados.has(x.id) && Number(x.monto) === f.monto);
          if (d) desembolsoId = d.id;
          else if (e.suma + f.monto > Number(otorgamiento.monto_aprobado)) errores.push('El monto excede el saldo disponible del monto aprobado');
          else if (e.previos === 0 && (otorgamiento.excede_cupo || otorgamiento.excede_presupuesto)) {
            errores.push('El otorgamiento excede cupo o presupuesto: programe su primer desembolso de forma individual confirmando el excedente');
          }
        }
        if (errores.length === 0 && !desembolsoId) {
          // Se programara y pagara en la misma carga: reserva el saldo para las filas siguientes.
          e.suma += f.monto;
          e.previos += 1;
        }
        if (errores.length === 0 && desembolsoId) usados.add(desembolsoId);
      }
    }

    const ok = errores.length === 0 && otorgamiento !== undefined && f.monto !== null && f.fecha_pago !== null && f.referencia !== null;
    resultado.push({
      fila: f.fila,
      ok,
      errores,
      otorgamiento_id: otorgamiento?.id ?? null,
      desembolso_id: desembolsoId,
      monto: f.monto,
      fecha_pago: f.fecha_pago,
      referencia: f.referencia,
    });
    if (ok && otorgamiento && f.monto !== null && f.fecha_pago && f.referencia) {
      aplicar.push({ fila: f.fila, otorgamiento_id: otorgamiento.id, desembolso_id: desembolsoId, monto: f.monto, fecha_pago: f.fecha_pago, referencia: f.referencia, beneficiario_id: otorgamiento.beneficiario_id });
    }
  }

  const filasOk = resultado.filter((r) => r.ok).length;
  const base: ResultadoCargaPagosDto = {
    dry_run: input.dry_run,
    aplicada: false,
    carga_id: null,
    archivo_sha256: sha,
    ya_aplicada: yaAplicada,
    filas_total: resultado.length,
    filas_ok: filasOk,
    filas_error: resultado.length - filasOk,
    filas: resultado,
  };

  if (input.dry_run) return base;

  if (input.confirmar !== true) {
    throw AppError.datosInvalidos('CONFIRMACION_REQUERIDA', 'Para aplicar la carga envie dry_run: false y confirmar: true');
  }
  if (yaAplicada) throw AppError.conflicto('CARGA_DUPLICADA', 'Este archivo ya fue aplicado anteriormente');
  if (base.filas_error > 0) {
    throw AppError.datosInvalidos('CARGA_CON_ERRORES', 'La carga tiene filas con errores; no se registro ningun pago', base);
  }

  // Descifrado auditado (una vez por otorgamiento ST) antes de aplicar.
  const verificados = new Set<string>();
  for (const a of aplicar) {
    const o = porId.get(a.otorgamiento_id) as OtorgamientoCarga;
    if (o.beneficio_codigo !== 'ST' || verificados.has(o.id)) continue;
    verificados.add(o.id);
    await verificarCuentaParaPago(ctx, o, a.desembolso_id, 'CARGA_MASIVA_PAGOS');
  }

  const r = await rpc<{ carga_id: string; aplicadas: number }>('fn_aplicar_carga_pagos', {
    p_filas: aplicar.map(({ beneficiario_id: _b, ...fila }) => fila),
    p_actor: user.id,
    p_sha256: sha,
    p_nombre: input.nombre_archivo ?? null,
    p_resultado: resultado,
  });

  await auditar({
    ...ctx,
    accion: 'CARGA_PAGOS',
    entidad: 'DESEMBOLSO',
    entidad_id: r.carga_id,
    metadatos: { archivo_sha256: sha, archivo_nombre: input.nombre_archivo ?? null, filas_total: resultado.length, aplicadas: r.aplicadas },
  });

  // Efectos posteriores: un fallo de notificacion nunca revierte la carga.
  const porBeneficiario = new Map<string, string>();
  for (const a of aplicar) porBeneficiario.set(a.beneficiario_id, a.otorgamiento_id);
  for (const bloque of enBloques([...porBeneficiario.entries()], 10)) {
    await Promise.all(
      bloque.map(async ([beneficiarioId, otorgamientoId]) => {
        try {
          const { data } = await supabaseAdmin.from('beneficiario').select('usuario_id, correo_notificacion_2').eq('id', beneficiarioId).maybeSingle();
          const b = data as { usuario_id: string; correo_notificacion_2: string | null } | null;
          if (!b) return;
          await encolarNotificacion({
            usuario_id: b.usuario_id,
            tipo: 'DESEMBOLSO_PAGADO',
            titulo: 'Se registro un pago a su favor',
            mensaje: `Se registro un pago de su apoyo. Consulte el detalle y la referencia en el portal. ${FIRMA_SEGUIMIENTO}.`,
            entidad: 'OTORGAMIENTO',
            entidad_id: otorgamientoId,
            url_destino: '/beneficiario/beneficios',
            clave_dedup: `DESEMBOLSO_PAGADO_CARGA:${r.carga_id}:${beneficiarioId}`,
            destinatarios_extra: b.correo_notificacion_2 ? [b.correo_notificacion_2] : undefined,
          });
        } catch (e) {
          logger.error({ err: e, beneficiario_id: beneficiarioId }, 'No fue posible notificar el pago de la carga masiva');
        }
      }),
    );
  }
  await alertarAdministradores(
    'Carga masiva de pagos aplicada',
    `Se aplicaron ${r.aplicadas} pago(s) de la carga ${input.nombre_archivo ?? r.carga_id}.`,
    `CARGA_PAGOS:${r.carga_id}`,
    '/admin/seguimiento/carga-pagos',
  ).catch(() => undefined);

  return { ...base, aplicada: true, carga_id: r.carga_id, ya_aplicada: true };
}
