import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PermisosMatrixView } from '../components/PermisosMatrixView';
import type { MatrizPermisos } from '../types';

const matriz: MatrizPermisos = {
  roles: [
    { id: 'ADMINISTRADOR', nombre: 'ADMINISTRADOR', descripcion: 'Gestiona', es_base: true, total_permisos: 2 },
    { id: 'FUNCIONARIO', nombre: 'FUNCIONARIO', descripcion: 'Evalua', es_base: true, total_permisos: 1 },
    { id: 'BENEFICIARIO', nombre: 'BENEFICIARIO', descripcion: 'Postula', es_base: true, total_permisos: 1 },
  ],
  categorias: ['EVALUACION', 'SEGURIDAD'],
  filas: [
    {
      codigo: 'evaluacion:dictaminar',
      descripcion: 'Emitir dictamen',
      categoria: 'EVALUACION',
      alcance: 'ASIGNADO',
      regla_alcance: 'Solo el titular de la asignacion ACTIVA',
      roles: { ADMINISTRADOR: false, FUNCIONARIO: true, BENEFICIARIO: false },
    },
    {
      codigo: 'rol:consultar',
      descripcion: 'Consultar roles',
      categoria: 'SEGURIDAD',
      alcance: 'GLOBAL',
      regla_alcance: 'Global',
      roles: { ADMINISTRADOR: true, FUNCIONARIO: false, BENEFICIARIO: false },
    },
  ],
};

describe('PermisosMatrixView', () => {
  it('agrupa por categoria y muestra Si/No por rol con el alcance', () => {
    render(<PermisosMatrixView matriz={matriz} />);

    expect(screen.getByRole('heading', { name: 'Asignacion y evaluacion' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Seguridad' })).toBeInTheDocument();

    const fila = screen.getByRole('row', { name: /evaluacion:dictaminar/ });
    expect(within(fila).getByLabelText('Administrador: no concedido')).toHaveTextContent('No');
    expect(within(fila).getByLabelText('Funcionario: concedido')).toHaveTextContent('Si');
    expect(within(fila).getByLabelText('Beneficiario: no concedido')).toHaveTextContent('No');
    expect(within(fila).getByText('Asignado')).toBeInTheDocument();
    expect(within(fila).getByText('Solo el titular de la asignacion ACTIVA')).toBeInTheDocument();
  });
});
