import type { EstadoCertificado } from './labor_social.enums';

/** Actividad registrada dentro de un certificado de labor social. */
export interface ActividadDto {
  id: string;
  certificado_id: string;
  /** YYYY-MM-DD */
  fecha_actividad: string;
  horas_ejecutadas: number;
  descripcion_actividad: string;
  dependencia_municipal: string;
  nombre_supervisor: string;
  cargo_supervisor: string;
  creado_en: string;
  actualizado_en: string;
}

/** Emision definitiva del GE-F038 (la verificacion publica solo expone codigo, tipo, fecha y sha256). */
export interface EmisionDto {
  id: string;
  certificado_id: string;
  hash_contenido: string;
  codigo_verificacion: string;
  sha256_archivo: string;
  total_paginas: number;
  emitido_en: string;
}

export interface CertificadoDto {
  id: string;
  beneficiario_id: string;
  postulacion_id: string | null;
  semestre_academico: string;
  /** Suma decimal exacta de las actividades (recalculada por trigger). */
  total_horas_acumuladas: number;
  /** Copia de LABOR_SOCIAL_HORAS_MINIMAS al crear el certificado. */
  horas_minimas_requeridas: number;
  cumple_minimo: boolean;
  estado: EstadoCertificado;
  soporte_documento_id: string | null;
  completado_en: string | null;
  presentado_en: string | null;
  version: number;
  creado_en: string;
  actualizado_en: string;
  /** Solo en listados del titular y del administrador (el funcionario no ve el detalle). */
  actividades?: ActividadDto[];
  /** Ultima emision definitiva (si existe). */
  ultima_emision?: EmisionDto | null;
  /** `true` si la ultima emision corresponde al contenido actual (necesario para presentar). */
  emision_vigente?: boolean;
}

/** `GET /labor-social/me` */
export interface MisCertificadosDto {
  horas_maximas_por_dia: number;
  certificados: CertificadoDto[];
}

/**
 * Resumen de solo lectura que consume `evaluacion` (compatible con `LaborSocialResumenDto`)
 * y el componente web `LaborSocialResumen`.
 */
export interface ResumenLaborSocialDto {
  total_horas_acumuladas: number;
  horas_minimas_requeridas: number | null;
  estado: EstadoCertificado | null;
  certificado_id?: string | null;
  semestre_academico?: string | null;
  cumple_minimo?: boolean;
}

/** `GET /beneficiarios/:beneficiarioId/labor-social` (funcionario con asignacion activa o administrador). */
export interface LaborSocialBeneficiarioDto {
  beneficiario_id: string;
  resumen: ResumenLaborSocialDto | null;
  certificados: CertificadoDto[];
}

/** `GET /labor-social/:id/certificado.pdf` (URL firmada de 300 s). */
export interface DescargaCertificadoDto {
  url: string;
  expira_en: string;
  /** `true` si es un borrador (EN_PROCESO): marca de agua, sin QR ni emision. */
  borrador: boolean;
  emision: EmisionDto | null;
}
