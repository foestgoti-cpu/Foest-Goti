import type { CategoriaBeneficio, CodigoBeneficio, EstadoConvocatoria, EstadoPostulacion } from '@foest/shared';

export interface Beneficio {
  id: string;
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
  descripcion: string;
  activo: boolean;
}

export interface BeneficioOfertado {
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
  descripcion: string;
  cupos_estimados: number;
  presupuesto_asignado: number;
  valor_apoyo_referencial: number;
}

export interface BeneficioPublico {
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
  descripcion: string;
  cupos_estimados: number;
  valor_apoyo_referencial: number;
}

export interface ConvocatoriaResumen {
  id: string;
  anio: number;
  semestre: number;
  nombre: string;
  descripcion: string;
  fecha_apertura: string;
  fecha_cierre_exclusiva: string;
  estado: EstadoConvocatoria;
  motivo_suspension: string | null;
  recordatorio_cierre_enviado_en: string | null;
  version: number;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
  abierta: boolean;
  fecha_cierre: string;
  fecha_apertura_local: string;
  dias_restantes: number;
  beneficios: BeneficioOfertado[];
  postulaciones_total?: number;
}

export interface Ampliacion {
  id: string;
  tipo: 'PRORROGA' | 'REAPERTURA';
  fecha_cierre_anterior: string;
  fecha_cierre_nueva: string;
  estado_anterior: EstadoConvocatoria;
  admin_id: string | null;
  motivo: string;
  fecha_ampliacion: string;
}

export interface CambioEstado {
  id: string;
  estado_desde: EstadoConvocatoria | null;
  estado_hasta: EstadoConvocatoria;
  origen: 'ADMIN' | 'CRON' | 'TIEMPO_REAL';
  actor_id: string | null;
  registrado_en: string;
}

export interface MiembroComite {
  funcionario_id: string;
  email: string;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  activo: boolean;
  asignado_en: string;
}

export interface ConvocatoriaDetalle extends ConvocatoriaResumen {
  ampliaciones: Ampliacion[];
  cambios_estado: CambioEstado[];
  comite: MiembroComite[];
  postulaciones_por_estado: Partial<Record<EstadoPostulacion, number>>;
}

export interface ConvocatoriaPublica {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
  descripcion: string;
  fecha_apertura: string;
  fecha_cierre: string;
  fecha_cierre_presentada: string;
  dias_restantes: number;
  beneficios: BeneficioPublico[];
}

export interface ListadoPublico {
  data: ConvocatoriaPublica[];
  proxima_apertura_estimada: string | null;
}

export interface BeneficioOfertadoInput {
  codigo: CodigoBeneficio;
  cupos_estimados: number;
  presupuesto_asignado: number;
  valor_apoyo_referencial: number;
}

export interface CrearConvocatoriaInput {
  anio: number;
  semestre: number;
  nombre: string;
  descripcion: string;
  fecha_apertura: string;
  fecha_cierre: string;
  beneficios: BeneficioOfertadoInput[];
}

export interface ActualizarConvocatoriaInput extends Partial<CrearConvocatoriaInput> {
  version: number;
}

export interface ExpedienteAfectado {
  funcionario_id: string;
  postulacion_ids: string[];
}

export interface RespuestaComite {
  comite: MiembroComite[];
  agregados: string[];
  retirados: string[];
  expedientes_afectados: ExpedienteAfectado[];
  asignaciones: 'LIBERAR' | 'MANTENER' | null;
}

export interface RespuestaDeshabilitar {
  convocatoria: ConvocatoriaDetalle;
  afectadas: { borradores: number; en_curso: number; notificados: number };
}

/** Funcionario tal como lo lista `GET /api/v1/funcionarios` (modulo accounts). */
export interface FuncionarioCuenta {
  id: string;
  usuario_id?: string;
  email: string;
  activo: boolean;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  dependencia?: string | null;
}
