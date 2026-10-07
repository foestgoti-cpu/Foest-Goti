import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ESQUEMA_SECCION,
  TITULOS_SECCION,
  seccionesAplicables,
  type CodigoBeneficio,
  type SeccionFormulario,
  type TipoSolicitud,
} from '@foest/shared';
import { documentosFaltantes } from '../documentos';
import { FormatosNoDisponiblesError, formatosVigentes } from '../formatos_oficiales/vigencia.service';
import type { DeclaracionVigente, PostulacionRow } from './postulaciones.types';

/**
 * Validacion previa del expediente (`GET /:id/validacion`) y revalidacion al enviar.
 * Calcula campos faltantes por seccion, declaraciones sin aceptar y, cuando el
 * modulo `documentos` exista, los documentos obligatorios faltantes.
 */

export interface CampoFaltante {
  seccion: SeccionFormulario;
  seccion_titulo: string;
  campo: string;
  mensaje: string;
}

export interface ResultadoValidacion {
  completo: boolean;
  secciones_aplicables: SeccionFormulario[];
  secciones_completas: SeccionFormulario[];
  campos_faltantes: CampoFaltante[];
  declaraciones: {
    vigentes: DeclaracionVigente[];
    pendientes: string[];
    texto_oficial_confirmado: boolean;
  };
  documentos: { pendiente_modulo: true } | { pendiente_modulo: false; faltantes: Array<{ tipo: string; obligatorio: boolean; estado: string }> };
  formatos:
    | { pendiente_modulo: true }
    | { pendiente_modulo: false; vigentes: boolean; faltantes: string[]; desactualizados: string[] };
  perfil_completo: boolean;
  errores: string[];
}

export function camposFaltantes(
  tipo: TipoSolicitud,
  beneficios: readonly CodigoBeneficio[],
  datos: Record<string, unknown>,
): { faltantes: CampoFaltante[]; aplicables: SeccionFormulario[]; completas: SeccionFormulario[] } {
  const aplicables = seccionesAplicables(tipo, beneficios);
  const faltantes: CampoFaltante[] = [];
  const completas: SeccionFormulario[] = [];

  for (const seccion of aplicables) {
    if (seccion === 'seccion_1') {
      completas.push(seccion); // se valida con perfil_completo
      continue;
    }
    if (seccion === 'seccion_2') {
      if (beneficios.length === 0) {
        faltantes.push({ seccion, seccion_titulo: TITULOS_SECCION[seccion], campo: 'beneficios', mensaje: 'Debe seleccionar al menos un beneficio' });
      } else completas.push(seccion);
      continue;
    }
    if (seccion === 'seccion_9') {
      // Las declaraciones se verifican contra el catalogo vigente en `validar()`.
      continue;
    }
    const esquema = ESQUEMA_SECCION[seccion];
    const valor = datos[seccion];
    const r = esquema.safeParse(valor ?? {});
    if (r.success) {
      completas.push(seccion);
      continue;
    }
    for (const issue of r.error.issues) {
      faltantes.push({
        seccion,
        seccion_titulo: TITULOS_SECCION[seccion],
        campo: issue.path.length ? issue.path.join('.') : '(seccion)',
        mensaje: issue.code === 'invalid_type' && issue.message === 'Required' ? 'Campo obligatorio' : issue.message,
      });
    }
  }
  return { faltantes, aplicables, completas };
}

export function declaracionesPendientes(
  vigentes: DeclaracionVigente[],
  aceptadas: Array<{ codigo: string; version: number; aceptada: boolean }> | undefined,
): string[] {
  const lista = Array.isArray(aceptadas) ? aceptadas : [];
  return vigentes
    .filter((d) => !lista.some((a) => a.codigo === d.codigo && a.version === d.version && a.aceptada === true))
    .map((d) => d.codigo);
}

export async function cargarDeclaracionesVigentes(db: SupabaseClient): Promise<DeclaracionVigente[]> {
  const { data, error } = await db
    .from('declaracion_juramentada')
    .select('codigo, version, titulo, texto, texto_oficial_confirmado')
    .eq('vigente', true)
    .order('codigo');
  if (error) throw new Error(`No fue posible leer las declaraciones: ${error.message}`);
  return (data ?? []) as DeclaracionVigente[];
}

