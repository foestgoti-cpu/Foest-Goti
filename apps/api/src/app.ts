import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Health } from '@foest/shared';
import { env, hasSupabaseCredentials } from './config/env';
import { httpLogger, logger } from './shared/logger';
import { errorHandler, notFoundHandler } from './shared/errors';
import { supabaseAdmin } from './shared/supabase';
import { registrarModulos } from './modules';

export const API_PREFIX = '/api/v1';

/** Comprueba Supabase con una consulta trivial (sin claves -> `sin_credenciales`). */
export async function estadoSupabase(): Promise<Health['supabase']> {
  if (!hasSupabaseCredentials()) return 'sin_credenciales';
  try {
    const { error } = await supabaseAdmin.from('configuracion_sistema').select('clave', { head: true, count: 'exact' }).limit(1);
    if (error) {
      logger.warn({ err: error }, 'Supabase respondio con error en /health');
      return 'error';
    }
    return 'ok';
  } catch (e) {
    logger.warn({ err: e }, 'Fallo la comprobacion de Supabase en /health');
    return 'error';
  }
}

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(httpLogger);

  app.use(
    API_PREFIX,
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { code: 'DEMASIADAS_PETICIONES', message: 'Demasiadas peticiones; intente mas tarde' },
      skip: (req) => req.path === '/health',
    }),
  );

  app.get(`${API_PREFIX}/health`, async (_req: Request, res: Response) => {
    const supabase = await estadoSupabase();
    const body: Health = {
      ok: true,
      supabase,
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(body);
  });

  // Routers de modulos: cada modulo exporta su router en src/modules/<modulo>/<modulo>.routes.ts
  // y se registra en src/modules/index.ts con su prefijo bajo /api/v1.
  registrarModulos(app, API_PREFIX);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
