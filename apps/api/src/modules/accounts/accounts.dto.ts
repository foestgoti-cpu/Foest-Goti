/**
 * DTOs del modulo accounts. Los esquemas viven en @foest/shared (los reutiliza la web);
 * aqui solo se reexportan con los nombres que usan rutas y controladores.
 */
export {
  CrearFuncionarioSchema as CrearFuncionarioDto,
  ActualizarFuncionarioSchema as ActualizarFuncionarioDto,
  CambiarEstadoCuentaSchema as CambiarEstadoCuentaDto,
  ListarFuncionariosQuerySchema as ListarFuncionariosQueryDto,
  ListarBeneficiariosQuerySchema as ListarBeneficiariosQueryDto,
  PerfilBeneficiarioSchema as PerfilBeneficiarioDto,
  CorregirDocumentoSchema as CorregirDocumentoDto,
  SolicitudHabeasDataSchema as SolicitudHabeasDataDto,
  ResolverHabeasDataSchema as ResolverHabeasDataDto,
  ListarHabeasDataQuerySchema as ListarHabeasDataQueryDto,
} from '@foest/shared';

export type {
  CrearFuncionarioDto as CrearFuncionario,
  ActualizarFuncionarioDto as ActualizarFuncionario,
  CambiarEstadoCuentaDto as CambiarEstadoCuenta,
  ListarFuncionariosQuery,
  ListarBeneficiariosQuery,
  PerfilBeneficiarioDto as PerfilBeneficiarioEntrada,
  CorregirDocumentoDto as CorregirDocumento,
  SolicitudHabeasDataDto as SolicitudHabeasDataEntrada,
  ResolverHabeasDataDto as ResolverHabeasData,
  ListarHabeasDataQuery,
} from '@foest/shared';
