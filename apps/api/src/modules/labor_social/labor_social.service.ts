import crypto from 'node:crypto';
import {
  EstadoCertificado,
  LABOR_SOCIAL_HORAS_MAX_DIA,
  LABOR_SOCIAL_SEGUNDOS_URL,
  TIPO_FORMATO_LABOR_SOCIAL,
  type ActividadDto,
  type ActividadInput,
  type ActividadPatchInput,
  type CertificadoDto,
  type CrearCertificadoInput,
  type DescargaCertificadoDto,
  type EmisionDto,
  type LaborSocialBeneficiarioDto,
  type MisCertificadosDto,
} from '@foest/shared';
import { AppError, auditar, logger, supabaseAdmin, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { tieneAsignacionActiva } from '../asignaciones';
import { configuracionService } from '../catalogos_configuracion';
import { esTablaInexistente } from '../formatos_oficiales/vigencia.service';
import { sha256Hex } from '../formatos_oficiales/hash-contenido';
import { encolarNotificacion } from '../notificaciones';
import { aResumen } from './labor_social.lectura';
import {
  calcularHashContenidoLaborSocial,
  construirModelo,
  renderizarGeF038,
  type ContextoPdf,
} from './labor_social.pdf.service';
import {
  BUCKET_LABOR_SOCIAL,
  COLUMNAS_ACTIVIDAD,
  COLUMNAS_CERTIFICADO,
  COLUMNAS_EMISION,
  type FilaActividad,
  type FilaCertificado,
  type FilaEmision,
} from './labor_social.types';

/**
 * Reglas de negocio de labor_social (docs/modules/labor_social.md). Acceso a datos con service_role; la
 * propiedad / alcance se resuelve aqui (ajeno -> 404, nunca 403). Los invariantes de horas, estados y
 * PRESENTADO inmutable los garantizan ademas los triggers de 0019_labor_social.sql.
 */

export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const MIGRACION_FALTANTE = 'El modulo de labor social no esta disponible: falta aplicar la migracion 0019';

// --- Mapeo --------------------------------------------------------------------------------------------

export function aActividadDto(f: FilaActividad): ActividadDto {
  return {
    id: f.id,
    certificado_id: f.certificado_id,
    fecha_actividad: f.fecha_actividad,
    horas_ejecutadas: Number(f.horas_ejecutadas),
    descripcion_actividad: f.descripcion_actividad,
    dependencia_municipal: f.dependencia_municipal,
    nombre_supervisor: f.nombre_supervisor,
    cargo_supervisor: f.cargo_supervisor,
    creado_en: f.creado_en,
    actualizado_en: f.actualizado_en,
  };
}

export function aEmisionDto(f: FilaEmision): EmisionDto {
  return {
    id: f.id,
    certificado_id: f.certificado_id,
    hash_contenido: f.hash_contenido,
    codigo_verificacion: f.codigo_verificacion,
    sha256_archivo: f.sha256_archivo,
    total_paginas: f.total_paginas,
    emitido_en: f.emitido_en,
  };
}

export function aCertificadoDto(f: FilaCertificado): CertificadoDto {
  const total = Number(f.total_horas_acumuladas);
  const minimas = Number(f.horas_minimas_requeridas);
  return {
    id: f.id,
    beneficiario_id: f.beneficiario_id,
    postulacion_id: f.postulacion_id,
    semestre_academico: f.semestre_academico,
    total_horas_acumuladas: total,
    horas_minimas_requeridas: minimas,
    cumple_minimo: total > 0 && total >= minimas,
    estado: f.estado,
    soporte_documento_id: f.soporte_documento_id,
    completado_en: f.completado_en,
    presentado_en: f.presentado_en,
    version: f.version,
    creado_en: f.creado_en,
    actualizado_en: f.actualizado_en,
  };
}

// --- Acceso a datos -----------------------------------------------------------------------------------

function fallo(error: { code?: string; message: string }, accion: string): never {
  if (esTablaInexistente(error)) throw AppError.interno(MIGRACION_FALTANTE);
  throw AppError.interno(`No fue posible ${accion}: ${error.message}`);
}

/** Traduce las excepciones de los triggers de 0019 (mensaje `CODIGO: texto`). */
function traducirErrorTrigger(error: { code?: string; message: string }): AppError | null {
  const m = /^(CERTIFICADO_NO_EDITABLE|CERTIFICADO_PRESENTADO_INMUTABLE|FECHA_FUTURA|HORAS_DIA_EXCEDIDAS|HORAS_INSUFICIENTES|TRANSICION_INVALIDA|SOPORTE_REQUERIDO)\b:?\s*(.*)$/.exec(
    error.message,
  );
  if (!m) return null;
  const [, code, texto] = m as unknown as [string, string, string];
  if (code === 'FECHA_FUTURA' || code === 'HORAS_DIA_EXCEDIDAS' || code === 'HORAS_INSUFICIENTES' || code === 'SOPORTE_REQUERIDO') {
    return AppError.datosInvalidos(code, texto || code);
  }
  if (code === 'CERTIFICADO_PRESENTADO_INMUTABLE') return AppError.conflicto('CERTIFICADO_NO_EDITABLE', 'El certificado ya fue presentado y no admite cambios');
  return AppError.conflicto(code, texto || code);
}

async function beneficiarioDeUsuario(usuarioId: string): Promise<{ id: string; usuario_id: string } | null> {
  const { data, error } = await supabaseAdmin.from('beneficiario').select('id, usuario_id').eq('usuario_id', usuarioId).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar el beneficiario: ${error.message}`);
  return (data as { id: string; usuario_id: string } | null) ?? null;
}

async function exigirBeneficiario(user: UsuarioAutenticado): Promise<{ id: string; usuario_id: string }> {
  if (user.rol !== 'BENEFICIARIO') throw AppError.sinPermiso('SOLO_BENEFICIARIO', 'Esta acción es exclusiva del beneficiario titular');
  const b = await beneficiarioDeUsuario(user.id);
  if (!b) throw AppError.noEncontrado();
  return b;
}

async function leerCertificado(id: string): Promise<FilaCertificado | null> {
  const { data, error } = await supabaseAdmin.from('certificado_labor_social').select(COLUMNAS_CERTIFICADO).eq('id', id).maybeSingle();
  if (error) fallo(error, 'leer el certificado');
  return (data as FilaCertificado | null) ?? null;
}

/** Certificado propio del beneficiario o 404 (ajeno o inexistente). */
async function certificadoPropio(user: UsuarioAutenticado, id: string): Promise<{ cert: FilaCertificado; beneficiario: { id: string; usuario_id: string } }> {
  const beneficiario = await exigirBeneficiario(user);
  const cert = await leerCertificado(id);
  if (!cert || cert.beneficiario_id !== beneficiario.id) throw AppError.noEncontrado();
  return { cert, beneficiario };
}

async function actividadesDe(certificadoId: string): Promise<FilaActividad[]> {
  const { data, error } = await supabaseAdmin
    .from('actividad_labor_social')
    .select(COLUMNAS_ACTIVIDAD)
    .eq('certificado_id', certificadoId)
    .order('fecha_actividad', { ascending: true })
    .order('creado_en', { ascending: true });
  if (error) fallo(error, 'leer las actividades');
  return (data ?? []) as FilaActividad[];
}

async function ultimaEmision(certificadoId: string): Promise<FilaEmision | null> {
  const { data, error } = await supabaseAdmin
    .from('labor_social_emision')
    .select(COLUMNAS_EMISION)
    .eq('certificado_id', certificadoId)
    .order('emitido_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fallo(error, 'leer la emision');
  return (data as FilaEmision | null) ?? null;
}

async function contextoPdf(cert: FilaCertificado): Promise<ContextoPdf> {
  const { data: b, error } = await supabaseAdmin
    .from('beneficiario')
    .select('nombres, apellidos, tipo_documento, numero_documento')
    .eq('id', cert.beneficiario_id)
    .maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar el beneficiario: ${error.message}`);
  const fila = (b ?? {}) as { nombres?: string | null; apellidos?: string | null; tipo_documento?: string | null; numero_documento?: string | null };

  let convocatoria: string | null = null;
  if (cert.postulacion_id) {
    const { data: p } = await supabaseAdmin.from('postulacion').select('convocatoria:convocatoria_id(nombre)').eq('id', cert.postulacion_id).maybeSingle();
    const c = (p as { convocatoria?: { nombre?: string | null } | { nombre?: string | null }[] | null } | null)?.convocatoria;
    convocatoria = (Array.isArray(c) ? c[0]?.nombre : c?.nombre) ?? null;
  }
  const acuerdo = (await configuracionService.get('ACUERDO_VIGENTE_TEXTO').catch(() => null)) ?? 'Acuerdo Municipal 023 de 2025';
  return {
    beneficiario: {
      nombres: fila.nombres ?? '',
      apellidos: fila.apellidos ?? '',
      tipo_documento: fila.tipo_documento ?? null,
      numero_documento: fila.numero_documento ?? null,
    },
    convocatoria_nombre: convocatoria,
    acuerdo,
  };
}

