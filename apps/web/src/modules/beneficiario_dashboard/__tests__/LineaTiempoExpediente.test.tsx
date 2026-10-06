import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineaTiempoExpediente } from '../components/LineaTiempoExpediente';
import type { LineaTiempo } from '../types';

const datos: LineaTiempo = {
  postulacion: {
    id: 'p1',
    convocatoria: null,
    tipo_solicitud: 'PRIMERA_VEZ',
    estado: 'APROBADA',
    estado_texto: 'Aprobada parcialmente: revise el resultado por beneficio',
    estado_descripcion: '',
    requiere_accion: false,
    terminal: true,
    ciclo: 1,
    aprobacion_parcial: true,
    fecha_limite_subsanacion: null,
    fecha_limite_subsanacion_texto: null,
    enviada_en: null,
    actualizado_en: '2026-01-03T00:00:00.000Z',
  },
  hitos: [
    { id: 'h1', fecha: '2026-01-01T00:00:00.000Z', fecha_texto: '1 de enero', ciclo: 0, estado: 'BORRADOR', titulo: 'Postulacion creada (borrador)', descripcion: '', observacion: null, actual: false },
    { id: 'h2', fecha: '2026-01-02T00:00:00.000Z', fecha_texto: '2 de enero', ciclo: 1, estado: 'EN_EVALUACION', titulo: 'En revision por el Comite FOEST', descripcion: '', observacion: null, actual: false },
    {
      id: 'h3',
      fecha: '2026-01-03T00:00:00.000Z',
      fecha_texto: '3 de enero',
      ciclo: 1,
      estado: 'APROBADA',
      titulo: 'Resultado: aprobada parcialmente',
      descripcion: '',
      observacion: { fecha: '2026-01-03T00:00:00.000Z', firma: 'Equipo FOEST', texto: 'Se aprueba matricula.', campos_observados: [], documentos_observados: [] },
      actual: true,
    },
  ],
  ciclos: [{ ciclo: 1, enviado_en: '2026-01-02T00:00:00.000Z', enviado_en_texto: '2 de enero' }],
  resultado_por_beneficio: [
    { beneficio_codigo: 'SUP', beneficio_nombre: 'Matricula Educacion Superior', decision: 'APROBADO', decision_texto: 'Aprobado', motivo_publico: null, monto_aprobado: 2500000 },
    { beneficio_codigo: 'ST', beneficio_nombre: 'Subsidio de Transporte', decision: 'RECHAZADO', decision_texto: 'No aprobado', motivo_publico: 'Sede dentro del municipio.', monto_aprobado: null },
  ],
  pendiente_modulo: { evaluacion: false },
};

describe('LineaTiempoExpediente', () => {
  it('muestra los hitos en orden, marca el actual y firma las observaciones como Equipo FOEST', () => {
    render(<LineaTiempoExpediente datos={datos} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('En revision por el Comite FOEST')).toBeInTheDocument();
    const actual = screen.getByText('Resultado: aprobada parcialmente').closest('li');
    expect(actual).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Firma: Equipo FOEST')).toBeInTheDocument();
  });

  it('en aprobacion parcial muestra el resultado por beneficio con motivo publico', () => {
    render(<LineaTiempoExpediente datos={datos} />);
    expect(screen.getByText('Resultado por beneficio (aprobacion parcial)')).toBeInTheDocument();
    expect(screen.getByText('Matricula Educacion Superior')).toBeInTheDocument();
    expect(screen.getByText(/Sede dentro del municipio/)).toBeInTheDocument();
    expect(screen.getByLabelText('Decision: No aprobado')).toBeInTheDocument();
  });

  it('sin datos muestra un mensaje amigable', () => {
    render(<LineaTiempoExpediente />);
    expect(screen.getByText(/Aun no tiene postulaciones/)).toBeInTheDocument();
  });
});
