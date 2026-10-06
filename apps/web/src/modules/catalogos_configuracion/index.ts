/**
 * API publica del modulo para otros modulos del web:
 *   import { IesProgramaSelect, useConfiguracionPublica, useDeclaracionesVigentes } from '../catalogos_configuracion';
 */
export { IesProgramaSelect, type SeleccionSnies } from './components/IesProgramaSelect';
export { useConfiguracionPublica, useDiasHabiles } from './hooks/useConfiguracion';
export { useBuscarIes, useProgramasDeIes, useProgramaSnies } from './hooks/useSnies';
export { useDeclaracionesVigentes, useConsentimientoVigente } from './hooks/useDeclaraciones';
export { configuracionApi, festivosApi, sniesApi, declaracionesApi } from './api';
export type * from './types';
