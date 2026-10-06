/** Tipos del modulo dashboard_funcionario (espejo de las respuestas de /api/v1/dashboard/funcionario). */

export interface FiltrosDashboard {
  convocatoria_id?: string;
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
}

export interface TotalesResumen {
  asignadas: number;
  pendientes: number;
  en_evaluacion: number;
  en_correccion: number;
  aprobadas: number;
  rechazadas: number;
  desistidas: number;
}

export interface RespuestaResumen {
  datos_actualizados_en: string | null;
  convocatorias: string[];
  totales: TotalesResumen;
}

export interface ItemDistribucion {
  clave: string;
  etiqueta: string;
  total: number;
  agrupado: boolean;
}

export interface RespuestaDistribucion {
  datos_actualizados_en: string | null;
  items: ItemDistribucion[];
  suprimido: boolean;
  celdas_agrupadas: number;
  umbral: number;
}

export interface PuntoSerie {
  dia: string;
  total: number;
}

export interface RespuestaSerie {
  datos_actualizados_en: string | null;
  desde: string | null;
  hasta: string | null;
  items: PuntoSerie[];
}

export interface RespuestaTiempos {
  datos_actualizados_en: string | null;
  n: number;
  promedio_horas: number | null;
  p90_horas: number | null;
  sin_datos: boolean;
  suprimido: boolean;
  umbral: number;
}

export interface CargaLado {
  activas: number;
  dictaminadas_periodo: number;
}

export interface RespuestaCarga {
  datos_actualizados_en: string | null;
  propia: CargaLado;
  promedio_comite: CargaLado | null;
  miembros_comite: number;
}

export interface ConvocatoriaComite {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
  estado: string;
}

export interface RespuestaConvocatorias {
  items: ConvocatoriaComite[];
}
