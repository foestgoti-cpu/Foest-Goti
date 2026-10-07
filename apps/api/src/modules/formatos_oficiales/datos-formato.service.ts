import { BENEFICIOS_CATALOGO, TipoFormato, seccionesAplicables, type CodigoBeneficio, type SeccionFormulario, type TipoSolicitud } from '@foest/shared';
import { AppError, supabaseAdmin } from '../../shared';
import { configuracionService } from '../catalogos_configuracion';
import { camposFaltantes } from '../postulaciones/validacion.service';
import { hashContenidoService } from './hash-contenido';
import {
  VERSION_PLANTILLA,
  type AcudienteDatos,
  type ContextoFormato,
  type DatosFormato,
  type DeclaracionImpresa,
  type PerfilEfectivo,
} from './formato.types';

/**
 * Lectura de los datos efectivos de la postulacion (solo lectura) y construccion de lo que se
 * hashea y se imprime en cada formato (docs/modules/formatos_oficiales.md, "hash_contenido").
 */

type Obj = Record<string, unknown>;

const TIPO_SOLICITUD_TEXTO: Record<string, string> = {
  PRIMERA_VEZ: 'Primera vez',
  RENOVACION: 'Renovación',
  REINTEGRO: 'Reintegro',
};
const TIPO_DOC_TEXTO: Record<string, string> = {
  CC: 'Cédula de ciudadanía',
  TI: 'Tarjeta de identidad',
  CE: 'Cédula de extranjería',
  PS: 'Pasaporte',
};
const SITUACION_TEXTO: Record<string, string> = {
  EMPLEADO: 'Empleado',
  INDEPENDIENTE: 'Independiente',
  DESEMPLEADO: 'Desempleado',
  SOLO_ESTUDIA: 'Solo estudia',
};
const MODALIDAD_TEXTO: Record<string, string> = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  DISTANCIA: 'A distancia',
  HIBRIDA: 'Híbrida',
};
const TIPO_PAGO_TEXTO: Record<string, string> = { CUENTA_BANCARIA: 'Cuenta bancaria', BILLETERA: 'Billetera digital' };

const TITULOS_SECCION = {
  seccion_1: 'Identificación del solicitante',
  seccion_2: 'Selección de beneficios',
  seccion_3: 'Hogar y situación personal',
  seccion_4: 'Programa de educación superior',
  seccion_5: 'Educación media',
  seccion_6: 'Desempeño académico',
  seccion_7: 'Matrícula',
  seccion_8: 'Subsidio de transporte',
  seccion_9: 'Declaraciones juramentadas',
} as const;

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

export function formatearFecha(valor: string | null | undefined): string {
  if (!valor) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}

export function formatearPesos(valor: number | null): string {
  if (valor === null) return '';
  return `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(valor)} COP`;
}

function aPerfil(origen: Obj, correoPrincipal: string | null): PerfilEfectivo {
  const ac = origen.acudiente && typeof origen.acudiente === 'object' ? (origen.acudiente as Obj) : null;
  const acudiente: AcudienteDatos | null = ac
    ? {
        tipo_documento: txt(ac.tipo_documento),
        numero_documento: txt(ac.numero_documento),
        nombres: txt(ac.nombres),
        apellidos: txt(ac.apellidos),
        parentesco: txt(ac.parentesco),
        celular: txt(ac.celular),
        correo: txt(ac.correo),
      }
    : null;
  return {
    tipo_documento: txt(origen.tipo_documento),
    numero_documento: txt(origen.numero_documento),
    expedido_en: txt(origen.expedido_en),
    nombres: txt(origen.nombres),
    apellidos: txt(origen.apellidos),
    fecha_nacimiento: txt(origen.fecha_nacimiento),
    es_menor: origen.es_menor === true,
    genero: txt(origen.genero),
    estado_civil: txt(origen.estado_civil),
    direccion: txt(origen.direccion),
    sector: txt(origen.sector),
    celular_1: txt(origen.celular_1),
    celular_2: txt(origen.celular_2),
    correo_principal: txt(origen.correo_principal) ?? correoPrincipal,
    correo_notificacion_2: txt(origen.correo_notificacion_2),
    estrato: num(origen.estrato),
    sisben_categoria: txt(origen.sisben_categoria),
    sisben_puntaje: num(origen.sisben_puntaje),
    acudiente,
  };
}

