import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { BENEFICIOS_CATALOGO, textoEstadoBeneficiario } from '@foest/shared';
import { AppError, auditar, supabaseAdmin, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { codigoExpediente } from '../asignaciones';
import { renderService } from '../formatos_oficiales/render.service';
import { puedeLeerExpediente, type ExpedienteMinimo } from '../formatos_oficiales/ports/expediente-acceso.port';
import { historialParaAdmin, historialParaBeneficiario, observacionPublica } from '../postulaciones/postulacion.serializer';
import type { CorreccionVigente, HistorialRow } from '../postulaciones/postulaciones.types';

/**
 * Resumen ejecutivo del expediente en PDF (docs/modules/export_reports.md). Se genera en la peticion y
 * NO se almacena. No contiene datos de pago ni SISBEN, ni hash de verificacion. Al beneficiario no se le
 * muestra ningun dato del evaluador (observaciones solo via ObservacionPublica, firma "Equipo FOEST").
 */
type Obj = Record<string, unknown>;
type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const NOMBRE_BENEFICIO = new Map<string, string>(BENEFICIOS_CATALOGO.map((b) => [b.codigo, b.nombre]));
const TIPO_SOLICITUD_TEXTO: Record<string, string> = { PRIMERA_VEZ: 'Primera vez', RENOVACION: 'Renovación', REINTEGRO: 'Reintegro' };
const ESTADO_TEXTO_PERSONAL: Record<string, string> = {
  BORRADOR: 'Borrador',
  PENDIENTE: 'Pendiente de revisión',
  EN_EVALUACION: 'En evaluación',
  EN_CORRECCION: 'En corrección',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  DESISTIDA: 'Desistida',
};

function directorioPlantillas(): string {
  const candidatos = [
    path.join(__dirname, 'plantillas'),
    path.resolve(process.cwd(), 'src', 'modules', 'export_reports', 'plantillas'),
    path.resolve(process.cwd(), 'apps', 'api', 'src', 'modules', 'export_reports', 'plantillas'),
  ];
  for (const c of candidatos) if (fs.existsSync(path.join(c, 'resumen.hbs'))) return c;
  throw new Error('No se encontro la plantilla resumen.hbs de export_reports');
}

let compilada: Handlebars.TemplateDelegate | null = null;

/** Compila (y cachea) la plantilla; lanza si el archivo no existe o no compila. */
export function plantillaResumen(): Handlebars.TemplateDelegate {
  if (!compilada) {
    const fuente = fs.readFileSync(path.join(directorioPlantillas(), 'resumen.hbs'), 'utf8');
    compilada = Handlebars.compile(fuente, { strict: false });
    compilada({}); // falla pronto si la plantilla no es valida
  }
  return compilada;
}

const fechaHora = (iso: string | null | undefined): string =>
  iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(iso)) : 'No registrada';
const moneda = (n: number): string => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

function falloTabla(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')));
}

async function nombresFuncionarios(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  const { data, error } = await supabaseAdmin.from('funcionario').select('usuario_id, nombres, apellidos').in('usuario_id', ids);
  if (error) return mapa;
  for (const f of (data ?? []) as Array<{ usuario_id: string; nombres: string | null; apellidos: string | null }>) {
    mapa.set(f.usuario_id, [f.nombres, f.apellidos].filter(Boolean).join(' '));
  }
  return mapa;
}

export class ResumenService {
  /** PDF del resumen o 404 si el expediente no existe o el usuario no tiene alcance. */
  async generar(user: UsuarioAutenticado, ctx: ContextoAuditoria, postulacionId: string): Promise<{ pdf: Buffer; nombre: string }> {
    const { data, error } = await supabaseAdmin
      .from('postulacion')
      .select(
        'id, beneficiario_id, convocatoria_id, estado, tipo_solicitud, ciclo, enviada_en, aprobacion_parcial, correccion_vigente, datos_formulario, ' +
          'beneficiario(nombres, apellidos), convocatoria(nombre, anio, semestre)',
      )
      .eq('id', postulacionId)
      .maybeSingle();
    if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
    const p = data as unknown as Obj | null;
    if (!p) throw AppError.noEncontrado();
    const exp: ExpedienteMinimo = { id: p.id as string, beneficiario_id: p.beneficiario_id as string, convocatoria_id: p.convocatoria_id as string };
    if (!(await puedeLeerExpediente(user, exp))) throw AppError.noEncontrado();

    const esBeneficiario = user.rol === 'BENEFICIARIO';
    const conv = (p.convocatoria as Obj | null) ?? {};
    const ben = (p.beneficiario as Obj | null) ?? {};
    const anio = Number(conv.anio ?? 0);
    const semestre = Number(conv.semestre ?? 0);
    const codigo = codigoExpediente(anio, semestre, postulacionId);
    const estado = String(p.estado);

    const [beneficios, historial] = await Promise.all([this.beneficios(postulacionId, !esBeneficiario), this.historial(postulacionId, esBeneficiario)]);
    const obs = observacionPublica((p.correccion_vigente as CorreccionVigente | null) ?? null);
    const s4 = ((p.datos_formulario as Obj | null)?.seccion_4 as Obj | undefined) ?? {};

    const vista = {
      codigo_expediente: codigo,
      convocatoria_nombre: conv.nombre ?? '',
      convocatoria_periodo: `${anio}-${semestre}`,
      solicitante: [ben.nombres, ben.apellidos].filter(Boolean).join(' ') || 'No disponible',
      tipo_solicitud: TIPO_SOLICITUD_TEXTO[String(p.tipo_solicitud)] ?? String(p.tipo_solicitud),
      estado_texto: esBeneficiario ? textoEstadoBeneficiario(estado as never, Boolean(p.aprobacion_parcial)) : (ESTADO_TEXTO_PERSONAL[estado] ?? estado),
      ciclo: p.ciclo,
      fecha_envio: fechaHora(p.enviada_en as string | null),
      programa: typeof s4.programa === 'string' ? s4.programa : null,
      beneficios: beneficios.filas,
      mostrar_montos: beneficios.hayMontos,
      historial,
      observacion: obs
        ? {
            texto: obs.observaciones,
            campos: obs.campos_observados,
            campos_texto: obs.campos_observados.join(', '),
            documentos: obs.documentos_observados,
            documentos_texto: obs.documentos_observados.join(', '),
            firma: obs.firma,
          }
        : null,
      generado_en_texto: fechaHora(new Date().toISOString()),
    };

    const html = plantillaResumen()(vista);
    const pdf = await renderService.renderHtml(html);

    await auditar({
      ...ctx,
      accion: 'EXPORTACION',
      entidad: 'POSTULACION',
      entidad_id: postulacionId,
      metadatos: { fase: 'RESUMEN', tipo: 'RESUMEN_PDF', codigo_expediente: codigo, tamano_bytes: pdf.length },
    });
    return { pdf, nombre: `resumen_${codigo}.pdf` };
  }

