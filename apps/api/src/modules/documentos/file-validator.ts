import { EncryptedPDFError, PDFDict, PDFDocument, PDFName, PDFStream, type PDFObject } from 'pdf-lib';
import type { MimeDocumento } from '@foest/shared';

/**
 * Validacion binaria de soportes (documentos.md): firma real (magic numbers de PDF, JPEG y PNG
 * implementados a mano), coincidencia con el MIME declarado e inspeccion de PDF con pdf-lib
 * (se rechazan PDF cifrados y con JavaScript o acciones automaticas).
 */

export type ResultadoValidacionArchivo = { ok: true; mime: MimeDocumento } | { ok: false; motivo: string };

const FIRMA_PDF = Buffer.from('%PDF-', 'latin1');
const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function empieza(contenido: Buffer, firma: Buffer): boolean {
  return contenido.length >= firma.length && contenido.subarray(0, firma.length).equals(firma);
}

/** Tipo real segun la firma binaria, o `null` si no es PDF/JPEG/PNG. */
export function detectarTipoReal(contenido: Buffer): MimeDocumento | null {
  if (empieza(contenido, FIRMA_PDF)) return 'application/pdf';
  if (empieza(contenido, FIRMA_JPEG)) return 'image/jpeg';
  if (empieza(contenido, FIRMA_PNG)) return 'image/png';
  return null;
}

const CLAVES_SCRIPT = ['JS', 'JavaScript'].map((n) => PDFName.of(n));
const NOMBRE_SCRIPT = '/JavaScript';

function diccionarioDe(obj: PDFObject): PDFDict | null {
  if (obj instanceof PDFStream) return obj.dict;
  if (obj instanceof PDFDict) return obj;
  return null;
}

/** Devuelve el motivo de rechazo de un PDF o `null` si es aceptable. */
export async function inspeccionarPdf(contenido: Buffer): Promise<string | null> {
  // Diccionario de cifrado declarado en el trailer (deteccion directa, independiente del parser).
  if (contenido.includes('/Encrypt', 0, 'latin1')) return 'El PDF esta cifrado o protegido con contrasena';
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(contenido, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (e) {
    if (e instanceof EncryptedPDFError) return 'El PDF esta cifrado o protegido con contrasena';
    return 'El PDF esta danado o no se puede leer';
  }
  if (doc.context.trailerInfo.Encrypt) return 'El PDF esta cifrado o protegido con contrasena';

  const catalogo = doc.catalog;
  if (catalogo.has(PDFName.of('OpenAction')) || catalogo.has(PDFName.of('AA'))) {
    return 'El PDF contiene acciones automaticas no permitidas';
  }
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = diccionarioDe(obj);
    if (!dict) continue;
    if (CLAVES_SCRIPT.some((k) => dict.has(k))) return 'El PDF contiene JavaScript embebido';
    const subtipo = dict.get(PDFName.of('S'));
    if (subtipo instanceof PDFName && subtipo.asString() === NOMBRE_SCRIPT) return 'El PDF contiene JavaScript embebido';
  }
  return null;
}

/** Valida el contenido frente al MIME declarado. */
export async function validarArchivo(contenido: Buffer, mimeDeclarado: string): Promise<ResultadoValidacionArchivo> {
  if (contenido.length === 0) return { ok: false, motivo: 'El archivo esta vacio' };
  const real = detectarTipoReal(contenido);
  if (!real) return { ok: false, motivo: 'El contenido no corresponde a un PDF, JPEG o PNG' };
  if (real !== mimeDeclarado) return { ok: false, motivo: 'El contenido del archivo no coincide con el tipo declarado' };
  if (real === 'application/pdf') {
    const motivo = await inspeccionarPdf(contenido);
    if (motivo) return { ok: false, motivo };
  }
  return { ok: true, mime: real };
}