/** Lee todo lo necesario de una postulacion. `null` si no existe. */
export async function cargarContexto(postulacionId: string): Promise<ContextoFormato | null> {
  const { data: p, error } = await supabaseAdmin.from('postulacion').select('*').eq('id', postulacionId).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
  if (!p) return null;
  const post = p as ContextoFormato['postulacion'];

  const [benef, conv, benes, decl] = await Promise.all([
    supabaseAdmin.from('beneficiario').select('*').eq('id', post.beneficiario_id).maybeSingle(),
    supabaseAdmin.from('convocatoria').select('anio, semestre, nombre').eq('id', post.convocatoria_id).maybeSingle(),
    supabaseAdmin.from('postulacion_beneficio').select('beneficio_codigo').eq('postulacion_id', post.id),
    supabaseAdmin.from('declaracion_juramentada').select('codigo, version, titulo, texto').eq('vigente', true).order('codigo'),
  ]);
  if (benef.error || !benef.data) throw AppError.interno('No fue posible cargar el perfil del beneficiario');
  if (conv.error || !conv.data) throw AppError.interno('No fue posible cargar la convocatoria');
  const b = benef.data as Obj;
  const beneficiario = {
    id: b.id as string,
    usuario_id: b.usuario_id as string,
    perfil_completo: b.perfil_completo === true,
    es_menor: b.es_menor === true,
  };

  const { data: usuario } = await supabaseAdmin.from('usuario').select('email').eq('id', beneficiario.usuario_id).maybeSingle();
  const correo = txt((usuario as Obj | null)?.email);

  // Perfil efectivo: BORRADOR -> perfil vigente; otros -> ultimo snapshot (+ correcciones pendientes en EN_CORRECCION).
  let perfilOrigen: Obj | null = null;
  if (post.estado !== 'BORRADOR') {
    const { data: envio } = await supabaseAdmin
      .from('postulacion_envio')
      .select('perfil_snapshot')
      .eq('postulacion_id', post.id)
      .order('ciclo', { ascending: false })
      .limit(1)
      .maybeSingle();
    const snap = (envio as Obj | null)?.perfil_snapshot;
    if (snap && typeof snap === 'object') {
      perfilOrigen = { ...(snap as Obj) };
      if (post.estado === 'EN_CORRECCION' && post.correcciones_perfil) Object.assign(perfilOrigen, post.correcciones_perfil);
    }
  }
  if (!perfilOrigen) {
    const { data: ac } = await supabaseAdmin.from('acudiente').select('*').eq('beneficiario_id', beneficiario.id).maybeSingle();
    perfilOrigen = { ...b, acudiente: ac ?? null };
  }
  const perfil = aPerfil(perfilOrigen, correo);

  // Programa e institucion: del catalogo SNIES cuando el codigo existe; si no, lo declarado.
  const s4 = obj(post.datos_formulario?.seccion_4);
  let institucion = txt(s4.institucion);
  let programa = txt(s4.programa);
  const codigoPrograma = txt(s4.snies_codigo);
  if (codigoPrograma) {
    const { data: prog } = await supabaseAdmin.from('programa_snies').select('nombre, ies_codigo').eq('codigo_snies', codigoPrograma).maybeSingle();
    if (prog) {
      programa = txt((prog as Obj).nombre) ?? programa;
      const { data: ies } = await supabaseAdmin.from('ies_snies').select('nombre').eq('codigo_snies', (prog as Obj).ies_codigo as string).maybeSingle();
      institucion = txt((ies as Obj | null)?.nombre) ?? institucion;
    }
  }

  return {
    postulacion: post,
    convocatoria: conv.data as ContextoFormato['convocatoria'],
    beneficios: ((benes.data ?? []) as Array<{ beneficio_codigo: string }>).map((x) => x.beneficio_codigo).sort(),
    beneficiario,
    perfil,
    declaraciones: ((decl.data ?? []) as DeclaracionImpresa[]).map((d) => ({ codigo: d.codigo, version: d.version, titulo: d.titulo, texto: d.texto })),
    programa: { institucion, programa },
    pagareRequiereCodeudorMenores: await configuracionService.getBool('PAGARE_REQUIERE_CODEUDOR_MENORES', false),
  };
}

