import type { CategoriaConfiguracion, ClaveConfiguracion, TipoConfiguracion } from '@foest/shared';

/**
 * Catalogo completo de claves (catalogos_configuracion.md): tipo, valor por
 * defecto, rango, categoria y descripcion. Es la fuente del seed de
 * `configuracion_sistema` (0001_base.sql, 0002_auth.sql, 0009_admin_dashboard.sql y
 * el bloque de resiembra idempotente de 0010_catalogos_configuracion.sql) y el
 * respaldo tipado de `configuracionService.get()` cuando una clave no esta en BD.
 */
export interface DefinicionClave {
  clave: ClaveConfiguracion;
  tipo: TipoConfiguracion;
  categoria: CategoriaConfiguracion;
  defecto: string | null;
  min: string | null;
  max: string | null;
  descripcion: string;
  pendiente_confirmar: boolean;
}

const def = (
  clave: ClaveConfiguracion,
  tipo: TipoConfiguracion,
  categoria: CategoriaConfiguracion,
  defecto: string | null,
  rango: [string | null, string | null],
  descripcion: string,
  pendiente_confirmar = false,
): DefinicionClave => ({ clave, tipo, categoria, defecto, min: rango[0], max: rango[1], descripcion, pendiente_confirmar });

export const CONFIGURACION_DEFAULTS: readonly DefinicionClave[] = [
  def('ACUERDO_VIGENTE_CODIGO', 'STRING', 'ACUERDO', 'ACUERDO-023-2025', [null, null], 'Codigo del acuerdo aplicable (impreso en formatos). Concordancia con Acuerdo 037 de 2025 por validar', true),
  def('ACUERDO_VIGENTE_TEXTO', 'TEXT', 'ACUERDO', 'Acuerdo Municipal 023 de 2025', [null, null], 'Texto de referencia mostrado y estampado en los PDF'),
  def('MAX_TAMANO_ARCHIVO_MB', 'INT', 'DOCUMENTOS', '10', ['1', '10'], 'Tope por archivo (no puede exceder 10)'),
  def('CUOTA_POSTULACION_MB', 'INT', 'DOCUMENTOS', '30', ['10', '200'], 'Cuota total de soportes por postulacion'),
  def('SUBSANACION_DIAS_HABILES', 'INT', 'PLAZOS', '5', ['1', '15'], 'Plazo por defecto de subsanacion (dias habiles)'),
  def('SUBSANACION_DIAS_HABILES_MAX', 'INT', 'PLAZOS', '15', ['1', '30'], 'Maximo que el funcionario puede fijar al emitir CORRECCION'),
  def('ALERTA_CIERRE_DIAS', 'INT', 'ALERTAS', '7', ['1', '30'], 'Dias naturales antes del cierre para alertar y recordar'),
  def('ALERTA_SOBRECARGA_PENDIENTES', 'INT', 'ALERTAS', '50', ['1', '1000'], 'Postulaciones PENDIENTE acumuladas para considerar sobrecarga'),
  def('ALERTA_SOBRECARGA_DIAS_HABILES', 'INT', 'ALERTAS', '5', ['1', '30'], 'Dias habiles sin revisiones para marcar cuello de botella'),
  def('ALERTA_ASIGNACION_SIN_MOVIMIENTO_DIAS_HABILES', 'INT', 'ALERTAS', '5', ['1', '60'], 'Dias habiles sin movimiento en una asignacion ACTIVA antes de alertar', true),
  def('ALERTA_POOL_DIAS_HABILES', 'INT', 'ALERTAS', '3', ['1', '30'], 'Dias habiles que una postulacion PENDIENTE puede esperar sin ser tomada'),
  def('ALERTA_SUBSANACION_DIAS_HABILES', 'INT', 'ALERTAS', '2', ['1', '15'], 'Dias habiles antes del vencimiento de una subsanacion para alertar'),
  def('ALERTA_CUPO_AVISO_PCT', 'INT', 'ALERTAS', '90', ['50', '100'], 'Porcentaje de ocupacion de cupos/presupuesto desde el que se avisa'),
  def('ALERTA_TRABAJOS_HORAS', 'INT', 'ALERTAS', '24', ['1', '168'], 'Ventana en horas para alertar reportes o correos fallidos'),
  def('KANON_UMBRAL', 'INT', 'PRIVACIDAD', '5', ['2', '50'], 'Umbral de k-anonimato en dashboards'),
  def('SESIONES_MAX', 'INT', 'SEGURIDAD', '3', ['1', '10'], 'Sesiones activas por usuario'),
  def('RECORDATORIO_BORRADOR_DIAS', 'INT', 'PLAZOS', '5', ['1', '30'], 'Dias antes del cierre para recordar al beneficiario con borrador'),
  def('RECORDATORIO_SUBSANACION_DIAS_HABILES', 'INT', 'PLAZOS', '2', ['1', '5'], 'Dias habiles antes de fecha_limite_subsanacion para avisar'),
  def('FECHA_PROXIMA_APERTURA_ESTIMADA', 'DATE', 'PLAZOS', null, [null, null], 'Fecha estimada mostrada cuando no hay convocatoria abierta'),
  def('CONSENTIMIENTO_TEXTO_VERSION_VIGENTE', 'INT', 'PRIVACIDAD', '1', ['1', null], 'Version vigente del consentimiento; solo cambia publicando una version'),
  def('CONSENTIMIENTO_TEXTO', 'TEXT', 'PRIVACIDAD', null, [null, null], 'Texto vigente del consentimiento de tratamiento de datos mostrado en el registro (sincronizado con texto_consentimiento)', true),
  def('PAGARE_REQUIERE_CODEUDOR_MENORES', 'BOOL', 'JURIDICO', 'true', [null, null], 'Activa el bloque de codeudor/acudiente en GE-F043 para menores', true),
  def('RETENCION_DOCUMENTOS_ANIOS', 'INT', 'JURIDICO', '5', ['1', '30'], 'Retencion de documentos eliminados logicamente', true),
  def('RETENCION_AUDITORIA_ANIOS', 'INT', 'JURIDICO', '10', ['1', '30'], 'Retencion de auditoria_evento', true),
  def('RETENCION_NOTIFICACIONES_MESES', 'INT', 'PRIVACIDAD', '24', ['3', '120'], 'Retencion de notificaciones y entregas de correo'),
  def('LABOR_SOCIAL_HORAS_MINIMAS', 'INT', 'LABOR_SOCIAL', '0', ['0', '1000'], 'Horas minimas exigidas por periodo (sin definir)', true),
  def('AMPLIACION_MOTIVO_MIN_CARACTERES', 'INT', 'PLAZOS', '15', ['10', '200'], 'Longitud minima del motivo de ampliacion/suspension'),
  def('PERFIL_EDAD_MAYORIA', 'INT', 'JURIDICO', '18', ['18', '18'], 'Edad de mayoria para derivar es_menor'),
  def('REGISTRO_VERIFICACION_EMAIL_HORAS', 'INT', 'SEGURIDAD', '48', ['1', '168'], 'Vigencia del enlace de verificacion de correo'),
  def('NOTIF_REINTENTOS_MAX', 'INT', 'NOTIFICACIONES', '8', ['1', '20'], 'Reintentos del worker de correo'),
  def('BLOQUEAR_ENVIO_SIN_TEXTO_OFICIAL', 'BOOL', 'JURIDICO', 'false', [null, null], 'Si es true, /enviar responde 422 DECLARACIONES_SIN_TEXTO_OFICIAL mientras existan declaraciones vigentes sin texto oficial confirmado (GE-F041)', true),
];

const porClave = new Map<string, DefinicionClave>(CONFIGURACION_DEFAULTS.map((d) => [d.clave, d]));

export function definicionDeClave(clave: string): DefinicionClave | undefined {
  return porClave.get(clave);
}
