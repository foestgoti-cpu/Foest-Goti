/**
 * API publica del modulo `documentos` para los demas modulos:
 *
 *   import { documentosFaltantes, documentosExigibles, estadoDocumentosPostulacion, generarUrlLectura } from '../documentos';
 *
 * - `documentosExigibles(convocatoriaId, beneficios, tipoSolicitud)`: matriz de soportes exigidos.
 * - `documentosFaltantes(postulacionId)`: obligatorios sin soporte DISPONIBLE.
 * - `estadoDocumentosPostulacion(postulacionId)`: exigibles, cargados, faltantes y `completo`.
 * - `generarUrlLectura(documentoId, solicitante)`: URL de 300 s con alcance verificado y auditoria.
 */
import type { DocumentoFaltanteDto, ExigibleDto, TipoSolicitud, UrlLecturaDto } from '@foest/shared';
import { documentoService, type ContextoAuditoria } from './documento.service';
import type { SolicitanteDocumento } from './documento.types';

export {
  documentosRoutes,
  documentosPostulacionRoutes,
  tiposDocumentoRoutes,
  documentosConvocatoriaRoutes,
} from './documento.routes';
export { requisitosService, agruparExigibles } from './requisitos.service';
export { documentoService } from './documento.service';
export { setExpedienteAccessPort, type ExpedienteAccessPort } from './ports/expediente-access.port';
export { setFormatoVigentePort, type FormatoVigentePort, type ResultadoFormato } from './ports/formato-vigente.port';
export { __setAntivirusForTests, type AntivirusPort, type ResultadoEscaneo } from './antivirus.service';
export type { SolicitanteDocumento } from './documento.types';

export function documentosExigibles(convocatoriaId: string, beneficios: readonly string[], tipoSolicitud: TipoSolicitud): Promise<ExigibleDto[]> {
  return documentoService.documentosExigibles(convocatoriaId, beneficios, tipoSolicitud);
}

export function documentosFaltantes(postulacionId: string): Promise<DocumentoFaltanteDto[]> {
  return documentoService.documentosFaltantes(postulacionId);
}

export function estadoDocumentosPostulacion(postulacionId: string): ReturnType<typeof documentoService.estadoDocumentosPostulacion> {
  return documentoService.estadoDocumentosPostulacion(postulacionId);
}

export function generarUrlLectura(
  documentoId: string,
  solicitante: SolicitanteDocumento,
  opciones: { ctx?: ContextoAuditoria; version?: number } = {},
): Promise<UrlLecturaDto> {
  return documentoService.generarUrlLectura(documentoId, solicitante, opciones);
}

/** Elimina los objetos de Storage de una postulacion (al borrar un BORRADOR). */
export function purgarDocumentosDePostulacion(postulacionId: string): Promise<number> {
  return documentoService.purgarDocumentosDePostulacion(postulacionId);
}
