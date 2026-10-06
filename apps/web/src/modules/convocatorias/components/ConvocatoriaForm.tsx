import { useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { CODIGOS_BENEFICIO, CodigoBeneficioSchema, FechaLocalSchema, type CodigoBeneficio } from '@foest/shared';
import { Alert, Button, Checkbox, FormField, Input, Select, Spinner, Textarea } from '../../../components/ui';
import { useBeneficios } from '../hooks/useConvocatorias';
import type { BeneficioOfertadoInput, ConvocatoriaDetalle, CrearConvocatoriaInput } from '../types';
import { formatearMoneda } from '../utils';

/** Validacion local (espejo del DTO de la API). */
const BeneficioSchema = z.object({
  codigo: CodigoBeneficioSchema,
  cupos_estimados: z.coerce.number().int().min(0, 'Debe ser 0 o mayor'),
  presupuesto_asignado: z.coerce.number().min(0, 'Debe ser 0 o mayor'),
  valor_apoyo_referencial: z.coerce.number().min(0, 'Debe ser 0 o mayor'),
});

const FormSchema = z
  .object({
    anio: z.coerce.number().int().min(2024, 'Anio no valido').max(2100, 'Anio no valido'),
    semestre: z.coerce.number().int().min(1).max(2),
    nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(200),
    descripcion: z.string().trim().max(5000),
    fecha_apertura: FechaLocalSchema,
    fecha_cierre: FechaLocalSchema,
    beneficios: z.array(BeneficioSchema),
  })
  .refine((d) => d.fecha_cierre >= d.fecha_apertura, { message: 'La fecha de cierre debe ser igual o posterior a la apertura', path: ['fecha_cierre'] });

export interface ConvocatoriaFormProps {
  inicial?: ConvocatoriaDetalle;
  /** Con la convocatoria habilitada/suspendida solo se editan nombre, descripcion y valores referenciales. */
  soloInformativo?: boolean;
  enviando: boolean;
  errorApi?: string | null;
  onEnviar: (datos: CrearConvocatoriaInput) => void;
  onCancelar: () => void;
}

type Oferta = Record<string, BeneficioOfertadoInput>;

export function ConvocatoriaForm({ inicial, soloInformativo = false, enviando, errorApi, onEnviar, onCancelar }: ConvocatoriaFormProps) {
  const { data: catalogo, isLoading: cargandoCatalogo, error: errorCatalogo } = useBeneficios();
  const hoy = new Date();
  const [anio, setAnio] = useState(String(inicial?.anio ?? hoy.getFullYear()));
  const [semestre, setSemestre] = useState(String(inicial?.semestre ?? (hoy.getMonth() < 6 ? 1 : 2)));
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [fechaApertura, setFechaApertura] = useState(inicial?.fecha_apertura_local ?? '');
  const [fechaCierre, setFechaCierre] = useState(inicial?.fecha_cierre ?? '');
  const [oferta, setOferta] = useState<Oferta>(() =>
    Object.fromEntries(
      (inicial?.beneficios ?? []).map((b) => [
        b.codigo,
        { codigo: b.codigo, cupos_estimados: b.cupos_estimados, presupuesto_asignado: b.presupuesto_asignado, valor_apoyo_referencial: b.valor_apoyo_referencial },
      ]),
    ),
  );
  const [errores, setErrores] = useState<z.ZodError | null>(null);

  const beneficios = useMemo(() => {
    const lista = catalogo?.data ?? [];
    return [...lista].sort((a, b) => CODIGOS_BENEFICIO.indexOf(a.codigo) - CODIGOS_BENEFICIO.indexOf(b.codigo));
  }, [catalogo]);

  const alternar = (codigo: CodigoBeneficio, activo: boolean) => {
    setOferta((prev) => {
      const copia = { ...prev };
      if (activo) copia[codigo] = copia[codigo] ?? { codigo, cupos_estimados: 0, presupuesto_asignado: 0, valor_apoyo_referencial: 0 };
      else delete copia[codigo];
      return copia;
    });
  };

  const cambiarValor = (codigo: CodigoBeneficio, campo: keyof Omit<BeneficioOfertadoInput, 'codigo'>, valor: string) => {
    setOferta((prev) => ({ ...prev, [codigo]: { ...prev[codigo]!, [campo]: valor === '' ? 0 : Number(valor) } }));
  };

  const totalPresupuesto = Object.values(oferta).reduce((s, b) => s + (Number(b.presupuesto_asignado) || 0), 0);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = FormSchema.safeParse({
      anio,
      semestre,
      nombre,
      descripcion,
      fecha_apertura: fechaApertura,
      fecha_cierre: fechaCierre,
      beneficios: Object.values(oferta),
    });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    onEnviar(r.data);
  };

  return (
    <form onSubmit={enviar} noValidate>
      {errorApi && (
        <Alert tipo="error" className="mb-4">
          {errorApi}
        </Alert>
      )}
      {soloInformativo && (
        <Alert tipo="info" className="mb-4">
          La convocatoria ya fue habilitada: solo puede modificar el nombre, la descripcion y los valores de apoyo referenciales. El plazo se cambia mediante una
          ampliacion.
        </Alert>
      )}

      <fieldset className="mb-6 border border-ink p-4">
        <legend className="px-2 text-base font-semibold">Periodo y fechas</legend>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField etiqueta="Anio" nombre="anio" error={errores} obligatorio>
            <Input type="number" min={2024} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} disabled={soloInformativo} />
          </FormField>
          <FormField etiqueta="Semestre" nombre="semestre" error={errores} obligatorio>
            <Select
              opciones={[
                { valor: '1', etiqueta: 'Primer semestre (1)' },
                { valor: '2', etiqueta: 'Segundo semestre (2)' },
              ]}
              value={semestre}
              onChange={(e) => setSemestre(e.target.value)}
              disabled={soloInformativo}
            />
          </FormField>
          <FormField etiqueta="Fecha de apertura" nombre="fecha_apertura" error={errores} obligatorio ayuda="Desde las 00:00 (hora de Colombia).">
            <Input type="date" value={fechaApertura} onChange={(e) => setFechaApertura(e.target.value)} disabled={soloInformativo} />
          </FormField>
          <FormField etiqueta="Fecha de cierre" nombre="fecha_cierre" error={errores} obligatorio ayuda="Ultimo dia para postularse, hasta las 23:59:59 (hora de Colombia).">
            <Input type="date" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} disabled={soloInformativo} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="mb-6 border border-ink p-4">
        <legend className="px-2 text-base font-semibold">Identificacion</legend>
        <FormField etiqueta="Nombre de la convocatoria" nombre="nombre" error={errores} obligatorio>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} />
        </FormField>
        <FormField etiqueta="Descripcion" nombre="descripcion" error={errores} ayuda="Texto visible para los beneficiarios en la pagina publica.">
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={5000} rows={4} />
        </FormField>
      </fieldset>

      <fieldset className="mb-6 border border-ink p-4">
        <legend className="px-2 text-base font-semibold">Beneficios ofertados</legend>
        {cargandoCatalogo && <Spinner etiqueta="Cargando catalogo de beneficios" />}
        {errorCatalogo && <Alert tipo="error">No fue posible cargar el catalogo de beneficios.</Alert>}
        {!cargandoCatalogo && !errorCatalogo && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-primary-10">
                <tr>
                  <th scope="col" className="border-b border-ink px-2 py-2 text-left">
                    Ofertar
                  </th>
                  <th scope="col" className="border-b border-ink px-2 py-2 text-left">
                    Beneficio
                  </th>
                  <th scope="col" className="border-b border-ink px-2 py-2 text-left">
                    Cupos estimados
                  </th>
                  <th scope="col" className="border-b border-ink px-2 py-2 text-left">
                    Presupuesto asignado (COP)
                  </th>
                  <th scope="col" className="border-b border-ink px-2 py-2 text-left">
                    Valor de apoyo referencial (COP)
                  </th>
                </tr>
              </thead>
              <tbody>
                {beneficios.map((b) => {
                  const activo = Boolean(oferta[b.codigo]);
                  const bloqueado = soloInformativo;
                  return (
                    <tr key={b.codigo} className="border-b border-ink/30">
                      <td className="px-2 py-2 align-top">
                        <Checkbox
                          etiqueta={<span className="sr-only">Ofertar {b.nombre}</span>}
                          checked={activo}
                          disabled={bloqueado}
                          onChange={(e) => alternar(b.codigo, e.target.checked)}
                          aria-label={`Ofertar ${b.nombre}`}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span className="font-semibold">{b.nombre}</span> <span className="font-mono text-xs text-ink/70">{b.codigo}</span>
                        <span className="block text-xs text-ink/70">{b.categoria}</span>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`Cupos estimados ${b.codigo}`}
                          disabled={!activo || bloqueado}
                          value={activo ? oferta[b.codigo]!.cupos_estimados : ''}
                          onChange={(e) => cambiarValor(b.codigo, 'cupos_estimados', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          step={1000}
                          aria-label={`Presupuesto asignado ${b.codigo}`}
                          disabled={!activo || bloqueado}
                          value={activo ? oferta[b.codigo]!.presupuesto_asignado : ''}
                          onChange={(e) => cambiarValor(b.codigo, 'presupuesto_asignado', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          step={1000}
                          aria-label={`Valor de apoyo referencial ${b.codigo}`}
                          disabled={!activo}
                          value={activo ? oferta[b.codigo]!.valor_apoyo_referencial : ''}
                          onChange={(e) => cambiarValor(b.codigo, 'valor_apoyo_referencial', e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-primary-10">
                  <td colSpan={3} className="px-2 py-2 font-semibold">
                    Beneficios seleccionados: {Object.keys(oferta).length}
                  </td>
                  <td colSpan={2} className="px-2 py-2 font-semibold">
                    Presupuesto total: {formatearMoneda(totalPresupuesto)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {errores?.issues.some((i) => i.path[0] === 'beneficios') && (
          <p role="alert" className="mt-2 border-l-2 border-ink pl-2 text-sm font-medium">
            Revise los valores de los beneficios: deben ser numeros iguales o mayores que cero.
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variante="secundario" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" cargando={enviando}>
          {inicial ? 'Guardar cambios' : 'Crear convocatoria (borrador)'}
        </Button>
      </div>
    </form>
  );
}
