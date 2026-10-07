import {
  CODIGOS_BENEFICIO,
  TIPOS_DOCUMENTO,
  type CodigoBeneficio,
  type ExigibleDto,
  type RequisitoMatrizDto,
  type RequisitosQueryDto,
  type TipoDocumento,
  type TipoDocumentoDto,
  type TipoSolicitud,
} from '@foest/shared';
import { AppError, supabaseAdmin } from '../../shared';

/**
 * Calculo de documentos exigibles (documentos.md, "Regla de calculo"):
 *  1. filas de `requisito_documento` con beneficio en B y tramite = T;
 *  2. se agrupa por tipo: exigible si aparece en alguna fila; obligatorio si alguna fila lo es (OR);
 *  3. se informa `beneficios_que_lo_exigen`;
 *  4. los tipos fuera del resultado no pueden cargarse, salvo SOP_ESP (carga adicional voluntaria).
 */

/** Fila de la matriz con los datos del tipo ya resueltos. */
export interface FilaMatriz {
  tipo: TipoDocumentoDto;
  beneficio_codigo: string;
  tipo_tramite: TipoSolicitud;
  obligatorio: boolean;
}

/** Tipo de carga voluntaria siempre admitido aunque no sea exigible. */
export const TIPO_CARGA_VOLUNTARIA: TipoDocumento = 'SOP_ESP';

const ORDEN_TIPOS = new Map<string, number>(TIPOS_DOCUMENTO.map((t, i) => [t, i]));

type TipoEmbebido = { codigo: string; nombre: string; descripcion: string; formato_oficial: string | null };
type FilaCruda = {
  beneficio_codigo: string;
  tipo_tramite: TipoSolicitud;
  obligatorio: boolean;
  tipo: TipoEmbebido | TipoEmbebido[] | null;
};

/** Funcion pura: agrupa filas de la matriz en documentos exigibles. */
export function agruparExigibles(filas: readonly FilaMatriz[], beneficios: readonly string[], tramite: TipoSolicitud): ExigibleDto[] {
  const porTipo = new Map<TipoDocumento, ExigibleDto>();
  for (const f of filas) {
    if (f.tipo_tramite !== tramite || !beneficios.includes(f.beneficio_codigo)) continue;
    const actual = porTipo.get(f.tipo.codigo);
    if (!actual) {
      porTipo.set(f.tipo.codigo, { ...f.tipo, obligatorio: f.obligatorio, beneficios_que_lo_exigen: [f.beneficio_codigo] });
      continue;
    }
    if (f.obligatorio) actual.obligatorio = true;
    if (!actual.beneficios_que_lo_exigen.includes(f.beneficio_codigo)) actual.beneficios_que_lo_exigen.push(f.beneficio_codigo);
  }
  return [...porTipo.values()]
    .map((e) => ({ ...e, beneficios_que_lo_exigen: [...e.beneficios_que_lo_exigen].sort() }))
    .sort((a, b) => (ORDEN_TIPOS.get(a.codigo) ?? 99) - (ORDEN_TIPOS.get(b.codigo) ?? 99));
}

function normalizarFila(f: FilaCruda): FilaMatriz | null {
  const t = Array.isArray(f.tipo) ? f.tipo[0] : f.tipo;
  if (!t) return null;
  return {
    tipo: {
      codigo: t.codigo as TipoDocumento,
      nombre: t.nombre,
      descripcion: t.descripcion,
      formato_oficial: t.formato_oficial as TipoDocumentoDto['formato_oficial'],
    },
    beneficio_codigo: f.beneficio_codigo,
    tipo_tramite: f.tipo_tramite,
    obligatorio: f.obligatorio,
  };
}

const SELECT_MATRIZ = 'beneficio_codigo, tipo_tramite, obligatorio, tipo:tipo_id (codigo, nombre, descripcion, formato_oficial)';

export class RequisitosService {
  /** Filas de la matriz, opcionalmente restringidas a beneficios y/o tramite. */
  async cargarMatriz(opciones: { beneficios?: readonly string[]; tramite?: TipoSolicitud } = {}): Promise<FilaMatriz[]> {
    let consulta = supabaseAdmin.from('requisito_documento').select(SELECT_MATRIZ);
    if (opciones.beneficios) consulta = consulta.in('beneficio_codigo', [...opciones.beneficios]);
    if (opciones.tramite) consulta = consulta.eq('tipo_tramite', opciones.tramite);
    const { data, error } = await consulta;
    if (error) throw AppError.interno(`No fue posible leer la matriz de requisitos: ${error.message}`);
    return ((data ?? []) as unknown as FilaCruda[]).map(normalizarFila).filter((f): f is FilaMatriz => f !== null);
  }

  /** Documentos exigibles para unos beneficios y un tipo de tramite. */
  async calcularExigibles(beneficios: readonly string[], tipoTramite: TipoSolicitud): Promise<ExigibleDto[]> {
    if (beneficios.length === 0) return [];
    const filas = await this.cargarMatriz({ beneficios, tramite: tipoTramite });
    return agruparExigibles(filas, beneficios, tipoTramite);
  }

  /** Catalogo de tipos de documento. */
  async listarTipos(): Promise<TipoDocumentoDto[]> {
    const { data, error } = await supabaseAdmin.from('tipo_documento').select('codigo, nombre, descripcion, formato_oficial');
    if (error) throw AppError.interno(`No fue posible leer el catalogo de tipos: ${error.message}`);
    return ((data ?? []) as TipoDocumentoDto[]).sort((a, b) => (ORDEN_TIPOS.get(a.codigo) ?? 99) - (ORDEN_TIPOS.get(b.codigo) ?? 99));
  }