function nombreCompleto(p: PerfilEfectivo): string {
  return [p.nombres, p.apellidos].filter(Boolean).join(' ');
}

function acudienteCompleto(a: AcudienteDatos | null): boolean {
  return Boolean(a && a.nombres && a.numero_documento);
}

/** El bloque de codeudor/acudiente aplica si el beneficiario es menor y la politica esta activa. */
export function requiereBloqueCodeudor(ctx: ContextoFormato): boolean {
  return ctx.perfil.es_menor && ctx.pagareRequiereCodeudorMenores;
}

/** Indica si la postulacion admite generar formatos nuevos (BORRADOR o EN_CORRECCION dentro de plazo). */
export function admiteGeneracion(ctx: ContextoFormato, ahora = new Date()): boolean {
  const p = ctx.postulacion;
  if (p.estado === 'BORRADOR') return true;
  if (p.estado !== 'EN_CORRECCION') return false;
  return !p.fecha_limite_subsanacion || new Date(p.fecha_limite_subsanacion).getTime() >= ahora.getTime();
}

/** Validaciones previas a generar (los errores de dominio propios del modulo). */
export function validarGeneracion(ctx: ContextoFormato, tipo: TipoFormato, ahora = new Date()): void {
  const { postulacion: p } = ctx;
  if (!admiteGeneracion(ctx, ahora)) {
    throw AppError.conflicto(
      'GENERACION_NO_PERMITIDA',
      'Solo es posible generar formatos en borrador o en corrección dentro del plazo; en otros estados solo puede descargar los existentes',
      { estado: p.estado },
    );
  }
  if (!ctx.beneficiario.perfil_completo) {
    throw AppError.datosInvalidos('PERFIL_INCOMPLETO', 'Debe completar su perfil antes de generar los formatos');
  }
  if (tipo === TipoFormato.GE_F041) {
    const beneficios = ctx.beneficios as CodigoBeneficio[];
    const { faltantes } = camposFaltantes(p.tipo_solicitud as TipoSolicitud, beneficios, p.datos_formulario ?? {});
    if (faltantes.length > 0) {
      throw AppError.datosInvalidos('FORMULARIO_INCOMPLETO', 'Complete el formulario de postulación antes de generar el GE-F041', {
        campos_faltantes: faltantes,
      });
    }
  } else if (requiereBloqueCodeudor(ctx) && !acudienteCompleto(ctx.perfil.acudiente)) {
    throw AppError.datosInvalidos('ACUDIENTE_REQUERIDO', 'Debe registrar los datos de su acudiente en el perfil para generar el pagaré');
  }
}

function formularioParaHash(datos: Obj): Obj {
  const resto: Obj = { ...datos };
  delete resto.seccion_9;
  if (resto.seccion_8) {
    const s8 = obj(resto.seccion_8);
    const dp = obj(s8.datos_pago);
    resto.seccion_8 = { ...s8, datos_pago: { tipo: dp.tipo ?? null, entidad: dp.entidad ?? null, numero_enmascarado: dp.numero_enmascarado ?? null } };
  }
  return resto;
}

type Fila = { etiqueta: string; valor: string };
type SeccionVista = { numero: number; titulo: string; filas: Fila[] };

