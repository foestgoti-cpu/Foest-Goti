import type { EstadoCertificado } from '@foest/shared';

/** Filas de BD de 0019_labor_social.sql. Los `numeric` pueden llegar como numero o texto segun el cliente. */
export interface FilaCertificado {
  id: string;
  beneficiario_id: string;
  postulacion_id: string | null;
  semestre_academico: string;
  total_horas_acumuladas: number | string;
  horas_minimas_requeridas: number | string;
  estado: EstadoCertificado;
  soporte_documento_id: string | null;
  completado_en: string | null;
  presentado_en: string | null;
  version: number;
  creado_en: string;
  actualizado_en: string;
}

export interface FilaActividad {
  id: string;
  certificado_id: string;
  fecha_actividad: string;
  horas_ejecutadas: number | string;
  descripcion_actividad: string;
  dependencia_municipal: string;
  nombre_supervisor: string;
  cargo_supervisor: string;
  creado_en: string;
  actualizado_en: string;
}

export interface FilaEmision {
  id: string;
  certificado_id: string;
  hash_contenido: string;
  codigo_verificacion: string;
  sha256_archivo: string;
  storage_key: string;
  total_paginas: number;
  emitido_en: string;
}

export const COLUMNAS_CERTIFICADO =
  'id, beneficiario_id, postulacion_id, semestre_academico, total_horas_acumuladas, horas_minimas_requeridas, estado, soporte_documento_id, completado_en, presentado_en, version, creado_en, actualizado_en';
export const COLUMNAS_ACTIVIDAD =
  'id, certificado_id, fecha_actividad, horas_ejecutadas, descripcion_actividad, dependencia_municipal, nombre_supervisor, cargo_supervisor, creado_en, actualizado_en';
export const COLUMNAS_EMISION = 'id, certificado_id, hash_contenido, codigo_verificacion, sha256_archivo, storage_key, total_paginas, emitido_en';

export const BUCKET_LABOR_SOCIAL = 'formatos';
