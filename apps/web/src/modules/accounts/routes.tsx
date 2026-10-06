import type { RutasModulo } from '../index';
import { FuncionariosPage } from './pages/FuncionariosPage';
import { FuncionarioFormPage } from './pages/FuncionarioFormPage';
import { AdministradoresPage } from './pages/AdministradoresPage';
import { BeneficiariosPage } from './pages/BeneficiariosPage';
import { BeneficiarioDetallePage } from './pages/BeneficiarioDetallePage';
import { HabeasDataPage } from './pages/HabeasDataPage';
import { PerfilPage } from './pages/PerfilPage';

/** Modulo accounts: cuentas de funcionarios/administradores, beneficiarios, habeas data y perfil del titular. */
export const accountsRoutes: RutasModulo = {
  rutasAdmin: [
    { path: 'funcionarios', element: <FuncionariosPage /> },
    { path: 'funcionarios/nuevo', element: <FuncionarioFormPage /> },
    { path: 'funcionarios/:id', element: <FuncionarioFormPage /> },
    { path: 'administradores', element: <AdministradoresPage /> },
    { path: 'beneficiarios', element: <BeneficiariosPage /> },
    { path: 'beneficiarios/:id', element: <BeneficiarioDetallePage /> },
    { path: 'habeas-data', element: <HabeasDataPage /> },
  ],
  rutasBeneficiario: [{ path: 'perfil', element: <PerfilPage /> }],
};
