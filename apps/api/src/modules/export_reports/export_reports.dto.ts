import { z } from 'zod';
import { MisReportesQuerySchema, SolicitarConsolidadoInputSchema } from '@foest/shared';

export const SolicitarConsolidadoDto = SolicitarConsolidadoInputSchema;
export type SolicitarConsolidadoDtoType = z.infer<typeof SolicitarConsolidadoDto>;

export const MisReportesQueryDto = MisReportesQuerySchema;
