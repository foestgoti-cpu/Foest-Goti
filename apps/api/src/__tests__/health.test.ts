import request from 'supertest';
import { createApp } from '../app';

describe('GET /api/v1/health', () => {
  it('responde 200 con supabase=sin_credenciales cuando no hay claves', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, supabase: 'sin_credenciales' });
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('aplica CORS al origen configurado con credenciales', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
