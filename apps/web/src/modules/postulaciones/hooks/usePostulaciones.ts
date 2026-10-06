import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postulacionesApi } from '../api';
import type { FiltrosAdmin, GuardarPayload } from '../types';

export const clavesPostulaciones = {
  propias: (page: number) => ['postulaciones', 'me', page] as const,
  detalle: (id: string) => ['postulaciones', 'detalle', id] as const,
  validacion: (id: string) => ['postulaciones', 'validacion', id] as const,
  historial: (id: string) => ['postulaciones', 'historial', id] as const,
  abiertas: ['postulaciones', 'convocatorias-abiertas'] as const,
  admin: (f: FiltrosAdmin) => ['postulaciones', 'admin', f] as const,
  adminDetalle: (id: string) => ['postulaciones', 'admin', 'detalle', id] as const,
  adminHistorial: (id: string) => ['postulaciones', 'admin', 'historial', id] as const,
};

export function usePostulacionesPropias(page: number) {
  return useQuery({ queryKey: clavesPostulaciones.propias(page), queryFn: () => postulacionesApi.listarPropias(page) });
}

export function useConvocatoriasAbiertas() {
  return useQuery({ queryKey: clavesPostulaciones.abiertas, queryFn: postulacionesApi.convocatoriasAbiertas });
}

export function usePostulacion(id: string | undefined) {
  return useQuery({ queryKey: clavesPostulaciones.detalle(id ?? ''), queryFn: () => postulacionesApi.obtener(id as string), enabled: Boolean(id) });
}

export function useValidacion(id: string | undefined) {
  return useQuery({ queryKey: clavesPostulaciones.validacion(id ?? ''), queryFn: () => postulacionesApi.validacion(id as string), enabled: Boolean(id) });
}

export function useHistorial(id: string | undefined) {
  return useQuery({ queryKey: clavesPostulaciones.historial(id ?? ''), queryFn: () => postulacionesApi.historial(id as string), enabled: Boolean(id) });
}

/** Autoguardado con control de `version`: al guardar se actualiza la cache del detalle. */
export function useGuardarPostulacion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GuardarPayload) => postulacionesApi.guardar(id, body),
    onSuccess: (dto) => {
      qc.setQueryData(clavesPostulaciones.detalle(id), dto);
      void qc.invalidateQueries({ queryKey: clavesPostulaciones.validacion(id) });
    },
  });
}

export function useInvalidarPostulacion() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: clavesPostulaciones.detalle(id) });
    void qc.invalidateQueries({ queryKey: clavesPostulaciones.validacion(id) });
    void qc.invalidateQueries({ queryKey: clavesPostulaciones.historial(id) });
    void qc.invalidateQueries({ queryKey: ['postulaciones', 'me'] });
  };
}

export function usePostulacionesAdmin(f: FiltrosAdmin) {
  return useQuery({ queryKey: clavesPostulaciones.admin(f), queryFn: () => postulacionesApi.listarAdmin(f) });
}

export function usePostulacionAdmin(id: string | undefined) {
  return useQuery({ queryKey: clavesPostulaciones.adminDetalle(id ?? ''), queryFn: () => postulacionesApi.obtenerAdmin(id as string), enabled: Boolean(id) });
}

export function useHistorialAdmin(id: string | undefined) {
  return useQuery({ queryKey: clavesPostulaciones.adminHistorial(id ?? ''), queryFn: () => postulacionesApi.historialAdmin(id as string), enabled: Boolean(id) });
}