/** Hoy en America/Bogota (YYYY-MM-DD). */
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function maximoPorDia(): Promise<number> {
  return configuracionService.getEntero('LABOR_SOCIAL_HORAS_MAX_DIA', LABOR_SOCIAL_HORAS_MAX_DIA);
}

/** Detalle completo del certificado (actividades + ultima emision + vigencia de la emision). */
async function detallar(cert: FilaCertificado, conActividades: boolean): Promise<CertificadoDto> {
  const dto = aCertificadoDto(cert);
  const [actividades, emision] = await Promise.all([actividadesDe(cert.id), ultimaEmision(cert.id)]);
  if (conActividades) dto.actividades = actividades.map(aActividadDto);
  dto.ultima_emision = emision ? aEmisionDto(emision) : null;
  if (emision) {
    const ctx = await contextoPdf(cert);
    dto.emision_vigente = emision.hash_contenido === calcularHashContenidoLaborSocial(cert, actividades, ctx);
  } else {
    dto.emision_vigente = false;
  }
  return dto;
}

/** El funcionario tiene asignacion ACTIVA sobre alguna postulacion del beneficiario. */
async function funcionarioConAlcance(funcionarioId: string, beneficiarioId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('postulacion').select('id').eq('beneficiario_id', beneficiarioId);
  if (error) throw AppError.interno(`No fue posible cargar las postulaciones: ${error.message}`);
  for (const p of (data ?? []) as Array<{ id: string }>) {
    if (await tieneAsignacionActiva(funcionarioId, p.id)) return true;
  }
  return false;
}

