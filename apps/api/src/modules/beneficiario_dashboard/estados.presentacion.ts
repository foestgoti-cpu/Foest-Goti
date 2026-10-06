import type { EstadoPostulacion } from '@foest/shared';

/**
 * Fuente unica de traduccion de estados tecnicos a lenguaje claro para el
 * beneficiario (docs/modules/beneficiario_dashboard.md, tabla de traduccion).
 * El frontend no vuelve a traducir: consume `estado_texto` y `estado_descripcion`.
 */
export interface EstadoPresentado {
  /** Texto corto (titulo de la insignia o del hito). */
  texto: string;
  /** Explicacion breve de que significa y que sigue. */
  descripcion: string;
  /** `true` cuando el beneficiario debe hacer algo. */
  requiere_accion: boolean;
  /** `true` para estados terminales. */
  terminal: boolean;
}

const TABLA: Record<EstadoPostulacion, EstadoPresentado> = {
  BORRADOR: {
    texto: 'Borrador sin enviar',
    descripcion: 'Su postulacion aun no ha sido enviada. Complete el formulario y los soportes y envielo antes del cierre de la convocatoria.',
    requiere_accion: true,
    terminal: false,
  },
  PENDIENTE: {
    texto: 'Recibida, en espera de revision',
    descripcion: 'Su postulacion fue recibida correctamente y sera revisada por el Comite FOEST.',
    requiere_accion: false,
    terminal: false,
  },
  EN_EVALUACION: {
    texto: 'En revision por el Comite FOEST',
    descripcion: 'El Comite FOEST esta revisando su expediente. Le avisaremos cuando haya un resultado.',
    requiere_accion: false,
    terminal: false,
  },
  EN_CORRECCION: {
    texto: 'Documentos pendientes de correccion',
    descripcion: 'El Comite FOEST solicito correcciones. Revise las observaciones y subsane antes de la fecha limite.',
    requiere_accion: true,
    terminal: false,
  },
  APROBADA: {
    texto: 'Aprobada. Felicitaciones',
    descripcion: 'Su postulacion fue aprobada. Consulte sus otorgamientos y los formatos disponibles para descarga.',
    requiere_accion: false,
    terminal: true,
  },
  RECHAZADA: {
    texto: 'No aprobada (revise las observaciones)',
    descripcion: 'Su postulacion no fue aprobada en esta convocatoria. Las observaciones del Equipo FOEST estan en la linea de tiempo.',
    requiere_accion: false,
    terminal: true,
  },
  DESISTIDA: {
    texto: 'Desistida por usted',
    descripcion: 'Usted desistio de esta postulacion. Podra presentarse de nuevo en una proxima convocatoria.',
    requiere_accion: false,
    terminal: true,
  },
};

const APROBADA_PARCIAL: EstadoPresentado = {
  texto: 'Aprobada parcialmente: revise el resultado por beneficio',
  descripcion: 'Algunos de los beneficios solicitados fueron aprobados y otros no. Consulte el detalle por beneficio en la linea de tiempo.',
  requiere_accion: false,
  terminal: true,
};

export function presentarEstado(estado: EstadoPostulacion, aprobacionParcial = false): EstadoPresentado {
  if (estado === 'APROBADA' && aprobacionParcial) return APROBADA_PARCIAL;
  return TABLA[estado] ?? TABLA.PENDIENTE;
}

/** Titulo del hito de la linea de tiempo para una transicion de estado. */
export function tituloHito(estadoNuevo: EstadoPostulacion, ciclo: number, aprobacionParcial = false): string {
  switch (estadoNuevo) {
    case 'BORRADOR':
      return 'Postulacion creada (borrador)';
    case 'PENDIENTE':
      return ciclo > 1 ? `Postulacion enviada con correcciones (ciclo ${ciclo})` : 'Postulacion enviada';
    case 'EN_EVALUACION':
      return 'En revision por el Comite FOEST';
    case 'EN_CORRECCION':
      return 'Se solicitaron correcciones';
    case 'APROBADA':
      return aprobacionParcial ? 'Resultado: aprobada parcialmente' : 'Resultado: aprobada';
    case 'RECHAZADA':
      return 'Resultado: no aprobada';
    case 'DESISTIDA':
      return 'Postulacion desistida';
    default:
      return presentarEstado(estadoNuevo).texto;
  }
}

/** Insignias de documentos derivadas del chequeo documental del ultimo ciclo (DECISIONES seccion 9). */
export type EstadoDocumentoPublico = 'APROBADO' | 'POR_CORREGIR' | 'PENDIENTE' | 'NO_APLICA' | 'PROCESANDO' | 'ARCHIVO_RECHAZADO' | 'SIN_CARGAR';

export const TEXTO_ESTADO_DOCUMENTO: Record<EstadoDocumentoPublico, string> = {
  APROBADO: 'Aprobado',
  POR_CORREGIR: 'Por corregir',
  PENDIENTE: 'Pendiente',
  NO_APLICA: 'No aplica',
  PROCESANDO: 'Procesando',
  ARCHIVO_RECHAZADO: 'Archivo rechazado',
  SIN_CARGAR: 'Sin cargar',
};

export const TEXTO_ESTADO_OTORGAMIENTO: Record<string, string> = {
  ACTIVO: 'Activo',
  SUSPENDIDO: 'Suspendido',
  REVOCADO: 'Revocado',
  CUMPLIDO: 'Cumplido',
};

export const TEXTO_ESTADO_DESEMBOLSO: Record<string, string> = {
  PROGRAMADO: 'Programado',
  PAGADO: 'Pagado',
  ANULADO: 'Anulado',
};
