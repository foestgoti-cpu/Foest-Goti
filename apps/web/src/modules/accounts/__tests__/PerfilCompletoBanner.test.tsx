import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerfilCompletoBanner } from '../components/PerfilCompletoBanner';

describe('PerfilCompletoBanner', () => {
  it('muestra el perfil completo', () => {
    render(<PerfilCompletoBanner completo faltantes={[]} />);
    expect(screen.getByTestId('perfil-completo')).toBeInTheDocument();
    expect(screen.getByText(/Ya puede presentar postulaciones/)).toBeInTheDocument();
  });

  it('lista los campos faltantes en lenguaje claro (acudiente y consentimiento incluidos)', () => {
    render(<PerfilCompletoBanner completo={false} faltantes={['celular_1', 'acudiente', 'consentimiento']} />);
    expect(screen.getByTestId('perfil-incompleto')).toBeInTheDocument();
    expect(screen.getByText('Celular principal')).toBeInTheDocument();
    expect(screen.getByText('Datos del acudiente')).toBeInTheDocument();
    expect(screen.getByText(/Consentimiento de tratamiento de datos/)).toBeInTheDocument();
  });
});
