/**
 * Importa el listado oficial del MEN (SNIES) a `ies_snies` y `programa_snies`.
 * Comparte la logica del endpoint POST /admin/catalogos/snies/importar.
 *
 *   npm run snies:import -w apps/api -- <archivo.csv> [--simulacion]
 *
 * Columnas esperadas (encabezados configurables en snies.mapping.ts): codigo IES,
 * nombre IES, caracter, sector, codigo programa, nombre programa, nivel,
 * modalidad, estado, departamento y municipio de oferta.
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { getSupabaseAdmin } from '../src/shared/supabase';
import { sniesService } from '../src/modules/catalogos_configuracion/snies.service';

async function main(): Promise<void> {
  const ruta = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
  if (!ruta) throw new Error('Uso: npm run snies:import -w apps/api -- <archivo.csv> [--simulacion]');
  const simulacion = process.argv.includes('--simulacion');
  getSupabaseAdmin(); // falla con mensaje claro si faltan credenciales
  const contenido = await readFile(ruta, 'utf8');
  const resumen = await sniesService.importar(
    contenido,
    { archivo_nombre: basename(ruta), modo: simulacion ? 'simulacion' : 'real', actor: null },
    { actor_tipo: 'SISTEMA', metadatos: { origen: 'script import-snies' } },
  );
  process.stdout.write(`${JSON.stringify({ ...resumen, errores: resumen.errores.length }, null, 2)}\n`);
  if (resumen.errores.length > 0) {
    process.stdout.write('Primeros errores por fila:\n');
    for (const e of resumen.errores.slice(0, 20)) process.stdout.write(`  fila ${e.fila}: ${e.mensaje}\n`);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
