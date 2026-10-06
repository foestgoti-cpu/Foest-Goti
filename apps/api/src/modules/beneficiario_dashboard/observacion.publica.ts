/**
 * Serializador `ObservacionPublica` (DECISIONES seccion 9, anonimato del evaluador).
 *
 * Toda observacion que viaja al beneficiario pasa por aqui. El DTO resultante
 * NO contiene ningun campo de actor (id, nombre, correo, rol, funcionario) y
 * lleva la firma fija "Equipo FOEST". Ademas, `limpiarCamposActor` recorre
 * recursivamente cualquier objeto de respuesta y elimina claves de actor que
 * pudieran colarse desde tablas de otros modulos.
 */

export const FIRMA_PUBLICA = 'Equipo FOEST';

export interface ObservacionPublica {
  fecha: string;
  firma: typeof FIRMA_PUBLICA;
  texto: string;
  campos_observados: string[];
  documentos_observados: string[];
}

/** Claves que identifican a un actor y nunca se devuelven al beneficiario. */
const CLAVES_ACTOR = new Set([
  'actor_id',
  'actor_tipo',
  'actor_rol',
  'actor_email',
  'actor_nombre',
  'actor',
  'funcionario_id',
  'funcionario',
  'evaluador',
  'evaluador_id',
  'evaluador_nombre',
  'evaluador_email',
  'asignacion_id',
  'asignada_por',
  'liberada_por',
  'generado_por',
  'registrado_por',
  'creado_por',
  'actualizado_por',
  'decidido_por',
  'revisado_por',
  'usuario_id',
  'email',
  'correo',
  'nombres',
  'apellidos',
  'nombre_completo',
  'cargo',
  'dependencia',
  'rol',
]);

function aListaDeTextos(valor: unknown): string[] {
  if (!valor) return [];
  if (Array.isArray(valor)) {
    return valor
      .map((v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          const etiqueta = o.etiqueta ?? o.nombre ?? o.campo ?? o.tipo ?? o.codigo;
          return typeof etiqueta === 'string' ? etiqueta : '';
        }
        return '';
      })
      .filter((s) => s.length > 0);
  }
  if (typeof valor === 'string') {
    try {
      const parsed: unknown = JSON.parse(valor);
      return Array.isArray(parsed) ? aListaDeTextos(parsed) : [valor];
    } catch {
      return [valor];
    }
  }
  if (typeof valor === 'object') {
    return Object.keys(valor as Record<string, unknown>);
  }
  return [];
}

/**
 * Construye una `ObservacionPublica` a partir de una fila cruda (historial,
 * revision o correccion vigente). Solo toma los campos permitidos.
 */
export function serializarObservacionPublica(fila: {
  fecha?: string | Date | null;
  cambiado_en?: string | null;
  decidida_en?: string | null;
  texto?: string | null;
  observaciones?: string | null;
  campos_observados?: unknown;
  documentos_observados?: unknown;
}): ObservacionPublica | null {
  const texto = (fila.texto ?? fila.observaciones ?? '').toString().trim();
  const campos = aListaDeTextos(fila.campos_observados);
  const documentos = aListaDeTextos(fila.documentos_observados);
  if (!texto && campos.length === 0 && documentos.length === 0) return null;
  const fechaCruda = fila.fecha ?? fila.cambiado_en ?? fila.decidida_en ?? new Date();
  const fecha = fechaCruda instanceof Date ? fechaCruda.toISOString() : String(fechaCruda);
  return {
    fecha,
    firma: FIRMA_PUBLICA,
    texto,
    campos_observados: campos,
    documentos_observados: documentos,
  };
}

/** Elimina recursivamente cualquier clave de actor de un objeto de respuesta. */
export function limpiarCamposActor<T>(valor: T): T {
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return valor.map((v) => limpiarCamposActor(v)) as unknown as T;
  if (typeof valor === 'object') {
    if (valor instanceof Date) return valor;
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CLAVES_ACTOR.has(k.toLowerCase())) continue;
      salida[k] = limpiarCamposActor(v);
    }
    return salida as T;
  }
  return valor;
}

/** `true` si en algun nivel del objeto aparece una clave de actor (util en pruebas de contrato). */
export function contieneCamposActor(valor: unknown): string[] {
  const hallazgos: string[] = [];
  const recorrer = (v: unknown, ruta: string) => {
    if (v === null || v === undefined || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => recorrer(item, `${ruta}[${i}]`));
      return;
    }
    for (const [k, item] of Object.entries(v as Record<string, unknown>)) {
      if (CLAVES_ACTOR.has(k.toLowerCase())) hallazgos.push(`${ruta}.${k}`);
      recorrer(item, `${ruta}.${k}`);
    }
  };
  recorrer(valor, '$');
  return hallazgos;
}
