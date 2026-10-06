import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CODIGOS_BENEFICIO,
  ESTADOS_DESISTIBLES,
  type CodigoBeneficio,
  type EstadoPostulacion,
  type Paginado,
  type Rol,
} from '@foest/shared';
import {
  AppError,
  auditar,
  logger,
  paginar,
  rangoSupabase,
  supabaseAdmin,
  supabaseAsUser,
  type EventoAuditoria,
  type UsuarioAutenticado,
} from '../../shared';
import { configuracionService, declaracionService, sniesService } from '../catalogos_configuracion';
import { encolarNotificacion } from '../notificaciones';
import { estaAbierta as estaAbiertaConvocatoria } from '../convocatorias/convocatorias.fechas';
import { cifrarNumero, enmascarar } from './datos-pago.service';
import { pesosEnLetras } from './numero-a-letras';
import { errorDesdeSql, validarTransicion } from './postulacion.state-machine';
import {
  aAdminDTO,
  aBeneficiarioDTO,
  historialParaAdmin,
  historialParaBeneficiario,
  type HistorialBeneficiarioItem,
  type PostulacionAdminDTO,
  type PostulacionBeneficiarioDTO,
} from './postulacion.serializer';
import { crearElegibilidadProvisional, type ElegibilidadPort } from './ports/elegibilidad.port';
import { validar as validarExpediente, type ResultadoValidacion } from './validacion.service';
import type {
  CrearPostulacionInput,
  DesistirPostulacionInput,
  EnviarPostulacionInput,
  GuardarPostulacionInput,
  ListadoAdminQuery,
  ListadoPropioQuery,
} from './postulaciones.dto';
import type {
  BeneficiarioRow,
  ConvocatoriaResumen,
  HistorialRow,
  OpcionesTransicion,
  PostulacionRow,
  ResultadoEnvio,
} from './postulaciones.types';

/** Contexto de auditoria tomado de la peticion (contextoDesdeRequest). */
export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const COLUMNAS_CONVOCATORIA = 'id, nombre, anio, semestre, estado, fecha_apertura, fecha_cierre_exclusiva';

// ---------------------------------------------------------------------------
// Puerto de elegibilidad (provisional P1; seguimiento_beneficios lo reemplazara)
// ---------------------------------------------------------------------------
let elegibilidadPort: ElegibilidadPort = crearElegibilidadProvisional(async (beneficiarioId, convocatoriaId) => {
  const { count, error } = await supabaseAdmin
    .from('postulacion')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', beneficiarioId)
    .eq('estado', 'APROBADA')
    .neq('convocatoria_id', convocatoriaId);
  if (error) throw AppError.interno(`No fue posible verificar la elegibilidad: ${error.message}`);
  return count ?? 0;
});

/** Permite a `seguimiento_beneficios` (o a las pruebas) inyectar la implementacion real. */
export function setElegibilidadPort(port: ElegibilidadPort): void {
  elegibilidadPort = port;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Estado operativo "abierta" (DECISIONES seccion 5), delegado al helper del modulo convocatorias. */
export function estaAbierta(c: Pick<ConvocatoriaResumen, 'estado' | 'fecha_apertura' | 'fecha_cierre_exclusiva'>, ahora = new Date()): boolean {
  return estaAbiertaConvocatoria(c as Parameters<typeof estaAbiertaConvocatoria>[0], ahora);
}

function exigirRol(user: UsuarioAutenticado, roles: Rol[]): void {
  if (!roles.includes(user.rol)) throw AppError.sinPermiso();
}

async function cargarBeneficiario(db: SupabaseClient, usuarioId: string): Promise<BeneficiarioRow | null> {
  const { data, error } = await db.from('beneficiario').select('*').eq('usuario_id', usuarioId).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar el perfil: ${error.message}`);
  return (data as BeneficiarioRow | null) ?? null;
}

/** Carga una postulacion propia (RLS + verificacion explicita). Ajena o inexistente -> 404. */
async function cargarPropia(user: UsuarioAutenticado, id: string): Promise<{ postulacion: PostulacionRow; beneficiario: BeneficiarioRow }> {
  const db = supabaseAsUser(user.token);
  const beneficiario = await cargarBeneficiario(db, user.id);
  if (!beneficiario) throw AppError.noEncontrado();
  const { data, error } = await db.from('postulacion').select('*').eq('id', id).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
  const p = data as PostulacionRow | null;
  if (!p || p.beneficiario_id !== beneficiario.id) throw AppError.noEncontrado();
  return { postulacion: p, beneficiario };
}

async function cargarConvocatoria(id: string): Promise<ConvocatoriaResumen | null> {
  const { data, error } = await supabaseAdmin.from('convocatoria').select(COLUMNAS_CONVOCATORIA).eq('id', id).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar la convocatoria: ${error.message}`);
  return (data as ConvocatoriaResumen | null) ?? null;
}

