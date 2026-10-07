import type {
  AnularDesembolsoInput,
  CargaMasivaPagosInput,
  CumplirOtorgamientoInput,
  CupoBeneficioDto,
  DesembolsoDto,
  CambioEstadoOtorgamientoInput,
  MiOtorgamientoDto,
  OtorgamientoDetalleDto,
  OtorgamientoDto,
  PagarDesembolsoInput,
  ProgramarDesembolsoInput,
  ResultadoCargaPagosDto,
  ResultadoPagoDto,
} from '@foest/shared';
import { api, type Paginado } from '../../lib/api';
import type { AccionEstado, FiltrosOtorgamientosUi } from './types';

const P = '/seguimiento';
const RUTA_ACCION: Record<AccionEstado, string> = { SUSPENDER: 'suspender', REVOCAR: 'revocar', REACTIVAR: 'reactivar', CUMPLIR: 'cumplir' };

/** Cliente HTTP del modulo seguimiento_beneficios. */
export const seguimientoApi = {
  listar: (f: FiltrosOtorgamientosUi) =>
    api.get<Paginado<OtorgamientoDto>>(`${P}/otorgamientos`, {
      query: { page: f.page, page_size: f.page_size ?? 20, convocatoria_id: f.convocatoria_id, beneficio: f.beneficio || undefined, estado: f.estado || undefined, q: f.q },
    }),
  obtener: (id: string) => api.get<OtorgamientoDetalleDto>(`${P}/otorgamientos/${id}`),
  cambiarEstado: (id: string, accion: AccionEstado, datos: CambioEstadoOtorgamientoInput | CumplirOtorgamientoInput) =>
    api.patch<OtorgamientoDetalleDto>(`${P}/otorgamientos/${id}/${RUTA_ACCION[accion]}`, datos),
  programar: (id: string, datos: ProgramarDesembolsoInput) => api.post<DesembolsoDto>(`${P}/otorgamientos/${id}/desembolsos`, datos),
  pagar: (id: string, datos: PagarDesembolsoInput) => api.patch<ResultadoPagoDto>(`${P}/desembolsos/${id}/pagar`, datos),
  anular: (id: string, datos: AnularDesembolsoInput) => api.patch<DesembolsoDto>(`${P}/desembolsos/${id}/anular`, datos),
  cargaMasiva: (datos: CargaMasivaPagosInput) => api.post<ResultadoCargaPagosDto>(`${P}/desembolsos/carga-masiva`, datos),
  cupos: (convocatoriaId?: string) => api.get<CupoBeneficioDto[]>(`${P}/cupos`, { query: { convocatoria_id: convocatoriaId } }),
  misOtorgamientos: () => api.get<MiOtorgamientoDto[]>(`${P}/mis-otorgamientos`),
  miOtorgamiento: (id: string) => api.get<MiOtorgamientoDto>(`${P}/mis-otorgamientos/${id}`),
};
