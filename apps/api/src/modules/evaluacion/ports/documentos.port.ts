import { AppError, logger, supabaseAdmin } from '../../../shared';
import type { RequisitoRow, RequisitosPostulacion, SoporteRow, TipoExigible } from '../evaluacion.types';

/**
 * Puerto de requisitos y soportes documentales de una postulacion.
 *
 * PROVISIONAL(documentos): implementado con la funcion SQL `fn_evaluacion_requisitos` (0017), que lee
 * `requisito_documento`, `tipo_documento` y `documento` de 0014 y se protege con to_regclass (si las
 * tablas no existen devuelve `disponible: false`). Cuando `documentos/index.ts` exponga
 * `documentosExigibles` / `estadoDocumentosPostulacion`, reemplazar `crearDocumentosPortProvisional`
 * con `setDocumentosPort(...)` sin tocar el resto del modulo.
 */
export interface DocumentosPort {
  requisitos(postulacionId: string): Promise<RequisitosPostulacion>;
}

export function crearDocumentosPortProvisional(): DocumentosPort {
  return {
    async requisitos(postulacionId) {
      const { data, error } = await supabaseAdmin.rpc('fn_evaluacion_requisitos', { p_postulacion_id: postulacionId });
      if (error) {
        if (/Could not find the function/i.test(error.message)) {
          throw new AppError(503, 'MIGRACION_PENDIENTE', 'Falta aplicar la migracion 0017_evaluacion.sql');
        }
        if (error.message.startsWith('NO_ENCONTRADO')) throw AppError.noEncontrado();
        throw AppError.interno(`No fue posible consultar los requisitos documentales: ${error.message}`);
      }
      const r = (data ?? {}) as Partial<RequisitosPostulacion>;
      if (r.error) logger.warn({ error: r.error }, 'Requisitos documentales no disponibles (esquema de documentos distinto al esperado)');
      return {
        disponible: Boolean(r.disponible),
        requisitos: (r.requisitos ?? []) as RequisitoRow[],
        documentos: (r.documentos ?? []) as SoporteRow[],
        error: r.error,
      };
    },
  };
}

let documentosPort: DocumentosPort = crearDocumentosPortProvisional();

export function setDocumentosPort(port: DocumentosPort): void {
  documentosPort = port;
}

export function obtenerRequisitos(postulacionId: string): Promise<RequisitosPostulacion> {
  return documentosPort.requisitos(postulacionId);
}

/** Agrupa las filas (beneficio x tipo) por tipo de documento. */
export function agruparTipos(requisitos: RequisitoRow[]): TipoExigible[] {
  const mapa = new Map<string, TipoExigible>();
  for (const r of requisitos) {
    let t = mapa.get(r.tipo_codigo);
    if (!t) {
      t = { tipo_id: r.tipo_id, tipo_codigo: r.tipo_codigo, tipo_nombre: r.tipo_nombre, beneficios_obligatorios: [], beneficios_opcionales: [] };
      mapa.set(r.tipo_codigo, t);
    }
    const lista = r.obligatorio ? t.beneficios_obligatorios : t.beneficios_opcionales;
    if (!lista.includes(r.beneficio_codigo)) lista.push(r.beneficio_codigo);
  }
  return [...mapa.values()];
}

/** beneficio -> codigos de tipo de documento obligatorios para aprobarlo. */
export function obligatoriosPorBeneficio(requisitos: RequisitoRow[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const r of requisitos) {
    if (!r.obligatorio) continue;
    const lista = mapa.get(r.beneficio_codigo) ?? [];
    if (!lista.includes(r.tipo_codigo)) lista.push(r.tipo_codigo);
    mapa.set(r.beneficio_codigo, lista);
  }
  return mapa;
}
