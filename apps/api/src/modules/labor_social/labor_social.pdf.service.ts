import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { PDFDocument } from 'pdf-lib';
import {
  LABOR_SOCIAL_DEPENDENCIAS_PARA_RESUMEN,
  LABOR_SOCIAL_FILAS_POR_PAGINA,
  TIPO_FORMATO_LABOR_SOCIAL,
  VERSION_PLANTILLA_LABOR_SOCIAL,
} from '@foest/shared';
import { AppError, logger } from '../../shared';
import { hashContenidoService } from '../formatos_oficiales/hash-contenido';
import { generarQrDataUri } from '../formatos_oficiales/qr.service';
import { renderService } from '../formatos_oficiales/render.service';
import type { FilaActividad, FilaCertificado } from './labor_social.types';

/**
 * Armado y renderizado del GE-F038 (Certificado de Labor Social): Handlebars -> HTML -> PDF con el
 * Puppeteer perezoso de formatos_oficiales (`renderService.renderHtmlAPdf`).
 *
 *  - 15 filas por hoja; la primera es la hoja principal y las siguientes son "Anexo N" con encabezado repetido
 *    y subtotal por hoja.
 *  - Resumen por dependencia en HOJA ADICIONAL si hay mas de 4 dependencias (conserva el espacio de las firmas).
 *  - Suma exacta: todo se acumula en centesimas de hora (enteros). Subtotales, resumen y total deben coincidir
 *    o la generacion falla con 500 CERTIFICADO_INCONSISTENTE.
 *  - El QR (pie de pagina) lleva solo el codigo de verificacion; el sha256 del archivo jamas va dentro del PDF.
 */

export interface DatosBeneficiarioPdf {
  nombres: string;
  apellidos: string;
  tipo_documento: string | null;
  numero_documento: string | null;
}

export interface ContextoPdf {
  beneficiario: DatosBeneficiarioPdf;
  convocatoria_nombre: string | null;
  acuerdo: string;
}

export interface ModeloGeF038 {
  vista: Record<string, unknown>;
  total_centesimas: number;
  paginas_estimadas: number;
}

const centesimas = (h: number | string): number => Math.round(Number(h) * 100);

export function formatoHoras(c: number): string {
  const signo = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function fechaLarga(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }).format(d);
}

function ordenar(actividades: FilaActividad[]): FilaActividad[] {
  return [...actividades].sort((a, b) => a.fecha_actividad.localeCompare(b.fecha_actividad) || a.creado_en.localeCompare(b.creado_en) || a.id.localeCompare(b.id));
}

/** Hash canonico del contenido impreso (excluye marcas de tiempo de generacion y codigos). */
export function calcularHashContenidoLaborSocial(cert: FilaCertificado, actividades: FilaActividad[], ctx: ContextoPdf): string {
  const datos = {
    tipo: TIPO_FORMATO_LABOR_SOCIAL,
    plantilla: VERSION_PLANTILLA_LABOR_SOCIAL,
    certificado: {
      id: cert.id,
      semestre: cert.semestre_academico,
      postulacion_id: cert.postulacion_id,
      horas_minimas_cent: centesimas(cert.horas_minimas_requeridas),
    },
    beneficiario: ctx.beneficiario,
    convocatoria: ctx.convocatoria_nombre,
    acuerdo: ctx.acuerdo,
    actividades: ordenar(actividades).map((a) => ({
      id: a.id,
      fecha: a.fecha_actividad,
      horas_cent: centesimas(a.horas_ejecutadas),
      descripcion: a.descripcion_actividad,
      dependencia: a.dependencia_municipal,
      supervisor: a.nombre_supervisor,
      cargo: a.cargo_supervisor,
    })),
  };
  return crypto.createHash('sha256').update(hashContenidoService.serializar(datos), 'utf8').digest('hex');
}

