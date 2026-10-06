import { redactar } from '../shared/audit';

describe('redactar (auditoria)', () => {
  it('elimina secretos, enmascara documento y marca campos sensibles', () => {
    const salida = redactar({
      email: 'a@b.co',
      password_hash: 'xxx',
      token: 'yyy',
      numero_documento: '1234567890',
      estrato: 3,
      numero_cifrado: 'abc',
      anidado: { api_key: 'k', ok: 1 },
    }) as Record<string, unknown>;
    expect(salida).not.toHaveProperty('password_hash');
    expect(salida).not.toHaveProperty('token');
    expect(salida.numero_documento).toBe('***890');
    expect(salida.estrato).toBe('[SENSIBLE]');
    expect(salida.numero_cifrado).toBe('[CIFRADO]');
    expect(salida.anidado).toEqual({ ok: 1 });
    expect(salida.email).toBe('a@b.co');
  });
});
