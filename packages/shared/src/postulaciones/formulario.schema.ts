import { z } from 'zod';
import { CodigoBeneficioSchema, type CodigoBeneficio, type TipoSolicitud } from '../enums';

/**
 * Esquemas Zod de las 9 secciones del formato GE-F041 (`POSTULACION.datos_formulario`).
 * Fuente unica para API y web (docs/modules/postulaciones.md, "Estructura del Formulario").
 *
 * - Seccion 1 (identificacion) NO se captura: se toma de BENEFICIARIO y se congela en
 *   `perfil_snapshot` al enviar.
 * - Seccion 2 (beneficios) se persiste en POSTULACION_BENEFICIO; aqui solo se tipa la lista.
 * - Secciones 5 y 6 dependen del tipo de tramite; la 8 de que se haya elegido `ST`.
 * - Cada seccion tiene una version `Completa` (exigida al enviar) y una `Parcial`
 *   (autoguardado del borrador: campos opcionales pero con el tipo correcto).
 */

export const SITUACIONES_LABORALES = ['EMPLEADO', 'INDEPENDIENTE', 'DESEMPLEADO', 'SOLO_ESTUDIA'] as const;
export const SituacionLaboralSchema = z.enum(SITUACIONES_LABORALES);

export const MODALIDADES_PROGRAMA = ['PRESENCIAL', 'VIRTUAL', 'DISTANCIA', 'HIBRIDA'] as const;
export const ModalidadProgramaSchema = z.enum(MODALIDADES_PROGRAMA);

export const TIPOS_PAGO_ST = ['CUENTA_BANCARIA', 'BILLETERA'] as const;
export const TipoPagoStSchema = z.enum(TIPOS_PAGO_ST);

const texto = (min: number, max: number) => z.string().trim().min(min).max(max);

// --- Seccion 3: hogar y situacion personal (sin estrato ni SISBEN) ---
export const Seccion3Schema = z
  .object({
    personas_a_cargo: z.number().int().min(0).max(20),
    situacion_laboral: SituacionLaboralSchema,
    contacto_emergencia: z
      .object({
        nombre: texto(3, 120),
        parentesco: texto(2, 60),
        telefono: z.string().trim().regex(/^\d{7,10}$/, 'Telefono de 7 a 10 digitos'),
      })
      .strict(),
  })
  .strict();

// --- Seccion 4: programa de educacion superior ---
export const Seccion4Schema = z
  .object({
    /** Codigo SNIES del programa. TODO(catalogos): validar contra el catalogo cuando exista el modulo. */
    snies_codigo: z.string().trim().regex(/^\d{1,8}$/, 'Codigo SNIES numerico'),
    institucion: texto(3, 160),
    programa: texto(3, 160),
    semestre: z.number().int().min(1).max(20),
    modalidad: ModalidadProgramaSchema,
  })
  .strict();

// --- Seccion 5: educacion media (solo PRIMERA_VEZ) ---
export const Seccion5Schema = z
  .object({
    colegio: texto(3, 160),
    anio_graduacion: z.number().int().min(1990).max(2100),
    registro_saber11: texto(5, 30),
  })
  .strict();

// --- Seccion 6: desempeno academico (RENOVACION y REINTEGRO) ---
export const Seccion6Schema = z
  .object({
    promedio_semestre_anterior: z.number().min(0).max(5),
    promedio_acumulado: z.number().min(0).max(5),
    creditos_cursados: z.number().int().min(0).max(200),
    creditos_aprobados: z.number().int().min(0).max(200),
    creditos_perdidos: z.number().int().min(0).max(200),
  })
  .strict();

// --- Seccion 7: matricula ---
export const Seccion7Schema = z
  .object({
    /** Valor de la matricula ordinaria en pesos (entero positivo). El texto en letras lo genera el servidor. */
    valor_matricula: z.number().int().positive().max(1_000_000_000),
  })
  .strict();

// --- Seccion 8: subsidio de transporte (solo si se eligio ST) ---
/** Como se presenta el dato de pago en respuestas y en `datos_formulario`: nunca el numero completo. */
export const DatosPagoEnmascaradoSchema = z
  .object({
    tipo: TipoPagoStSchema,
    entidad: texto(2, 120),
    numero_enmascarado: z.string().regex(/^•{4} \d{4}$/),
  })
  .strict();

export const Seccion8Schema = z
  .object({
    dias_asistencia_semanal: z.number().int().min(1).max(7),
    municipio_destino: texto(3, 120),
    datos_pago: DatosPagoEnmascaradoSchema,
  })
  .strict();

