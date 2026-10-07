import { CATALOGO_TIPOS_DOCUMENTO, CODIGOS_BENEFICIO, type CodigoBeneficio, type TipoDocumento, type TipoSolicitud } from '@foest/shared';
import { logger, supabaseAdmin } from '../../../shared';

/**
 * Seed idempotente de `tipo_documento` y `requisito_documento` (matriz "propuesta inicial" de
 * docs/modules/documentos.md, pendiente de validacion juridica). La migracion 0014 ya lo aplica;
 * este script permite re-sembrarlo desde codigo (p. ej. tras cambiar una regla) con upsert.
 *
 * Reglas compactas expandidas a filas (tipo, beneficio, tramite): 285 filas, todas obligatorias.
 */
export interface ReglaRequisito {
  tipo: TipoDocumento;
  beneficios: readonly CodigoBeneficio[];
  tramites: readonly TipoSolicitud[];
}

export interface FilaRequisito {
  tipo: TipoDocumento;
  beneficio: CodigoBeneficio;
  tramite: TipoSolicitud;
  obligatorio: boolean;
}

const TODOS_BENEFICIOS: readonly CodigoBeneficio[] = CODIGOS_BENEFICIO;
const LINEAS_ESPECIALES: readonly CodigoBeneficio[] = ['LE1', 'LE2', 'LE3', 'LE4', 'LE5', 'LE6'];
const TODOS_TRAMITES: readonly TipoSolicitud[] = ['PRIMERA_VEZ', 'RENOVACION', 'REINTEGRO'];

export const REGLAS_REQUISITOS: readonly ReglaRequisito[] = [
  { tipo: 'DOC_ID', beneficios: TODOS_BENEFICIOS, tramites: TODOS_TRAMITES },
  { tipo: 'FORM_INS', beneficios: TODOS_BENEFICIOS, tramites: TODOS_TRAMITES },
  { tipo: 'PAG_CART', beneficios: TODOS_BENEFICIOS, tramites: TODOS_TRAMITES },
  { tipo: 'SISBEN', beneficios: TODOS_BENEFICIOS, tramites: TODOS_TRAMITES },
  { tipo: 'CERT_RES', beneficios: TODOS_BENEFICIOS, tramites: TODOS_TRAMITES },
  { tipo: 'DIP_BACH', beneficios: TODOS_BENEFICIOS, tramites: ['PRIMERA_VEZ'] },
  { tipo: 'RES_ICFES', beneficios: TODOS_BENEFICIOS, tramites: ['PRIMERA_VEZ'] },
  { tipo: 'RES_ICFES', beneficios: ['S11'], tramites: ['RENOVACION', 'REINTEGRO'] },
  { tipo: 'CERT_ESC', beneficios: TODOS_BENEFICIOS, tramites: ['PRIMERA_VEZ'] },
  { tipo: 'LIQ_MAT', beneficios: ['SUP', 'ST', 'EA'], tramites: TODOS_TRAMITES },
  { tipo: 'CERT_NOT', beneficios: TODOS_BENEFICIOS, tramites: ['RENOVACION', 'REINTEGRO'] },
  { tipo: 'CERT_NOT', beneficios: ['EA'], tramites: ['PRIMERA_VEZ'] },
  { tipo: 'LAB_SOC', beneficios: TODOS_BENEFICIOS, tramites: ['RENOVACION'] },
  { tipo: 'HOR_CLA', beneficios: ['ST'], tramites: TODOS_TRAMITES },
  { tipo: 'SOP_ESP', beneficios: LINEAS_ESPECIALES, tramites: TODOS_TRAMITES },
];

/** Producto cartesiano de las reglas, sin duplicados. */
export function expandirRequisitos(reglas: readonly ReglaRequisito[] = REGLAS_REQUISITOS): FilaRequisito[] {
  const vistos = new Set<string>();
  const filas: FilaRequisito[] = [];
  for (const regla of reglas) {
    for (const beneficio of regla.beneficios) {
      for (const tramite of regla.tramites) {
        const clave = `${regla.tipo}|${beneficio}|${tramite}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        filas.push({ tipo: regla.tipo, beneficio, tramite, obligatorio: true });
      }
    }
  }
  return filas;
}

/** Upsert de tipos y requisitos. Idempotente: puede ejecutarse cualquier numero de veces. */
export async function seedRequisitos(): Promise<{ tipos: number; requisitos: number }> {
  const { error: errTipos } = await supabaseAdmin.from('tipo_documento').upsert(
    CATALOGO_TIPOS_DOCUMENTO.map((t) => ({ codigo: t.codigo, nombre: t.nombre, descripcion: t.descripcion, formato_oficial: t.formato_oficial })),
    { onConflict: 'codigo', ignoreDuplicates: true },
  );
  if (errTipos) throw new Error(`No fue posible sembrar tipo_documento: ${errTipos.message}`);

  const { data: tipos, error: errLectura } = await supabaseAdmin.from('tipo_documento').select('id, codigo');
  if (errLectura || !tipos) throw new Error(`No fue posible leer tipo_documento: ${errLectura?.message ?? 'sin datos'}`);
  const idPorCodigo = new Map((tipos as Array<{ id: string; codigo: string }>).map((t) => [t.codigo, t.id]));

  const filas = expandirRequisitos().map((f) => ({
    tipo_id: idPorCodigo.get(f.tipo),
    beneficio_codigo: f.beneficio,
    tipo_tramite: f.tramite,
    obligatorio: f.obligatorio,
  }));
  const { error } = await supabaseAdmin.from('requisito_documento').upsert(filas, { onConflict: 'tipo_id,beneficio_codigo,tipo_tramite', ignoreDuplicates: true });
  if (error) throw new Error(`No fue posible sembrar requisito_documento: ${error.message}`);
  logger.info({ requisitos: filas.length }, 'Seed de requisito_documento aplicado');
  return { tipos: CATALOGO_TIPOS_DOCUMENTO.length, requisitos: filas.length };
}