/** Modelo de datos de la plantilla. Falla con CERTIFICADO_INCONSISTENTE si las sumas no coinciden. */
export function construirModelo(cert: FilaCertificado, actividades: FilaActividad[], ctx: ContextoPdf, borrador: boolean, generadoEn: Date): ModeloGeF038 {
  const filas = ordenar(actividades).map((a, i) => ({
    numero: i + 1,
    fecha: fechaCorta(a.fecha_actividad),
    horas: formatoHoras(centesimas(a.horas_ejecutadas)),
    centesimas: centesimas(a.horas_ejecutadas),
    descripcion: a.descripcion_actividad,
    dependencia: a.dependencia_municipal,
    supervisor: a.nombre_supervisor,
    cargo: a.cargo_supervisor,
  }));

  const totalCent = filas.reduce((s, f) => s + f.centesimas, 0);

  // Paginacion: bloques de 15 filas (siempre existe al menos la hoja principal).
  const bloques: (typeof filas)[] = [];
  for (let i = 0; i < filas.length; i += LABOR_SOCIAL_FILAS_POR_PAGINA) bloques.push(filas.slice(i, i + LABOR_SOCIAL_FILAS_POR_PAGINA));
  if (bloques.length === 0) bloques.push([]);
  const subtotales = bloques.map((b) => b.reduce((s, f) => s + f.centesimas, 0));

  // Resumen por dependencia.
  const porDep = new Map<string, { horas: number; actividades: number }>();
  for (const f of filas) {
    const acc = porDep.get(f.dependencia) ?? { horas: 0, actividades: 0 };
    acc.horas += f.centesimas;
    acc.actividades += 1;
    porDep.set(f.dependencia, acc);
  }
  const dependencias = [...porDep.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([dependencia, v]) => ({ dependencia, horas: formatoHoras(v.horas), actividades: v.actividades, centesimas: v.horas }));

  const sumaSub = subtotales.reduce((s, x) => s + x, 0);
  const sumaDep = dependencias.reduce((s, d) => s + d.centesimas, 0);
  if (sumaSub !== totalCent || sumaDep !== totalCent) {
    logger.error({ certificado_id: cert.id, totalCent, sumaSub, sumaDep }, 'GE-F038 inconsistente: las sumas no coinciden');
    throw new AppError(500, 'CERTIFICADO_INCONSISTENTE', 'No fue posible generar el certificado: las sumas de horas no coinciden');
  }

  const resumenAparte = dependencias.length > LABOR_SOCIAL_DEPENDENCIAS_PARA_RESUMEN;
  const hojas = bloques.map((b, i) => ({
    principal: i === 0,
    ultima: i === bloques.length - 1,
    anexo: i === 0 ? null : i,
    filas: b,
    subtotal: formatoHoras(subtotales[i] as number),
    cantidad: b.length,
  }));

  // Casillas de firma de la hoja principal: una por dependencia (hasta 4); con mas, cuatro casillas en blanco
  // y las firmas de cada dependencia van en la hoja de resumen.
  const firmas = resumenAparte
    ? [0, 1, 2, 3].map(() => ({ dependencia: '' }))
    : dependencias.length > 0
      ? dependencias.map((d) => ({ dependencia: d.dependencia }))
      : [{ dependencia: '' }, { dependencia: '' }];

  const b = ctx.beneficiario;
  const vista: Record<string, unknown> = {
    borrador,
    codigo_formato: TIPO_FORMATO_LABOR_SOCIAL,
    version_plantilla: VERSION_PLANTILLA_LABOR_SOCIAL,
    titulo: 'Certificado de Labor Social',
    acuerdo: ctx.acuerdo,
    generado_en_texto: fechaLarga(generadoEn),
    beneficiario: {
      nombre: `${b.nombres} ${b.apellidos}`.trim(),
      documento: [b.tipo_documento, b.numero_documento].filter(Boolean).join(' '),
    },
    convocatoria: ctx.convocatoria_nombre,
    semestre: cert.semestre_academico,
    horas_minimas: formatoHoras(centesimas(cert.horas_minimas_requeridas)),
    total_horas: formatoHoras(totalCent),
    total_actividades: filas.length,
    hojas,
    dependencias,
    resumen_aparte: resumenAparte,
    resumen_en_principal: !resumenAparte && dependencias.length > 0,
    firmas,
    cumple_minimo: totalCent >= centesimas(cert.horas_minimas_requeridas),
  };
  return { vista, total_centesimas: totalCent, paginas_estimadas: hojas.length + (resumenAparte ? 1 : 0) };
}

