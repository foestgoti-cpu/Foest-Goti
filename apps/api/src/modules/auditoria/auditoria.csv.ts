import { redactar } from '../../shared';
import type { AuditoriaEventoRow } from './auditoria.types';

/**
 * Exportacion CSV de la bitacora (auditoria.md, "Exportacion auditada"):
 *  - misma redaccion que al persistir (`redactar` de shared/audit.ts) y, ademas,
 *    enmascarado de correos `ab***@dominio.com` en los JSON exportados;
 *  - saneamiento contra inyeccion de formulas (celdas que inician con = + - @ \t \r);
 *  - RFC 4180 (comillas dobles escapadas, CRLF) con BOM UTF-8 para hojas de calculo.
 */
export const COLUMNAS_CSV = [
  'secuencia',
  'registrado_en',
  'accion',
  'entidad',
  'entidad_id',
  'resultado',
  'actor_tipo',
  'actor_rol',
  'actor_id',
  'request_id',
  'sesion_id',
  'ip_origen',
  'user_agent',
  'datos_antes',
  'datos_despues',
  'metadatos',
  'hash_previo',
  'hash_evento',
] as const;

const CORREO = /([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function enmascararCorreos(texto: string): string {
  return texto.replace(CORREO, (_m, inicio: string, dominio: string) => `${inicio}***@${dominio}`);
}

export function sanearCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  let texto = typeof valor === 'string' ? valor : typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  if (/[",\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function json(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return enmascararCorreos(JSON.stringify(redactar(valor)));
}

export function filaCsv(e: AuditoriaEventoRow): string {
  const celdas: unknown[] = [
    e.secuencia,
    e.registrado_en,
    e.accion,
    e.entidad,
    e.entidad_id,
    e.resultado,
    e.actor_tipo,
    e.actor_rol,
    e.actor_id,
    e.request_id,
    e.sesion_id,
    e.ip_origen,
    e.user_agent,
    json(e.datos_antes),
    json(e.datos_despues),
    json(e.metadatos),
    e.hash_previo,
    e.hash_evento,
  ];
  return celdas.map(sanearCelda).join(',');
}

export function generarCsv(eventos: AuditoriaEventoRow[]): string {
  const lineas = [COLUMNAS_CSV.join(','), ...eventos.map(filaCsv)];
  return `﻿${lineas.join('\r\n')}\r\n`;
}