/** Entrada de datos de pago en claro (solo en el PUT; se cifra en el servidor). */
export const DatosPagoEntradaSchema = z
  .object({
    tipo: TipoPagoStSchema,
    entidad: texto(2, 120),
    numero: z.string().trim().regex(/^\d{6,24}$/, 'Numero de 6 a 24 digitos'),
  })
  .strict();
export type DatosPagoEntrada = z.infer<typeof DatosPagoEntradaSchema>;

// --- Seccion 9: declaraciones juramentadas ---
export const DeclaracionAceptadaSchema = z
  .object({
    codigo: z.string().regex(/^DECL_[1-6]$/),
    version: z.number().int().min(1),
    aceptada: z.boolean(),
  })
  .strict();

export const Seccion9Schema = z.object({ declaraciones: z.array(DeclaracionAceptadaSchema).max(6) }).strict();

/** Formulario completo (todas las secciones opcionales a nivel de objeto; la obligatoriedad depende del tramite). */
export const FormularioSchema = z
  .object({
    seccion_3: Seccion3Schema.optional(),
    seccion_4: Seccion4Schema.optional(),
    seccion_5: Seccion5Schema.optional(),
    seccion_6: Seccion6Schema.optional(),
    seccion_7: Seccion7Schema.optional(),
    seccion_8: Seccion8Schema.optional(),
    seccion_9: Seccion9Schema.optional(),
  })
  .strict();
export type Formulario = z.infer<typeof FormularioSchema>;

/** Version parcial para autoguardado: cada seccion acepta campos faltantes pero no de tipo incorrecto. */
export const FormularioParcialSchema = z
  .object({
    seccion_3: Seccion3Schema.partial().strict().optional(),
    seccion_4: Seccion4Schema.partial().strict().optional(),
    seccion_5: Seccion5Schema.partial().strict().optional(),
    seccion_6: Seccion6Schema.partial().strict().optional(),
    seccion_7: Seccion7Schema.partial().strict().optional(),
    seccion_8: Seccion8Schema.omit({ datos_pago: true }).partial().strict().optional(),
    seccion_9: Seccion9Schema.partial().strict().optional(),
  })
  .strict();
export type FormularioParcial = z.infer<typeof FormularioParcialSchema>;

export const SECCIONES_FORMULARIO = [
  'seccion_1',
  'seccion_2',
  'seccion_3',
  'seccion_4',
  'seccion_5',
  'seccion_6',
  'seccion_7',
  'seccion_8',
  'seccion_9',
] as const;
export type SeccionFormulario = (typeof SECCIONES_FORMULARIO)[number];

export const TITULOS_SECCION: Readonly<Record<SeccionFormulario, string>> = {
  seccion_1: 'Identificacion del solicitante',
  seccion_2: 'Seleccion de beneficios',
  seccion_3: 'Hogar y situacion personal',
  seccion_4: 'Programa de educacion superior',
  seccion_5: 'Educacion media',
  seccion_6: 'Desempeno academico',
  seccion_7: 'Matricula',
  seccion_8: 'Subsidio de transporte',
  seccion_9: 'Declaraciones juramentadas',
};

/** Secciones exigidas segun el tramite y los beneficios elegidos (la 1, 2 y 9 siempre aplican). */
export function seccionesAplicables(tipo: TipoSolicitud, beneficios: readonly CodigoBeneficio[]): SeccionFormulario[] {
  const lista: SeccionFormulario[] = ['seccion_1', 'seccion_2', 'seccion_3', 'seccion_4'];
  if (tipo === 'PRIMERA_VEZ') lista.push('seccion_5');
  else lista.push('seccion_6');
  lista.push('seccion_7');
  if (beneficios.includes('ST')) lista.push('seccion_8');
  lista.push('seccion_9');
  return lista;
}

/** Esquema completo por seccion (para calcular campos faltantes). */
export const ESQUEMA_SECCION: Readonly<Record<Exclude<SeccionFormulario, 'seccion_1' | 'seccion_2'>, z.ZodTypeAny>> = {
  seccion_3: Seccion3Schema,
  seccion_4: Seccion4Schema,
  seccion_5: Seccion5Schema,
  seccion_6: Seccion6Schema,
  seccion_7: Seccion7Schema,
  seccion_8: Seccion8Schema,
  seccion_9: Seccion9Schema,
};

export const BeneficiosSeleccionSchema = z.array(CodigoBeneficioSchema).min(1).max(12);
