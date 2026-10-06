import { MATRIZ_PERMISOS, PERMISOS, rolTienePermiso } from '../permisos';
import { ROLES } from '../enums';

describe('matriz de permisos', () => {
  it('solo contiene permisos del catalogo cerrado', () => {
    for (const rol of ROLES) {
      for (const permiso of MATRIZ_PERMISOS[rol]) {
        expect(PERMISOS).toContain(permiso);
      }
    }
  });

  it('no repite permisos dentro de un rol', () => {
    for (const rol of ROLES) {
      expect(new Set(MATRIZ_PERMISOS[rol]).size).toBe(MATRIZ_PERMISOS[rol].length);
    }
  });

  it('respeta la segregacion de funciones (DECISIONES section 3)', () => {
    expect(rolTienePermiso('ADMINISTRADOR', 'evaluacion:dictaminar')).toBe(false);
    expect(rolTienePermiso('ADMINISTRADOR', 'asignacion:tomar')).toBe(false);
    expect(rolTienePermiso('FUNCIONARIO', 'configuracion:editar')).toBe(false);
    expect(rolTienePermiso('BENEFICIARIO', 'postulacion:crear')).toBe(true);
    expect(rolTienePermiso('BENEFICIARIO', 'evaluacion:dictaminar')).toBe(false);
  });
});
