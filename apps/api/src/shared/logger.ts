import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

/**
 * Logger estructurado (pino). En desarrollo intenta usar pino-pretty si esta
 * instalado; en pruebas y produccion escribe JSON.
 */
const esDesarrollo = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: { servicio: 'foest-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'access_token',
      'refresh_token',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
    censor: '[REDACTADO]',
  },
  ...(esDesarrollo
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
    : {}),
});

/** Middleware HTTP con `request_id` por peticion (se expone en `req.id` y en el header `X-Request-Id`). */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existente = req.headers['x-request-id'];
    const id = typeof existente === 'string' && existente.length <= 128 ? existente : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
});
