import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '../Input';

describe('Input de contrasena', () => {
  it('alterna la visibilidad, actualiza aria-label y no envia el formulario', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Input type="password" aria-label="Clave" defaultValue="secreto" />
      </form>,
    );
    const campo = screen.getByLabelText('Clave') as HTMLInputElement;
    expect(campo.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(campo.type).toBe('text');
    const ocultar = screen.getByRole('button', { name: 'Ocultar contraseña' });
    expect(ocultar.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(ocultar);
    expect(campo.type).toBe('password');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('marca invalido con aria-invalid', () => {
    render(<Input aria-label="Correo" invalido />);
    expect(screen.getByLabelText('Correo').getAttribute('aria-invalid')).toBe('true');
  });
});
