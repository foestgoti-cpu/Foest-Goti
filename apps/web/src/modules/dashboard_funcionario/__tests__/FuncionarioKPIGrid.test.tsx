import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { enlaceBandeja, FuncionarioKPIGrid } from '../components/FuncionarioKPIGrid';

describe('FuncionarioKPIGrid', () => {
  const totales = { asignadas: 19, pendientes: 4, en_evaluacion: 3, en_correccion: 0, aprobadas: 10, rechazadas: 2, desistidas: 0 };

  it('muestra las cifras y enlaza cada tarjeta a la bandeja de evaluacion con filtros precargados', () => {
    render(
      <MemoryRouter>
        <FuncionarioKPIGrid totales={totales} filtros={{ convocatoria_id: '22222222-2222-4222-8222-222222222222', desde: '2026-03-01', hasta: '2026-03-31' }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('kpi-asignadas')).toHaveTextContent('19');
    expect(screen.getByTestId('kpi-pendientes')).toHaveTextContent('4');
    expect(screen.getByTestId('kpi-aprobadas')).toHaveTextContent('10');

    const pendientes = screen.getByRole('link', { name: /Pendientes: 4/ });
    expect(pendientes).toHaveAttribute(
      'href',
      '/funcionario/evaluacion?estado=PENDIENTE&convocatoria_id=22222222-2222-4222-8222-222222222222&desde=2026-03-01&hasta=2026-03-31',
    );
    const principal = screen.getByRole('link', { name: /Postulaciones del comite: 19/ });
    expect(principal.getAttribute('href')).toBe('/funcionario/evaluacion?convocatoria_id=22222222-2222-4222-8222-222222222222&desde=2026-03-01&hasta=2026-03-31');
  });

  it('sin datos muestra ceros (funcionario sin comite) y enlaces sin filtros', () => {
    render(
      <MemoryRouter>
        <FuncionarioKPIGrid totales={{ asignadas: 0, pendientes: 0, en_evaluacion: 0, en_correccion: 0, aprobadas: 0, rechazadas: 0, desistidas: 0 }} filtros={{}} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('kpi-asignadas')).toHaveTextContent('0');
    expect(enlaceBandeja({})).toBe('/funcionario/evaluacion');
    expect(enlaceBandeja({}, 'APROBADA')).toBe('/funcionario/evaluacion?estado=APROBADA');
  });
});
