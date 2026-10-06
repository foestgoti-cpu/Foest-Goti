import type { ConsentimientoVigenteDto, DeclaracionJuramentada, PublicarConsentimiento, PublicarDeclaracion, TextoConsentimiento } from '@foest/shared';
import { AppError, auditar, supabaseAdmin, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { configuracionService } from './configuracion.service';

/**
 * Declaraciones juramentadas (GE-F041) y texto de consentimiento (Ley 1581),
 * versionados e inmutables: publicar = nueva fila vigente; la anterior queda
 * inactiva sin modificarse (RPC atomicas fn_publicar_declaracion y
 * fn_publicar_consentimiento de 0010). El consentimiento mantiene sincronizadas
 * las claves CONSENTIMIENTO_TEXTO y CONSENTIMIENTO_TEXTO_VERSION_VIGENTE de
 * configuracion_sistema para compatibilidad con auth (consentimiento_vigente()).
 */
export const declaracionService = {
  async vigentes(user: UsuarioAutenticado): Promise<{ declaraciones: DeclaracionJuramentada[]; todas_confirmadas: boolean }> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('declaracion_juramentada').select('*').eq('vigente', true).order('codigo');
    if (error) throw AppError.interno(`No fue posible leer las declaraciones: ${error.message}`);
    const declaraciones = (data ?? []) as DeclaracionJuramentada[];
    return { declaraciones, todas_confirmadas: declaraciones.length === 6 && declaraciones.every((d) => d.texto_oficial_confirmado) };
  },

  /** Verificacion para postulaciones: alguna declaracion vigente sin texto oficial confirmado. */
  async hayDeclaracionesSinTextoOficial(): Promise<boolean> {
    const { data, error } = await supabaseAdmin.from('declaracion_juramentada').select('codigo, texto_oficial_confirmado').eq('vigente', true);
    if (error) throw AppError.interno(`No fue posible verificar las declaraciones: ${error.message}`);
    const filas = (data ?? []) as Array<{ texto_oficial_confirmado: boolean }>;
    return filas.length < 6 || filas.some((f) => !f.texto_oficial_confirmado);
  },

  async todas(user: UsuarioAutenticado): Promise<{ data: DeclaracionJuramentada[] }> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('declaracion_juramentada').select('*').order('codigo').order('version', { ascending: false });
    if (error) throw AppError.interno(`No fue posible leer las declaraciones: ${error.message}`);
    return { data: (data ?? []) as DeclaracionJuramentada[] };
  },

  async publicarDeclaracion(
    user: UsuarioAutenticado,
    codigo: string,
    cuerpo: PublicarDeclaracion,
    contexto: Partial<EventoAuditoria>,
  ): Promise<DeclaracionJuramentada> {
    const { data: anterior, error: errAnt } = await supabaseAdmin
      .from('declaracion_juramentada')
      .select('*')
      .eq('codigo', codigo)
      .eq('vigente', true)
      .maybeSingle();
    if (errAnt) throw AppError.interno(`No fue posible leer la declaracion vigente: ${errAnt.message}`);

    const { data, error } = await supabaseAdmin.rpc('fn_publicar_declaracion', {
      p_codigo: codigo,
      p_titulo: cuerpo.titulo,
      p_texto: cuerpo.texto,
      p_confirmado: cuerpo.texto_oficial_confirmado,
      p_actor: user.id,
    });
    if (error) throw AppError.interno(`No fue posible publicar la declaracion: ${error.message}`);
    const nueva = data as DeclaracionJuramentada;

    await auditar({
      ...contexto,
      accion: 'CREAR',
      entidad: 'DECLARACION_JURAMENTADA',
      entidad_id: nueva.id,
      datos_antes: anterior ? { codigo, version: (anterior as DeclaracionJuramentada).version, texto_oficial_confirmado: (anterior as DeclaracionJuramentada).texto_oficial_confirmado } : null,
      datos_despues: { codigo, version: nueva.version, titulo: nueva.titulo, texto_oficial_confirmado: nueva.texto_oficial_confirmado },
      metadatos: { motivo: cuerpo.motivo ?? null },
    });
    return nueva;
  },

  /** Publico (sin token). Lee texto_consentimiento vigente; si la tabla aun no existe, cae a configuracion_sistema. */
  async consentimientoVigente(): Promise<ConsentimientoVigenteDto> {
    const { data, error } = await supabaseAdmin.from('texto_consentimiento').select('version, texto, vigente_desde').eq('vigente', true).maybeSingle();
    if (!error && data) {
      const fila = data as { version: number; texto: string; vigente_desde: string | null };
      return { version: fila.version, texto: fila.texto, vigente_desde: fila.vigente_desde ?? null };
    }
    const { data: conf, error: errConf } = await supabaseAdmin
      .from('configuracion_sistema')
      .select('clave, valor')
      .in('clave', ['CONSENTIMIENTO_TEXTO_VERSION_VIGENTE', 'CONSENTIMIENTO_TEXTO']);
    if (errConf) throw AppError.interno(`No fue posible leer el consentimiento: ${errConf.message}`);
    const filas = (conf ?? []) as Array<{ clave: string; valor: string | null }>;
    const version = Number.parseInt(filas.find((f) => f.clave === 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE')?.valor ?? '1', 10);
    return { version: Number.isFinite(version) && version > 0 ? version : 1, texto: filas.find((f) => f.clave === 'CONSENTIMIENTO_TEXTO')?.valor ?? '', vigente_desde: null };
  },

  async versionesConsentimiento(user: UsuarioAutenticado): Promise<{ data: TextoConsentimiento[] }> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('texto_consentimiento').select('*').order('version', { ascending: false });
    if (error) throw AppError.interno(`No fue posible leer las versiones del consentimiento: ${error.message}`);
    return { data: (data ?? []) as TextoConsentimiento[] };
  },

  async publicarConsentimiento(user: UsuarioAutenticado, cuerpo: PublicarConsentimiento, contexto: Partial<EventoAuditoria>): Promise<TextoConsentimiento> {
    const anterior = await this.consentimientoVigente();
    const { data, error } = await supabaseAdmin.rpc('fn_publicar_consentimiento', { p_texto: cuerpo.texto, p_actor: user.id });
    if (error) throw AppError.interno(`No fue posible publicar el consentimiento: ${error.message}`);
    const nuevo = data as TextoConsentimiento;

    await auditar({
      ...contexto,
      accion: 'CREAR',
      entidad: 'TEXTO_CONSENTIMIENTO',
      entidad_id: nuevo.id,
      datos_antes: { version: anterior.version },
      datos_despues: { version: nuevo.version, vigente_desde: nuevo.vigente_desde },
      metadatos: { motivo: cuerpo.motivo ?? null },
    });
    configuracionService.invalidar('CONSENTIMIENTO_TEXTO_VERSION_VIGENTE');
    configuracionService.invalidar('CONSENTIMIENTO_TEXTO');
    return nuevo;
  },
};
