import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AlertasOperativasPanel, agruparAlertas } from '../components/AlertasOperativasPanel';
import { CATALOGO_ALERTAS, CODIGOS_ALERTA, type Alerta } from '../types';

const alertas: Alerta[] = [
  { codigo: 'CIERRE_PROXIMO', severidad: 'ALTA', entidad: 'CONVOCATORIA', entidad_id: 'c1', mensaje: 'La convocatoria 2026-2 cierra en 2 dia(s)', detalle: { dias_restantes: 2 }, accion_url: '/admin/convocatorias/c1' },
  { codigo: 'SIN_COMITE', severidad: 'ALTA', entidad: 'CONVOCATORIA', entidad_id: 'c2', mensaje: 'Sin comite', detalle: {}, accion_url: '/admin/convocatorias/c2/comite' },
  { codigo: 'POOL_SIN_TOMAR', severidad: 'MEDIA', entidad: 'CONVOCATORIA', entidad_id: 'c1', mensaje: '3 postulaciones sin tomar', detalle: {}, accion_url: '/admin/postulaciones?estado=PENDIENTE' },
];

describe('AlertasOperativasPanel', () => {
  it('contrato: todo codigo de alerta del backend tiene grupo y accion en el panel', () => {
    for (const codigo of CODIGOS_ALERTA) {
      expect(CATALOGO_ALERTAS[codigo].grupo).toBeTruthy();
      expect(CATALOGO_ALERTAS[codigo].accion).toBeTruthy();
    }
  });

  it('agrupa por severidad y por grupo del panel', () => {
    const secciones = agruparAlertas(alertas);
    expect(secciones.map((s) => s.severidad)).toEqual(['ALTA', 'MEDIA']);
    expect(secciones[0]?.grupos[0]).toMatchObject({ grupo: 'Convocatorias' });
    expect(secciones[0]?.grupos[0]?.alertas).toHaveLength(2);
    expect(secciones[1]?.grupos[0]).toMatchObject({ grupo: 'Carga y comite' });
  });

  it('muestra cada alerta con su enlace a la pantalla que la resuelve', () => {
    render(
      <MemoryRouter>
        <AlertasOperativasPanel datos={{ generado_en: '2026-10-06T15:00:00Z', total: 3, alertas, detectores_con_error: [], umbrales: {} }} cargando={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText('La convocatoria 2026-2 cierra en 2 dia(s)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Asignar comite' })).toHaveAttribute('href', '/admin/convocatorias/c2/comite');
    expect(screen.getByText('Severidad alta')).toBeInTheDocument();
    expect(screen.getByText('3 activas')).toBeInTheDocument();
  });

  it('informa cuando hay detectores con error y cuando no hay alertas', () => {
    render(
      <MemoryRouter>
        <AlertasOperativasPanel datos={{ generado_en: 'x', total: 0, alertas: [], detectores_con_error: [{ codigo: 'SOBRECARGA', error: 'falla' }], umbrales: {} }} cargando={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Algunos detectores no pudieron ejecutarse: SOBRECARGA/)).toBeInTheDocument();
    expect(screen.getByText('Sin alertas activas')).toBeInTheDocument();
  });
});
