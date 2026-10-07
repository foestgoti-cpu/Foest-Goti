import type { ReactNode } from 'react';
import { Badge, Button, EmptyState, type TonoBadge } from '../../../components/ui';
import type { DocumentoDto, DocumentosPostulacionDto, SituacionDocumento, TipoDocumentoDto } from '../types';

export interface DocumentChecklistProps {
  datos: DocumentosPostulacionDto;
  /** Acciones disponibles solo si el expediente es editable; si se omiten no se muestran botones. */
  onCargar?: (tipo: TipoDocumentoDto) => void;
  onReemplazar?: (doc: DocumentoDto, tipo: TipoDocumentoDto) => void;
  onVer?: (doc: DocumentoDto) => void;
  onEliminar?: (doc: DocumentoDto) => void;
  /** Tipo cuyo cargador esta abierto (se resalta la fila). */
  tipoActivo?: string | null;
  /** Contenido bajo una fila (p. ej. el cargador abierto para ese tipo). */
  renderDetalle?: (tipo: TipoDocumentoDto) => ReactNode;
}

const TEXTO_SITUACION: Record<SituacionDocumento, string> = {
  SIN_CARGAR: 'Pendiente',
  SUBIENDO: 'Subiendo',
  ESCANEANDO: 'Verificando',
  DISPONIBLE: 'Cargado',
  RECHAZADO_ARCHIVO: 'Rechazado',
};

const TONO_SITUACION: Record<SituacionDocumento, TonoBadge> = {
  SIN_CARGAR: 'neutro',
  SUBIENDO: 'destacado',
  ESCANEANDO: 'destacado',
  DISPONIBLE: 'relleno',
  RECHAZADO_ARCHIVO: 'neutro',
};

function tamano(bytes: number | null): string {
  if (bytes === null) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Lista de soportes exigibles segun beneficios y tramite, con el estado de carga de cada uno. */
export function DocumentChecklist({ datos, onCargar, onReemplazar, onVer, onEliminar, tipoActivo, renderDetalle }: DocumentChecklistProps) {
  const filas: Array<{ tipo: TipoDocumentoDto; obligatorio: boolean; exigidoPor: string[] }> = [
    ...datos.exigibles.map((e) => ({
      tipo: { codigo: e.codigo, nombre: e.nombre, descripcion: e.descripcion, formato_oficial: e.formato_oficial },
      obligatorio: e.obligatorio,
      exigidoPor: e.beneficios_que_lo_exigen,
    })),
    ...datos.opcionales.map((t) => ({ tipo: t, obligatorio: false, exigidoPor: [] as string[] })),
  ];

  if (filas.length === 0) {
    return <EmptyState titulo="Sin soportes exigibles" descripcion="No se encontraron soportes para los beneficios y el tramite de esta postulacion." />;
  }

  return (
    <ul className="divide-y divide-ink/30 border border-ink" aria-label="Soportes exigibles">
      {filas.map(({ tipo, obligatorio, exigidoPor }) => {
        const doc = datos.documentos.find((d) => d.tipo_codigo === tipo.codigo);
        const situacion: SituacionDocumento = doc ? doc.estado_carga : 'SIN_CARGAR';
        const vigente = doc?.versiones.find((v) => v.version === doc.version_actual);
        const enCurso = doc?.version_en_curso ?? null;
        const puedeReemplazar = doc?.estado_carga === 'DISPONIBLE';
        return (
          <li key={tipo.codigo} className={tipoActivo === tipo.codigo ? 'bg-primary-10 px-3 py-3' : 'px-3 py-3'}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{tipo.nombre}</p>
                <p className="text-sm text-ink/80">
                  {obligatorio ? 'Obligatorio' : 'Opcional'}
                  {exigidoPor.length > 0 && ` - Exigido por: ${exigidoPor.join(', ')}`}
                </p>
                {tipo.descripcion && <p className="text-sm text-ink/70">{tipo.descripcion}</p>}
                {doc && doc.nombre_original && situacion !== 'SIN_CARGAR' && (
                  <p className="mt-1 break-words text-sm">
                    Archivo: {doc.nombre_original} {tamano(doc.tamano_bytes) && `(${tamano(doc.tamano_bytes)})`}
                    {doc.version_actual > 1 && ` - version ${doc.version_actual}`}
                  </p>
                )}
                {situacion === 'RECHAZADO_ARCHIVO' && (
                  <p className="mt-1 border-l-2 border-ink pl-2 text-sm font-medium">
                    {vigente?.motivo_rechazo_archivo ?? 'El archivo fue rechazado.'} Cargue un archivo nuevo.
                  </p>
                )}
                {enCurso && enCurso.estado_carga === 'RECHAZADO_ARCHIVO' && (
                  <p className="mt-1 border-l-2 border-ink pl-2 text-sm font-medium">
                    El reemplazo (version {enCurso.version}) fue rechazado: {enCurso.motivo_rechazo_archivo ?? 'archivo no valido'}. Se conserva la version anterior.
                  </p>
                )}
                {enCurso && (enCurso.estado_carga === 'ESCANEANDO' || enCurso.estado_carga === 'SUBIENDO') && (
                  <p className="mt-1 text-sm">El reemplazo (version {enCurso.version}) se esta verificando; mientras tanto rige la version anterior.</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tono={TONO_SITUACION[situacion]}>{TEXTO_SITUACION[situacion]}</Badge>
                <div className="flex flex-wrap justify-end gap-2">
                  {doc && doc.estado_carga === 'DISPONIBLE' && onVer && (
                    <Button variante="secundario" onClick={() => onVer(doc)}>
                      Ver
                    </Button>
                  )}
                  {onCargar && !doc && (
                    <Button onClick={() => onCargar(tipo)}>Cargar</Button>
                  )}
                  {onCargar && doc && doc.estado_carga === 'RECHAZADO_ARCHIVO' && <Button onClick={() => onCargar(tipo)}>Cargar de nuevo</Button>}
                  {onReemplazar && doc && puedeReemplazar && (
                    <Button variante="secundario" onClick={() => onReemplazar(doc, tipo)}>
                      Reemplazar
                    </Button>
                  )}
                  {onEliminar && doc && (
                    <Button variante="texto" onClick={() => onEliminar(doc)}>
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {renderDetalle && <div className="mt-3">{renderDetalle(tipo)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
