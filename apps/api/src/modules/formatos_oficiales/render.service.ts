import puppeteer, { Browser } from 'puppeteer';
import { TipoFormato } from '@foest/shared';
// import { compile } from 'handlebars';

export class RenderService {
  private browser: Browser | null = null;

  async init() {
    this.browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async render(tipo: TipoFormato, datos: any, codigoVerificacion: string): Promise<Buffer> {
    if (!this.browser) {
      await this.init();
    }
    
    const page = await this.browser!.newPage();
    try {
      // 1. Compile template
      // const html = compile('template string')(datos);
      
      const html = `<html><body><h1>${tipo}</h1><p>Codigo: ${codigoVerificacion}</p></body></html>`;
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
      });

      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const renderService = new RenderService();