  /** Datos del tipo `SOP_ESP` para ofrecerlo como carga opcional. */
  async tipoVoluntario(): Promise<TipoDocumentoDto | null> {
    const { data, error } = await supabaseAdmin
      .from('tipo_documento')
      .select('codigo, nombre, descripcion, formato_oficial')
      .eq('codigo', TIPO_CARGA_VOLUNTARIA)
      .maybeSingle();
    if (error) throw AppError.interno(`No fue posible leer el tipo ${TIPO_CARGA_VOLUNTARIA}: ${error.message}`);
    return (data as TipoDocumentoDto | null) ?? null;
  }

  /** Codigos de beneficio ofertados en una convocatoria; `null` si la convocatoria no existe. */
  async beneficiosDeConvocatoria(convocatoriaId: string): Promise<CodigoBeneficio[] | null> {
    const { data: conv, error: errConv } = await supabaseAdmin.from('convocatoria').select('id').eq('id', convocatoriaId).maybeSingle();
    if (errConv) throw AppError.interno(`No fue posible cargar la convocatoria: ${errConv.message}`);
    if (!conv) return null;
    const { data, error } = await supabaseAdmin.from('convocatoria_beneficio').select('beneficio:beneficio_id (codigo)').eq('convocatoria_id', convocatoriaId);
    if (error) throw AppError.interno(`No fue posible cargar los beneficios de la convocatoria: ${error.message}`);
    const codigos: CodigoBeneficio[] = [];
    for (const fila of (data ?? []) as unknown as Array<{ beneficio: { codigo: string } | { codigo: string }[] | null }>) {
      const b = Array.isArray(fila.beneficio) ? fila.beneficio[0] : fila.beneficio;
      if (b && (CODIGOS_BENEFICIO as readonly string[]).includes(b.codigo)) codigos.push(b.codigo as CodigoBeneficio);
    }
    return codigos;
  }

  /** Matriz completa restringida a los beneficios de la convocatoria (todos los tramites). */
  async getRequisitosByConvocatoria(convocatoriaId: string): Promise<{ convocatoria_id: string; beneficios: CodigoBeneficio[]; matriz: RequisitoMatrizDto[] }> {
    const beneficios = await this.beneficiosDeConvocatoria(convocatoriaId);
    if (!beneficios) throw AppError.noEncontrado('CONVOCATORIA_NO_ENCONTRADA', 'Convocatoria no encontrada');
    const filas = beneficios.length > 0 ? await this.cargarMatriz({ beneficios }) : [];
    const matriz: RequisitoMatrizDto[] = filas
      .map((f) => ({ tipo_codigo: f.tipo.codigo, beneficio_codigo: f.beneficio_codigo, tipo_tramite: f.tipo_tramite, obligatorio: f.obligatorio }))
      .sort(
        (a, b) =>
          (ORDEN_TIPOS.get(a.tipo_codigo) ?? 99) - (ORDEN_TIPOS.get(b.tipo_codigo) ?? 99) ||
          a.beneficio_codigo.localeCompare(b.beneficio_codigo) ||
          a.tipo_tramite.localeCompare(b.tipo_tramite),
      );
    return { convocatoria_id: convocatoriaId, beneficios, matriz };
  }

  /**
   * `GET /convocatorias/:id/requisitos-documentos`: sin `tipo_tramite` devuelve la matriz; con
   * `tipo_tramite` devuelve los exigibles ya calculados (beneficios por defecto: los de la convocatoria).
   */
  async requisitosDeConvocatoria(
    convocatoriaId: string,
    query: RequisitosQueryDto,
  ): Promise<
    | { convocatoria_id: string; beneficios: CodigoBeneficio[]; matriz: RequisitoMatrizDto[] }
    | { convocatoria_id: string; beneficios: CodigoBeneficio[]; tipo_tramite: TipoSolicitud; exigibles: ExigibleDto[] }
  > {
    const ofertados = await this.beneficiosDeConvocatoria(convocatoriaId);
    if (!ofertados) throw AppError.noEncontrado('CONVOCATORIA_NO_ENCONTRADA', 'Convocatoria no encontrada');

    let beneficios = ofertados;
    if (query.beneficios) {
      const invalidos = query.beneficios.filter((b) => !(CODIGOS_BENEFICIO as readonly string[]).includes(b));
      if (invalidos.length > 0) throw AppError.datosInvalidos('BENEFICIO_INVALIDO', 'Algunos codigos de beneficio no existen', { beneficios: invalidos });
      const noOfertados = query.beneficios.filter((b) => !ofertados.includes(b as CodigoBeneficio));
      if (noOfertados.length > 0) throw AppError.datosInvalidos('BENEFICIO_NO_OFERTADO', 'Algunos beneficios no estan ofertados en la convocatoria', { beneficios: noOfertados });
      beneficios = [...new Set(query.beneficios)] as CodigoBeneficio[];
    }

    if (query.tipo_tramite) {
      return {
        convocatoria_id: convocatoriaId,
        beneficios,
        tipo_tramite: query.tipo_tramite,
        exigibles: await this.calcularExigibles(beneficios, query.tipo_tramite),
      };
    }
    const completa = await this.getRequisitosByConvocatoria(convocatoriaId);
    return { ...completa, beneficios, matriz: completa.matriz.filter((m) => beneficios.includes(m.beneficio_codigo as CodigoBeneficio)) };
  }
}

export const requisitosService = new RequisitosService();