function fila(etiqueta: string, valor: unknown): Fila {
  const v = valor === null || valor === undefined ? '' : String(valor);
  return { etiqueta, valor: v };
}

function construirVistaF041(ctx: ContextoFormato): SeccionVista[] {
  const per = ctx.perfil;
  const d = ctx.postulacion.datos_formulario ?? {};
  const aplicables = new Set<SeccionFormulario>(seccionesAplicables(ctx.postulacion.tipo_solicitud as TipoSolicitud, ctx.beneficios as CodigoBeneficio[]));
  const secciones: SeccionVista[] = [];

  secciones.push({
    numero: 1,
    titulo: TITULOS_SECCION.seccion_1,
    filas: [
      fila('Tipo de documento', TIPO_DOC_TEXTO[per.tipo_documento ?? ''] ?? per.tipo_documento),
      fila('Número de documento', per.numero_documento),
      fila('Lugar de expedición', per.expedido_en),
      fila('Nombres', per.nombres),
      fila('Apellidos', per.apellidos),
      fila('Fecha de nacimiento', formatearFecha(per.fecha_nacimiento)),
      fila('Género', per.genero),
      fila('Estado civil', per.estado_civil),
      fila('Dirección', per.direccion),
      fila('Sector', per.sector),
      fila('Celular principal', per.celular_1),
      fila('Celular alterno', per.celular_2),
      fila('Correo electrónico', per.correo_principal),
      fila('Correo alterno', per.correo_notificacion_2),
      fila('Estrato', per.estrato),
      fila('Categoría SISBEN', per.sisben_categoria),
      fila('Puntaje SISBEN', per.sisben_puntaje),
    ],
  });

  secciones.push({
    numero: 2,
    titulo: TITULOS_SECCION.seccion_2,
    filas: [
      fila('Trámite', TIPO_SOLICITUD_TEXTO[ctx.postulacion.tipo_solicitud] ?? ctx.postulacion.tipo_solicitud),
      fila('Convocatoria', `${ctx.convocatoria.nombre} (${ctx.convocatoria.anio}-${ctx.convocatoria.semestre})`),
      ...ctx.beneficios.map((c) => fila(c, BENEFICIOS_CATALOGO.find((x) => x.codigo === c)?.nombre ?? c)),
    ],
  });

  const s3 = obj(d.seccion_3);
  const emer = obj(s3.contacto_emergencia);
  secciones.push({
    numero: 3,
    titulo: TITULOS_SECCION.seccion_3,
    filas: [
      fila('Personas a cargo', s3.personas_a_cargo),
      fila('Situación laboral', SITUACION_TEXTO[String(s3.situacion_laboral)] ?? s3.situacion_laboral),
      fila('Contacto de emergencia', emer.nombre),
      fila('Parentesco', emer.parentesco),
      fila('Teléfono de emergencia', emer.telefono),
    ],
  });

  const s4 = obj(d.seccion_4);
  secciones.push({
    numero: 4,
    titulo: TITULOS_SECCION.seccion_4,
    filas: [
      fila('Código SNIES del programa', s4.snies_codigo),
      fila('Institución de educación superior', ctx.programa.institucion),
      fila('Programa', ctx.programa.programa),
      fila('Semestre', s4.semestre),
      fila('Modalidad', MODALIDAD_TEXTO[String(s4.modalidad)] ?? s4.modalidad),
    ],
  });

  if (aplicables.has('seccion_5')) {
    const s5 = obj(d.seccion_5);
    secciones.push({
      numero: 5,
      titulo: TITULOS_SECCION.seccion_5,
      filas: [fila('Colegio', s5.colegio), fila('Año de graduación', s5.anio_graduacion), fila('Registro Saber 11', s5.registro_saber11)],
    });
  }
  if (aplicables.has('seccion_6')) {
    const s6 = obj(d.seccion_6);
    secciones.push({
      numero: 6,
      titulo: TITULOS_SECCION.seccion_6,
      filas: [
        fila('Promedio del semestre anterior', s6.promedio_semestre_anterior),
        fila('Promedio acumulado', s6.promedio_acumulado),
        fila('Créditos cursados', s6.creditos_cursados),
        fila('Créditos aprobados', s6.creditos_aprobados),
        fila('Créditos perdidos', s6.creditos_perdidos),
      ],
    });
  }

  const s7 = obj(d.seccion_7);
  secciones.push({
    numero: 7,
    titulo: TITULOS_SECCION.seccion_7,
    filas: [fila('Valor de la matrícula ordinaria', formatearPesos(num(s7.valor_matricula))), fila('Valor en letras', ctx.postulacion.valor_matricula_letras)],
  });

  if (aplicables.has('seccion_8')) {
    const s8 = obj(d.seccion_8);
    const dp = obj(s8.datos_pago);
    secciones.push({
      numero: 8,
      titulo: TITULOS_SECCION.seccion_8,
      filas: [
        fila('Días de asistencia semanal', s8.dias_asistencia_semanal),
        fila('Municipio de destino', s8.municipio_destino),
        fila('Medio de pago', TIPO_PAGO_TEXTO[String(dp.tipo)] ?? dp.tipo),
        fila('Entidad', dp.entidad),
        fila('Número (enmascarado)', dp.numero_enmascarado),
      ],
    });
  }
  return secciones;
}

