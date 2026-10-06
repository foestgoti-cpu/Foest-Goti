import { CARACTER_IES, MODALIDAD_PROGRAMA, NIVEL_PROGRAMA, SECTOR_IES } from '@foest/shared';

/**
 * Mapeo configurable de encabezados del CSV del MEN (SNIES) a los campos del
 * catalogo. El MEN cambia encabezados entre publicaciones: agregue alias aqui.
 * Los encabezados se comparan normalizados (sin tildes, mayusculas, sin espacios
 * ni signos).
 */
export type CampoSnies =
  | 'ies_codigo'
  | 'ies_nombre'
  | 'ies_caracter'
  | 'ies_sector'
  | 'programa_codigo'
  | 'programa_nombre'
  | 'nivel'
  | 'modalidad'
  | 'estado'
  | 'departamento'
  | 'municipio';

export const CAMPOS_OBLIGATORIOS: readonly CampoSnies[] = ['ies_codigo', 'ies_nombre', 'programa_codigo', 'programa_nombre'];

export const ALIAS_ENCABEZADOS: Readonly<Record<CampoSnies, readonly string[]>> = {
  ies_codigo: ['CODIGOINSTITUCION', 'CODIGODELAINSTITUCION', 'CODIGOIES', 'CODIGOSNIESIES', 'IESCODIGO', 'CODIGOINSTITUCIONSNIES'],
  ies_nombre: ['NOMBREINSTITUCION', 'NOMBREDELAINSTITUCION', 'NOMBREIES', 'INSTITUCION', 'IESNOMBRE', 'INSTITUCIONDEEDUCACIONSUPERIORIES'],
  ies_caracter: ['CARACTERACADEMICO', 'CARACTER', 'CARACTERIES'],
  ies_sector: ['SECTOR', 'SECTORIES', 'ORIGEN', 'SECTORINSTITUCION'],
  programa_codigo: ['CODIGOSNIESDELPROGRAMA', 'CODIGOSNIESPROGRAMA', 'CODIGOPROGRAMA', 'CODIGOSNIES', 'SNIES', 'CODIGODELPROGRAMA'],
  programa_nombre: ['NOMBREDELPROGRAMA', 'NOMBREPROGRAMA', 'PROGRAMA', 'PROGRAMAACADEMICO'],
  nivel: ['NIVELDEFORMACION', 'NIVELFORMACION', 'NIVELACADEMICO', 'NIVEL'],
  modalidad: ['MODALIDAD', 'METODOLOGIA', 'MODALIDADDEFORMACION'],
  estado: ['ESTADOPROGRAMA', 'ESTADO', 'ESTADODELPROGRAMA'],
  departamento: ['DEPARTAMENTOOFERTAPROGRAMA', 'DEPARTAMENTOOFERTA', 'DEPARTAMENTO', 'DEPARTAMENTODEOFERTA'],
  municipio: ['MUNICIPIOOFERTAPROGRAMA', 'MUNICIPIOOFERTA', 'MUNICIPIO', 'MUNICIPIODEOFERTA'],
};

/** Sin tildes, mayusculas, espacios colapsados. Es el campo de busqueda. */
export function normalizarTexto(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function claveEncabezado(valor: string): string {
  return normalizarTexto(valor).replace(/[^A-Z0-9]/g, '');
}

/** Devuelve el indice de columna por campo; `undefined` si el encabezado no esta. */
export function resolverColumnas(encabezados: string[]): Partial<Record<CampoSnies, number>> {
  const claves = encabezados.map(claveEncabezado);
  const resultado: Partial<Record<CampoSnies, number>> = {};
  for (const campo of Object.keys(ALIAS_ENCABEZADOS) as CampoSnies[]) {
    const alias = ALIAS_ENCABEZADOS[campo];
    const idx = claves.findIndex((c) => alias.includes(c));
    if (idx >= 0 && !Object.values(resultado).includes(idx)) resultado[campo] = idx;
  }
  return resultado;
}

export function mapearCaracter(valor: string): string | null {
  const v = normalizarTexto(valor);
  if (!v) return null;
  if (v.includes('INSTITUCION UNIVERSITARIA') || v.includes('ESCUELA TECNOLOGICA')) return 'INSTITUCION_UNIVERSITARIA';
  if (v.includes('UNIVERSIDAD')) return 'UNIVERSIDAD';
  if (v.includes('TECNOLOGICA')) return 'TECNOLOGICA';
  if (v.includes('TECNICA')) return 'TECNICA_PROFESIONAL';
  return (CARACTER_IES as readonly string[]).includes(v) ? v : null;
}

export function mapearSector(valor: string): string | null {
  const v = normalizarTexto(valor);
  if (!v) return null;
  if (v.includes('OFICIAL') || v.includes('PUBLIC')) return 'OFICIAL';
  if (v.includes('PRIVAD')) return 'PRIVADA';
  return (SECTOR_IES as readonly string[]).includes(v) ? v : null;
}

export function mapearNivel(valor: string): string | null {
  const v = normalizarTexto(valor);
  if (!v) return null;
  if (v.includes('DOCTOR')) return 'DOCTORADO';
  if (v.includes('MAESTR')) return 'MAESTRIA';
  if (v.includes('ESPECIALIZ')) return 'ESPECIALIZACION';
  if (v.includes('TECNOLOG')) return 'TECNOLOGICO';
  if (v.includes('TECNIC')) return 'TECNICO';
  if (v.includes('UNIVERSITARI') || v.includes('PROFESIONAL') || v.includes('PREGRADO')) return 'PROFESIONAL';
  return (NIVEL_PROGRAMA as readonly string[]).includes(v) ? v : null;
}

export function mapearModalidad(valor: string): string | null {
  const v = normalizarTexto(valor);
  if (!v) return null;
  if (v.includes('DUAL')) return 'DUAL';
  if (v.includes('VIRTUAL')) return 'VIRTUAL';
  if (v.includes('DISTANCIA')) return 'DISTANCIA';
  if (v.includes('PRESENCIAL')) return 'PRESENCIAL';
  return (MODALIDAD_PROGRAMA as readonly string[]).includes(v) ? v : null;
}

export function mapearEstado(valor: string): 'ACTIVO' | 'INACTIVO' {
  const v = normalizarTexto(valor);
  if (!v) return 'ACTIVO';
  if (v.startsWith('INACTIV') || v.includes('NO ACTIV') || v.includes('CERRAD') || v.includes('VENCID')) return 'INACTIVO';
  return 'ACTIVO';
}