async function beneficiosOfertados(convocatoriaId: string): Promise<CodigoBeneficio[]> {
  const { data, error } = await supabaseAdmin
    .from('convocatoria_beneficio')
    .select('beneficio:beneficio_id (codigo)')
    .eq('convocatoria_id', convocatoriaId);
  if (error) throw AppError.interno(`No fue posible cargar los beneficios de la convocatoria: ${error.message}`);
  const codigos: CodigoBeneficio[] = [];
  for (const fila of (data ?? []) as Array<{ beneficio: { codigo: string } | { codigo: string }[] | null }>) {
    const b = Array.isArray(fila.beneficio) ? fila.beneficio[0] : fila.beneficio;
    if (b && (CODIGOS_BENEFICIO as readonly string[]).includes(b.codigo)) codigos.push(b.codigo as CodigoBeneficio);
  }
  return codigos;
}

async function cargarBeneficios(db: SupabaseClient, postulacionIds: string[]): Promise<Map<string, CodigoBeneficio[]>> {
  const mapa = new Map<string, CodigoBeneficio[]>();
  if (postulacionIds.length === 0) return mapa;
  const { data, error } = await db.from('postulacion_beneficio').select('postulacion_id, beneficio_codigo').in('postulacion_id', postulacionIds);
  if (error) throw AppError.interno(`No fue posible cargar los beneficios: ${error.message}`);
  for (const fila of (data ?? []) as Array<{ postulacion_id: string; beneficio_codigo: CodigoBeneficio }>) {
    const lista = mapa.get(fila.postulacion_id) ?? [];
    lista.push(fila.beneficio_codigo);
    mapa.set(fila.postulacion_id, lista);
  }
  return mapa;
}

async function reemplazarBeneficios(postulacionId: string, beneficios: CodigoBeneficio[]): Promise<void> {
  const { error: errDel } = await supabaseAdmin.from('postulacion_beneficio').delete().eq('postulacion_id', postulacionId);
  if (errDel) throw AppError.interno(`No fue posible actualizar los beneficios: ${errDel.message}`);
  if (beneficios.length === 0) return;
  const { error } = await supabaseAdmin
    .from('postulacion_beneficio')
    .insert(beneficios.map((b) => ({ postulacion_id: postulacionId, beneficio_codigo: b })));
  if (error) throw AppError.interno(`No fue posible guardar los beneficios: ${error.message}`);
}

async function convocatoriaConOferta(convocatoriaId: string): Promise<ConvocatoriaResumen | null> {
  const c = await cargarConvocatoria(convocatoriaId);
  if (!c) return null;
  return { ...c, beneficios_ofertados: await beneficiosOfertados(convocatoriaId) };
}

function esCampoObservado(camposObservados: string[], ruta: string): boolean {
  return camposObservados.some((c) => c === ruta || ruta.startsWith(`${c}.`) || c.startsWith(`${ruta}.`));
}

