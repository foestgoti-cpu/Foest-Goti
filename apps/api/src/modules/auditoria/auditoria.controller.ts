import type { RequestHandler } from 'express';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { auditoriaService } from './auditoria.service';
import type { AuditoriaEntidadParams, AuditoriaExportarQuery, AuditoriaListarQuery } from './auditoria.dto';

/** Envuelve un handler async y propaga errores al manejador global. */
const h =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const auditoriaController = {
  catalogo: h(async (_req, res) => {
    res.json(auditoriaService.catalogo());
  }),
  listar: h(async (req, res) => {
    res.json(await auditoriaService.listar(usuarioActual(req), req.query as unknown as AuditoriaListarQuery, contextoDesdeRequest(req)));
  }),
  detalle: h(async (req, res) => {
    res.json(await auditoriaService.detalle(usuarioActual(req), req.params.id as string, contextoDesdeRequest(req)));
  }),
  porEntidad: h(async (req, res) => {
    const { entidad, id } = req.params as unknown as AuditoriaEntidadParams;
    res.json(await auditoriaService.porEntidad(usuarioActual(req), entidad, id, contextoDesdeRequest(req)));
  }),
  exportar: h(async (req, res) => {
    const archivo = await auditoriaService.exportar(usuarioActual(req), req.query as unknown as AuditoriaExportarQuery, contextoDesdeRequest(req));
    res.setHeader('Content-Type', archivo.tipo_contenido);
    res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre_archivo}"`);
    res.setHeader('X-Auditoria-Filas', String(archivo.filas));
    res.status(200).send(archivo.contenido);
  }),
  integridad: h(async (req, res) => {
    res.json(await auditoriaService.integridad(usuarioActual(req)));
  }),
};
