import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstudianteResumenCard } from '../components/EstudianteResumenCard';
import type { Resumen } from '../types';

const base: Resumen = {
  saludo: { nombre: 'Laura', perfil_completo: true, tiene_perfil: true },
  convocatoria_abierta: null,
  proxima_apertura_estimada: null,
  proxima_apertura_texto: null,
  mensaje_convocatoria: 'En este momento no hay convocatoria abierta.',
  postulacion_actual: null,
  puede_iniciar_postulacion: false,
  postulaciones: [],
  acciones_pendientes: [],
  notificaciones: { no_leidas: 0, criticas_no_leidas: 0 },
  pendiente_modulo: { otorgamientos: true },
  generado_en: '2026-01-01T00:00:00.000Z',
};

const renderizar = (r: Resumen) =>
  render(
    <MemoryRouter>
      <EstudianteResumenCard resumen={r} />
    </MemoryRouter>,
  );

describe('EstudianteResumenCard', () => {
  it('con convocatoria abierta y sin postulacion muestra el boton destacado "Iniciar postulacion"', () => {
    renderizar({
      ...base,
      convocatoria_abierta: {
        id: 'c1',
        nombre: 'Convocatoria 2026-1',
        anio: 2026,
        semestre: 1,
        descripcion: '',
        fecha_apertura: '2026-01-01T05:00:00.000Z',
        fecha_cierre_exclusiva: '2026-02-01T05:00:00.000Z',
        fecha_cierre_texto: '31 de enero de 2026, 11:59 p. m.',
        dias_restantes: 10,
      },
      puede_iniciar_postulacion: true,
    });
    expect(screen.getByText('Bienvenido(a), Laura')).toBeInTheDocument();
    expect(screen.getByText('Convocatoria 2026-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar postulacion' })).toBeEnabled();
  });

  it('sin convocatoria abierta muestra la fecha estimada de la proxima apertura', () => {
    renderizar({ ...base, proxima_apertura_estimada: '2026-08-01', proxima_apertura_texto: '1 de agosto de 2026', mensaje_convocatoria: 'No hay convocatoria abierta. Proxima apertura estimada.' });
    expect(screen.getByText(/Proxima apertura estimada:/)).toBeInTheDocument();
    expect(screen.getByText('1 de agosto de 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar postulacion' })).not.toBeInTheDocument();
  });

  it('con postulacion en curso muestra el estado en lenguaje claro y el boton de accion', () => {
    renderizar({
      ...base,
      postulacion_actual: {
        id: 'p1',
        convocatoria: { id: 'c1', nombre: 'Convocatoria 2026-1', anio: 2026, semestre: 1 },
        tipo_solicitud: 'PRIMERA_VEZ',
        estado: 'EN_CORRECCION',
        estado_texto: 'Documentos pendientes de correccion',
        estado_descripcion: 'Revise las observaciones.',
        requiere_accion: true,
        terminal: false,
        ciclo: 1,
        aprobacion_parcial: false,
        fecha_limite_subsanacion: null,
        fecha_limite_subsanacion_texto: null,
        enviada_en: null,
        actualizado_en: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(screen.getByText('Documentos pendientes de correccion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Corregir documentos' })).toBeInTheDocument();
    expect(screen.getByText('Requiere su accion')).toBeInTheDocument();
  });
});