function errorSupabase(error: { code?: string; message: string }): AppError {
  if (error.code === '23505') return AppError.conflicto('POSTULACION_DUPLICADA', 'Ya existe una postulacion suya para esta convocatoria');
  return AppError.interno(`Operacion no completada: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------
export const postulacionService = {
  /** Convocatorias abiertas con sus beneficios ofertados (provisional hasta que exista el modulo convocatorias). */
  async convocatoriasAbiertas(user: UsuarioAutenticado): Promise<ConvocatoriaResumen[]> {
    exigirRol(user, ['BENEFICIARIO']);
    const ahora = new Date().toISOString();
    const { data, error } = await supabaseAsUser(user.token)
      .from('convocatoria')
      .select(COLUMNAS_CONVOCATORIA)
      .eq('estado', 'HABILITADA')
      .lte('fecha_apertura', ahora)
      .gt('fecha_cierre_exclusiva', ahora)
      .order('fecha_cierre_exclusiva');
    if (error) throw AppError.interno(`No fue posible consultar las convocatorias: ${error.message}`);
    const lista = (data ?? []) as ConvocatoriaResumen[];
    return Promise.all(lista.map(async (c) => ({ ...c, beneficios_ofertados: await beneficiosOfertados(c.id) })));
  },

  async crear(user: UsuarioAutenticado, ctx: ContextoAuditoria, input: CrearPostulacionInput): Promise<PostulacionBeneficiarioDTO> {
    exigirRol(user, ['BENEFICIARIO']);
    const db = supabaseAsUser(user.token);

    const beneficiario = await cargarBeneficiario(db, user.id);
    if (!beneficiario || !beneficiario.perfil_completo) {
      throw AppError.datosInvalidos('PERFIL_INCOMPLETO', 'Debe completar su perfil antes de crear una postulacion', {
        accion: 'Complete su perfil en Mi perfil',
      });
    }

    const convocatoria = await cargarConvocatoria(input.convocatoria_id);
    if (!convocatoria || !estaAbierta(convocatoria)) {
      throw AppError.datosInvalidos('CONVOCATORIA_NO_ABIERTA', 'La convocatoria no esta abierta para recibir postulaciones');
    }

    const elegibilidad = await elegibilidadPort.validar(beneficiario.id, convocatoria.id, input.tipo_solicitud);
    if (!elegibilidad.elegible) {
      throw AppError.datosInvalidos('TRAMITE_NO_ELEGIBLE', elegibilidad.motivo ?? 'El tramite solicitado no es elegible');
    }

    let beneficios: CodigoBeneficio[] = [];
    if (input.beneficios && input.beneficios.length > 0) {
      const ofertados = await beneficiosOfertados(convocatoria.id);
      const noOfertados = input.beneficios.filter((b) => !ofertados.includes(b));
      if (noOfertados.length > 0) {
        throw AppError.datosInvalidos('BENEFICIO_NO_OFERTADO', 'Algunos beneficios no estan ofertados en esta convocatoria', { beneficios: noOfertados });
      }
      beneficios = [...new Set(input.beneficios)];
    }

    const { data, error } = await supabaseAdmin
      .from('postulacion')
      .insert({
        beneficiario_id: beneficiario.id,
        convocatoria_id: convocatoria.id,
        tipo_solicitud: input.tipo_solicitud,
        estado: 'BORRADOR',
        datos_formulario: {},
      })
      .select('*')
      .single();
    if (error || !data) throw errorSupabase(error ?? { message: 'sin datos' });
    const p = data as PostulacionRow;

    if (beneficios.length > 0) await reemplazarBeneficios(p.id, beneficios);

    const { error: errHist } = await supabaseAdmin.from('historial_estado_postulacion').insert({
      postulacion_id: p.id,
      ciclo: 0,
      estado_anterior: null,
      estado_nuevo: 'BORRADOR',
      motivo: 'CREACION',
      actor_tipo: 'BENEFICIARIO',
      actor_id: user.id,
      observaciones: 'Creacion del borrador',
    });
    if (errHist) logger.warn({ err: errHist }, 'No fue posible registrar el historial de creacion');

    await auditar({
      ...ctx,
      accion: 'CREAR',
      entidad: 'POSTULACION',
      entidad_id: p.id,
      datos_despues: { convocatoria_id: p.convocatoria_id, tipo_solicitud: p.tipo_solicitud, estado: p.estado, beneficios },
    });

    return aBeneficiarioDTO(p, beneficios, await convocatoriaConOferta(p.convocatoria_id));
  },

  async guardar(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string, input: GuardarPostulacionInput): Promise<PostulacionBeneficiarioDTO> {
    exigirRol(user, ['BENEFICIARIO']);
    const { postulacion: p } = await cargarPropia(user, id);

    if (p.estado !== 'BORRADOR' && p.estado !== 'EN_CORRECCION') {
      throw AppError.conflicto('TRANSICION_INVALIDA', `La postulacion no es editable en estado ${p.estado}`);
    }
    if (p.version !== input.version) {
      throw AppError.conflicto('VERSION_CONFLICTO', 'La postulacion fue modificada en otra sesion; recargue para continuar', {
        version_actual: p.version,
      });
    }

    const enCorreccion = p.estado === 'EN_CORRECCION';
    const camposObservados = enCorreccion ? (p.correccion_vigente?.campos_observados ?? []).map(String) : [];

    if (enCorreccion) {
      if (p.fecha_limite_subsanacion && new Date(p.fecha_limite_subsanacion).getTime() < Date.now()) {
        throw AppError.conflicto('PLAZO_SUBSANACION_VENCIDO', 'El plazo para subsanar ya vencio');
      }
      if (input.beneficios) {
        throw AppError.datosInvalidos('CAMPO_NO_EDITABLE', 'Los beneficios solicitados no son editables en subsanacion');
      }
    } else {
      const convocatoria = await cargarConvocatoria(p.convocatoria_id);
      if (!convocatoria || !estaAbierta(convocatoria)) {
        throw AppError.datosInvalidos('CONVOCATORIA_NO_ABIERTA', 'La convocatoria ya no esta abierta; el borrador no puede editarse');
      }
    }

    const mapaBeneficios = await cargarBeneficios(supabaseAdmin, [p.id]);
    let beneficios = mapaBeneficios.get(p.id) ?? [];

    // --- Beneficios (solo BORRADOR) ---
    if (input.beneficios) {
      const ofertados = await beneficiosOfertados(p.convocatoria_id);
      const noOfertados = input.beneficios.filter((b) => !ofertados.includes(b));
      if (noOfertados.length > 0) {
        throw AppError.datosInvalidos('BENEFICIO_NO_OFERTADO', 'Algunos beneficios no estan ofertados en esta convocatoria', { beneficios: noOfertados });
      }
      beneficios = [...new Set(input.beneficios)];
    }

    // --- Formulario: fusion por seccion ---
    const actual = { ...(p.datos_formulario ?? {}) } as Record<string, Record<string, unknown>>;
    const entrante = (input.datos_formulario ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const seccionesTocadas: string[] = [];
    for (const [seccion, valores] of Object.entries(entrante)) {
      if (!valores) continue;
      if (enCorreccion) {
        for (const campo of Object.keys(valores)) {
          if (!esCampoObservado(camposObservados, `${seccion}.${campo}`)) {
            throw AppError.datosInvalidos('CAMPO_NO_EDITABLE', `El campo ${seccion}.${campo} no esta entre los observados`, {
              campos_observados: camposObservados,
            });
          }
        }
      }
      if (seccion === 'seccion_4' && 'snies_codigo' in valores) {
        await validarSniesSeccion4(valores.snies_codigo, valores.ies_codigo ?? actual.seccion_4?.ies_codigo);
      }
      actual[seccion] = { ...(actual[seccion] ?? {}), ...valores };
      seccionesTocadas.push(seccion);
    }

    // --- Valor de matricula en letras (siempre generado en servidor) ---
    const valorMatricula = actual.seccion_7?.valor_matricula;
    let valorLetras = p.valor_matricula_letras;
    if (typeof valorMatricula === 'number' && Number.isInteger(valorMatricula) && valorMatricula > 0) {
      valorLetras = pesosEnLetras(valorMatricula);
    } else if (actual.seccion_7 && valorMatricula === undefined) {
      valorLetras = null;
    }

    // --- Datos de pago del ST: cifrado a nivel de campo ---
    if (input.datos_pago) {
      if (enCorreccion && !esCampoObservado(camposObservados, 'seccion_8.datos_pago')) {
        throw AppError.datosInvalidos('CAMPO_NO_EDITABLE', 'Los datos de pago no estan entre los campos observados');
      }
      if (!beneficios.includes('ST')) {
        throw AppError.datosInvalidos('DATOS_INVALIDOS', 'Los datos de pago solo aplican si solicita el subsidio de transporte (ST)');
      }
      const cifrado = cifrarNumero(input.datos_pago.numero);
      const { error: errPago } = await supabaseAdmin.from('datos_pago_st').upsert(
        {
          postulacion_id: p.id,
          tipo: input.datos_pago.tipo,
          entidad: input.datos_pago.entidad,
          numero_cifrado: cifrado.numero_cifrado,
          ultimos4: cifrado.ultimos4,
          clave_version: cifrado.clave_version,
        },
        { onConflict: 'postulacion_id' },
      );
      if (errPago) throw AppError.interno(`No fue posible guardar los datos de pago: ${errPago.message}`);
      actual.seccion_8 = {
        ...(actual.seccion_8 ?? {}),
        datos_pago: { tipo: input.datos_pago.tipo, entidad: input.datos_pago.entidad, numero_enmascarado: enmascarar(cifrado.ultimos4) },
      };
      if (!seccionesTocadas.includes('seccion_8')) seccionesTocadas.push('seccion_8');
    }

    if (input.beneficios) await reemplazarBeneficios(p.id, beneficios);

    const { data, error } = await supabaseAdmin
      .from('postulacion')
      .update({ datos_formulario: actual, valor_matricula_letras: valorLetras, version: p.version + 1 })
      .eq('id', p.id)
      .eq('version', p.version)
      .select('*')
      .maybeSingle();
    if (error) throw AppError.interno(`No fue posible guardar la postulacion: ${error.message}`);
    if (!data) {
      throw AppError.conflicto('VERSION_CONFLICTO', 'La postulacion fue modificada en otra sesion; recargue para continuar');
    }
    const actualizada = data as PostulacionRow;

    await auditar({
      ...ctx,
      accion: enCorreccion ? 'EDITAR_CAMPOS_OBSERVADOS' : 'ACTUALIZAR',
      entidad: 'POSTULACION',
      entidad_id: p.id,
      metadatos: { secciones: seccionesTocadas, beneficios: input.beneficios ? beneficios : undefined, version: actualizada.version },
    });

    return aBeneficiarioDTO(actualizada, beneficios, await convocatoriaConOferta(p.convocatoria_id));
  },

  async eliminarBorrador(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string): Promise<void> {
    exigirRol(user, ['BENEFICIARIO']);
    const { postulacion: p } = await cargarPropia(user, id);
    if (p.estado !== 'BORRADOR') {
      throw AppError.conflicto('TRANSICION_INVALIDA', 'Solo se puede eliminar una postulacion en borrador');
    }
    // TODO(documentos, formatos_oficiales): purga de soportes y formatos asociados.
    const { error } = await supabaseAdmin.from('postulacion').delete().eq('id', p.id).eq('estado', 'BORRADOR');
    if (error) throw AppError.interno(`No fue posible eliminar el borrador: ${error.message}`);
    await auditar({
      ...ctx,
      accion: 'POSTULACION_BORRADOR_ELIMINADO',
      entidad: 'POSTULACION',
      entidad_id: p.id,
      datos_antes: { convocatoria_id: p.convocatoria_id, tipo_solicitud: p.tipo_solicitud, estado: p.estado },
    });
  },

  async listarPropias(user: UsuarioAutenticado, query: ListadoPropioQuery): Promise<Paginado<PostulacionBeneficiarioDTO>> {
    exigirRol(user, ['BENEFICIARIO']);
    const db = supabaseAsUser(user.token);
    const { desde, hasta } = rangoSupabase(query);
    const { data, error, count } = await db
      .from('postulacion')
      .select(`*, convocatoria:convocatoria_id (${COLUMNAS_CONVOCATORIA})`, { count: 'exact' })
      .order('creado_en', { ascending: false })
      .range(desde, hasta);
    if (error) throw AppError.interno(`No fue posible consultar sus postulaciones: ${error.message}`);
    const filas = (data ?? []) as Array<PostulacionRow & { convocatoria: ConvocatoriaResumen | null }>;
    const beneficios = await cargarBeneficios(db, filas.map((f) => f.id));
    return paginar(
      filas.map((f) => aBeneficiarioDTO(f, beneficios.get(f.id) ?? [], f.convocatoria ?? null)),
      query,
      count ?? 0,
    );
  },

  async listarAdmin(user: UsuarioAutenticado, ctx: ContextoAuditoria, query: ListadoAdminQuery): Promise<Paginado<PostulacionAdminDTO>> {
    exigirRol(user, ['ADMINISTRADOR']);
    const { desde, hasta } = rangoSupabase(query);
    let consulta = supabaseAdmin
      .from('postulacion')
      .select(
        `*, convocatoria:convocatoria_id (${COLUMNAS_CONVOCATORIA}), beneficiario:beneficiario_id!inner (id, nombres, apellidos, tipo_documento, numero_documento)`,
        { count: 'exact' },
      );
    if (query.convocatoria_id) consulta = consulta.eq('convocatoria_id', query.convocatoria_id);
    if (query.estado) consulta = consulta.eq('estado', query.estado);
    if (query.tipo_solicitud) consulta = consulta.eq('tipo_solicitud', query.tipo_solicitud);
    if (query.q) {
      const q = query.q.replace(/[%,()]/g, ' ').trim();
      if (q) {
        consulta = consulta.or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,numero_documento.ilike.%${q}%`, { referencedTable: 'beneficiario' });
      }
    }
    const { data, error, count } = await consulta.order('creado_en', { ascending: false }).range(desde, hasta);
    if (error) throw AppError.interno(`No fue posible consultar las postulaciones: ${error.message}`);
    const filas = (data ?? []) as Array<PostulacionRow & { convocatoria: ConvocatoriaResumen | null; beneficiario: PostulacionAdminDTO['beneficiario'] }>;
    const beneficios = await cargarBeneficios(supabaseAdmin, filas.map((f) => f.id));

    await auditar({
      ...ctx,
      accion: 'LISTADO_POSTULACIONES',
      entidad: 'POSTULACION',
      metadatos: { filtros: { convocatoria_id: query.convocatoria_id, estado: query.estado, tipo_solicitud: query.tipo_solicitud, q: query.q }, page: query.page },
    });

    return paginar(
      filas.map((f) => aAdminDTO(f, beneficios.get(f.id) ?? [], f.convocatoria ?? null, f.beneficiario ?? null)),
      query,
      count ?? 0,
    );
  },

  /** Detalle: beneficiario (propia, sin actor) o administrador (lectura auditada). FUNCIONARIO -> 403 (seccion 18). */
  async obtener(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string): Promise<PostulacionBeneficiarioDTO | PostulacionAdminDTO> {
    exigirRol(user, ['BENEFICIARIO', 'ADMINISTRADOR']);
    if (user.rol === 'BENEFICIARIO') {
      const { postulacion: p } = await cargarPropia(user, id);
      const beneficios = await cargarBeneficios(supabaseAdmin, [p.id]);
      return aBeneficiarioDTO(p, beneficios.get(p.id) ?? [], await convocatoriaConOferta(p.convocatoria_id));
    }
    const { data, error } = await supabaseAdmin
      .from('postulacion')
      .select(`*, convocatoria:convocatoria_id (${COLUMNAS_CONVOCATORIA}), beneficiario:beneficiario_id (id, nombres, apellidos, tipo_documento, numero_documento)`)
      .eq('id', id)
      .maybeSingle();
    if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
    if (!data) throw AppError.noEncontrado();
    const p = data as PostulacionRow & { convocatoria: ConvocatoriaResumen | null; beneficiario: PostulacionAdminDTO['beneficiario'] };
    const beneficios = await cargarBeneficios(supabaseAdmin, [p.id]);
    await auditar({ ...ctx, accion: 'LECTURA_SENSIBLE', entidad: 'POSTULACION', entidad_id: p.id, metadatos: { vista: 'detalle_admin' } });
    return aAdminDTO(p, beneficios.get(p.id) ?? [], p.convocatoria ?? null, p.beneficiario ?? null);
  },

  async validacion(user: UsuarioAutenticado, id: string): Promise<ResultadoValidacion> {
    exigirRol(user, ['BENEFICIARIO']);
    const { postulacion: p, beneficiario } = await cargarPropia(user, id);
    const beneficios = await cargarBeneficios(supabaseAdmin, [p.id]);
    return validarExpediente(supabaseAdmin, p, beneficios.get(p.id) ?? [], beneficiario.perfil_completo);
  },

  async enviar(
    user: UsuarioAutenticado,
    ctx: ContextoAuditoria,
    id: string,
    input: EnviarPostulacionInput,
    idempotencyKey: string | undefined,
  ): Promise<ResultadoEnvio & { postulacion: PostulacionBeneficiarioDTO }> {
    return ejecutarEnvio(user, ctx, id, input, idempotencyKey, 'ENVIO');
  },

  async subsanar(
    user: UsuarioAutenticado,
    ctx: ContextoAuditoria,
    id: string,
    input: EnviarPostulacionInput,
    idempotencyKey: string | undefined,
  ): Promise<ResultadoEnvio & { postulacion: PostulacionBeneficiarioDTO }> {
    return ejecutarEnvio(user, ctx, id, input, idempotencyKey, 'SUBSANACION');
  },

  async desistir(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string, input: DesistirPostulacionInput): Promise<PostulacionBeneficiarioDTO> {
    exigirRol(user, ['BENEFICIARIO']);
    const { postulacion: p } = await cargarPropia(user, id);
    if (!ESTADOS_DESISTIBLES.includes(p.estado)) {
      throw AppError.conflicto('TRANSICION_INVALIDA', `No es posible desistir desde el estado ${p.estado}`);
    }
    const actualizada = await postulacionService.transicionar(p.id, 'DESISTIDA', {
      actor: { tipo: 'BENEFICIARIO', id: user.id },
      motivo: 'DESISTIMIENTO',
      observaciones: input.motivo ?? null,
      versionEsperada: input.version ?? null,
      contexto: { ip: ctx.ip, user_agent: ctx.user_agent, request_id: ctx.request_id, actor_rol: 'BENEFICIARIO' },
    });
    // TODO(asignaciones): evento interno POSTULACION_DESISTIDA para liberar la asignacion ACTIVA.
    const beneficios = await cargarBeneficios(supabaseAdmin, [p.id]);
    return aBeneficiarioDTO(actualizada, beneficios.get(p.id) ?? [], await convocatoriaConOferta(p.convocatoria_id));
  },

  async historial(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string): Promise<HistorialBeneficiarioItem[] | HistorialRow[]> {
    exigirRol(user, ['BENEFICIARIO', 'ADMINISTRADOR']);
    let postulacionId = id;
    if (user.rol === 'BENEFICIARIO') {
      const { postulacion } = await cargarPropia(user, id);
      postulacionId = postulacion.id;
    } else {
      const { data, error } = await supabaseAdmin.from('postulacion').select('id').eq('id', id).maybeSingle();
      if (error) throw AppError.interno(error.message);
      if (!data) throw AppError.noEncontrado();
    }
    const { data, error } = await supabaseAdmin
      .from('historial_estado_postulacion')
      .select('*')
      .eq('postulacion_id', postulacionId)
      .order('cambiado_en', { ascending: true });
    if (error) throw AppError.interno(`No fue posible consultar el historial: ${error.message}`);
    const filas = (data ?? []) as HistorialRow[];
    if (user.rol === 'ADMINISTRADOR') {
      await auditar({ ...ctx, accion: 'LECTURA_SENSIBLE', entidad: 'POSTULACION', entidad_id: postulacionId, metadatos: { vista: 'historial_admin' } });
      return historialParaAdmin(filas);
    }
    return historialParaBeneficiario(filas);
  },

  /**
   * UNICO punto de cambio de estado (DECISIONES seccion 4). Lo usan desistir, el job de
   * vencimiento y los modulos `evaluacion` / `asignaciones`.
   * Valida la tabla de transiciones y delega la escritura atomica (FOR UPDATE, version,
   * historial, notificacion) a `fn_transicionar_postulacion`.
   */
  async transicionar(id: string, estadoNuevo: EstadoPostulacion, opciones: OpcionesTransicion): Promise<PostulacionRow> {
    const { data: actual, error: errLeer } = await supabaseAdmin.from('postulacion').select('id, estado, version').eq('id', id).maybeSingle();
    if (errLeer) throw AppError.interno(`No fue posible leer la postulacion: ${errLeer.message}`);
    if (!actual) throw AppError.noEncontrado();
    const fila = actual as Pick<PostulacionRow, 'id' | 'estado' | 'version'>;

    validarTransicion(fila.estado, estadoNuevo, opciones.motivo, opciones.actor);
    if (opciones.versionEsperada != null && opciones.versionEsperada !== fila.version) {
      throw AppError.conflicto('VERSION_CONFLICTO', 'La postulacion fue modificada; recargue para continuar', { version_actual: fila.version });
    }

    const { data, error } = await supabaseAdmin.rpc('fn_transicionar_postulacion', {
      p_postulacion_id: id,
      p_estado_nuevo: estadoNuevo,
      p_motivo: opciones.motivo,
      p_actor_tipo: opciones.actor.tipo,
      p_actor_id: opciones.actor.id ?? null,
      p_observaciones: opciones.observaciones ?? null,
      p_version_esperada: opciones.versionEsperada ?? null,
      p_payload: opciones.payload ?? {},
    });
    if (error) throw errorDesdeSql(error.message);
    const actualizada = data as PostulacionRow;

    await auditar({
      actor_id: opciones.actor.id ?? null,
      actor_tipo: opciones.actor.tipo === 'SISTEMA' ? 'SISTEMA' : 'USUARIO',
      actor_rol: opciones.contexto?.actor_rol ?? (opciones.actor.tipo === 'SISTEMA' ? null : opciones.actor.tipo),
      ip: opciones.contexto?.ip ?? null,
      user_agent: opciones.contexto?.user_agent ?? null,
      request_id: opciones.contexto?.request_id ?? null,
      accion: 'TRANSICION_ESTADO',
      entidad: 'POSTULACION',
      entidad_id: id,
      datos_antes: { estado: fila.estado, version: fila.version },
      datos_despues: { estado: estadoNuevo, version: actualizada.version, motivo: opciones.motivo },
      metadatos: { observaciones: opciones.observaciones ?? null },
    });

    return actualizada;
  },
};