  private async beneficios(postulacionId: string, esPersonal: boolean): Promise<{ filas: Array<{ nombre: string; decision: string; monto: string }>; hayMontos: boolean }> {
    const { data, error } = await supabaseAdmin.from('postulacion_beneficio').select('beneficio_codigo').eq('postulacion_id', postulacionId);
    if (error) throw AppError.interno(`No fue posible leer los beneficios: ${error.message}`);
    const codigos = ((data ?? []) as Array<{ beneficio_codigo: string }>).map((b) => b.beneficio_codigo).sort();

    const decisiones = new Map<string, { decision: string; monto: number | null }>();
    const rev = await supabaseAdmin
      .from('revision')
      .select('id')
      .eq('postulacion_id', postulacionId)
      .not('decidida_en', 'is', null)
      .order('ciclo', { ascending: false })
      .order('decidida_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rev.error && !falloTabla(rev.error)) throw AppError.interno(`No fue posible leer la revision: ${rev.error.message}`);
    const revisionId = (rev.data as { id: string } | null)?.id;
    if (revisionId) {
      const dec = await supabaseAdmin.from('revision_beneficio').select('beneficio_codigo, decision, monto_aprobado').eq('revision_id', revisionId);
      if (dec.error && !falloTabla(dec.error)) throw AppError.interno(`No fue posible leer las decisiones: ${dec.error.message}`);
      for (const d of (dec.data ?? []) as Array<{ beneficio_codigo: string; decision: string; monto_aprobado: number | string | null }>) {
        decisiones.set(d.beneficio_codigo, { decision: d.decision, monto: d.monto_aprobado === null ? null : Number(d.monto_aprobado) });
      }
    }
    const filas = codigos.map((c) => {
      const d = decisiones.get(c);
      return {
        nombre: `${c} - ${NOMBRE_BENEFICIO.get(c) ?? c}`,
        decision: !d ? 'Sin decisión' : d.decision === 'APROBADO' ? 'Aprobado' : 'No aprobado',
        monto: d?.monto != null && d.decision === 'APROBADO' ? moneda(d.monto) : '',
      };
    });
    // Los montos solo se muestran al personal o cuando ya hay decision.
    const hayMontos = filas.some((f) => f.monto !== '') && (esPersonal || decisiones.size > 0);
    return { filas, hayMontos };
  }

  private async historial(postulacionId: string, paraBeneficiario: boolean): Promise<Array<{ fecha: string; estado: string; quien: string }>> {
    const { data, error } = await supabaseAdmin
      .from('historial_estado_postulacion')
      .select('id, postulacion_id, ciclo, estado_anterior, estado_nuevo, motivo, actor_tipo, actor_id, observaciones, cambiado_en')
      .eq('postulacion_id', postulacionId)
      .order('cambiado_en', { ascending: true });
    if (error) throw AppError.interno(`No fue posible leer el historial: ${error.message}`);
    const filas = (data ?? []) as HistorialRow[];
    if (paraBeneficiario) {
      return historialParaBeneficiario(filas).map((h) => ({ fecha: fechaHora(h.cambiado_en), estado: h.estado_texto, quien: h.quien }));
    }
    const todas = historialParaAdmin(filas);
    const nombres = await nombresFuncionarios([...new Set(todas.map((h) => h.actor_id).filter((v): v is string => Boolean(v)))]);
    return todas.map((h) => ({
      fecha: fechaHora(h.cambiado_en),
      estado: ESTADO_TEXTO_PERSONAL[h.estado_nuevo] ?? h.estado_nuevo,
      quien: (h.actor_id && nombres.get(h.actor_id)) || (h.actor_tipo === 'SISTEMA' ? 'Sistema' : h.actor_tipo === 'BENEFICIARIO' ? 'Beneficiario' : String(h.actor_tipo)),
    }));
  }
}

export const resumenService = new ResumenService();
