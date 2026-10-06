/** Tipos internos del modulo dashboard_funcionario (contratos de la RPC y de las respuestas). */

export interface CeldaConteo {
  clave: string;
  total: number;
}

export interface FilaEstado {
  estado: string;
  total: number;
}

export interface PuntoSerie {
  dia: string; // YYYY-MM-DD (America/Bogota)
  total: number;
}

export interface TiemposCrudos {
  n: number;
  promedio_horas: number | null;
  p90_horas: number | null;
}

export interface CargaLado {
  activas: number;
  dictaminadas_periodo: number;
}

export interface CargaCruda {
  propia: CargaLado;
  comite: CargaLado;
  miembros_comite: number;
}

/** Resultado jsonb de `fn_metricas_funcionario`. */
export interface AgregadosRpc {
  alcance_invalido: boolean;
  convocatorias: string[];
  resumen?: FilaEstado[];
  por_beneficio?: CeldaConteo[];
  por_tipo_solicitud?: CeldaConteo[];
  serie?: PuntoSerie[];
  tiempos?: TiemposCrudos;
  carga?: CargaCruda;
  datos_actualizados_en: string | null;
}

export interface ConvocatoriaComite {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
  estado: string;
}

// ---- Respuestas de la API ----

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
  /** true para el bucket "Otros / Casos aislados". */
  agrupado: boolean;
}

export interface RespuestaDistribucion {
  datos_actualizados_en: string | null;
  items: ItemDistribucion[];
  /** true si el total completo es menor al umbral y no se publica desglose. */
  suprimido: boolean;
  /** Numero de celdas agrupadas en "Otros / Casos aislados". */
  celdas_agrupadas: number;
  umbral: number;
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
  /** true cuando no existe ningun dictamen en el alcance/rango. */
  sin_datos: boolean;
  /** true cuando hay dictamenes pero la muestra es menor al umbral de k-anonimato. */
  suprimido: boolean;
  umbral: number;
}

export interface RespuestaCarga {
  datos_actualizados_en: string | null;
  propia: CargaLado;
  /** null si el comite tiene menos de 3 miembros (evitaria deducir la carga del otro evaluador). */
  promedio_comite: CargaLado | null;
  miembros_comite: number;
}

export interface RespuestaConvocatorias {
  items: ConvocatoriaComite[];
}
