import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Checkbox, EmptyState, PageHeader, Spinner } from '../../../components/ui';
import { useContadorNotificaciones, useLeerTodas, useMarcarLeida, useNotificaciones } from '../hooks/useNotificaciones';
import type { Notificacion } from '../types';

const TEXTO_SEVERIDAD: Record<Notificacion['severidad'], string> = { INFO: 'Informacion', ADVERTENCIA: 'Atencion', CRITICA: 'Importante' };

/** Centro de notificaciones: lista paginada, filtro de no leidas, marcar leida y leer todas. */
export function NotificacionesPage() {
  const [page, setPage] = useState(1);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const navigate = useNavigate();
  const lista = useNotificaciones(page, soloNoLeidas);
  const contador = useContadorNotificaciones();
  const marcar = useMarcarLeida();
  const leerTodas = useLeerTodas();
  const totalPaginas = lista.data ? Math.max(1, Math.ceil(lista.data.total / lista.data.page_size)) : 1;

  const abrir = async (n: Notificacion) => {
    if (!n.leida) await marcar.mutateAsync(n.id).catch(() => undefined);
    if (n.url_destino) navigate(n.url_destino);
  };

  return (
    <>
      <PageHeader
        titulo="Centro de notificaciones"
        descripcion={
          contador.data
            ? contador.data.no_leidas === 0
              ? 'No tiene notificaciones sin leer.'
              : `Tiene ${contador.data.no_leidas} notificaciones sin leer${contador.data.criticas_no_leidas > 0 ? `, ${contador.data.criticas_no_leidas} importantes` : ''}.`
            : undefined
        }
        acciones={
          <Button variante="secundario" onClick={() => leerTodas.mutate()} cargando={leerTodas.isPending} disabled={(contador.data?.no_leidas ?? 0) === 0}>
            Marcar todas como leidas
          </Button>
        }
      />

      <div className="mb-4">
        <Checkbox
          etiqueta="Mostrar solo las no leidas"
          checked={soloNoLeidas}
          onChange={(e) => {
            setSoloNoLeidas(e.target.checked);
            setPage(1);
          }}
        />
      </div>

      {lista.isLoading && <Spinner etiqueta="Cargando notificaciones" />}
      {lista.error && <Alert tipo="error">{(lista.error as Error).message}</Alert>}
      {leerTodas.isSuccess && (
        <Alert tipo="exito" className="mb-4">
          Se marcaron {leerTodas.data.afectadas} notificaciones como leidas.
        </Alert>
      )}

      {lista.data && lista.data.data.length === 0 && <EmptyState titulo="Sin notificaciones" descripcion="No hay mensajes para mostrar con el filtro actual." />}

      {lista.data && lista.data.data.length > 0 && (
        <ul className="divide-y divide-ink border border-ink rounded-xl overflow-hidden bg-white" aria-label="Notificaciones">
          {lista.data.data.map((n) => (
            <li key={n.id} className={`px-4 py-3 ${n.leida ? '' : 'border-l-4 border-l-primary'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`text-base ${n.leida ? '' : 'font-semibold'}`}>{n.titulo}</span>
                    <Badge tono={n.severidad === 'CRITICA' ? 'relleno' : n.severidad === 'ADVERTENCIA' ? 'destacado' : 'neutro'} aria-label={`Severidad: ${TEXTO_SEVERIDAD[n.severidad]}`}>
                      {TEXTO_SEVERIDAD[n.severidad]}
                    </Badge>
                    {!n.leida && <Badge tono="neutro">Sin leer</Badge>}
                  </p>
                  <p className="mt-1 text-sm">{n.mensaje}</p>
                  <p className="mt-1 text-xs text-ink/70">
                    <time dateTime={n.creada_en}>{n.creada_en_texto}</time>
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {!n.leida && (
                    <Button variante="secundario" onClick={() => marcar.mutate(n.id)} disabled={marcar.isPending} aria-label={`Marcar como leida: ${n.titulo}`}>
                      Marcar leida
                    </Button>
                  )}
                  {n.url_destino && (
                    <Button variante="texto" onClick={() => void abrir(n)} aria-label={`Abrir: ${n.titulo}`}>
                      Abrir
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lista.data && lista.data.total > lista.data.page_size && (
        <nav aria-label="Paginacion de notificaciones" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Pagina {lista.data.page} de {totalPaginas} ({lista.data.total} notificaciones)
          </span>
          <div className="flex gap-2">
            <Button variante="secundario" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variante="secundario" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}