/**
 * Documentos obligatorios segun la matriz REQUISITO_DOCUMENTO (modulo `documentos`): solo cuenta el
 * estado DISPONIBLE. Si la tabla `documento` aun no existe (migracion 0014 sin aplicar) se informa
 * `pendiente_modulo`.
 */
export async function verificarDocumentos(db: SupabaseClient, postulacionId: string): Promise<ResultadoValidacion['documentos']> {
  const { error } = await db.from('documento').select('id', { count: 'exact', head: true }).eq('postulacion_id', postulacionId);
  if (error) return { pendiente_modulo: true };
  // Matriz REQUISITO_DOCUMENTO: obligatorios sin soporte DISPONIBLE (modulo documentos).
  const faltantes = await documentosFaltantes(postulacionId);
  return { pendiente_modulo: false, faltantes: faltantes.map((f) => ({ tipo: f.tipo, obligatorio: f.obligatorio, estado: f.estado })) };
}

/**
 * Formatos oficiales (GE-F041 / GE-F043): compara el hash_contenido actual con el del formato vigente.
 * Si la tabla de formatos aun no existe (migracion 0015 sin aplicar) no bloquea.
 */
export async function verificarFormatos(postulacionId: string): Promise<ResultadoValidacion['formatos']> {
  try {
    const r = await formatosVigentes(postulacionId);
    return { pendiente_modulo: false, ...r };
  } catch (e) {
    if (e instanceof FormatosNoDisponiblesError) return { pendiente_modulo: true };
    throw e;
  }
}

export async function validar(
  db: SupabaseClient,
  p: PostulacionRow,
  beneficios: CodigoBeneficio[],
  perfilCompleto: boolean,
  declaracionesAceptadasOverride?: string[],
): Promise<ResultadoValidacion> {
  const vigentes = await cargarDeclaracionesVigentes(db);
  const { faltantes, aplicables, completas } = camposFaltantes(p.tipo_solicitud, beneficios, p.datos_formulario ?? {});

  const seccion9 = (p.datos_formulario?.seccion_9 as { declaraciones?: Array<{ codigo: string; version: number; aceptada: boolean }> } | undefined)
    ?.declaraciones;
  const aceptadas = declaracionesAceptadasOverride
    ? vigentes.filter((v) => declaracionesAceptadasOverride.includes(v.codigo)).map((v) => ({ codigo: v.codigo, version: v.version, aceptada: true }))
    : seccion9;
  const pendientes = declaracionesPendientes(vigentes, aceptadas);
  if (pendientes.length === 0 && vigentes.length > 0) completas.push('seccion_9');
  for (const codigo of pendientes) {
    faltantes.push({ seccion: 'seccion_9', seccion_titulo: TITULOS_SECCION.seccion_9, campo: codigo, mensaje: 'Declaracion sin aceptar' });
  }

  const documentos = await verificarDocumentos(db, p.id);
  const formatos = await verificarFormatos(p.id);
  const errores: string[] = [];
  if (!perfilCompleto) errores.push('PERFIL_INCOMPLETO');
  if (faltantes.length > 0) errores.push('EXPEDIENTE_INCOMPLETO');
  if (vigentes.length === 0) errores.push('DECLARACIONES_NO_CONFIGURADAS');
  if (!documentos.pendiente_modulo && documentos.faltantes.length > 0) errores.push('DOCUMENTOS_FALTANTES');
  if (!formatos.pendiente_modulo && formatos.desactualizados.length > 0) errores.push('FORMATOS_DESACTUALIZADOS');

  return {
    completo: errores.length === 0,
    secciones_aplicables: aplicables,
    secciones_completas: completas,
    campos_faltantes: faltantes,
    declaraciones: {
      vigentes,
      pendientes,
      // TODO(DECISIONES seccion 18): bloquear el envio mientras el texto oficial no este confirmado.
      texto_oficial_confirmado: vigentes.length > 0 && vigentes.every((d) => d.texto_oficial_confirmado),
    },
    documentos,
    formatos,
    perfil_completo: perfilCompleto,
    errores,
  };
}