export type { PostulacionRow };

/**
 * Valida el codigo SNIES de la seccion 4 contra el catalogo. Si la tabla aun no existe o esta
 * vacia (catalogo sin importar) no bloquea y solo registra un warning; si el catalogo tiene
 * datos y el codigo no figura como programa activo -> 422 SNIES_INVALIDO.
 */
async function validarSniesSeccion4(codigo: unknown, codigoIes?: unknown): Promise<void> {
  if (typeof codigo !== 'string' || codigo.trim() === '') return;
  let existe: boolean;
  try {
    existe = await sniesService.existeProgramaActivo(codigo.trim(), typeof codigoIes === 'string' && codigoIes ? codigoIes : undefined);
  } catch (e) {
    logger.warn({ err: e }, 'Catalogo SNIES no disponible; no se valida el codigo SNIES');
    return;
  }
  if (existe) return;
  const { count, error } = await supabaseAdmin.from('programa_snies').select('codigo_snies', { count: 'exact', head: true });
  if (error || !count) {
    logger.warn({ err: error }, 'Catalogo SNIES vacio; no se valida el codigo SNIES');
    return;
  }
  throw AppError.datosInvalidos('SNIES_INVALIDO', 'El codigo SNIES no corresponde a un programa activo del catalogo', { campo: 'seccion_4.snies_codigo' });
}

