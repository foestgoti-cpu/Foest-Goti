import type { RequestHandler } from 'express';
import { AppError, contextoDesdeRequest, detallesZod, parsearPaginacion, usuarioActual } from '../../shared';
import { configuracionService } from './configuracion.service';
import { festivoService } from './festivo.service';
import { sniesService } from './snies.service';
import { declaracionService } from './declaracion.service';
import {
  SniesImportarBodyDto,
  type ConfiguracionActualizar,
  type ConfiguracionListarQuery,
  type DiasHabilesQuery,
  type FestivoCrear,
  type FestivosCargaAnual,
  type FestivosQuery,
  type PublicarConsentimiento,
  type PublicarDeclaracion,
  type SniesBusquedaQuery,
  type SniesImportarQuery,
} from './catalogos_configuracion.dto';

/** Envuelve un handler async y propaga errores al manejador global. */
const h =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const configuracionController = {
  listar: h(async (req, res) => {
    res.json(await configuracionService.listar(usuarioActual(req), req.query as unknown as ConfiguracionListarQuery));
  }),
  obtener: h(async (req, res) => {
    res.json(await configuracionService.obtener(usuarioActual(req), req.params.clave as string));
  }),
  actualizar: h(async (req, res) => {
    res.json(
      await configuracionService.actualizar(usuarioActual(req), req.params.clave as string, req.body as ConfiguracionActualizar, contextoDesdeRequest(req)),
    );
  }),
  publica: h(async (req, res) => {
    usuarioActual(req);
    res.json(await configuracionService.publica());
  }),
};

export const festivosController = {
  listar: h(async (req, res) => {
    res.json(await festivoService.listar(usuarioActual(req), req.query as unknown as FestivosQuery));
  }),
  crear: h(async (req, res) => {
    res.status(201).json(await festivoService.crear(usuarioActual(req), req.body as FestivoCrear, contextoDesdeRequest(req)));
  }),
  eliminar: h(async (req, res) => {
    await festivoService.eliminar(usuarioActual(req), req.params.id as string, contextoDesdeRequest(req));
    res.status(204).end();
  }),
  cargaAnual: h(async (req, res) => {
    res.json(await festivoService.cargaAnual(usuarioActual(req), req.body as FestivosCargaAnual, contextoDesdeRequest(req)));
  }),
  propuesta: h(async (req, res) => {
    usuarioActual(req);
    res.json(festivoService.propuesta((req.query as unknown as { anio: number }).anio));
  }),
  diasHabiles: h(async (req, res) => {
    usuarioActual(req);
    const q = req.query as unknown as DiasHabilesQuery;
    res.json(await festivoService.diasHabiles(q.desde, q.n));
  }),
};

export const sniesController = {
  buscarIes: h(async (req, res) => {
    res.json(await sniesService.buscarIes(usuarioActual(req), req.query as unknown as SniesBusquedaQuery));
  }),
  programasDeIes: h(async (req, res) => {
    res.json(await sniesService.programasDeIes(usuarioActual(req), req.params.codigo_snies as string, req.query as unknown as SniesBusquedaQuery));
  }),
  detallePrograma: h(async (req, res) => {
    res.json(await sniesService.detallePrograma(usuarioActual(req), req.params.codigo_snies as string));
  }),
  /**
   * Acepta el CSV como `text/csv` (cuerpo crudo; nombre en `?archivo_nombre=` o
   * cabecera `X-Archivo-Nombre`) o como JSON `{ archivo_nombre, contenido }`.
   * `?modo=simulacion` valida sin escribir.
   */
  importar: h(async (req, res) => {
    const user = usuarioActual(req);
    const query = req.query as unknown as SniesImportarQuery;
    let contenido: string;
    let archivoNombre: string;
    if (typeof req.body === 'string') {
      contenido = req.body;
      archivoNombre = query.archivo_nombre ?? String(req.headers['x-archivo-nombre'] ?? 'snies.csv').slice(0, 200);
    } else {
      const parsed = SniesImportarBodyDto.safeParse(req.body);
      if (!parsed.success) throw AppError.datosInvalidos('DATOS_INVALIDOS', 'Datos invalidos en body', detallesZod(parsed.error));
      contenido = parsed.data.contenido;
      archivoNombre = parsed.data.archivo_nombre;
    }
    if (!contenido.trim()) throw AppError.datosInvalidos('CSV_VACIO', 'El archivo esta vacio');
    res.json(await sniesService.importar(contenido, { archivo_nombre: archivoNombre, modo: query.modo, actor: user }, contextoDesdeRequest(req)));
  }),
  importaciones: h(async (req, res) => {
    res.json(await sniesService.importaciones(usuarioActual(req), parsearPaginacion(req.query)));
  }),
};

export const declaracionesController = {
  vigentes: h(async (req, res) => {
    res.json(await declaracionService.vigentes(usuarioActual(req)));
  }),
  todas: h(async (req, res) => {
    res.json(await declaracionService.todas(usuarioActual(req)));
  }),
  publicar: h(async (req, res) => {
    res
      .status(201)
      .json(await declaracionService.publicarDeclaracion(usuarioActual(req), req.params.codigo as string, req.body as PublicarDeclaracion, contextoDesdeRequest(req)));
  }),
  consentimientoVigente: h(async (_req, res) => {
    res.json(await declaracionService.consentimientoVigente());
  }),
  versionesConsentimiento: h(async (req, res) => {
    res.json(await declaracionService.versionesConsentimiento(usuarioActual(req)));
  }),
  publicarConsentimiento: h(async (req, res) => {
    res.status(201).json(await declaracionService.publicarConsentimiento(usuarioActual(req), req.body as PublicarConsentimiento, contextoDesdeRequest(req)));
  }),
};