// --- Servicio -----------------------------------------------------------------------------------------

export class LaborSocialService {
  /** POST /labor-social */
  async crear(user: UsuarioAutenticado, ctx: ContextoAuditoria, input: CrearCertificadoInput): Promise<CertificadoDto> {
    const beneficiario = await exigirBeneficiario(user);

    if (input.postulacion_id) {
      const { data, error } = await supabaseAdmin
        .from('postulacion')
        .select('id, beneficiario_id, estado')
        .eq('id', input.postulacion_id)
        .maybeSingle();
      if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
      const p = data as { id: string; beneficiario_id: string; estado: string } | null;
      if (!p || p.beneficiario_id !== beneficiario.id) throw AppError.noEncontrado();
      if (p.estado !== 'APROBADA') {
        throw AppError.conflicto('POSTULACION_NO_APROBADA', 'Solo puede registrar labor social sobre una postulación aprobada');
      }
    }

    const minimas = await configuracionService.getEntero('LABOR_SOCIAL_HORAS_MINIMAS', 0);
    const { data, error } = await supabaseAdmin
      .from('certificado_labor_social')
      .insert({
        beneficiario_id: beneficiario.id,
        postulacion_id: input.postulacion_id ?? null,
        semestre_academico: input.semestre_academico,
        horas_minimas_requeridas: minimas,
      })
      .select(COLUMNAS_CERTIFICADO)
      .single();
    if (error) {
      if (error.code === '23505') {
        throw AppError.conflicto('CERTIFICADO_EXISTENTE', 'Ya existe un certificado de labor social para esa postulación o ese semestre');
      }
      fallo(error, 'crear el certificado');
    }
    const cert = data as FilaCertificado;
    await auditar({
      ...ctx,
      accion: 'CREAR',
      entidad: 'CERTIFICADO_LABOR_SOCIAL',
      entidad_id: cert.id,
      datos_despues: { semestre_academico: cert.semestre_academico, postulacion_id: cert.postulacion_id, horas_minimas_requeridas: cert.horas_minimas_requeridas },
    });
    return { ...aCertificadoDto(cert), actividades: [], ultima_emision: null, emision_vigente: false };
  }

  /** GET /labor-social/me */
  async misCertificados(user: UsuarioAutenticado): Promise<MisCertificadosDto> {
    // Funcionario y administrador tienen labor_social:consultar pero no certificados propios: lista vacia.
    if (user.rol !== 'BENEFICIARIO') return { horas_maximas_por_dia: await maximoPorDia(), certificados: [] };
    const beneficiario = await exigirBeneficiario(user);
    const { data, error } = await supabaseAdmin
      .from('certificado_labor_social')
      .select(COLUMNAS_CERTIFICADO)
      .eq('beneficiario_id', beneficiario.id)
      .order('creado_en', { ascending: false });
    if (error) fallo(error, 'listar los certificados');
    const certificados: CertificadoDto[] = [];
    for (const c of (data ?? []) as FilaCertificado[]) certificados.push(await detallar(c, true));
    return { horas_maximas_por_dia: await maximoPorDia(), certificados };
  }

