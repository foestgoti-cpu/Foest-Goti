import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnularDesembolsoInput, CargaMasivaPagosInput, PagarDesembolsoInput, ProgramarDesembolsoInput } from '@foest/shared';
import { seguimientoApi } from '../api';
import { convocatoriasApi } from '../../convocatorias/api';
import type { AccionEstado, FiltrosOtorgamientosUi } from '../types';

const CLAVE = ['seguimiento'] as const;

export function useOtorgamientos(filtros: FiltrosOtorgamientosUi) {
  return useQuery({ queryKey: [...CLAVE, 'lista', filtros], queryFn: () => seguimientoApi.listar(filtros) });
}
export function useOtorgamiento(id: string | undefined) {
  return useQuery({ queryKey: [...CLAVE, 'detalle', id], queryFn: () => seguimientoApi.obtener(id as string), enabled: Boolean(id), retry: false });
}
export function useCupos(convocatoriaId?: string) {
  return useQuery({ queryKey: [...CLAVE, 'cupos', convocatoriaId ?? ''], queryFn: () => seguimientoApi.cupos(convocatoriaId) });
}
export function useMisOtorgamientos() {
  return useQuery({ queryKey: [...CLAVE, 'mios'], queryFn: seguimientoApi.misOtorgamientos });
}
export function useConvocatoriasFiltro() {
  return useQuery({
    queryKey: ['convocatorias', 'filtro-seguimiento'],
    queryFn: () => convocatoriasApi.listar({ page: 1, page_size: 100 }),
    staleTime: 5 * 60_000,
  });
}

export function useMutacionesOtorgamiento(id: string) {
  const qc = useQueryClient();
  const invalidar = async () => {
    await qc.invalidateQueries({ queryKey: CLAVE });
  };
  return {
    cambiarEstado: useMutation({
      mutationFn: (v: { accion: AccionEstado; datos: Parameters<typeof seguimientoApi.cambiarEstado>[2] }) => seguimientoApi.cambiarEstado(id, v.accion, v.datos),
      onSuccess: invalidar,
    }),
    programar: useMutation({ mutationFn: (d: ProgramarDesembolsoInput) => seguimientoApi.programar(id, d), onSuccess: invalidar }),
    pagar: useMutation({ mutationFn: (v: { desembolsoId: string; datos: PagarDesembolsoInput }) => seguimientoApi.pagar(v.desembolsoId, v.datos), onSuccess: invalidar }),
    anular: useMutation({ mutationFn: (v: { desembolsoId: string; datos: AnularDesembolsoInput }) => seguimientoApi.anular(v.desembolsoId, v.datos), onSuccess: invalidar }),
  };
}

export function useCargaMasiva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: CargaMasivaPagosInput) => seguimientoApi.cargaMasiva(d),
    onSuccess: async (r) => {
      if (r.aplicada) await qc.invalidateQueries({ queryKey: CLAVE });
    },
  });
}
