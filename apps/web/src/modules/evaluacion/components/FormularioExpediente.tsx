import { TITULOS_SECCION, type SeccionFormulario } from '@foest/shared';
import { Badge, Card } from '../../../components/ui';
import { LaborSocialResumen } from '../../labor_social/components/LaborSocialResumen';
import { fechaCorta, TEXTO_TIPO_SOLICITUD } from '../../postulaciones/formato';
import type { ExpedienteEvaluacionDto } from '../types';
import { ValorArbol } from './ValorArbol';

/** Columna izquierda: formulario GE-F041, perfil del ciclo y datos de pago enmascarados. */
export function FormularioExpediente({ expediente: e }: { expediente: ExpedienteEvaluacionDto }) {
  const p = e.postulacion;
  const secciones = Object.keys(e.formulario ?? {});
  const pago = e.datos_pago;

  return (
    <div className="space-y-4">
      <Card titulo="Resumen de la solicitud">
        <dl className="grid grid-cols-1 gap-y-1 text-sm">
          <dt className="font-semibold">Convocatoria</dt>
          <dd>{p.convocatoria_nombre ?? '-'}</dd>
          <dt className="font-semibold">Tramite</dt>
          <dd>{TEXTO_TIPO_SOLICITUD[p.tipo_solicitud] ?? p.tipo_solicitud}</dd>
          <dt className="font-semibold">Estado y ciclo</dt>
          <dd>
            <Badge tono="destacado">{p.estado}</Badge> Ciclo {p.ciclo}, version {p.version}
          </dd>
          <dt className="font-semibold">Beneficios solicitados</dt>
          <dd>{e.beneficios.map((b) => b.nombre ?? b.codigo).join(', ') || '-'}</dd>
          <dt className="font-semibold">Labor social</dt>
          <dd>
            <LaborSocialResumen resumen={e.labor_social} titulo="Último certificado del beneficiario" />
          </dd>
          {e.subsanacion && (
            <>
              <dt className="font-semibold">Plazo maximo de subsanacion</dt>
              <dd>{fechaCorta(e.subsanacion.fecha_limite_maxima)}</dd>
            </>
          )}
        </dl>
      </Card>

      <Card titulo={`Formulario GE-F041 (ciclo ${p.ciclo})`}>
        {secciones.length === 0 && <p className="text-sm">Sin datos diligenciados.</p>}
        {secciones.map((s) => (
          <div key={s} className="mb-3 text-sm">
            <h3 className="text-base">{TITULOS_SECCION[s as SeccionFormulario] ?? s.replace(/_/g, ' ')}</h3>
            <ValorArbol v={e.formulario[s]} />
          </div>
        ))}
      </Card>

      <Card titulo="Perfil del beneficiario en este ciclo">
        {e.perfil_snapshot ? (
          <div className="text-sm">
            <ValorArbol v={e.perfil_snapshot} />
          </div>
        ) : (
          <p className="text-sm">Sin perfil registrado para el ciclo.</p>
        )}
      </Card>

      <Card titulo="Datos de pago">
        {pago ? (
          <dl className="grid grid-cols-1 gap-y-1 text-sm">
            <dt className="font-semibold">Tipo</dt>
            <dd>{pago.tipo}</dd>
            <dt className="font-semibold">Entidad</dt>
            <dd>{pago.entidad}</dd>
            <dt className="font-semibold">Numero</dt>
            <dd className="font-mono">{pago.numero_enmascarado}</dd>
          </dl>
        ) : (
          <p className="text-sm">No aplica para los beneficios solicitados.</p>
        )}
      </Card>
    </div>
  );
}