  /** POST /labor-social/:id/actividades */
  async agregarActividad(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string, input: ActividadInput): Promise<CertificadoDto> {
    const { cert } = await certificadoPropio(user, id);
    this.exigirEditable(cert);
    await this.validarActividad(cert.id, input, null);

    const { data, error } = await supabaseAdmin
      .from('actividad_labor_social')
      .insert({ certificado_id: cert.id, ...input })
      .select(COLUMNAS_ACTIVIDAD)
      .single();
    if (error) throw traducirErrorTrigger(error) ?? this.errorBd(error, 'registrar la actividad');
    const actividad = data as FilaActividad;
    await auditar({
      ...ctx,
      accion: 'CREAR',
      entidad: 'ACTIVIDAD_LABOR_SOCIAL',
      entidad_id: actividad.id,
      datos_despues: aActividadDto(actividad),
      metadatos: { certificado_id: cert.id },
    });
    return this.recargar(cert.id);
  }

  /** PATCH /labor-social/:id/actividades/:actividadId */
  async editarActividad(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string, actividadId: string, input: ActividadPatchInput): Promise<CertificadoDto> {
    const { cert } = await certificadoPropio(user, id);
    this.exigirEditable(cert);
    const antes = await this.actividadDe(cert.id, actividadId);
    const resultante: ActividadInput = {
      fecha_actividad: input.fecha_actividad ?? antes.fecha_actividad,
      horas_ejecutadas: input.horas_ejecutadas ?? Number(antes.horas_ejecutadas),
      descripcion_actividad: input.descripcion_actividad ?? antes.descripcion_actividad,
      dependencia_municipal: input.dependencia_municipal ?? antes.dependencia_municipal,
      nombre_supervisor: input.nombre_supervisor ?? antes.nombre_supervisor,
      cargo_supervisor: input.cargo_supervisor ?? antes.cargo_supervisor,
    };
    await this.validarActividad(cert.id, resultante, actividadId);

    const { data, error } = await supabaseAdmin
      .from('actividad_labor_social')
      .update(input)
      .eq('id', actividadId)
      .eq('certificado_id', cert.id)
      .select(COLUMNAS_ACTIVIDAD)
      .single();
    if (error) throw traducirErrorTrigger(error) ?? this.errorBd(error, 'editar la actividad');
    await auditar({
      ...ctx,
      accion: 'ACTUALIZAR',
      entidad: 'ACTIVIDAD_LABOR_SOCIAL',
      entidad_id: actividadId,
      datos_antes: aActividadDto(antes),
      datos_despues: aActividadDto(data as FilaActividad),
      metadatos: { certificado_id: cert.id },
    });
    return this.recargar(cert.id);
  }

  /** DELETE /labor-social/:id/actividades/:actividadId */
  async eliminarActividad(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string, actividadId: string): Promise<CertificadoDto> {
    const { cert } = await certificadoPropio(user, id);
    this.exigirEditable(cert);
    const antes = await this.actividadDe(cert.id, actividadId);
    const { error } = await supabaseAdmin.from('actividad_labor_social').delete().eq('id', actividadId).eq('certificado_id', cert.id);
    if (error) throw traducirErrorTrigger(error) ?? this.errorBd(error, 'eliminar la actividad');
    await auditar({
      ...ctx,
      accion: 'ELIMINAR',
      entidad: 'ACTIVIDAD_LABOR_SOCIAL',
      entidad_id: actividadId,
      datos_antes: aActividadDto(antes),
      metadatos: { certificado_id: cert.id },
    });
    return this.recargar(cert.id);
  }

  /** PATCH /labor-social/:id/completar  (EN_PROCESO -> COMPLETADO, horas >= minimo) */
  async completar(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string): Promise<CertificadoDto> {
    const { cert } = await certificadoPropio(user, id);
    this.exigirEditable(cert);
    const actividades = await actividadesDe(cert.id);
    const totalCent = actividades.reduce((s, a) => s + Math.round(Number(a.horas_ejecutadas) * 100), 0);
    const minCent = Math.round(Number(cert.horas_minimas_requeridas) * 100);
    if (actividades.length === 0 || totalCent < minCent) {
      throw AppError.datosInvalidos(
        'HORAS_INSUFICIENTES',
        `El certificado acumula ${(totalCent / 100).toFixed(2)} horas y requiere al menos ${Number(cert.horas_minimas_requeridas).toFixed(2)}`,
        { total_horas_acumuladas: totalCent / 100, horas_minimas_requeridas: Number(cert.horas_minimas_requeridas) },
      );
    }
    const actualizado = await this.cambiarEstado(cert, EstadoCertificado.COMPLETADO, EstadoCertificado.EN_PROCESO, {});
    await auditar({
      ...ctx,
      accion: 'COMPLETAR',
      entidad: 'CERTIFICADO_LABOR_SOCIAL',
      entidad_id: cert.id,
      datos_antes: { estado: cert.estado, total_horas_acumuladas: cert.total_horas_acumuladas },
      datos_despues: { estado: actualizado.estado, total_horas_acumuladas: actualizado.total_horas_acumuladas },
    });
    return detallar(actualizado, true);
  }

