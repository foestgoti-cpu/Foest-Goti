import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Modal } from '../../../components/ui';
import { documentosApi } from '../../documentos/services/documentosApi';
import { fechaHora, horas, mensajeError } from '../formato';
import { useLaborSocialMutaciones } from '../hooks/useLaborSocial';
import { EstadoCertificado, TEXTO_ESTADO_CERTIFICADO, type ActividadDto, type CertificadoDto } from '../types';
import { LaborSocialFormModal } from './LaborSocialFormModal';
import { ResumenHoras } from './ResumenHoras';
import { TablaActividades } from './TablaActividades';

type Accion = 'completar' | 'reabrir' | 'presentar' | null;

/** Un certificado de labor social: horas, actividades y acciones (completar, reabrir, presentar, descargar GE-F038). */
export function CertificadoCard({ certificado: c, maxHorasDia }: { certificado: CertificadoDto; maxHorasDia: number }) {
  const m = useLaborSocialMutaciones();
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<ActividadDto | null>(null);
  const [eliminando, setEliminando] = useState<ActividadDto | null>(null);
  const [accion, setAccion] = useState<Accion>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const enProceso = c.estado === EstadoCertificado.EN_PROCESO;
  const completado = c.estado === EstadoCertificado.COMPLETADO;
  const presentado = c.estado === EstadoCertificado.PRESENTADO;

  // Soporte LAB_SOC disponible de la postulacion (solo cuando se va a presentar).
  const soporte = useQuery({
    queryKey: ['labor-social', 'soporte', c.postulacion_id],
    queryFn: () => documentosApi.listar(c.postulacion_id as string),
    enabled: accion === 'presentar' && Boolean(c.postulacion_id),
  });
  const documentoLabSoc = soporte.data?.documentos.find((d) => d.tipo_codigo === 'LAB_SOC' && d.estado_carga === 'DISPONIBLE') ?? null;

  const ejecutar = async (fn: () => Promise<unknown>, exito?: string) => {
    setError(null);
    setAviso(null);
    try {
      await fn();
      if (exito) setAviso(exito);
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const confirmarAccion = async () => {
    const que = accion;
    setAccion(null);
    if (que === 'completar') await ejecutar(() => m.completar.mutateAsync(c.id), 'El certificado quedó completado. Ya puede descargar el GE-F038 definitivo.');
    if (que === 'reabrir') await ejecutar(() => m.reabrir.mutateAsync(c.id), 'El certificado volvió a estar en proceso; podrá modificar las actividades.');
    if (que === 'presentar' && documentoLabSoc) {
      await ejecutar(() => m.presentar.mutateAsync({ id: c.id, documentoId: documentoLabSoc.id }), 'El certificado quedó presentado.');
    }
  };

  const descargar = () =>
    ejecutar(async () => {
      const r = await m.descargar.mutateAsync(c.id);
      setAviso(r.borrador ? 'Se generó un borrador sin validez (marca de agua). Complete el certificado para obtener el definitivo.' : 'Se generó el GE-F038 definitivo con su código de verificación.');
    });

  const guardarActividad = async (datos: Parameters<typeof m.agregarActividad.mutateAsync>[0]['datos']) => {
    if (editando) await m.editarActividad.mutateAsync({ id: c.id, actividadId: editando.id, datos });
    else await m.agregarActividad.mutateAsync({ id: c.id, datos });
  };

  return (
    <Card
      titulo={
        <>
          Semestre {c.semestre_academico} <Badge tono={presentado ? 'relleno' : 'destacado'}>{TEXTO_ESTADO_CERTIFICADO[c.estado]}</Badge>
        </>
      }
      acciones={
        enProceso ? (
          <Button
            onClick={() => {
              setEditando(null);
              setFormAbierto(true);
            }}
          >
            Registrar actividad
          </Button>
        ) : undefined
      }
    >
      {error && (
        <Alert tipo="error" className="mb-4">
          {error}
        </Alert>
      )}
      {aviso && (
        <Alert tipo="exito" className="mb-4">
          {aviso}
        </Alert>
      )}

      <ResumenHoras total={c.total_horas_acumuladas} minimas={c.horas_minimas_requeridas} />

      <div className="mt-4">
        <TablaActividades
          actividades={c.actividades ?? []}
          editable={enProceso}
          onEditar={(a) => {
            setEditando(a);
            setFormAbierto(true);
          }}
          onEliminar={setEliminando}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variante="secundario" onClick={() => void descargar()} cargando={m.descargar.isPending}>
          {enProceso ? 'Descargar borrador del GE-F038' : 'Descargar GE-F038'}
        </Button>
        {enProceso && (
          <Button onClick={() => setAccion('completar')} disabled={!c.cumple_minimo}>
            Marcar como completado
          </Button>
        )}
        {completado && (
          <>
            <Button variante="secundario" onClick={() => setAccion('reabrir')}>
              Reabrir
            </Button>
            <Button onClick={() => setAccion('presentar')} disabled={!c.emision_vigente || !c.postulacion_id}>
              Presentar
            </Button>
          </>
        )}
      </div>
      {enProceso && !c.cumple_minimo && <p className="mt-2 text-sm">Podrá marcarlo como completado cuando acumule el mínimo de horas exigido.</p>}
      {completado && !c.emision_vigente && (
        <p className="mt-2 text-sm">Descargue el GE-F038 definitivo con las actividades actuales para poder presentarlo.</p>
      )}
      {completado && !c.postulacion_id && (
        <p className="mt-2 text-sm">Para presentarlo, el certificado debe estar vinculado a una postulación aprobada.</p>
      )}
      {presentado && <p className="mt-2 text-sm">Presentado el {fechaHora(c.presentado_en)}. Un certificado presentado no admite cambios.</p>}
      {c.ultima_emision && (
        <p className="mt-2 text-xs">
          Última emisión definitiva: {fechaHora(c.ultima_emision.emitido_en)}, {c.ultima_emision.total_paginas} página(s). Código de verificación: <span className="font-mono">{c.ultima_emision.codigo_verificacion}</span>
        </p>
      )}

      <LaborSocialFormModal
        abierto={formAbierto}
        actividad={editando}
        maxHorasDia={maxHorasDia}
        onCerrar={() => setFormAbierto(false)}
        onGuardar={guardarActividad}
      />

      <Modal
        abierto={eliminando !== null}
        titulo="Eliminar actividad"
        onCerrar={() => setEliminando(null)}
        textoConfirmar="Eliminar actividad"
        cargando={m.eliminarActividad.isPending}
        onConfirmar={async () => {
          const a = eliminando;
          setEliminando(null);
          if (a) await ejecutar(() => m.eliminarActividad.mutateAsync({ id: c.id, actividadId: a.id }));
        }}
      >
        <p>
          ¿Desea eliminar la actividad del {eliminando?.fecha_actividad} ({horas(eliminando?.horas_ejecutadas)} horas)? El total de horas se recalculará.
        </p>
      </Modal>

      <Modal
        abierto={accion === 'completar'}
        titulo="Marcar el certificado como completado"
        onCerrar={() => setAccion(null)}
        onConfirmar={confirmarAccion}
        textoConfirmar="Marcar como completado"
        confirmacion={{ palabra: 'COMPLETAR', comprension: 'Entiendo que no podré modificar las actividades salvo que reabra el certificado.' }}
      >
        <p>Al completarlo se cierra la edición de actividades con {horas(c.total_horas_acumuladas)} horas acumuladas.</p>
      </Modal>

      <Modal
        abierto={accion === 'reabrir'}
        titulo="Reabrir el certificado"
        onCerrar={() => setAccion(null)}
        onConfirmar={confirmarAccion}
        textoConfirmar="Reabrir"
        confirmacion={{ palabra: 'REABRIR', comprension: 'Entiendo que el GE-F038 ya firmado perderá vigencia si modifico las actividades.' }}
      >
        <p>El certificado volverá a estar en proceso. Si cambia las actividades deberá descargar de nuevo el GE-F038 y hacerlo firmar otra vez.</p>
      </Modal>

      <Modal
        abierto={accion === 'presentar'}
        titulo="Presentar el certificado"
        onCerrar={() => setAccion(null)}
        onConfirmar={documentoLabSoc ? confirmarAccion : undefined}
        textoConfirmar="Presentar certificado"
        cargando={m.presentar.isPending}
        confirmacion={{ palabra: 'PRESENTAR', comprension: 'Entiendo que un certificado presentado no admite cambios ni puede reabrirse.' }}
      >
        {soporte.isLoading && <p>Verificando el soporte firmado...</p>}
        {soporte.isError && <Alert tipo="error">No fue posible consultar sus documentos; intente de nuevo.</Alert>}
        {!soporte.isLoading && !soporte.isError && documentoLabSoc && (
          <p>
            Se vinculará el soporte firmado <span className="font-semibold">{documentoLabSoc.nombre_original ?? 'LAB_SOC'}</span> (LAB_SOC disponible).
          </p>
        )}
        {!soporte.isLoading && !soporte.isError && !documentoLabSoc && (
          <Alert tipo="advertencia">
            Aún no hay un soporte LAB_SOC disponible. Suba el GE-F038 firmado y escaneado en{' '}
            <Link to={`/beneficiario/postulaciones/${c.postulacion_id}/documentos`}>Documentos</Link> y vuelva a intentarlo.
          </Alert>
        )}
      </Modal>
    </Card>
  );
}
