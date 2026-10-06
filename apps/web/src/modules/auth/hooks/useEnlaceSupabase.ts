import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

/**
 * Lee el resultado de un enlace de correo de Supabase Auth (verificacion,
 * recuperacion o invitacion). El cliente (detectSessionInUrl) consume el hash
 * `#access_token=...&type=recovery|invite|signup` y emite un evento; si el
 * enlace vencio llega `#error=...&error_description=...` en la URL.
 */
export interface EstadoEnlace {
  /** Error reportado por Supabase en la URL (enlace vencido o invalido). */
  errorEnlace: string | null;
  /** Tipo del enlace segun el hash (recovery, invite, signup, magiclink...). */
  tipo: string | null;
  /** `true` cuando el cliente ya establecio una sesion a partir del enlace. */
  conSesion: boolean;
  /** `true` mientras se resuelve el hash. */
  resolviendo: boolean;
}

function leerHash(): URLSearchParams {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

export function useEnlaceSupabase(): EstadoEnlace {
  const inicial = useMemo(() => {
    const p = leerHash();
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const descripcion = p.get('error_description') ?? q.get('error_description');
    const codigo = p.get('error') ?? q.get('error') ?? p.get('error_code') ?? q.get('error_code');
    return {
      errorEnlace: codigo || descripcion ? (descripcion ?? codigo) : null,
      tipo: p.get('type') ?? q.get('type'),
    };
  }, []);
  const [conSesion, setConSesion] = useState(false);
  const [resolviendo, setResolviendo] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let activo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!activo) return;
        setConSesion(Boolean(data.session));
        setResolviendo(false);
      })
      .catch(() => {
        if (activo) setResolviendo(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      setConSesion(Boolean(sesion));
      setResolviendo(false);
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { errorEnlace: inicial.errorEnlace, tipo: inicial.tipo, conSesion, resolviendo };
}
