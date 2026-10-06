import request from 'supertest';
import { createApp } from '../../../app';

describe('modulo ejemplo (plantilla de pruebas por modulo)', () => {
  const app = createApp();

  it('la ruta publica responde 200 sin token', async () => {
    const res = await request(app).get('/api/v1/ejemplo/publico');
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBeDefined();
  });

  it('la ruta protegida responde 401 sin token (DECISIONES section 2)', async () => {
    const res = await request(app).get('/api/v1/ejemplo');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'NO_AUTENTICADO' });
  });

  it('una ruta inexistente responde 404 con el error estandar', async () => {
    const res = await request(app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'RUTA_NO_ENCONTRADA', message: expect.any(String) });
  });
});