  /** PATCH /labor-social/:id/reabrir  (COMPLETADO -> EN_PROCESO) */
  async reabrir(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string): Promise<CertificadoDto> {
    const { cert } = await certificadoPropio(user, id);
    if (cert.estado === EstadoCertificado.PRESENTADO) {
      throw AppError.conflicto('CERTIFICADO_NO_EDITABLE', 'Un certificado presentado no puede reabrirse');
    }
    if (cert.estado !== EstadoCertificado.COMPLETADO) {
      throw AppError.conflicto('CERTIFICADO_NO_COMPLETADO', 'Solo se reabre un certificado completado');
    }
    const actualizado = await this.cambiarEstado(cert, EstadoCertificado.EN_PROCESO, EstadoCertificado.COMPLETADO, {});
    await auditar({
      ...ctx,
      accion: 'REABRIR',
      entidad: 'CERTIFICADO_LABOR_SOCIAL',
      entidad_id: cert.id,
      datos_antes: { estado: cert.estado },
      datos_despues: { estado: actualizado.estado },
    });
    return detallar(actualizado, true);
  }

  /** PATCH /labor-social/:id/presentar  (COMPLETADO -> PRESENTADO con soporte LAB_SOC DISPONIBLE) */
  async presentar(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string, documentoId: string): Promise<CertificadoDto> {
    const { cert, beneficiario } = await certificadoPropio(user, id);
    if (cert.estado === EstadoCertificado.PRESENTADO) {
      throw AppError.conflicto('CERTIFICADO_NO_EDITABLE', 'El certificado ya fue presentado');
    }
    if (cert.estado !== EstadoCertificado.COMPLETADO) {
      throw AppError.conflicto('CERTIFICADO_NO_COMPLETADO', 'Debe completar el certificado antes de presentarlo');
    }

    await this.validarSoporte(cert, documentoId);

    // La presentacion exige que el contenido actual coincida con el de la ultima emision que se firmo.
    const [actividades, emision, pdfCtx] = await Promise.all([actividadesDe(cert.id), ultimaEmision(cert.id), contextoPdf(cert)]);
    const hashActual = calcularHashContenidoLaborSocial(cert, actividades, pdfCtx);
    if (!emision || emision.hash_contenido !== hashActual) {
      throw AppError.conflicto(
        'EMISION_DESACTUALIZADA',
        'Descargue el certificado definitivo con las actividades actuales, hágalo firmar y suba el soporte antes de presentarlo',
      );
    }

    const actualizado = await this.cambiarEstado(cert, EstadoCertificado.PRESENTADO, EstadoCertificado.COMPLETADO, { soporte_documento_id: documentoId });
    await auditar({
      ...ctx,
      accion: 'PRESENTAR',
      entidad: 'CERTIFICADO_LABOR_SOCIAL',
      entidad_id: cert.id,
      datos_antes: { estado: cert.estado },
      datos_despues: { estado: actualizado.estado, soporte_documento_id: documentoId },
      metadatos: { emision_id: emision.id, hash_contenido: emision.hash_contenido },
    });
    try {
      await encolarNotificacion({
        usuario_id: beneficiario.usuario_id,
        tipo: 'LABOR_SOCIAL_REGISTRADA',
        titulo: 'Certificado de labor social presentado',
        mensaje: `Su certificado de labor social del semestre ${cert.semestre_academico} quedó presentado con el soporte firmado.`,
        url_destino: '/beneficiario/labor-social',
        clave_dedup: `LABOR_SOCIAL_PRESENTADO:${cert.id}`,
      });
    } catch (e) {
      logger.error({ err: e, certificado_id: cert.id }, 'No se pudo notificar la presentacion de labor social');
    }
    return detallar(actualizado, true);
  }

