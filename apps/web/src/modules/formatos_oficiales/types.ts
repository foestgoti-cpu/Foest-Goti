import { EstadoVigenciaFormato, TipoFormato } from '@foest/shared';
import type {
  DescargaFormatoDto,
  FormatoGeneradoDto,
  ListadoFormatosDto,
  ResumenFormatoDto,
  VerificarFormatoDto,
} from '@foest/shared';

export type { DescargaFormatoDto, FormatoGeneradoDto, ListadoFormatosDto, ResumenFormatoDto, VerificarFormatoDto };
export { EstadoVigenciaFormato, TipoFormato };

export const NOMBRE_FORMATO: Record<TipoFormato, string> = {
  'GE-F041': 'Formulario de Solicitud GE-F041',
  'GE-F043': 'Pagaré con Carta de Instrucciones GE-F043',
};

export const DESCRIPCION_FORMATO: Record<TipoFormato, string> = {
  'GE-F041': 'Formulario de solicitud prellenado con los datos de su postulación. Requiere el formulario completo.',
  'GE-F043': 'Pagaré en blanco y carta de instrucciones. Solo se prellena su identificación; la suma, los intereses y la fecha de exigibilidad quedan en blanco.',
};

/** Soporte documental en el que se carga el escaneo firmado de cada formato. */
export const SOPORTE_FORMATO: Record<TipoFormato, string> = {
  'GE-F041': 'FORM_INS',
  'GE-F043': 'PAG_CART',
};
