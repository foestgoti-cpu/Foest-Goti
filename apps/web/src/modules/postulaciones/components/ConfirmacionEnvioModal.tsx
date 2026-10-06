import { BENEFICIOS_CATALOGO } from '@foest/shared';
import { Modal } from '../../../components/ui';
import { cierrePresentado, pesos, TEXTO_TIPO_SOLICITUD } from '../formato';
import type { Postulacion } from '../types';

/** Resumen y confirmacion explicita (doble intencion) previa al envio o a la subsanacion. */
export function ConfirmacionEnvioModal({
  abierto,
  postulacion,
  modo,
  cargando,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean;
  postulacion: Postulacion;
  modo: 'ENVIO' | 'SUBSANACION';
  cargando: boolean;
  onCerrar: () => void;
  onConfirmar: () => void | Promise<void>;
}) {
  const nombres = postulacion.beneficios.map((b) => BENEFICIOS_CATALOGO.find((c) => c.codigo === b)?.nombre ?? b);
  const valor = postulacion.datos_formulario.seccion_7?.valor_matricula;
  return (
    <Modal
      abierto={abierto}
      titulo={modo === 'ENVIO' ? 'Confirmar envio de la postulacion' : 'Confirmar envio de la subsanacion'}
      onCerrar={onCerrar}
      onConfirmar={onConfirmar}
      textoConfirmar={modo === 'ENVIO' ? 'Enviar postulacion' : 'Enviar subsanacion'}
      cargando={cargando}
      confirmacion={{
        palabra: 'ENVIAR',
        comprension:
          modo === 'ENVIO'
            ? 'Entiendo que al enviar no podre modificar el formulario salvo que el Comite FOEST solicite correcciones.'
            : 'Entiendo que al enviar la subsanacion inicia un nuevo ciclo de revision.',
      }}
    >
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <dt className="font-semibold">Convocatoria</dt>
        <dd>{postulacion.convocatoria?.nombre ?? postulacion.convocatoria_id}</dd>
        <dt className="font-semibold">Cierre</dt>
        <dd>{cierrePresentado(postulacion.convocatoria?.fecha_cierre_exclusiva)}</dd>
        <dt className="font-semibold">Tipo de tramite</dt>
        <dd>{TEXTO_TIPO_SOLICITUD[postulacion.tipo_solicitud] ?? postulacion.tipo_solicitud}</dd>
        <dt className="font-semibold">Beneficios solicitados</dt>
        <dd>{nombres.length ? nombres.join(', ') : '-'}</dd>
        <dt className="font-semibold">Valor de matricula</dt>
        <dd>
          {typeof valor === 'number' ? pesos(valor) : '-'}
          {postulacion.valor_matricula_letras && <span className="block text-xs uppercase">{postulacion.valor_matricula_letras}</span>}
        </dd>
        <dt className="font-semibold">Ciclo</dt>
        <dd>{modo === 'ENVIO' ? 1 : postulacion.ciclo + 1}</dd>
      </dl>
      <p className="mt-3 text-sm">
        Sus datos de identificacion, estrato y SISBEN se tomaran de su perfil y quedaran congelados en este envio.
      </p>
    </Modal>
  );
}