  /**
   * GET /labor-social/:id/certificado.pdf
   * Titular: genera (borrador si EN_PROCESO; definitivo con emision si COMPLETADO/PRESENTADO).
   * Funcionario con asignacion activa o administrador: solo descargan la ultima emision definitiva.
   */
  async descargarCertificado(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string): Promise<DescargaCertificadoDto> {
    const cert = await leerCertificado(id);
    if (!cert) throw AppError.noEncontrado();

    if (user.rol === 'BENEFICIARIO') {
      const b = await beneficiarioDeUsuario(user.id);
      if (!b || b.id !== cert.beneficiario_id) throw AppError.noEncontrado();
      return this.generarYFirmar(cert, ctx);
    }
    if (user.rol === 'FUNCIONARIO' && !(await funcionarioConAlcance(user.id, cert.beneficiario_id))) throw AppError.noEncontrado();
    if (user.rol !== 'FUNCIONARIO' && user.rol !== 'ADMINISTRADOR') throw AppError.noEncontrado();

    const emision = await ultimaEmision(cert.id);
    if (!emision) throw AppError.noEncontrado('EMISION_NO_ENCONTRADA', 'El beneficiario aún no ha emitido el certificado definitivo');
    const url = await this.urlFirmada(emision.storage_key);
    await auditar({
      ...ctx,
      accion: 'DESCARGA_DOCUMENTO',
      entidad: 'CERTIFICADO_LABOR_SOCIAL',
      entidad_id: cert.id,
      metadatos: { emision_id: emision.id, tipo: TIPO_FORMATO_LABOR_SOCIAL },
    });
    return { url: url.url, expira_en: url.expira_en, borrador: false, emision: aEmisionDto(emision) };
  }

  /** GET /beneficiarios/:beneficiarioId/labor-social (funcionario con asignacion activa o administrador). */
  async porBeneficiario(user: UsuarioAutenticado, beneficiarioId: string): Promise<LaborSocialBeneficiarioDto> {
    const { data: b, error: eb } = await supabaseAdmin.from('beneficiario').select('id').eq('id', beneficiarioId).maybeSingle();
    if (eb) throw AppError.interno(`No fue posible cargar el beneficiario: ${eb.message}`);
    if (!b) throw AppError.noEncontrado();
    if (user.rol === 'FUNCIONARIO') {
      if (!(await funcionarioConAlcance(user.id, beneficiarioId))) throw AppError.noEncontrado();
    } else if (user.rol !== 'ADMINISTRADOR') {
      throw AppError.noEncontrado();
    }

    const { data, error } = await supabaseAdmin
      .from('certificado_labor_social')
      .select(COLUMNAS_CERTIFICADO)
      .eq('beneficiario_id', beneficiarioId)
      .order('creado_en', { ascending: false });
    if (error) fallo(error, 'listar los certificados');
    const filas = (data ?? []) as FilaCertificado[];
    const conDetalle = user.rol === 'ADMINISTRADOR';
    const certificados: CertificadoDto[] = [];
    for (const c of filas) certificados.push(conDetalle ? await detallar(c, true) : aCertificadoDto(c));
    return { beneficiario_id: beneficiarioId, resumen: filas[0] ? aResumen(filas[0]) : null, certificados };
  }

  // --- Internos ---------------------------------------------------------------------------------------

  private errorBd(error: { code?: string; message: string }, accion: string): AppError {
    if (esTablaInexistente(error)) return AppError.interno(MIGRACION_FALTANTE);
    return AppError.interno(`No fue posible ${accion}: ${error.message}`);
  }

  private exigirEditable(cert: FilaCertificado): void {
    if (cert.estado !== EstadoCertificado.EN_PROCESO) {
      throw AppError.conflicto('CERTIFICADO_NO_EDITABLE', 'Solo puede modificar actividades mientras el certificado está en proceso');
    }
  }

  private async actividadDe(certificadoId: string, actividadId: string): Promise<FilaActividad> {
    const { data, error } = await supabaseAdmin
      .from('actividad_labor_social')
      .select(COLUMNAS_ACTIVIDAD)
      .eq('id', actividadId)
      .eq('certificado_id', certificadoId)
      .maybeSingle();
    if (error) fallo(error, 'leer la actividad');
    if (!data) throw AppError.noEncontrado();
    return data as FilaActividad;
  }

  private async recargar(certificadoId: string): Promise<CertificadoDto> {
    const cert = await leerCertificado(certificadoId);
    if (!cert) throw AppError.noEncontrado();
    return detallar(cert, true);
  }

