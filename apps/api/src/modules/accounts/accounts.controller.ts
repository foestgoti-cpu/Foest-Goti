import type { RequestHandler } from 'express';
import { contextoDesdeRequest, usuarioActual, parsearPaginacion } from '../../shared';
import { administradoresService, beneficiariosService, funcionariosService, habeasDataService } from './accounts.service';
import type {
  ActualizarFuncionario,
  CambiarEstadoCuenta,
  CorregirDocumento,
  CrearFuncionario,
  ListarBeneficiariosQuery,
  ListarFuncionariosQuery,
  ListarHabeasDataQuery,
  PerfilBeneficiarioEntrada,
  ResolverHabeasData,
  SolicitudHabeasDataEntrada,
} from './accounts.dto';

/** Envuelve un handler async para propagar errores al manejador global. */
const h =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const id = (req: Parameters<RequestHandler>[0]) => (req.params as { id: string }).id;

export const funcionariosController = {
  listar: h(async (req, res) => {
    res.json(await funcionariosService.listar(req.query as unknown as ListarFuncionariosQuery));
  }),
  dependencias: h(async (_req, res) => {
    res.json({ data: await funcionariosService.dependencias() });
  }),
  detalle: h(async (req, res) => {
    res.json(await funcionariosService.detalle(id(req)));
  }),
  invitar: h(async (req, res) => {
    const creado = await funcionariosService.invitar(contextoDesdeRequest(req), req.body as CrearFuncionario);
    res.status(201).json(creado);
  }),
  actualizar: h(async (req, res) => {
    res.json(await funcionariosService.actualizar(contextoDesdeRequest(req), id(req), req.body as ActualizarFuncionario));
  }),
  cambiarEstado: h(async (req, res) => {
    res.json(await funcionariosService.cambiarEstado(contextoDesdeRequest(req), id(req), req.body as CambiarEstadoCuenta));
  }),
  reenviarInvitacion: h(async (req, res) => {
    res.json(await funcionariosService.reenviarInvitacion(contextoDesdeRequest(req), id(req)));
  }),
};

export const administradoresController = {
  listar: h(async (req, res) => {
    res.json(await administradoresService.listar(parsearPaginacion(req.query)));
  }),
  cambiarEstado: h(async (req, res) => {
    const user = usuarioActual(req);
    res.json(await administradoresService.cambiarEstado(contextoDesdeRequest(req), user, id(req), req.body as CambiarEstadoCuenta));
  }),
};

export const beneficiariosController = {
  perfilPropio: h(async (req, res) => {
    res.json(await beneficiariosService.perfilPropio(usuarioActual(req)));
  }),
  actualizarPerfilPropio: h(async (req, res) => {
    res.json(await beneficiariosService.actualizarPerfilPropio(contextoDesdeRequest(req), usuarioActual(req), req.body as PerfilBeneficiarioEntrada));
  }),
  consentimientosPropios: h(async (req, res) => {
    res.json(await beneficiariosService.consentimientosPropios(usuarioActual(req)));
  }),
  aceptarConsentimiento: h(async (req, res) => {
    res.status(201).json(await beneficiariosService.aceptarConsentimiento(contextoDesdeRequest(req), usuarioActual(req)));
  }),
  exportarDatosPropios: h(async (req, res) => {
    res.json(await beneficiariosService.exportarDatosPropios(contextoDesdeRequest(req), usuarioActual(req)));
  }),
  radicarHabeasData: h(async (req, res) => {
    res.status(201).json(await habeasDataService.radicar(contextoDesdeRequest(req), usuarioActual(req), req.body as SolicitudHabeasDataEntrada));
  }),
  habeasDataPropias: h(async (req, res) => {
    res.json({ data: await habeasDataService.propias(usuarioActual(req)) });
  }),
  listar: h(async (req, res) => {
    res.json(await beneficiariosService.listar(req.query as unknown as ListarBeneficiariosQuery));
  }),
  detalle: h(async (req, res) => {
    res.json(await beneficiariosService.detalle(contextoDesdeRequest(req), usuarioActual(req), id(req)));
  }),
  cambiarEstado: h(async (req, res) => {
    res.json(await beneficiariosService.cambiarEstado(contextoDesdeRequest(req), id(req), req.body as CambiarEstadoCuenta));
  }),
  corregirDocumento: h(async (req, res) => {
    res.json(await beneficiariosService.corregirDocumento(contextoDesdeRequest(req), id(req), req.body as CorregirDocumento));
  }),
};

export const habeasDataController = {
  bandeja: h(async (req, res) => {
    const user = usuarioActual(req);
    if (user.rol === 'ADMINISTRADOR') {
      res.json(await habeasDataService.bandeja(req.query as unknown as ListarHabeasDataQuery));
      return;
    }
    const propias = await habeasDataService.propias(user);
    res.json({ data: propias, page: 1, page_size: propias.length, total: propias.length });
  }),
  resolver: h(async (req, res) => {
    const user = usuarioActual(req);
    res.json(await habeasDataService.resolver(contextoDesdeRequest(req), user, id(req), req.body as ResolverHabeasData));
  }),
};