/** Las plantillas viven junto al codigo (src) y se copian a dist en el build; tambien se busca en src. */
function directorioPlantillas(): string {
  const candidatos = [
    path.join(__dirname, 'plantillas'),
    path.resolve(process.cwd(), 'src', 'modules', 'labor_social', 'plantillas'),
    path.resolve(process.cwd(), 'apps', 'api', 'src', 'modules', 'labor_social', 'plantillas'),
  ];
  for (const c of candidatos) if (fs.existsSync(c)) return c;
  throw new Error('No se encontro el directorio de plantillas de labor_social');
}

let plantillaCompilada: Handlebars.TemplateDelegate | null = null;
function plantilla(): Handlebars.TemplateDelegate {
  if (!plantillaCompilada) {
    const fuente = fs.readFileSync(path.join(directorioPlantillas(), 'GE-F038.hbs'), 'utf8');
    plantillaCompilada = Handlebars.compile(fuente, { strict: false });
  }
  return plantillaCompilada;
}

export function renderizarHtmlGeF038(vista: Record<string, unknown>): string {
  return plantilla()(vista);
}

const ESTILO_PIE = "width:100%;font-family:'Times New Roman','Liberation Serif',serif;font-size:8px;color:#000;padding:0 14mm;box-sizing:border-box;";

function pieDefinitivo(codigo: string, qrDataUri: string): string {
  return `<div style="${ESTILO_PIE}">
  <div style="border-top:0.5px solid #000;padding-top:2mm;display:flex;align-items:center;">
    <img src="${qrDataUri}" style="width:17mm;height:17mm;margin-right:4mm;" />
    <div style="flex:1;">
      <div>Verifique la autenticidad de este documento en la plataforma FOEST con el código:</div>
      <div style="font-family:'Courier New','Liberation Mono',monospace;font-size:10px;font-weight:bold;">${codigo}</div>
      <div>El código y el QR no constituyen firma digital. La firma de los secretarios de despacho es física.</div>
    </div>
    <div>Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>
  </div>
</div>`;
}

function pieBorrador(): string {
  return `<div style="${ESTILO_PIE}">
  <div style="border-top:0.5px solid #000;padding-top:2mm;display:flex;align-items:center;justify-content:space-between;">
    <div>BORRADOR SIN VALIDEZ: no tiene código de verificación ni puede presentarse como soporte.</div>
    <div>Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>
  </div>
</div>`;
}

export interface ResultadoRender {
  pdf: Buffer;
  total_paginas: number;
}

/** Renderiza el GE-F038. `codigoVerificacion` es null para el borrador (sin QR). */
export async function renderizarGeF038(modelo: ModeloGeF038, codigoVerificacion: string | null, timeoutMs = 60_000): Promise<ResultadoRender> {
  const html = renderizarHtmlGeF038({ ...modelo.vista, codigo_verificacion: codigoVerificacion });
  const footerTemplate = codigoVerificacion ? pieDefinitivo(codigoVerificacion, await generarQrDataUri(codigoVerificacion)) : pieBorrador();
  const pdf = await renderService.renderHtmlAPdf(html, {
    footerTemplate,
    timeoutMs,
    margin: { top: '16mm', bottom: '30mm', left: '14mm', right: '14mm' },
  });
  let total = modelo.paginas_estimadas;
  try {
    total = (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount();
  } catch (e) {
    logger.warn({ err: e }, 'No se pudo contar las paginas del GE-F038; se usa la estimacion');
  }
  return { pdf, total_paginas: total };
}
