/**
 * Carga los festivos de Colombia de un anio (Ley Emiliani) en `festivo` sin
 * sobrescribir los existentes (on conflict do nothing).
 *
 *   npm run festivos:seed -w apps/api -- 2027
 *
 * Sin anio: carga el anio en curso y el siguiente (America/Bogota).
 */
import { getSupabaseAdmin } from '../src/shared/supabase';
import { festivosColombia } from '../src/modules/catalogos_configuracion/festivos.calendario';
import { fechaLocalBogota } from '../src/modules/catalogos_configuracion/business-days';

async function main(): Promise<void> {
  const arg = process.argv[2];
  const anioActual = Number(fechaLocalBogota().slice(0, 4));
  const anios = arg ? [Number(arg)] : [anioActual, anioActual + 1];
  for (const a of anios) {
    if (!Number.isInteger(a) || a < 2000 || a > 2100) throw new Error(`Anio invalido: ${arg}`);
  }
  const admin = getSupabaseAdmin();
  for (const anio of anios) {
    const festivos = festivosColombia(anio).map((f) => ({ ...f, anio }));
    const { error } = await admin.from('festivo').upsert(festivos, { onConflict: 'fecha', ignoreDuplicates: true });
    if (error) throw new Error(`No fue posible cargar los festivos de ${anio}: ${error.message}`);
    const { count } = await admin.from('festivo').select('id', { head: true, count: 'exact' }).eq('anio', anio);
    process.stdout.write(`Festivos ${anio}: ${festivos.length} propuestos, ${count ?? 0} registrados en total.\n`);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
