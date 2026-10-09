import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CATEGORIAS_SISBEN, PerfilBeneficiarioSchema } from '@foest/shared';
import { Select } from '../../../components/ui';
import { opcionesSisben } from '../pages/PerfilPage';

describe('SISBEN como desplegable', () => {
  it('ofrece las 51 categorias y una opcion vacia', () => {
    expect(CATEGORIAS_SISBEN).toHaveLength(51);
    render(<Select aria-label="sisben" value="" onChange={() => {}} placeholder="Seleccione una categoría" opciones={opcionesSisben('')} />);
    expect(screen.getAllByRole('option')).toHaveLength(52);
    expect(screen.getByRole('option', { name: 'Seleccione una categoría' })).toHaveValue('');
  });

  it('conserva un valor historico fuera de lista', () => {
    expect(opcionesSisben('Z9')[0]).toEqual({ valor: 'Z9', etiqueta: 'Z9 (valor anterior)' });
  });

  it('el esquema acepta vacio y valores de la lista, y rechaza otros', () => {
    const base = PerfilBeneficiarioSchema.safeParse({}).success; // ejercita el esquema sin lanzar
    expect(base).toBe(false);
    const campo = (v: string) => {
      const r = PerfilBeneficiarioSchema.safeParse({ sisben_categoria: v });
      return r.success ? [] : r.error.issues.filter((i) => i.path[0] === 'sisben_categoria');
    };
    expect(campo('')).toHaveLength(0);
    expect(campo('B3')).toHaveLength(0);
    expect(campo('D21')).toHaveLength(0);
    expect(campo('A6')).toHaveLength(1);
    expect(campo('E1')).toHaveLength(1);
  });
});