async function ejecutarEnvio(
  user: UsuarioAutenticado,
  ctx: ContextoAuditoria,
  id: string,
  input: EnviarPostulacionInput,
  idempotencyKey: string | undefined,
  modo: 'ENVIO' | 'SUBSANACION',
): Promise<ResultadoEnvio & { postulacion: PostulacionBeneficiarioDTO }> {
  exigirRol(user, ['BENEFICIARIO']);
  const { postulacion: p, beneficiario } = await cargarPropia(user, id);
  const mapaBeneficios = await cargarBeneficios(supabaseAdmin, [p.id]);
  const beneficios = mapaBeneficios.get(p.id) ?? [];

  const llave = idempotencyKey?.trim() || null;

  // Repeticion con la misma llave: resultado identico sin revalidar (idempotencia).
  if (llave) {
    const { data: previo } = await supabaseAdmin
      .from('postulacion_envio')
      .select('ciclo, hash_envio, enviado_en')
      .eq('postulacion_id', p.id)
      .eq('idempotency_key', llave)
      .maybeSingle();
    if (previo) {
      const e = previo as { ciclo: number; hash_envio: string; enviado_en: string };
      return {
        postulacion_id: p.id,
        estado: p.estado,
        ciclo: e.ciclo,
        version: p.version,
        hash_envio: e.hash_envio,
        enviado_en: e.enviado_en,
        repetido: true,
        postulacion: aBeneficiarioDTO(p, beneficios, await convocatoriaConOferta(p.convocatoria_id)),
      };
    }
  }

  if (modo === 'ENVIO') {
    if (p.estado !== 'BORRADOR') throw AppError.conflicto('TRANSICION_INVALIDA', `Solo se envia desde BORRADOR (estado actual ${p.estado})`);
    const convocatoria = await cargarConvocatoria(p.convocatoria_id);
    if (!convocatoria || !estaAbierta(convocatoria)) {
      throw AppError.datosInvalidos('CONVOCATORIA_NO_ABIERTA', 'La convocatoria ya no esta abierta; no es posible enviar');
    }
  } else {
    if (p.estado !== 'EN_CORRECCION') throw AppError.conflicto('TRANSICION_INVALIDA', `Solo se subsana desde EN_CORRECCION (estado actual ${p.estado})`);
    if (p.fecha_limite_subsanacion && new Date(p.fecha_limite_subsanacion).getTime() < Date.now()) {
      throw AppError.conflicto('PLAZO_SUBSANACION_VENCIDO', 'El plazo para subsanar ya vencio');
    }
  }
  if (input.version != null && input.version !== p.version) {
    throw AppError.conflicto('VERSION_CONFLICTO', 'La postulacion fue modificada; recargue para continuar', { version_actual: p.version });
  }
  if (!beneficiario.perfil_completo) {
    throw AppError.datosInvalidos('PERFIL_INCOMPLETO', 'Debe completar su perfil antes de enviar');
  }

  // Bloqueo opcional hasta cargar el texto oficial GE-F041 (DECISIONES 18); apagado por defecto.
  if (await configuracionService.getBool('BLOQUEAR_ENVIO_SIN_TEXTO_OFICIAL', false)) {
    if (await declaracionService.hayDeclaracionesSinTextoOficial()) {
      throw AppError.datosInvalidos('DECLARACIONES_SIN_TEXTO_OFICIAL', 'Las declaraciones aun no tienen el texto oficial confirmado; el envio esta bloqueado');
    }
  }

  const resultado = await validarExpediente(
    supabaseAdmin,
    p,
    beneficios,
    beneficiario.perfil_completo,
    input.declaraciones_aceptadas.length > 0 ? input.declaraciones_aceptadas : undefined,
  );
  if (!resultado.completo) {
    throw AppError.datosInvalidos('EXPEDIENTE_INCOMPLETO', 'El expediente tiene pendientes; revise la validacion', {
      errores: resultado.errores,
      campos_faltantes: resultado.campos_faltantes,
      declaraciones_pendientes: resultado.declaraciones.pendientes,
    });
  }

  const declaraciones = resultado.declaraciones.vigentes.map((d) => ({ codigo: d.codigo, version: d.version, aceptada: true }));

  const { data, error } = await supabaseAdmin.rpc('fn_enviar_postulacion', {
    p_postulacion_id: p.id,
    p_actor_id: user.id,
    p_idempotency_key: llave,
    p_declaraciones: declaraciones,
    p_modo: modo,
  });
  if (error) throw errorDesdeSql(error.message);
  const r = data as ResultadoEnvio;

  // La auditoria del envio la escribe la funcion SQL en la misma transaccion; aqui se
  // registra ademas el contexto HTTP (ip, user agent, request id).
  await auditar({
    ...ctx,
    accion: modo === 'ENVIO' ? 'ENVIAR_CONTEXTO' : 'SUBSANAR_CONTEXTO',
    entidad: 'POSTULACION',
    entidad_id: p.id,
    metadatos: { ciclo: r.ciclo, idempotency_key: llave, repetido: r.repetido },
  });
  // Correo via outbox. El buzon in-app ya lo creo fn_enviar_postulacion con la misma clave_dedup,
  // por eso canal 'CORREO' (no duplica la notificacion). El tipo SUBSANADA no existe en el
  // catalogo cerrado: se usa POSTULACION_ENVIADA con texto propio.
  if (!r.repetido) {
    try {
      const conv = await cargarConvocatoria(p.convocatoria_id);
      await encolarNotificacion({
        usuario_id: user.id,
        tipo: 'POSTULACION_ENVIADA',
        titulo: modo === 'ENVIO' ? 'Postulacion enviada' : 'Subsanacion enviada',
        mensaje:
          modo === 'ENVIO'
            ? `Su postulacion fue recibida (ciclo ${r.ciclo}). Sera revisada por el Comite FOEST.`
            : `Su subsanacion fue recibida (ciclo ${r.ciclo}). Sera revisada por el Comite FOEST.`,
        entidad: 'POSTULACION',
        entidad_id: p.id,
        url_destino: `/beneficiario/postulaciones/${p.id}`,
        clave_dedup: `POSTULACION_ENVIADA:${p.id}:${r.ciclo}`,
        canal: 'CORREO',
        correo: true,
        payload: { ciclo: r.ciclo, ...(conv?.nombre ? { convocatoria_nombre: conv.nombre } : {}) },
      });
    } catch (e) {
      logger.warn({ err: e, postulacion: p.id }, 'No fue posible encolar el correo del envio');
    }
  }

  const { data: actualizada } = await supabaseAdmin.from('postulacion').select('*').eq('id', p.id).maybeSingle();
  const fila = (actualizada as PostulacionRow | null) ?? { ...p, estado: r.estado, ciclo: r.ciclo, version: r.version };
  return { ...r, postulacion: aBeneficiarioDTO(fila, beneficios, await convocatoriaConOferta(p.convocatoria_id)) };
}
