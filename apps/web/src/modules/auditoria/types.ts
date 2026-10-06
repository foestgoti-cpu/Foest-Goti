import type {
  AuditoriaEvento,
  AuditoriaFiltros,
  AuditoriaIntegridad,
  CatalogoAuditoria,
  EstadoIntegridadAuditoria,
  LineaTiempoAuditoria,
} from '@foest/shared';

/**
 * Tipos del modulo auditoria (web). Los contratos viven en `@foest/shared/auditoria`;
 * aqui solo se reexportan y se agregan tipos de interfaz.
 */
export type { AuditoriaEvento, AuditoriaFiltros, AuditoriaIntegridad, CatalogoAuditoria, EstadoIntegridadAuditoria, LineaTiempoAuditoria };

/** Filtros tal como los maneja el formulario (todas las claves como texto). */
export type FiltrosFormulario = Record<keyof AuditoriaFiltros, string>;

export const FILTROS_VACIOS: FiltrosFormulario = {
  actor_id: '',
  entidad: '',
  entidad_id: '',
  accion: '',
  resultado: '',
  request_id: '',
  desde: '',
  hasta: '',
};

export const ETIQUETA_RESULTADO: Record<string, string> = {
  EXITO: 'Exito',
  FALLO: 'Fallo',
  DENEGADO: 'Denegado',
};
