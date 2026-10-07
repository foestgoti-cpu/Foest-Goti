import { AppError, supabaseAdmin } from '../../shared';

/** Errores de PostgREST/Postgres que indican tabla, columna o funcion ausente (migracion 0018 sin aplicar). */
const CODIGOS_ESQUEMA_AUSENTE = new Set(['42P01', '42703', '42883', 'PGRST205', 'PGRST204', 'PGRST202']);

export interface ErrorSupabase {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export function esEsquemaAusente(error: ErrorSupabase | null | undefined): boolean {
  return Boolean(error?.code && CODIGOS_ESQUEMA_AUSENTE.has(error.code));
}

/** Traduce el codigo de negocio lanzado por las funciones SQL (`raise exception '<CODIGO>'`) a AppError. */
export function traducirErrorSql(error: ErrorSupabase): AppError {
  if (esEsquemaAusente(error)) {
    return new AppError(503, 'MIGRACION_PENDIENTE', 'El modulo de seguimiento de beneficios aun no esta disponible (migracion 0018 pendiente)');
  }
  const codigo = (error.message ?? '').trim();
  const detalle = error.details ?? undefined;
  switch (codigo) {
    case 'NO_ENCONTRADO':
    case 'POSTULACION_NO_ENCONTRADA':
      return AppError.noEncontrado();
    case 'OTORGAMIENTO_ESTADO_INVALIDO':
      return AppError.conflicto(codigo, 'El estado actual del otorgamiento no permite esta operacion', detalle);
    case 'VERSION_CONFLICTO':
      return AppError.conflicto(codigo, 'El otorgamiento cambio mientras lo consultaba. Recargue e intente de nuevo', detalle);
    case 'DESEMBOLSOS_PENDIENTES':
      return AppError.conflicto(
        codigo,
        'El otorgamiento tiene desembolsos programados pendientes. Para cumplirlo de todos modos envie forzar: true (los desembolsos se anularan)',
        { pendientes: Number(detalle) || undefined },
      );
    case 'EXCEDE_PRESUPUESTO':
      return AppError.conflicto(
        codigo,
        'El otorgamiento excede el cupo o el presupuesto del beneficio. Para programar su primer desembolso confirme el excedente (confirmar_excedente: true)',
      );
    case 'REFERENCIA_DUPLICADA':
      return AppError.conflicto(codigo, 'La referencia de pago ya fue utilizada en otro desembolso pagado');
    case 'DESEMBOLSO_ESTADO_INVALIDO':
      return AppError.conflicto(codigo, 'El estado actual del desembolso no permite esta operacion', detalle);
    case 'CARGA_DUPLICADA':
      return AppError.conflicto(codigo, 'Este archivo ya fue aplicado anteriormente');
    case 'MONTO_EXCEDE_APROBADO':
      return AppError.datosInvalidos(codigo, 'La suma de los desembolsos no anulados superaria el monto aprobado del otorgamiento', detalle);
    case 'CUENTA_PAGO_FALTANTE':
      return AppError.datosInvalidos(codigo, 'El beneficiario no tiene datos de pago registrados para el subsidio de transporte');
    case 'CARGA_CON_ERRORES':
      return AppError.datosInvalidos(codigo, 'La carga no pudo aplicarse; no se registro ningun pago', detalle);
    default:
      return AppError.interno(`No fue posible completar la operacion: ${error.message ?? 'error desconocido'}`);
  }
}

/** Invoca una funcion SQL de la migracion 0018 y traduce sus errores de negocio. */
export async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(nombre, args);
  if (error) throw traducirErrorSql(error as ErrorSupabase);
  return data as T;
}

/** Divide una lista en bloques para evitar URLs demasiado largas en filtros `in`. */
export function enBloques<T>(lista: readonly T[], tamano = 100): T[][] {
  const bloques: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) bloques.push(lista.slice(i, i + tamano));
  return bloques;
}
