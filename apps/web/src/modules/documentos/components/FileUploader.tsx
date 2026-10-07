import { useId, useRef, useState, type DragEvent } from 'react';
import type { TipoDocumento } from '@foest/shared';
import { Alert, Button, FormField, Textarea } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { useDocumentUpload, validarArchivoLocal } from '../hooks/useDocumentUpload';

export interface FileUploaderProps {
  postulacionId: string;
  tipo: TipoDocumento;
  nombreTipo: string;
  /** Tope por archivo en MB (configuracion del sistema). */
  maxMb: number;
  /** Formato oficial vigente vinculado (obligatorio para FORM_INS y PAG_CART). */
  formatoGeneradoId?: string;
  /** `true` si ya existe una version disponible: se trata de un reemplazo. */
  esReemplazo?: boolean;
  /** `true` si el reemplazo exige indicar el motivo (subsanacion). */
  exigeMotivo?: boolean;
  /** Se invoca cuando el soporte quedo cargado (con o sin escaneo pendiente). */
  onTerminado: () => void;
  onCancelar?: () => void;
}

const TEXTO_FASE = {
  inactivo: '',
  reservando: 'Reservando la carga...',
  subiendo: 'Subiendo el archivo...',
  confirmando: 'Validando el archivo...',
  verificando: 'Verificando seguridad del archivo...',
  listo: 'Archivo cargado correctamente.',
  error: '',
} as const;

/** Carga de un soporte: arrastrar y soltar o seleccionar, validacion local y progreso real de subida. */
export function FileUploader({ postulacionId, tipo, nombreTipo, maxMb, formatoGeneradoId, esReemplazo, exigeMotivo, onTerminado, onCancelar }: FileUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const carga = useDocumentUpload();

  const motivoRequerido = Boolean(esReemplazo && exigeMotivo);
  const motivoValido = !motivoRequerido || motivo.trim().length >= 10;

  const elegir = (file: File | undefined) => {
    carga.reiniciar();
    if (!file) return;
    const invalido = validarArchivoLocal(file, maxMb);
    setErrorLocal(invalido);
    setArchivo(invalido ? null : file);
  };

  const alSoltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrando(false);
    elegir(e.dataTransfer.files?.[0]);
  };

  const iniciar = async () => {
    if (!archivo) return;
    const ok = await carga.subir(archivo, {
      postulacionId,
      tipo,
      maxMb,
      formatoGeneradoId,
      motivoReemplazo: motivoRequerido ? motivo.trim() : undefined,
    });
    if (ok) {
      setArchivo(null);
      onTerminado();
    }
  };

  return (
    <div className="border border-ink p-4">
      <h3 className="mb-2 text-base font-semibold">
        {esReemplazo ? 'Reemplazar' : 'Cargar'}: {nombreTipo}
      </h3>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
        className={cn('border-2 border-dashed px-4 py-6 text-center', arrastrando ? 'border-primary bg-primary-10' : 'border-ink bg-white')}
      >
        <p className="text-sm">Arrastre el archivo aqui o seleccionelo desde su equipo.</p>
        <p className="mt-1 text-sm text-ink/70">Formatos admitidos: PDF, JPEG o PNG. Tamano maximo: {maxMb} MB.</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept="application/pdf,image/jpeg,image/png"
          disabled={carga.ocupado}
          onChange={(e) => {
            elegir(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button variante="secundario" className="mt-3" disabled={carga.ocupado} onClick={() => inputRef.current?.click()}>
          Seleccionar archivo
        </Button>
        {archivo && (
          <p className="mt-3 text-sm font-semibold" aria-live="polite">
            {archivo.name} ({(archivo.size / (1024 * 1024)).toFixed(2)} MB)
          </p>
        )}
      </div>

      {errorLocal && (
        <Alert tipo="error" className="mt-3">
          {errorLocal}
        </Alert>
      )}

      {motivoRequerido && (
        <div className="mt-4">
          <FormField etiqueta="Motivo del reemplazo" nombre="motivo_reemplazo" obligatorio ayuda="Explique brevemente por que reemplaza el soporte (minimo 10 caracteres).">
            <Textarea rows={3} maxLength={500} value={motivo} disabled={carga.ocupado} onChange={(e) => setMotivo(e.target.value)} />
          </FormField>
        </div>
      )}

      {carga.ocupado && (
        <div className="mt-4" aria-live="polite">
          <p className="mb-1 text-sm">
            {TEXTO_FASE[carga.fase]} {carga.fase === 'subiendo' ? `${carga.progreso}%` : ''}
          </p>
          <div className="h-2 w-full border border-ink bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={carga.progreso}>
            <div className="h-full bg-primary" style={{ width: `${carga.fase === 'subiendo' ? carga.progreso : 100}%` }} />
          </div>
        </div>
      )}

      {carga.error && (
        <Alert tipo="error" className="mt-3" titulo="No fue posible cargar el archivo">
          {carga.error}
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {onCancelar && (
          <Button variante="secundario" onClick={onCancelar} disabled={carga.ocupado}>
            Cancelar
          </Button>
        )}
        <Button onClick={() => void iniciar()} disabled={!archivo || !motivoValido || carga.ocupado} cargando={carga.ocupado}>
          {esReemplazo ? 'Reemplazar soporte' : 'Cargar soporte'}
        </Button>
      </div>
    </div>
  );
}
