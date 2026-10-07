import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, FormField, Input, Select } from '../../../components/ui';
import { postulacionesApi } from '../../postulaciones/api';
import { mensajeError } from '../formato';
import { useLaborSocialMutaciones } from '../hooks/useLaborSocial';
import { SemestreAcademicoSchema } from '../types';

/** Alta de un certificado de labor social para un semestre (vinculado a una postulación aprobada). */
export function NuevoCertificadoCard() {
  const { crear } = useLaborSocialMutaciones();
  const [semestre, setSemestre] = useState('');
  const [postulacionId, setPostulacionId] = useState('');
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const postulaciones = useQuery({ queryKey: ['labor-social', 'postulaciones-aprobadas'], queryFn: () => postulacionesApi.listarPropias(1, 100) });
  const aprobadas = (postulaciones.data?.data ?? []).filter((p) => p.estado === 'APROBADA');

  const enviar = async () => {
    setError(null);
    const parsed = SemestreAcademicoSchema.safeParse(semestre);
    if (!parsed.success) {
      setErrorCampo(parsed.error.issues[0]?.message ?? 'Semestre inválido');
      return;
    }
    setErrorCampo(null);
    try {
      await crear.mutateAsync({ semestre_academico: parsed.data, postulacion_id: postulacionId || undefined });
      setSemestre('');
      setPostulacionId('');
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <Card titulo="Nuevo certificado de labor social">
      {error && (
        <Alert tipo="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="grid gap-x-4 md:grid-cols-2">
        <FormField etiqueta="Semestre académico" nombre="semestre_academico" error={errorCampo} ayuda="Formato AAAA-S, por ejemplo 2026-1." obligatorio>
          <Input value={semestre} onChange={(e) => setSemestre(e.target.value)} placeholder="2026-1" />
        </FormField>
        <FormField etiqueta="Postulación aprobada" nombre="postulacion_id" ayuda="Necesaria para presentar el certificado con su soporte firmado.">
          <Select
            value={postulacionId}
            onChange={(e) => setPostulacionId(e.target.value)}
            placeholder="Sin vincular"
            opciones={aprobadas.map((p) => ({ valor: p.id, etiqueta: p.convocatoria?.nombre ?? `Postulación ${p.id.slice(0, 8)}` }))}
          />
        </FormField>
      </div>
      <Button onClick={() => void enviar()} cargando={crear.isPending}>
        Crear certificado
      </Button>
    </Card>
  );
}
