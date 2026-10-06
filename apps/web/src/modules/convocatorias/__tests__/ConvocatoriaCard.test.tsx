import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConvocatoriaCard } from '../components/ConvocatoriaCard';
import type { ConvocatoriaPublica } from '../types';

const convocatoria: ConvocatoriaPublica = {
  id: '7b1a6f2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
  nombre: 'Convocatoria 2026-1',
  anio: 2026,
  semestre: 1,
  descripcion: 'Apoyos educativos del primer semestre.',
  fecha_apertura: '2026-03-01T05:00:00.000Z',
  fecha_cierre: '2026-03-31',
  fecha_cierre_presentada: '2026-04-01T04:59:59.000Z',
  dias_restantes: 12,
  beneficios: [
    { codigo: 'SUP', nombre: 'Matricula Educacion Superior', categoria: 'MATRICULA', descripcion: 'Apoyo', cupos_estimados: 10, valor_apoyo_referencial: 1500000 },
    { codigo: 'ST', nombre: 'Subsidio de Transporte', categoria: 'TRANSPORTE', descripcion: 'Apoyo', cupos_estimados: 0, valor_apoyo_referencial: 0 },
  ],
};

describe('ConvocatoriaCard', () => {
  it('muestra nombre, periodo, beneficios, fecha de cierre y dias restantes', () => {
    render(
      <MemoryRouter>
        <ConvocatoriaCard convocatoria={convocatoria} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Convocatoria 2026-1')).toBeInTheDocument();
    expect(screen.getByText('(2026-1)')).toBeInTheDocument();
    expect(screen.getByText('12 dias restantes')).toBeInTheDocument();
    expect(screen.getByText('Matricula Educacion Superior')).toBeInTheDocument();
    expect(screen.getByText('Subsidio de Transporte')).toBeInTheDocument();
    expect(screen.getByText('Cupos estimados: 10')).toBeInTheDocument();
    expect(screen.getByText(/31 de marzo de 2026 a las 23:59/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute('href', `/convocatorias/${convocatoria.id}`);
  });

  it('en modo detallado no muestra el enlace de detalle', () => {
    render(
      <MemoryRouter>
        <ConvocatoriaCard convocatoria={{ ...convocatoria, dias_restantes: 1 }} detallada />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Ver detalle' })).not.toBeInTheDocument();
    expect(screen.getByText('Cierra hoy')).toBeInTheDocument();
  });
});
