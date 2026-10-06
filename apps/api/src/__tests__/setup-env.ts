// Entorno de pruebas: sin credenciales de Supabase (todo debe funcionar o fallar con claridad).
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.WEB_ORIGIN = 'http://localhost:5173';
process.env.PORT = '4999';
