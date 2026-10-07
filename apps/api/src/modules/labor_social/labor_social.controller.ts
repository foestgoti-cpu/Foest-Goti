import type { NextFunction, Request, Response } from 'express';
import type { ActividadInput, ActividadPatchInput, CrearCertificadoInput, PresentarCertificadoInput } from '@foest/shared';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { laborSocialService as s } from './labor_social.service';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
type Handler = (req: Request, res: Response) => Promise<void>;
const manejar =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

const param = (req: Request, nombre: string): string => String(req.params[nombre] ?? '');

export const laborSocialController = {
  crear: manejar(async (req, res) => {
    res.status(201).json(await s.crear(usuarioActual(req), contextoDesdeRequest(req), req.body as CrearCertificadoInput));
  }),
  misCertificados: manejar(async (req, res) => {
    res.json(await s.misCertificados(usuarioActual(req)));
  }),
  agregarActividad: manejar(async (req, res) => {
    res.status(201).json(await s.agregarActividad(usuarioActual(req), contextoDesdeRequest(req), param(req, 'id'), req.body as ActividadInput));
  }),
  editarActividad: manejar(async (req, res) => {
    res.json(
      await s.editarActividad(usuarioActual(req), contextoDesdeRequest(req), param(req, 'id'), param(req, 'actividadId'), req.body as ActividadPatchInput),
    );
  }),
  eliminarActividad: manejar(async (req, res) => {
    res.json(await s.eliminarActividad(usuarioActual(req), contextoDesdeRequest(req), param(req, 'id'), param(req, 'actividadId')));
  }),
  completar: manejar(async (req, res) => {
    res.json(await s.completar(usuarioActual(req), contextoDesdeRequest(req), param(req, 'id')));
  }),
  reabrir: manejar(async (req, res) => {
    res.json(await s.reabrir(usuarioActual(req), contextoDesdeRequest(req), param(req, 'id')));
  }),
  presentar: manejar(async (req, res) => {
    const { documento_id } = req.body as PresentarCertificadoInput;
    res.json(await s.presentar(usuarioActual(req), contextoDesdeRequest(req), param(req, 'id'), documento_id));
  }),
  certificadoPdf: manejar(async (req, res) => {
    res.json(await s.descargarCertificado(usuarioActual(req), contextoDesdeRequest(req), param(req, 'id')));
  }),
  porBeneficiario: manejar(async (req, res) => {
    res.json(await s.porBeneficiario(usuarioActual(req), param(req, 'beneficiarioId')));
  }),
};
