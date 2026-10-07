/**
 * Esquemas Zod de entrada del modulo: viven en `@foest/shared` (los consume tambien el web).
 */
export {
  SuspenderOtorgamientoSchema as SuspenderDto,
  RevocarOtorgamientoSchema as RevocarDto,
  ReactivarOtorgamientoSchema as ReactivarDto,
  CumplirOtorgamientoSchema as CumplirDto,
  ProgramarDesembolsoSchema as ProgramarDesembolsoDto,
  PagarDesembolsoSchema as PagarDesembolsoDto,
  AnularDesembolsoSchema as AnularDesembolsoDto,
  CargaMasivaPagosSchema as CargaMasivaDto,
  FiltrosOtorgamientosSchema as FiltrosOtorgamientosDto,
  CuposQuerySchema as CuposQueryDto,
} from '@foest/shared';

export type {
  CambioEstadoOtorgamientoInput,
  CumplirOtorgamientoInput,
  ProgramarDesembolsoInput,
  PagarDesembolsoInput,
  AnularDesembolsoInput,
  CargaMasivaPagosInput,
  FiltrosOtorgamientosInput,
  CuposQueryInput,
} from '@foest/shared';