  /** Fecha no futura y tope diario por fecha (suma de todas las actividades de ese dia). */
  private async validarActividad(certificadoId: string, input: ActividadInput, excluirId: string | null): Promise<void> {
    if (input.fecha_actividad > hoyBogota()) {
      throw AppError.datosInvalidos('FECHA_FUTURA', 'La fecha de la actividad no puede ser futura');
    }
    const maximo = await maximoPorDia();
    const { data, error } = await supabaseAdmin
      .from('actividad_labor_social')
      .select('id, horas_ejecutadas')
      .eq('certificado_id', certificadoId)
      .eq('fecha_actividad', input.fecha_actividad);
    if (error) fallo(error, 'validar las horas del día');
    const existentes = ((data ?? []) as Array<{ id: string; horas_ejecutadas: number | string }>)
      .filter((a) => a.id !== excluirId)
      .reduce((s, a) => s + Math.round(Number(a.horas_ejecutadas) * 100), 0);
    const total = existentes + Math.round(input.horas_ejecutadas * 100);
    if (total > Math.round(maximo * 100)) {
      throw AppError.datosInvalidos(
        'HORAS_DIA_EXCEDIDAS',
        `El total de horas de esa fecha (${(total / 100).toFixed(2)}) supera el máximo diario de ${maximo} horas`,
        { maximo_por_dia: maximo, horas_registradas_en_la_fecha: existentes / 100 },
      );
    }
  }

  /** Cambio de estado con control optimista (estado + version); el trigger valida la transicion. */
  private async cambiarEstado(cert: FilaCertificado, nuevo: string, esperado: string, extra: Record<string, unknown>): Promise<FilaCertificado> {
    const { data, error } = await supabaseAdmin
      .from('certificado_labor_social')
      .update({ estado: nuevo, ...extra })
      .eq('id', cert.id)
      .eq('estado', esperado)
      .eq('version', cert.version)
      .select(COLUMNAS_CERTIFICADO)
      .maybeSingle();
    if (error) throw traducirErrorTrigger(error) ?? this.errorBd(error, 'actualizar el certificado');
    if (!data) throw AppError.conflicto('CERTIFICADO_MODIFICADO', 'El certificado cambió mientras lo editaba; recargue e intente de nuevo');
    return data as FilaCertificado;
  }

  /** El soporte debe ser un LAB_SOC DISPONIBLE del mismo beneficiario (y de la misma postulacion, si aplica). */
  private async validarSoporte(cert: FilaCertificado, documentoId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('documento')
      .select('id, postulacion_id, estado_carga, eliminado, tipo:tipo_id(codigo), postulacion:postulacion_id(beneficiario_id)')
      .eq('id', documentoId)
      .maybeSingle();
    if (error) {
      if (esTablaInexistente(error)) throw AppError.conflicto('DOCUMENTOS_NO_DISPONIBLES', 'El módulo de documentos aún no está disponible');
      throw AppError.interno(`No fue posible validar el soporte: ${error.message}`);
    }
    const d = data as {
      id: string;
      postulacion_id: string;
      estado_carga: string;
      eliminado: boolean;
      tipo: { codigo?: string } | { codigo?: string }[] | null;
      postulacion: { beneficiario_id?: string } | { beneficiario_id?: string }[] | null;
    } | null;
    const tipo = Array.isArray(d?.tipo) ? d?.tipo[0] : d?.tipo;
    const post = Array.isArray(d?.postulacion) ? d?.postulacion[0] : d?.postulacion;
    const valido =
      d != null &&
      !d.eliminado &&
      tipo?.codigo === 'LAB_SOC' &&
      d.estado_carga === 'DISPONIBLE' &&
      post?.beneficiario_id === cert.beneficiario_id &&
      (cert.postulacion_id == null || d.postulacion_id === cert.postulacion_id);
    if (!valido) {
      throw AppError.datosInvalidos(
        'SOPORTE_INVALIDO',
        'El soporte debe ser un documento LAB_SOC disponible, propio y de la misma postulación del certificado',
      );
    }
  }

