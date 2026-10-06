import { TRANSICIONES_POSTULACION } from '@foest/shared';
import { errorDesdeSql, validarTransicion } from '../postulacion.state-machine';
import { cifrarNumero, descifrarNumero, enmascarar } from '../datos-pago.service';

describe('maquina de estados de postulacion (DECISIONES seccion 4)', () => {
  it('la tabla contiene las transiciones canonicas', () => {
    const pares = TRANSICIONES_POSTULACION.map((t) => `${t.desde}->${t.hacia}`);
    expect(pares).toEqual(
      expect.arrayContaining([
        'BORRADOR->PENDIENTE',
        'PENDIENTE->EN_EVALUACION',
        'EN_EVALUACION->PENDIENTE',
        'EN_EVALUACION->APROBADA',
        'EN_EVALUACION->RECHAZADA',
        'EN_EVALUACION->EN_CORRECCION',
        'EN_CORRECCION->PENDIENTE',
        'EN_CORRECCION->RECHAZADA',
        'PENDIENTE->DESISTIDA',
        'EN_EVALUACION->DESISTIDA',
        'EN_CORRECCION->DESISTIDA',
      ]),
    );
  });

  it('permite desistir desde PENDIENTE y rechaza desde BORRADOR', () => {
    expect(() => validarTransicion('PENDIENTE', 'DESISTIDA', 'DESISTIMIENTO', { tipo: 'BENEFICIARIO', id: 'u1' })).not.toThrow();
    expect(() => validarTransicion('BORRADOR', 'DESISTIDA', 'DESISTIMIENTO', { tipo: 'BENEFICIARIO', id: 'u1' })).toThrow(
      expect.objectContaining({ status: 409, code: 'TRANSICION_INVALIDA' }),
    );
  });

  it('ningun estado terminal admite transicion', () => {
    for (const terminal of ['APROBADA', 'RECHAZADA', 'DESISTIDA'] as const) {
      expect(() => validarTransicion(terminal, 'PENDIENTE', 'SUBSANACION', { tipo: 'BENEFICIARIO', id: 'u1' })).toThrow(
        expect.objectContaining({ code: 'TRANSICION_INVALIDA' }),
      );
    }
  });

  it('RECHAZADA no es subsanable y el vencimiento solo lo ejecuta SISTEMA', () => {
    expect(() => validarTransicion('RECHAZADA', 'PENDIENTE', 'SUBSANACION', { tipo: 'BENEFICIARIO', id: 'u1' })).toThrow();
    expect(() => validarTransicion('EN_CORRECCION', 'RECHAZADA', 'VENCIMIENTO_SUBSANACION', { tipo: 'SISTEMA' })).not.toThrow();
    expect(() => validarTransicion('EN_CORRECCION', 'RECHAZADA', 'VENCIMIENTO_SUBSANACION', { tipo: 'BENEFICIARIO', id: 'u1' })).toThrow();
  });

  it('traduce los errores de las funciones SQL a codigos HTTP', () => {
    expect(errorDesdeSql('PLAZO_SUBSANACION_VENCIDO: vencio').status).toBe(409);
    expect(errorDesdeSql('VERSION_CONFLICTO: x').code).toBe('VERSION_CONFLICTO');
    expect(errorDesdeSql('PERFIL_INCOMPLETO: x').status).toBe(422);
    expect(errorDesdeSql('NO_ENCONTRADO: x').status).toBe(404);
    expect(errorDesdeSql('otra cosa').status).toBe(500);
  });
});

describe('cifrado de datos de pago (AES-256-GCM)', () => {
  const original = process.env.DATOS_PAGO_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.DATOS_PAGO_KEY;
    else process.env.DATOS_PAGO_KEY = original;
  });

  it('sin DATOS_PAGO_KEY responde 503 CIFRADO_NO_CONFIGURADO', () => {
    delete process.env.DATOS_PAGO_KEY;
    expect(() => cifrarNumero('1234567890')).toThrow(expect.objectContaining({ status: 503, code: 'CIFRADO_NO_CONFIGURADO' }));
  });

  it('cifra y descifra; guarda ultimos4 en claro y enmascara', () => {
    process.env.DATOS_PAGO_KEY = 'a'.repeat(64);
    const r = cifrarNumero('1234567890');
    expect(r.ultimos4).toBe('7890');
    expect(r.numero_cifrado).not.toContain('1234567890');
    expect(r.numero_cifrado.split(':')).toHaveLength(4);
    expect(descifrarNumero(r.numero_cifrado)).toBe('1234567890');
    expect(enmascarar(r.ultimos4)).toBe('•••• 7890');
  });
});
