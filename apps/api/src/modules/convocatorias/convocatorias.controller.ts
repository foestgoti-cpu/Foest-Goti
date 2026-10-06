import type { RequestHandler } from 'express';
import { HTTP } from '@foest/shared';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { convocatoriasService } from './convocatorias.service';
import type {
  ActualizarConvocatoriaInput,
  AmpliarInput,
  ArchivarInput,
  ComiteInput,
  CrearConvocatoriaInput,
  DeshabilitarInput,
  ListarConvocatoriasQuery,
  VersionOpcionalInput,
} from './convocatorias.dto';

/** Controlador autenticado: traduce HTTP <-> servicio. Sin reglas de negocio. */
type Req = Parameters<RequestHandler>[0];
type Res = Parameters<RequestHandler>[1];

const envolver =
  (fn: (req: Req, res: Res) => Promise<void>): RequestHandler =>
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };

/** `:id` ya validado por `validate({ params: IdParamSchema })`. */
const idDe = (req: Req): string => String(req.params.id);

export const convocatoriasController = {
  listarBeneficios: envolver(async (req, res) => {
    res.json({ data: await convocatoriasService.listarBeneficios(usuarioActual(req)) });
  }),

  listar: envolver(async (req, res) => {
    res.json(await convocatoriasService.listar(usuarioActual(req), req.query as unknown as ListarConvocatoriasQuery));
  }),

  obtener: envolver(async (req, res) => {
    res.json(await convocatoriasService.obtener(usuarioActual(req), idDe(req)));
  }),

  crear: envolver(async (req, res) => {
    const creada = await convocatoriasService.crear(usuarioActual(req), req.body as CrearConvocatoriaInput, contextoDesdeRequest(req));
    res.status(HTTP.CREATED).json(creada);
  }),

  actualizar: envolver(async (req, res) => {
    res.json(await convocatoriasService.actualizar(usuarioActual(req), idDe(req), req.body as ActualizarConvocatoriaInput, contextoDesdeRequest(req)));
  }),

  habilitar: envolver(async (req, res) => {
    res.json(await convocatoriasService.habilitar(usuarioActual(req), idDe(req), req.body as VersionOpcionalInput, contextoDesdeRequest(req)));
  }),

  deshabilitar: envolver(async (req, res) => {
    res.json(await convocatoriasService.deshabilitar(usuarioActual(req), idDe(req), req.body as DeshabilitarInput, contextoDesdeRequest(req)));
  }),

  rehabilitar: envolver(async (req, res) => {
    res.json(await convocatoriasService.rehabilitar(usuarioActual(req), idDe(req), req.body as VersionOpcionalInput, contextoDesdeRequest(req)));
  }),

  ampliar: envolver(async (req, res) => {
    res.json(await convocatoriasService.ampliar(usuarioActual(req), idDe(req), req.body as AmpliarInput, contextoDesdeRequest(req)));
  }),

  archivar: envolver(async (req, res) => {
    res.json(await convocatoriasService.archivar(usuarioActual(req), idDe(req), req.body as ArchivarInput, contextoDesdeRequest(req)));
  }),

  listarComite: envolver(async (req, res) => {
    res.json({ data: await convocatoriasService.listarComite(usuarioActual(req), idDe(req)) });
  }),

  definirComite: envolver(async (req, res) => {
    res.json(await convocatoriasService.definirComite(usuarioActual(req), idDe(req), req.body as ComiteInput, contextoDesdeRequest(req)));
  }),
};

/** Controlador publico (sin autenticacion; serializador reducido). */
export const convocatoriasPublicoController = {
  listar: envolver(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(await convocatoriasService.listarPublicas());
  }),
  obtener: envolver(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(await convocatoriasService.obtenerPublica(idDe(req)));
  }),
};
