import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import type { Browser } from 'puppeteer';
import type { TipoFormato } from '@foest/shared';
import { logger } from '../../shared';
import { generarQrDataUri } from './qr.service';
import { NOMBRE_FORMATO, VERSION_PLANTILLA } from './formato.types';

/**
 * Handlebars -> HTML -> PDF con Puppeteer. El navegador Chromium se reutiliza (una pagina por
 * render, cerrada al terminar). El HTML no depende de recursos externos: toda peticion de red
 * de la pagina se bloquea. El PDF resultante NO se post-procesa: su SHA-256 se calcula despues.
 *
 * Si no se puede descargar/usar el Chromium de Puppeteer, configure PUPPETEER_EXECUTABLE_PATH
 * con la ruta de un Chrome/Chromium instalado.
 */

/**
 * puppeteer v25 es solo ESM y el API compila a CommonJS: se carga de forma perezosa con un import()
 * dinamico que sobrevive a la compilacion (y evita cargarlo al arrancar la app o las pruebas).
 */
const importDinamico = new Function('m', 'return import(m)') as (m: string) => Promise<typeof import('puppeteer')>;

const ARCHIVOS_PLANTILLA: Record<TipoFormato, string> = {
  'GE-F041': 'GE-F041.hbs',
  'GE-F043': 'GE-F043.hbs',
};

/** Las plantillas viven junto al codigo (src) y se copian a dist en el build; tambien se busca en src. */
function directorioPlantillas(): string {
  const candidatos = [
    path.join(__dirname, 'plantillas'),
    path.resolve(process.cwd(), 'src', 'modules', 'formatos_oficiales', 'plantillas'),
    path.resolve(process.cwd(), 'apps', 'api', 'src', 'modules', 'formatos_oficiales', 'plantillas'),
  ];
  for (const c of candidatos) if (fs.existsSync(c)) return c;
  throw new Error('No se encontro el directorio de plantillas de formatos oficiales');
}

const plantillasCompiladas = new Map<TipoFormato, Handlebars.TemplateDelegate>();

function plantilla(tipo: TipoFormato): Handlebars.TemplateDelegate {
  let compilada = plantillasCompiladas.get(tipo);
  if (!compilada) {
    const fuente = fs.readFileSync(path.join(directorioPlantillas(), ARCHIVOS_PLANTILLA[tipo]), 'utf8');
    compilada = Handlebars.compile(fuente, { strict: false });
    plantillasCompiladas.set(tipo, compilada);
  }
  return compilada;
}

export interface EntradaRender {
  tipo: TipoFormato;
  vista: Record<string, unknown>;
  codigoVerificacion: string;
  generadoEn: Date;
}

function fechaLegible(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }).format(d);
}

/** HTML final (sin PDF): util para depurar la plantilla. */
export async function renderizarHtml(entrada: EntradaRender): Promise<string> {
  const qr = await generarQrDataUri(entrada.codigoVerificacion);
  return plantilla(entrada.tipo)({
    ...entrada.vista,
    titulo_formato: NOMBRE_FORMATO[entrada.tipo],
    codigo_formato: entrada.tipo,
    version_plantilla: VERSION_PLANTILLA[entrada.tipo],
    codigo_verificacion: entrada.codigoVerificacion,
    qr_data_uri: qr,
    generado_en_texto: fechaLegible(entrada.generadoEn),
  });
}

/** Pie de cada pagina: QR + codigo de verificacion en texto legible + numeracion. El codigo es base64url (sin HTML). */
function pieDePagina(codigo: string, qrDataUri: string): string {
  return `<div style="width:100%;font-family:'Times New Roman','Liberation Serif',serif;font-size:8px;color:#000;padding:0 16mm;box-sizing:border-box;">
  <div style="border-top:0.5px solid #000;padding-top:2mm;display:flex;align-items:center;">
    <img src="${qrDataUri}" style="width:17mm;height:17mm;margin-right:4mm;" />
    <div style="flex:1;">
      <div>Verifique la autenticidad de este documento en la plataforma FOEST con el código:</div>
      <div style="font-family:'Courier New','Liberation Mono',monospace;font-size:10px;font-weight:bold;">${codigo}</div>
      <div>El código y el QR no constituyen firma digital certificada.</div>
    </div>
    <div>Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>
  </div>
</div>`;
}

export class RenderService {
  private browser: Browser | null = null;
  private lanzando: Promise<Browser> | null = null;

  private async obtenerNavegador(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (!this.lanzando) {
      this.lanzando = importDinamico('puppeteer')
        .then((pptr) => pptr.default.launch({
          headless: true,
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        }))
        .then((b) => {
          this.browser = b;
          b.on('disconnected', () => {
            if (this.browser === b) this.browser = null;
          });
          return b;
        })
        .finally(() => {
          this.lanzando = null;
        });
    }
    return this.lanzando;
  }

  /** Renderiza el formato a PDF A4. Lanza si supera `timeoutMs` o falla el navegador. */
  async render(entrada: EntradaRender, timeoutMs = 60_000): Promise<Buffer> {
    const html = await renderizarHtml(entrada);
    const qr = await generarQrDataUri(entrada.codigoVerificacion);
    return this.renderHtmlAPdf(html, { footerTemplate: pieDePagina(entrada.codigoVerificacion, qr), timeoutMs });
  }

  /**
   * HTML ya armado -> PDF A4 reutilizando el navegador (otros modulos con su propia plantilla, p. ej. labor_social GE-F038).
   * Sin red ni JavaScript en la pagina; el PDF no se post-procesa.
   */
  async renderHtmlAPdf(
    html: string,
    opciones: { footerTemplate: string; timeoutMs?: number; margin?: { top: string; bottom: string; left: string; right: string } },
  ): Promise<Buffer> {
    const timeoutMs = opciones.timeoutMs ?? 60_000;
    const navegador = await this.obtenerNavegador();
    const page = await navegador.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url === 'about:blank') void req.continue();
        else void req.abort();
      });
      await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: opciones.margin ?? { top: '18mm', bottom: '30mm', left: '16mm', right: '16mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: opciones.footerTemplate,
        timeout: timeoutMs,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch((e: unknown) => logger.warn({ err: e }, 'No se pudo cerrar la pagina de render'));
    }
  }

  /**
   * Renderiza HTML ya construido a PDF A4 reutilizando el mismo navegador (lo usa export_reports para
   * el resumen ejecutivo). Sin red, sin JavaScript; pie de pagina opcional (solo numeracion por defecto).
   */
  async renderHtml(html: string, opciones: { pieHtml?: string; timeoutMs?: number } = {}): Promise<Buffer> {
    const timeoutMs = opciones.timeoutMs ?? 60_000;
    const navegador = await this.obtenerNavegador();
    const page = await navegador.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url === 'about:blank') void req.continue();
        else void req.abort();
      });
      await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          opciones.pieHtml ??
          `<div style="width:100%;font-family:'Times New Roman','Liberation Serif',serif;font-size:8px;color:#000;padding:0 16mm;text-align:right;box-sizing:border-box;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
        timeout: timeoutMs,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch((e: unknown) => logger.warn({ err: e }, 'No se pudo cerrar la pagina de render'));
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      const b = this.browser;
      this.browser = null;
      await b.close().catch(() => undefined);
    }
  }
}

export const renderService = new RenderService();
