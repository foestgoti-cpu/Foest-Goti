import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatearHoraBogota, SelloActualizacion } from '../components/SelloActualizacion';
import { formatearHoras, MetricasTiemposRevision } from '../components/MetricasTiemposRevision';

describe('SelloActualizacion', () => {
  it('muestra la hora de Bogota en formato hh:mm:ss', () => {
    // 14:05:09 UTC = 09:05:09 America/Bogota (UTC-5, sin horario de verano)
    expect(formatearHoraBogota('2026-03-05T14:05:09.000Z')).toBe('09:05:09');
    render(<SelloActualizacion actualizadoEn="2026-03-05T14:05:09.000Z" />);
    expect(screen.getByText(/Datos actualizados a las/)).toBeInTheDocument();
    expect(screen.getByText('09:05:09')).toBeInTheDocument();
  });

  it('sin sello informa que las vistas no se han refrescado', () => {
    render(<SelloActualizacion actualizadoEn={null} />);
    expect(screen.getByText(/Datos aun no actualizados/)).toBeInTheDocument();
  });
});

describe('MetricasTiemposRevision', () => {
  it('con sin_datos explica que no hay dictamenes todavia', () => {
    render(
      <MetricasTiemposRevision
        datos={{ datos_actualizados_en: null, n: 0, promedio_horas: null, p90_horas: null, sin_datos: true, suprimido: false, umbral: 5 }}
      />,
    );
    expect(screen.getByTestId('tiempos-sin-datos')).toBeInTheDocument();
    expect(screen.queryByTestId('tiempos-promedio')).not.toBeInTheDocument();
  });

  it('publica promedio y p90 en horas (y dias cuando supera 48 h)', () => {
    expect(formatearHoras(30.5)).toBe('30,5 h');
    expect(formatearHoras(72)).toBe('72,0 h (3,0 dias)');
    render(
      <MetricasTiemposRevision
        datos={{ datos_actualizados_en: null, n: 12, promedio_horas: 30.5, p90_horas: 72, sin_datos: false, suprimido: false, umbral: 5 }}
      />,
    );
    expect(screen.getByTestId('tiempos-promedio')).toHaveTextContent('30,5 h');
    expect(screen.getByTestId('tiempos-p90')).toHaveTextContent('72,0 h (3,0 dias)');
  });
});