  private async urlFirmada(storageKey: string): Promise<{ url: string; expira_en: string }> {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_LABOR_SOCIAL).createSignedUrl(storageKey, LABOR_SOCIAL_SEGUNDOS_URL);
    if (error || !data?.signedUrl) throw AppError.interno('No fue posible generar la URL de descarga');
    return { url: data.signedUrl, expira_en: new Date(Date.now() + LABOR_SOCIAL_SEGUNDOS_URL * 1000).toISOString() };
  }

  /** Genera (o reutiliza) el PDF del titular y devuelve la URL firmada de 300 s. */
  private async generarYFirmar(cert: FilaCertificado, ctx: ContextoAuditoria): Promise<DescargaCertificadoDto> {
    const [actividades, pdfCtx] = await Promise.all([actividadesDe(cert.id), contextoPdf(cert)]);
    const ahora = new Date();

    // Borrador: marca de agua, sin QR y sin registro de emision.
    if (cert.estado === EstadoCertificado.EN_PROCESO) {
      const modelo = construirModelo(cert, actividades, pdfCtx, true, ahora);
      const { pdf } = await this.renderizar(() => renderizarGeF038(modelo, null));
      const clave = `labor-social/${cert.id}/borrador.pdf`;
      const subida = await supabaseAdmin.storage.from(BUCKET_LABOR_SOCIAL).upload(clave, pdf, { contentType: 'application/pdf', upsert: true });
      if (subida.error) throw AppError.interno(`No fue posible almacenar el borrador: ${subida.error.message}`);
      const url = await this.urlFirmada(clave);
      await auditar({
        ...ctx,
        accion: 'DESCARGA_DOCUMENTO',
        entidad: 'CERTIFICADO_LABOR_SOCIAL',
        entidad_id: cert.id,
        metadatos: { tipo: TIPO_FORMATO_LABOR_SOCIAL, borrador: true },
      });
      return { ...url, borrador: true, emision: null };
    }

    // Definitivo: si el contenido no cambio desde la ultima emision, se reutiliza; si no, se emite una nueva.
    const hash = calcularHashContenidoLaborSocial(cert, actividades, pdfCtx);
    const previa = await ultimaEmision(cert.id);
    if (previa && previa.hash_contenido === hash) {
      const url = await this.urlFirmada(previa.storage_key);
      await auditar({
        ...ctx,
        accion: 'DESCARGA_DOCUMENTO',
        entidad: 'CERTIFICADO_LABOR_SOCIAL',
        entidad_id: cert.id,
        metadatos: { tipo: TIPO_FORMATO_LABOR_SOCIAL, emision_id: previa.id },
      });
      return { ...url, borrador: false, emision: aEmisionDto(previa) };
    }
    if (cert.estado === EstadoCertificado.PRESENTADO) {
      // No deberia ocurrir: presentar exige emision vigente y el certificado queda inmutable.
      throw AppError.conflicto('CERTIFICADO_NO_EDITABLE', 'El certificado presentado no admite nuevas emisiones');
    }

    const codigo = crypto.randomBytes(16).toString('base64url'); // 128 bits, 22 caracteres
    const emisionId = crypto.randomUUID();
    const modelo = construirModelo(cert, actividades, pdfCtx, false, ahora);
    const { pdf, total_paginas } = await this.renderizar(() => renderizarGeF038(modelo, codigo));
    const sha256 = sha256Hex(pdf); // solo en BD: nunca dentro del archivo
    const clave = `labor-social/${cert.id}/${emisionId}.pdf`;
    const subida = await supabaseAdmin.storage.from(BUCKET_LABOR_SOCIAL).upload(clave, pdf, { contentType: 'application/pdf', upsert: false });
    if (subida.error) throw AppError.interno(`No fue posible almacenar el certificado: ${subida.error.message}`);

    const { data, error } = await supabaseAdmin
      .from('labor_social_emision')
      .insert({
        id: emisionId,
        certificado_id: cert.id,
        hash_contenido: hash,
        codigo_verificacion: codigo,
        sha256_archivo: sha256,
        storage_key: clave,
        total_paginas,
        emitido_en: ahora.toISOString(),
      })
      .select(COLUMNAS_EMISION)
      .single();
    if (error) {
      await supabaseAdmin.storage.from(BUCKET_LABOR_SOCIAL).remove([clave]).catch(() => undefined);
      fallo(error, 'registrar la emisión');
    }
    const emision = data as FilaEmision;
    await auditar({
      ...ctx,
      accion: 'GENERAR_FORMATO',
      entidad: 'CERTIFICADO_LABOR_SOCIAL',
      entidad_id: cert.id,
      datos_despues: { tipo: TIPO_FORMATO_LABOR_SOCIAL, emision_id: emision.id, sha256_archivo: sha256, total_paginas, hash_contenido: hash },
      metadatos: { codigo_verificacion_prefijo: codigo.slice(0, 6) },
    });
    const url = await this.urlFirmada(clave);
    return { ...url, borrador: false, emision: aEmisionDto(emision) };
  }

  private async renderizar<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AppError) throw e;
      logger.error({ err: e }, 'Fallo la generacion del GE-F038');
      throw AppError.interno('No fue posible generar el certificado; intente de nuevo');
    }
  }
}

export const laborSocialService = new LaborSocialService();
