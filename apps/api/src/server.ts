import { createApp } from './app';
import { env, hasSupabaseCredentials } from './config/env';
import { logger } from './shared/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, web_origin: env.WEB_ORIGIN }, `API FOEST escuchando en http://localhost:${env.PORT}/api/v1`);
  if (!hasSupabaseCredentials()) {
    logger.warn(
      'Sin credenciales de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY). ' +
        '/health respondera supabase=sin_credenciales y las rutas autenticadas fallaran con 503.',
    );
  }
});

const apagar = (senal: string) => {
  logger.info({ senal }, 'Apagando API');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
