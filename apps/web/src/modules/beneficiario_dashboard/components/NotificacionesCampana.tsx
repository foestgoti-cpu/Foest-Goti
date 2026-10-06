import { useContext, useEffect, useRef, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { rutaInicioPorRol, useAuth } from '../../../lib/auth/AuthProvider';
import { useContadorNotificaciones, useMarcarLeida, useNotificaciones } from '../hooks/useNotificaciones';
import type { Notificacion } from '../types';

/**
 * Campana de notificaciones para el encabezado del AppShell (cualquier rol):
 * contador de no leidas, lista corta y marcar como leida.
 * Es tolerante al entorno: sin QueryClient (p. ej. pruebas del AppShell) o sin
 * sesion no renderiza nada.
 */
export function NotificacionesCampana() {
  const qc = useContext(QueryClientContext);
  const { session, rol } = useAuth();
  if (!qc || !session || !rol) return null;
  return <CampanaInterna rutaCentro={`${rutaInicioPorRol(rol)}/notificaciones`} />;
}

function CampanaInterna({ rutaCentro }: { rutaCentro: string }) {
  const [abierta, setAbierta] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: contador } = useContadorNotificaciones();
  const { data: lista, isLoading } = useNotificaciones(1, true, 5);
  const marcar = useMarcarLeida();
  const noLeidas = contador?.no_leidas ?? 0;

  useEffect(() => {
    if (!abierta) return;
    const alClic = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierta(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(false);
    };
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTecla);
    };
  }, [abierta]);

  const abrir = async (n: Notificacion) => {
    if (!n.leida) await marcar.mutateAsync(n.id).catch(() => undefined);
    setAbierta(false);
    if (n.url_destino) navigate(n.url_destino);
  };

  const etiqueta = noLeidas === 0 ? 'Notificaciones: sin mensajes nuevos' : `Notificaciones: ${noLeidas} sin leer`;

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 border border-ink bg-white px-3 text-sm font-medium hover:bg-primary-10"
        aria-label={etiqueta}
        aria-haspopup="dialog"
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
        data-testid="campana-notificaciones"
      >
        <span>Notificaciones</span>
        {noLeidas > 0 && (
          <span className="inline-flex min-w-[24px] items-center justify-center border border-primary bg-primary px-1.5 py-0.5 text-xs font-semibold text-white" aria-hidden="true">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>
      {abierta && (
        <div role="dialog" aria-label="Notificaciones recientes" className="absolute right-0 z-40 mt-1 w-[min(92vw,360px)] border border-ink bg-white text-ink shadow-none">
          <div className="border-b border-ink bg-primary-10 px-3 py-2 text-sm font-semibold">Notificaciones sin leer</div>
          {isLoading && <p className="px-3 py-3 text-sm">Cargando...</p>}
          {!isLoading && (lista?.data.length ?? 0) === 0 && <p className="px-3 py-3 text-sm">No tiene notificaciones sin leer.</p>}
          {lista && lista.data.length > 0 && (
            <ul className="max-h-80 divide-y divide-ink/30 overflow-y-auto">
              {lista.data.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void abrir(n)}
                    className="block min-h-[44px] w-full px-3 py-2 text-left hover:bg-primary-10"
                    aria-label={`${n.severidad === 'CRITICA' ? 'Importante: ' : ''}${n.titulo}. Marcar como leida`}
                  >
                    <span className="block text-sm font-semibold">
                      {n.severidad === 'CRITICA' && <span className="mr-1 text-xs uppercase tracking-wide">[Importante]</span>}
                      {n.titulo}
                    </span>
                    <span className="block text-sm">{n.mensaje}</span>
                    <span className="block text-xs text-ink/70">{n.creada_en_texto}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-ink px-3 py-2 text-sm">
            <Link to={rutaCentro} onClick={() => setAbierta(false)} className="inline-flex min-h-[44px] items-center font-semibold">
              Ver todas las notificaciones
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
