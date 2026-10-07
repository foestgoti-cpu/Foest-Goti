import type { CodigoBeneficio, CupoBeneficioDto, EstadoOtorgamiento, NivelAlertaCupo } from '@foest/shared';
import { AppError, supabaseAdmin } from '../../shared';
import { configuracionService } from '../catalogos_configuracion';
import { rpc } from './seguimiento_beneficios.db';
import type { MontosConvocatoria } from './seguimiento_beneficios.types';

/**
 * Cupos y presupuesto por (convocatoria, beneficio) (docs/modules/seguimiento_beneficios.md, "Cupos y presupuesto").
 *  - cupos_ocupados = COUNT(otorgamiento) en ACTIVO|SUSPENDIDO|CUMPLIDO
 *  - presupuesto_comprometido = SUM(monto_aprobado) de los mismos
 *  - presupuesto_pagado = SUM(desembolso.monto) PAGADO
 * Solo alerta, nunca bloquea el dictamen.
 */
interface FilaOcupacion {
  convocatoria_id: string;
  beneficio_codigo: string;
  cupos_estimados: number;
  presupuesto_asignado: number | string;
  cupos_ocupados: number;
  presupuesto_comprometido: number | string;
  presupuesto_pagado: number | string;
  monto_aprobado_total: number | string;
}

export const UMBRAL_ALERTA_DEFECTO = 90;

export function porcentaje(ocupado: number, total: number): number {
  if (total > 0) return Math.round((ocupado * 100) / total);
  return ocupado > 0 ? 100 : 0;
}

export function nivelAlerta(ocupado: number, total: number, umbral: number): NivelAlertaCupo {
  if (ocupado > total) return 'EXCEDIDA';
  if (porcentaje(ocupado, total) >= umbral && (total > 0 || ocupado > 0)) return 'PREVENTIVA';
  return 'NORMAL';
}

export async function umbralAlerta(): Promise<number> {
  return configuracionService.getEntero('ALERTA_PRESUPUESTO_PORCENTAJE', UMBRAL_ALERTA_DEFECTO);
}

async function nombresConvocatorias(ids: string[]): Promise<Map<string, { nombre: string | null; estado: string | null }>> {
  const mapa = new Map<string, { nombre: string | null; estado: string | null }>();
  if (ids.length === 0) return mapa;
  const { data, error } = await supabaseAdmin.from('convocatoria').select('id, nombre, estado').in('id', ids);
  if (error) throw AppError.interno(`No fue posible cargar las convocatorias: ${error.message}`);
  for (const c of (data ?? []) as Array<{ id: string; nombre: string | null; estado: string | null }>) mapa.set(c.id, { nombre: c.nombre, estado: c.estado });
  return mapa;
}

async function nombresBeneficios(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin.from('beneficio').select('codigo, nombre');
  if (error) throw AppError.interno(`No fue posible cargar los beneficios: ${error.message}`);
  return new Map(((data ?? []) as Array<{ codigo: string; nombre: string }>).map((b) => [b.codigo, b.nombre] as const));
}

export interface CupoConEstado extends CupoBeneficioDto {
  convocatoria_estado: string | null;
}

export async function calcularCupos(convocatoriaId?: string): Promise<CupoConEstado[]> {
  const filas = await rpc<FilaOcupacion[] | null>('fn_cupos_ocupacion', { p_convocatoria_id: convocatoriaId ?? null });
  const lista = filas ?? [];
  const [umbral, convs, benef] = await Promise.all([
    umbralAlerta(),
    nombresConvocatorias([...new Set(lista.map((f) => f.convocatoria_id))]),
    nombresBeneficios(),
  ]);
  return lista
    .map((f) => {
      const asignado = Number(f.presupuesto_asignado);
      const comprometido = Number(f.presupuesto_comprometido);
      return {
        convocatoria_id: f.convocatoria_id,
        convocatoria_nombre: convs.get(f.convocatoria_id)?.nombre ?? null,
        convocatoria_estado: convs.get(f.convocatoria_id)?.estado ?? null,
        beneficio_codigo: f.beneficio_codigo as CodigoBeneficio,
        beneficio_nombre: benef.get(f.beneficio_codigo) ?? null,
        cupos_estimados: Number(f.cupos_estimados),
        cupos_ocupados: Number(f.cupos_ocupados),
        pct_cupos: porcentaje(Number(f.cupos_ocupados), Number(f.cupos_estimados)),
        presupuesto_asignado: asignado,
        presupuesto_comprometido: comprometido,
        presupuesto_pagado: Number(f.presupuesto_pagado),
        pct_presupuesto: porcentaje(comprometido, asignado),
        umbral_alerta_pct: umbral,
        alerta_cupos: nivelAlerta(Number(f.cupos_ocupados), Number(f.cupos_estimados), umbral),
        alerta_presupuesto: nivelAlerta(comprometido, asignado, umbral),
      };
    })
    .sort((a, b) => (a.convocatoria_nombre ?? '').localeCompare(b.convocatoria_nombre ?? '') || a.beneficio_codigo.localeCompare(b.beneficio_codigo));
}

/**
 * Montos aprobados, comprometidos y pagados de una convocatoria, por beneficio y por estado.
 * Lectura para dashboards (admin_dashboard, dashboard_funcionario, beneficiario_dashboard) y export_reports;
 * el k-anonimato se aplica en esos modulos.
 */
export async function montosPorConvocatoria(convocatoriaId: string): Promise<MontosConvocatoria> {
  const [filas, estados] = await Promise.all([
    rpc<FilaOcupacion[] | null>('fn_cupos_ocupacion', { p_convocatoria_id: convocatoriaId }),
    rpc<Array<{ estado: EstadoOtorgamiento; beneficio_codigo: string; total: number; monto: number | string }> | null>('fn_otorgamientos_por_estado', {
      p_convocatoria_id: convocatoriaId,
    }),
  ]);
  const por_beneficio = (filas ?? []).map((f) => ({
    beneficio_codigo: f.beneficio_codigo,
    cupos_estimados: Number(f.cupos_estimados),
    cupos_ocupados: Number(f.cupos_ocupados),
    presupuesto_asignado: Number(f.presupuesto_asignado),
    monto_aprobado: Number(f.monto_aprobado_total),
    monto_comprometido: Number(f.presupuesto_comprometido),
    monto_pagado: Number(f.presupuesto_pagado),
  }));
  const suma = (k: 'monto_aprobado' | 'monto_comprometido' | 'monto_pagado'): number => por_beneficio.reduce((acc, b) => acc + b[k], 0);
  return {
    convocatoria_id: convocatoriaId,
    monto_aprobado: suma('monto_aprobado'),
    monto_comprometido: suma('monto_comprometido'),
    monto_pagado: suma('monto_pagado'),
    por_beneficio,
    por_estado: (estados ?? []).map((e) => ({ estado: e.estado, beneficio_codigo: e.beneficio_codigo, total: Number(e.total), monto: Number(e.monto) })),
  };
}
