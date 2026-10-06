import type { TipoNotificacion } from '@foest/shared';
import { CATALOGO_TIPOS_NOTIFICACION } from '@foest/shared';
import { logger, supabaseAdmin } from '../../../shared';
import type { Destinatario } from '../notificaciones.types';

/**
 * Resuelve los correos de un usuario sin importar modulos de negocio:
 * lee `usuario.email` (PRINCIPAL), `beneficiario.correo_notificacion_2` (ALTERNATIVO)
 * y `acudiente.correo` (ACUDIENTE, solo para menores de edad).
 * Los tipos de SEGURIDAD van unicamente al correo principal.
 * Otro modulo (accounts) puede sustituir la implementacion con `registrarResolverDestinatarios`.
 */
export interface ResolverDestinatarios {
  resolver(usuarioId: string, tipo: TipoNotificacion): Promise<Destinatario[]>;
}

interface FilaUsuario {
  id: string;
  email: string | null;
  rol: 'ADMINISTRADOR' | 'FUNCIONARIO' | 'BENEFICIARIO';
  activo: boolean;
}

interface FilaBeneficiarioCorreo {
  id: string;
  correo_notificacion_2: string | null;
  es_menor: boolean;
  anonimizado: boolean;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim().toLowerCase();
  return RE_EMAIL.test(v) ? v : null;
}

export class ResolverDestinatariosSupabase implements ResolverDestinatarios {
  async resolver(usuarioId: string, tipo: TipoNotificacion): Promise<Destinatario[]> {
    const { data: u, error } = await supabaseAdmin.from('usuario').select('id, email, rol, activo').eq('id', usuarioId).maybeSingle();
    if (error) throw new Error(`No fue posible consultar el usuario destinatario: ${error.message}`);
    const usuario = u as FilaUsuario | null;
    if (!usuario) return [];
    const resultado: Destinatario[] = [];
    const vistos = new Set<string>();
    const agregar = (email: string | null, rol: Destinatario['rol']) => {
      const e = normalizarEmail(email);
      if (!e || vistos.has(e)) return;
      vistos.add(e);
      resultado.push({ email: e, rol });
    };
    agregar(usuario.email, 'PRINCIPAL');

    const categoria = CATALOGO_TIPOS_NOTIFICACION[tipo].categoria;
    if (usuario.rol !== 'BENEFICIARIO' || categoria === 'SEGURIDAD') return resultado;

    const { data: b, error: errB } = await supabaseAdmin
      .from('beneficiario')
      .select('id, correo_notificacion_2, es_menor, anonimizado')
      .eq('usuario_id', usuarioId)
      .maybeSingle();
    if (errB) {
      logger.warn({ err: errB, usuarioId }, 'No fue posible leer el perfil del beneficiario para resolver destinatarios');
      return resultado;
    }
    const ben = b as FilaBeneficiarioCorreo | null;
    if (!ben || ben.anonimizado) return resultado;
    agregar(ben.correo_notificacion_2, 'ALTERNATIVO');

    if (ben.es_menor) {
      const { data: a, error: errA } = await supabaseAdmin.from('acudiente').select('correo').eq('beneficiario_id', ben.id).maybeSingle();
      if (errA) logger.warn({ err: errA, usuarioId }, 'No fue posible leer el acudiente para resolver destinatarios');
      else agregar((a as { correo: string | null } | null)?.correo ?? null, 'ACUDIENTE');
    }
    return resultado;
  }
}

let resolverActual: ResolverDestinatarios = new ResolverDestinatariosSupabase();

export function obtenerResolverDestinatarios(): ResolverDestinatarios {
  return resolverActual;
}

/** Permite a otro modulo (accounts) registrar su propio resolutor al arranque. */
export function registrarResolverDestinatarios(resolver: ResolverDestinatarios): void {
  resolverActual = resolver;
}
