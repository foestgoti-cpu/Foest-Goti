import type { PostgrestError } from '@supabase/supabase-js';
import { contieneCamposActor, FIRMA_PUBLICA, limpiarCamposActor, serializarObservacionPublica } from '../observacion.publica';
import { presentarEstado, tituloHito } from '../estados.presentacion';
import { esTablaInexistente, textoCierre, diasHasta } from '../supabase.util';

describe('ObservacionPublica (anonimato del evaluador)', () => {
  it('construye el DTO con firma "Equipo FOEST" y sin ningun campo de actor', () => {
    const cruda = {
      cambiado_en: '2026-03-01T10:00:00.000Z',
      observaciones: 'Debe actualizar el certificado.',
      campos_observados: ['datos.telefono', { campo: 'perfil.direccion', etiqueta: 'Direccion' }],
      documentos_observados: '["Certificado SISBEN"]',
      actor_id: 'f-1',
      actor_tipo: 'FUNCIONARIO',
      funcionario: { nombres: 'Juan', apellidos: 'Perez', email: 'juan@tocancipa.gov.co' },
    };
    const dto = serializarObservacionPublica(cruda);
    expect(dto).toEqual({
      fecha: '2026-03-01T10:00:00.000Z',
      firma: FIRMA_PUBLICA,
      texto: 'Debe actualizar el certificado.',
      campos_observados: ['datos.telefono', 'Direccion'],
      documentos_observados: ['Certificado SISBEN'],
    });
    expect(Object.keys(dto!)).toEqual(['fecha', 'firma', 'texto', 'campos_observados', 'documentos_observados']);
    expect(contieneCamposActor(dto)).toEqual([]);
    expect(JSON.stringify(dto)).not.toMatch(/juan|perez|f-1|FUNCIONARIO/i);
  });

  it('devuelve null cuando no hay nada que mostrar', () => {
    expect(serializarObservacionPublica({ observaciones: '   ' })).toBeNull();
  });

  it('limpiarCamposActor elimina claves de actor en cualquier nivel y conserva el resto', () => {
    const entrada = {
      hitos: [{ titulo: 'x', actor_id: 'a', detalle: { funcionario_id: 'b', evaluador: { email: 'e' }, texto: 'ok' } }],
      saludo: { nombre: 'Laura' },
      usuario_id: 'u',
    };
    const salida = limpiarCamposActor(entrada);
    expect(salida).toEqual({ hitos: [{ titulo: 'x', detalle: { texto: 'ok' } }], saludo: { nombre: 'Laura' } });
    expect(contieneCamposActor(entrada).length).toBeGreaterThan(0);
    expect(contieneCamposActor(salida)).toEqual([]);
  });
});

describe('estados.presentacion', () => {
  it('traduce cada estado tecnico segun la tabla del modulo', () => {
    expect(presentarEstado('BORRADOR').texto).toBe('Borrador sin enviar');
    expect(presentarEstado('PENDIENTE').texto).toBe('Recibida, en espera de revision');
    expect(presentarEstado('EN_EVALUACION').texto).toBe('En revision por el Comite FOEST');
    expect(presentarEstado('EN_CORRECCION').texto).toBe('Documentos pendientes de correccion');
    expect(presentarEstado('APROBADA').texto).toBe('Aprobada. Felicitaciones');
    expect(presentarEstado('APROBADA', true).texto).toBe('Aprobada parcialmente: revise el resultado por beneficio');
    expect(presentarEstado('RECHAZADA').texto).toBe('No aprobada (revise las observaciones)');
    expect(presentarEstado('DESISTIDA').texto).toBe('Desistida por usted');
    expect(tituloHito('PENDIENTE', 2)).toContain('ciclo 2');
  });
});

describe('supabase.util', () => {
  const err = (code: string, message: string) => ({ code, message, details: '', hint: '', name: 'PostgrestError' }) as unknown as PostgrestError;

  it('reconoce tablas inexistentes por codigo o mensaje', () => {
    expect(esTablaInexistente(err('42P01', 'x'))).toBe(true);
    expect(esTablaInexistente(err('PGRST205', 'x'))).toBe(true);
    expect(esTablaInexistente(err('XX', "Could not find the table 'public.documento' in the schema cache"))).toBe(true);
    expect(esTablaInexistente(err('23505', 'duplicate key'))).toBe(false);
    expect(esTablaInexistente(null)).toBe(false);
  });

  it('presenta el cierre un segundo antes del instante exclusivo en hora de Bogota', () => {
    // 2026-03-16T05:00:00Z = 2026-03-16 00:00 Bogota -> cierre presentado 15 de marzo 11:59 p. m.
    const texto = textoCierre('2026-03-16T05:00:00.000Z');
    expect(texto).toMatch(/15 de marzo de 2026/);
    expect(texto).toMatch(/11:59/);
    expect(diasHasta('2026-03-16T05:00:00.000Z', new Date('2026-03-13T05:00:00.000Z'))).toBe(3);
  });
});