/** Construye lo que se hashea y se imprime. No valida (ver `validarGeneracion`). */
export function construirDatos(ctx: ContextoFormato, tipo: TipoFormato): DatosFormato {
  const version = VERSION_PLANTILLA[tipo];
  const per = ctx.perfil;
  if (tipo === TipoFormato.GE_F041) {
    return {
      hashInput: {
        version_plantilla: version,
        tipo_solicitud: ctx.postulacion.tipo_solicitud,
        convocatoria: { anio: ctx.convocatoria.anio, semestre: ctx.convocatoria.semestre },
        beneficios: [...ctx.beneficios].sort(),
        datos_formulario: formularioParaHash(ctx.postulacion.datos_formulario ?? {}),
        valor_matricula_letras: ctx.postulacion.valor_matricula_letras,
        programa: ctx.programa,
        perfil: { ...per } as unknown as Obj,
        declaraciones: ctx.declaraciones.map((x) => ({ codigo: x.codigo, version: x.version })),
      },
      vista: {
        secciones: construirVistaF041(ctx),
        declaraciones: ctx.declaraciones,
        solicitante: nombreCompleto(per),
        documento: `${per.tipo_documento ?? ''} ${per.numero_documento ?? ''}`.trim(),
      },
    };
  }

  const bloque = requiereBloqueCodeudor(ctx);
  const deudor = {
    nombre_completo: nombreCompleto(per),
    tipo_documento: per.tipo_documento,
    numero_documento: per.numero_documento,
    direccion: per.direccion,
    telefono: per.celular_1,
  };
  return {
    hashInput: {
      version_plantilla: version,
      deudor,
      bloque_codeudor: bloque,
      acudiente: bloque ? per.acudiente : null,
      pagare_requiere_codeudor_menores: ctx.pagareRequiereCodeudorMenores,
      es_menor: per.es_menor,
    },
    vista: {
      deudor: { ...deudor, tipo_documento_texto: TIPO_DOC_TEXTO[per.tipo_documento ?? ''] ?? per.tipo_documento ?? '' },
      bloque_codeudor: bloque,
      menor: per.es_menor,
      convocatoria: `${ctx.convocatoria.nombre} (${ctx.convocatoria.anio}-${ctx.convocatoria.semestre})`,
    },
  };
}

export function calcularHashContenido(ctx: ContextoFormato, tipo: TipoFormato): string {
  return hashContenidoService.calcularHash(tipo, construirDatos(ctx, tipo).hashInput);
}
