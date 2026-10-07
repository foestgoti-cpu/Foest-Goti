import { z } from 'zod';
import { CodigoBeneficioSchema, EstadoPostulacionSchema, TipoSolicitudSchema } from '../enums';
import { FormatoConsolidadoSchema, EstadoReporteSchema, TipoReporteSchema } from './export_reports.enums';

const FechaLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD');

/** Filtros del consolidado (todos opcionales). `desde`/`hasta` acotan la fecha de envio (inclusive, America/Bogota). */
export const FiltrosConsolidadoSchema = z
  .object({
    estado: EstadoPostulacionSchema.optional(),
    tipo_solicitud: TipoSolicitudSchema.optional(),
    beneficio: CodigoBeneficioSchema.optional(),
    desde: FechaLocal.optional(),
    hasta: FechaLocal.optional(),
  })
  .strict()
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, { message: 'La fecha inicial no puede ser posterior a la final', path: ['desde'] });
export type FiltrosConsolidado = z.infer<typeof FiltrosConsolidadoSchema>;

/** Cuerpo de `POST /reportes/convocatorias/:id/consolidado`. */
export const SolicitarConsolidadoInputSchema = z
  .object({
    formato: FormatoConsolidadoSchema,
    filtros: FiltrosConsolidadoSchema.optional().default({}),
  })
  .strict();
export type SolicitarConsolidadoInput = z.input<typeof SolicitarConsolidadoInputSchema>;

/** Query de `GET /reportes/me`. */
export const MisReportesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  estado: EstadoReporteSchema.optional(),
  tipo: TipoReporteSchema.optional(),
});
export type MisReportesQuery = z.infer<typeof MisReportesQuerySchema>;

// ------------------------------- DTOs de respuesta -------------------------------

export const ReporteSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoReporteSchema,
  estado: EstadoReporteSchema,
  convocatoria_id: z.string().uuid().nullable(),
  convocatoria_nombre: z.string().nullable(),
  filtros: FiltrosConsolidadoSchema.nullable(),
  filas_total: z.number().int().nullable(),
  tamano_bytes: z.number().int().nullable(),
  error: z.string().nullable(),
  creado_en: z.string(),
  finalizado_en: z.string().nullable(),
  expira_en: z.string().nullable(),
  /** true si el consolidado incluye estrato, SISBEN y documento. */
  incluye_sensibles: z.boolean(),
});
export type ReporteDto = z.infer<typeof ReporteSchema>;

/** Respuesta de la solicitud: HTTP 200 si el reporte ya esta LISTO, HTTP 202 si quedo en COLA. */
export const SolicitudReporteRespuestaSchema = z.object({
  reporte: ReporteSchema,
  /** true si se genero dentro de la peticion (LISTO), false si quedo en cola. */
  sincrono: z.boolean(),
});
export type SolicitudReporteRespuestaDto = z.infer<typeof SolicitudReporteRespuestaSchema>;

export const DescargaReporteSchema = z.object({
  url: z.string().url(),
  expira_en: z.string(),
  nombre_archivo: z.string(),
});
export type DescargaReporteDto = z.infer<typeof DescargaReporteSchema>;
