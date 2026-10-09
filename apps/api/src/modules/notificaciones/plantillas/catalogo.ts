import type { TipoNotificacion } from '@foest/shared';
import { CATALOGO_TIPOS_NOTIFICACION } from '@foest/shared';
import type { PayloadOutbox } from '../notificaciones.types';
import { htmlATexto, renderizarTexto, verificarContexto } from './render';

/**
 * Plantillas de correo versionadas, firmadas "Equipo FOEST". Sin variables de actor.
 * Toda plantilla recibe al menos `titulo`, `mensaje` y opcionalmente `url_destino`
 * (ruta interna del SPA; el correo enlaza al portal y el detalle se ve autenticado).
 * Las variables adicionales obligatorias se declaran por tipo.
 */
export interface PlantillaCorreo {
  version: number;
  asunto: string;
  cuerpo: string;
  obligatorias: readonly string[];
}

const FIRMA = 'Equipo FOEST';
const ENTIDAD = 'Fondo para la Educacion Superior de Tocancipa (FOEST) - Alcaldia Municipal de Tocancipa';

export const LAYOUT_VERSION = 1;

/** Layout institucional: solo blanco, azul #0066ff y texto negro. */
export function layout(contenidoHtml: string, contexto: { portal_url: string; asunto: string }): string {
  const portal = contexto.portal_url;
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${contexto.asunto}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;border:1px solid #000000;background:#ffffff;">
        <tr><td style="background:#0066ff;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold;">FOEST - Fondo para la Educacion Superior de Tocancipa</td></tr>
        <tr><td style="padding:24px;">
          ${contenidoHtml}
          <p style="margin:24px 0 0 0;">Atentamente,<br><strong>${FIRMA}</strong></p>
        </td></tr>
        <tr><td style="border-top:1px solid #000000;padding:16px 24px;font-size:12px;color:#000000;">
          <p style="margin:0 0 8px 0;">${ENTIDAD}. Este mensaje se envio de forma automatica; por favor no responda a este correo.</p>
          <p style="margin:0 0 8px 0;">Portal: <a href="${portal}" style="color:#0066ff;">${portal}</a></p>
          <p style="margin:0;">Sus datos personales se tratan conforme a la Ley 1581 de 2012 y la politica de tratamiento de datos de la Alcaldia de Tocancipa. Este correo no contiene informacion sensible; la informacion detallada se consulta en el portal con su usuario y contrasena.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const BOTON = `{{#if enlace}}<p style="margin:16px 0;"><a href="{{enlace}}" style="display:inline-block;border:1px solid #0066ff;background:#0066ff;color:#ffffff;padding:10px 16px;text-decoration:none;font-weight:bold;">Ingresar al portal</a></p>{{/if}}`;

const GENERICA: PlantillaCorreo = {
  version: 1,
  asunto: '[FOEST] {{titulo}}',
  cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p>${BOTON}`,
  obligatorias: ['titulo', 'mensaje'],
};

function conSaludo(cuerpo: string): string {
  return `<p style="margin:0 0 12px 0;">Cordial saludo{{#if nombre}}, {{nombre}}{{/if}}.</p>${cuerpo}${BOTON}`;
}

const PLANTILLAS: Partial<Record<TipoNotificacion, PlantillaCorreo>> = {
  POSTULACION_ENVIADA: {
    version: 1,
    asunto: '[FOEST] Recibimos su postulacion',
    cuerpo: conSaludo(
      `<p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0 0 12px 0;">{{#if convocatoria_nombre}}Convocatoria: <strong>{{convocatoria_nombre}}</strong>. {{/if}}{{#if ciclo}}Envio numero {{ciclo}}. {{/if}}Le informaremos por este medio y en el portal cada cambio de estado.</p>`,
    ),
    obligatorias: ['titulo', 'mensaje'],
  },
  POSTULACION_EN_REVISION: {
    version: 1,
    asunto: '[FOEST] Su postulacion esta en revision',
    cuerpo: conSaludo(`<p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0 0 12px 0;">No necesita realizar ninguna accion por ahora.</p>`),
    obligatorias: ['titulo', 'mensaje'],
  },
  CORRECCION_SOLICITADA: {
    version: 1,
    asunto: '[FOEST] Su postulacion requiere correcciones',
    cuerpo: conSaludo(
      `<p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0 0 12px 0;"><strong>Plazo para subsanar: {{fecha_limite_texto}}.</strong> Si no realiza las correcciones dentro del plazo, la postulacion sera rechazada por vencimiento.</p>{{#if observacion}}<p style="margin:0 0 12px 0;border:1px solid #000000;padding:12px;">Observaciones: {{observacion}}</p>{{/if}}`,
    ),
    obligatorias: ['titulo', 'mensaje', 'fecha_limite_texto'],
  },
  POSTULACION_APROBADA: {
    version: 1,
    asunto: '[FOEST] Resultado de su postulacion: aprobada',
    cuerpo: conSaludo(`<p style="margin:0 0 12px 0;">{{mensaje}}</p>{{#if parcial}}<p style="margin:0 0 12px 0;">La aprobacion es parcial: consulte en el portal el detalle por beneficio.</p>{{/if}}`),
    obligatorias: ['titulo', 'mensaje'],
  },
  POSTULACION_RECHAZADA: {
    version: 1,
    asunto: '[FOEST] Resultado de su postulacion',
    cuerpo: conSaludo(`<p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0 0 12px 0;">Puede consultar el detalle del resultado en el portal.</p>`),
    obligatorias: ['titulo', 'mensaje'],
  },
  SUBSANACION_POR_VENCER: {
    version: 1,
    asunto: '[FOEST] Su plazo para subsanar esta por vencer',
    cuerpo: conSaludo(`<p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0 0 12px 0;"><strong>Fecha limite: {{fecha_limite_texto}}.</strong></p>`),
    obligatorias: ['titulo', 'mensaje', 'fecha_limite_texto'],
  },
  RECORDATORIO_BORRADOR: {
    version: 1,
    asunto: '[FOEST] Su postulacion en borrador esta pendiente de envio',
    cuerpo: conSaludo(
      `<p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0 0 12px 0;">Convocatoria: <strong>{{convocatoria_nombre}}</strong>. Cierre: <strong>{{fecha_cierre_texto}}</strong>.</p>`,
    ),
    obligatorias: ['titulo', 'mensaje', 'convocatoria_nombre', 'fecha_cierre_texto'],
  },
  POSTULACION_DESISTIDA: {
    version: 1,
    asunto: '[FOEST] Registramos el desistimiento de su postulacion',
    cuerpo: conSaludo(`<p style="margin:0 0 12px 0;">{{mensaje}}</p>`),
    obligatorias: ['titulo', 'mensaje'],
  },
  CONVOCATORIA_ABIERTA: {
    version: 1,
    asunto: '[FOEST] Nueva convocatoria abierta',
    cuerpo: conSaludo(`<p style="margin:0 0 12px 0;">{{mensaje}}</p>{{#if fecha_cierre_texto}}<p style="margin:0 0 12px 0;">Cierre: <strong>{{fecha_cierre_texto}}</strong>.</p>{{/if}}`),
    obligatorias: ['titulo', 'mensaje'],
  },
  CONVOCATORIA_SUSPENDIDA: {
    version: 1,
    asunto: '[FOEST] Convocatoria suspendida temporalmente',
    cuerpo: conSaludo(`<p style="margin:0 0 12px 0;">{{mensaje}}</p>`),
    obligatorias: ['titulo', 'mensaje'],
  },
  CONVOCATORIA_POR_CERRAR: {
    version: 1,
    asunto: '[FOEST] Convocatoria proxima a cerrar',
    cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p>${BOTON}`,
    obligatorias: ['titulo', 'mensaje'],
  },
  REPORTE_LISTO: {
    version: 1,
    asunto: '[FOEST] Su reporte esta listo',
    cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0 0 12px 0;">La descarga se realiza desde el portal, una vez autenticado.</p>${BOTON}`,
    obligatorias: ['titulo', 'mensaje'],
  },
  INVITACION_FUNCIONARIO: {
    version: 1,
    asunto: '[FOEST] Invitacion para activar su cuenta de funcionario',
    cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0 0 12px 0;">El enlace es de un solo uso y vence en {{horas_vigencia}} horas.</p><p style="margin:16px 0;"><a href="{{enlace_accion}}" style="display:inline-block;border:1px solid #0066ff;background:#0066ff;color:#ffffff;padding:10px 16px;text-decoration:none;font-weight:bold;">Activar cuenta</a></p>`,
    obligatorias: ['titulo', 'mensaje', 'enlace_accion', 'horas_vigencia'],
  },
  VERIFICACION_CORREO: {
    version: 1,
    asunto: '[FOEST] Verifique su correo electronico',
    cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:16px 0;"><a href="{{enlace_accion}}" style="display:inline-block;border:1px solid #0066ff;background:#0066ff;color:#ffffff;padding:10px 16px;text-decoration:none;font-weight:bold;">Verificar correo</a></p><p style="margin:0;">Si usted no solicito este registro, ignore este mensaje.</p>`,
    obligatorias: ['titulo', 'mensaje', 'enlace_accion'],
  },
  RESTABLECER_CLAVE: {
    version: 1,
    asunto: '[FOEST] Restablecimiento de contrasena',
    cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:16px 0;"><a href="{{enlace_accion}}" style="display:inline-block;border:1px solid #0066ff;background:#0066ff;color:#ffffff;padding:10px 16px;text-decoration:none;font-weight:bold;">Restablecer contrasena</a></p><p style="margin:0;">Si usted no solicito el cambio, ignore este mensaje; su contrasena actual sigue vigente.</p>`,
    obligatorias: ['titulo', 'mensaje', 'enlace_accion'],
  },
  BLOQUEO_POR_INTENTOS: {
    version: 1,
    asunto: '[FOEST] Aviso de seguridad: cuenta bloqueada temporalmente',
    cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0;">Si no fue usted, le recomendamos cambiar su contrasena cuando el bloqueo termine.</p>`,
    obligatorias: ['titulo', 'mensaje'],
  },
  CAMBIO_CLAVE_CONFIRMACION: {
    version: 1,
    asunto: '[FOEST] Su contrasena fue cambiada',
    cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p><p style="margin:0;">Si usted no realizo este cambio, comuniquese de inmediato con el Equipo FOEST.</p>`,
    obligatorias: ['titulo', 'mensaje'],
  },
  CUENTA_DESHABILITADA: {
    version: 1,
    asunto: '[FOEST] Su cuenta fue deshabilitada',
    cuerpo: `<p style="margin:0 0 12px 0;">Cordial saludo.</p><p style="margin:0 0 12px 0;">{{mensaje}}</p>`,
    obligatorias: ['titulo', 'mensaje'],
  },
};

export function plantillaDe(tipo: TipoNotificacion): PlantillaCorreo {
  return PLANTILLAS[tipo] ?? GENERICA;
}

export interface CorreoRenderizado {
  asunto: string;
  html: string;
  texto: string;
  plantilla_version: number;
}

/** Claves del payload que no deben sobrevivir al envio (enlaces con token, etc.). */
export const CLAVES_SENSIBLES_PAYLOAD = ['enlace_accion', 'token', 'codigo', 'enlace'] as const;

/**
 * Renderiza asunto, HTML y texto plano de un evento. Lanza `ErrorPlantilla` si faltan
 * variables obligatorias o si el contexto trae variables de actor.
 */
export function renderizarCorreo(tipo: TipoNotificacion, payload: PayloadOutbox, portalUrl: string): CorreoRenderizado {
  const plantilla = plantillaDe(tipo);
  const contexto: PayloadOutbox = { ...payload };
  if (!contexto.enlace && typeof contexto.url_destino === 'string' && contexto.url_destino.startsWith('/')) {
    contexto.enlace = `${portalUrl}${contexto.url_destino}`;
  }
  if (!contexto.enlace && CATALOGO_TIPOS_NOTIFICACION[tipo].categoria !== 'SEGURIDAD') contexto.enlace = portalUrl;
  verificarContexto(contexto, plantilla.obligatorias);
  const asunto = renderizarTexto(plantilla.asunto, contexto, false).replace(/\s+/g, ' ').trim();
  const cuerpo = renderizarTexto(plantilla.cuerpo, contexto, true);
  const html = layout(cuerpo, { portal_url: portalUrl, asunto: renderizarTexto(plantilla.asunto, contexto, true) });
  return { asunto, html, texto: htmlATexto(html), plantilla_version: plantilla.version * 100 + LAYOUT_VERSION };
}
