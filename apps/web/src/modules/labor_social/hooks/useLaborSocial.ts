import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { laborSocialApi } from '../api';
import type { ActividadInput, CrearCertificadoInput } from '../types';

export const clavesLaborSocial = {
  mios: ['labor-social', 'me'] as const,
  beneficiario: (id: string) => ['labor-social', 'beneficiario', id] as const,
};

export function useMisCertificados() {
  return useQuery({ queryKey: clavesLaborSocial.mios, queryFn: laborSocialApi.misCertificados });
}

/** Lectura para funcionario con asignacion activa o administrador. */
export function useLaborSocialBeneficiario(beneficiarioId: string | undefined) {
  return useQuery({
    queryKey: clavesLaborSocial.beneficiario(beneficiarioId ?? ''),
    queryFn: () => laborSocialApi.porBeneficiario(beneficiarioId as string),
    enabled: Boolean(beneficiarioId),
    retry: false,
  });
}

/** Mutaciones del titular: todas refrescan la lista de certificados. */
export function useLaborSocialMutaciones() {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: clavesLaborSocial.mios });
  return {
    crear: useMutation({ mutationFn: (b: CrearCertificadoInput) => laborSocialApi.crear(b), onSuccess: refrescar }),
    agregarActividad: useMutation({
      mutationFn: (v: { id: string; datos: ActividadInput }) => laborSocialApi.agregarActividad(v.id, v.datos),
      onSuccess: refrescar,
    }),
    editarActividad: useMutation({
      mutationFn: (v: { id: string; actividadId: string; datos: ActividadInput }) => laborSocialApi.editarActividad(v.id, v.actividadId, v.datos),
      onSuccess: refrescar,
    }),
    eliminarActividad: useMutation({
      mutationFn: (v: { id: string; actividadId: string }) => laborSocialApi.eliminarActividad(v.id, v.actividadId),
      onSuccess: refrescar,
    }),
    completar: useMutation({ mutationFn: (id: string) => laborSocialApi.completar(id), onSuccess: refrescar }),
    reabrir: useMutation({ mutationFn: (id: string) => laborSocialApi.reabrir(id), onSuccess: refrescar }),
    presentar: useMutation({
      mutationFn: (v: { id: string; documentoId: string }) => laborSocialApi.presentar(v.id, v.documentoId),
      onSuccess: refrescar,
    }),
    /** Solicita la URL firmada y abre la descarga. Refresca porque puede crear una emision nueva. */
    descargar: useMutation({
      mutationFn: async (id: string) => {
        const r = await laborSocialApi.certificadoPdf(id);
        window.open(r.url, '_blank', 'noopener');
        return r;
      },
      onSuccess: refrescar,
    }),
  };
}
