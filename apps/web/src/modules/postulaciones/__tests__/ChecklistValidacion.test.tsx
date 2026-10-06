import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChecklistValidacion } from '../components/ChecklistValidacion';
import { BarraProgreso } from '../components/BarraProgreso';
import type { Validacion } from '../types';

const validacion: Validacion = {
  completo: false,
  secciones_aplicables: ['seccion_1', 'seccion_2', 'seccion_3', 'seccion_4', 'seccion_5', 'seccion_7', 'seccion_9'],
  secciones_completas: ['seccion_1', 'seccion_2', 'seccion_7'],
  campos_faltantes: [
    { seccion: 'seccion_3', seccion_titulo: 'Hogar y situacion personal', campo: 'personas_a_cargo', mensaje: 'Campo obligatorio' },
    { seccion: 'seccion_9', seccion_titulo: 'Declaraciones juramentadas', campo: 'DECL_1', mensaje: 'Declaracion sin aceptar' },
  ],
  declaraciones: { vigentes: [], pendientes: ['DECL_1'], texto_oficial_confirmado: false },
  documentos: { pendiente_modulo: true },
  formatos: { pendiente_modulo: true },
  perfil_completo: true,
  errores: ['EXPEDIENTE_INCOMPLETO'],
};

describe('ChecklistValidacion', () => {
  it('muestra secciones completas y pendientes con sus campos faltantes', () => {
    const onIr = vi.fn();
    render(<ChecklistValidacion validacion={validacion} onIrSeccion={onIr} />);
    expect(screen.getByText(/Su expediente tiene pendientes/)).toBeInTheDocument();
    expect(screen.getByText('Matricula: Completa')).toBeInTheDocument();
    expect(screen.getByText('Hogar y situacion personal: Pendiente')).toBeInTheDocument();
    expect(screen.getByText('personas_a_cargo: Campo obligatorio')).toBeInTheDocument();
    expect(screen.getByText(/carga de documentos se habilitara/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Ir a la seccion')[0] as HTMLElement);
    expect(onIr).toHaveBeenCalledWith('seccion_3');
  });
});

describe('BarraProgreso', () => {
  it('calcula el porcentaje y marca la seccion actual', () => {
    render(<BarraProgreso secciones={validacion.secciones_aplicables} completas={validacion.secciones_completas} actual="seccion_3" />);
    expect(screen.getByText('Progreso: 3 de 7 secciones completas')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43');
    expect(screen.getByRole('button', { name: /3\. Hogar y situacion personal/ })).toHaveAttribute('aria-current', 'step');
  });
});
