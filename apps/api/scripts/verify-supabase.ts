/**
 * Verifica la conexion a Supabase, la existencia de las tablas clave y que RLS
 * este activo. Imprime un informe. Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *
 *   npm run verify:supabase -w apps/api
 *
 * La comprobacion de RLS usa la funcion `public.fn_estado_rls()` creada en
 * 0001_base.sql (lee pg_class.relrowsecurity). Si no existe, se informa.
 */
import { getSupabaseAdmin } from '../src/shared/supabase';

const TABLAS_CLAVE = [
  'usuario',
  'beneficiario',
  'funcionario',
  'acudiente',
  'consentimiento_datos',
  'rol',
  'permiso',
  'rol_permiso',
  'beneficio',
  'convocatoria',
  'convocatoria_beneficio',
  'ampliacion_convocatoria',
  'convocatoria_cambio_estado',
  'asignacion_funcionario',
  'postulacion',
  'postulacion_envio',
  'postulacion_beneficio',
  'historial_estado_postulacion',
  'declaracion_juramentada',
  'notificacion',
  'auditoria_evento',
  'configuracion_sistema',
  'festivo',
  'metricas_refresh',
];

type Fila = { tabla: string; rls: boolean; forzado: boolean };

async function main(): Promise<void> {
  const admin = getSupabaseAdmin();
  const lineas: string[] = [];
  let fallos = 0;

  lineas.push('== Verificacion de Supabase (FOEST) ==');
  lineas.push(`URL: ${process.env.SUPABASE_URL}`);

  // 1) Conexion
  {
    const { error } = await admin.from('configuracion_sistema').select('clave', { head: true, count: 'exact' });
    if (error) {
      lineas.push(`[FALLO] Conexion / tabla configuracion_sistema: ${error.message}`);
      fallos++;
    } else {
      lineas.push('[OK] Conexion establecida (consulta a configuracion_sistema)');
    }
  }

  // 2) Tablas clave
  for (const tabla of TABLAS_CLAVE) {
    const { error } = await admin.from(tabla).select('*', { head: true, count: 'exact' }).limit(1);
    if (error) {
      lineas.push(`[FALLO] Tabla ${tabla}: ${error.message}`);
      fallos++;
    } else {
      lineas.push(`[OK] Tabla ${tabla}`);
    }
  }

  // 3) RLS activo
  {
    const { data, error } = await admin.rpc('fn_estado_rls');
    if (error) {
      lineas.push(`[FALLO] No fue posible consultar RLS (fn_estado_rls): ${error.message}. Aplique 0001_base.sql.`);
      fallos++;
    } else {
      const filas = (data ?? []) as Fila[];
      for (const tabla of TABLAS_CLAVE) {
        const f = filas.find((x) => x.tabla === tabla);
        if (!f) {
          lineas.push(`[FALLO] RLS ${tabla}: tabla no reportada`);
          fallos++;
        } else if (!f.rls) {
          lineas.push(`[FALLO] RLS ${tabla}: DESACTIVADO`);
          fallos++;
        } else {
          lineas.push(`[OK] RLS ${tabla}: activo`);
        }
      }
    }
  }

  // 4) Seeds minimos
  {
    const { count, error } = await admin.from('beneficio').select('codigo', { head: true, count: 'exact' });
    if (error || (count ?? 0) < 12) {
      lineas.push(`[FALLO] Seed beneficio: se esperaban 12 codigos, hay ${count ?? 'desconocido'}`);
      fallos++;
    } else lineas.push('[OK] Seed beneficio (12 codigos)');
    const { count: cp } = await admin.from('rol_permiso').select('rol_id', { head: true, count: 'exact' });
    lineas.push(`[INFO] rol_permiso: ${cp ?? 0} pares`);
    const { count: cu } = await admin.from('usuario').select('id', { head: true, count: 'exact' }).eq('rol', 'ADMINISTRADOR');
    lineas.push(`[INFO] administradores en public.usuario: ${cu ?? 0}${(cu ?? 0) === 0 ? ' (ejecute npm run seed:admin)' : ''}`);
  }

  lineas.push(fallos === 0 ? '== RESULTADO: TODO OK ==' : `== RESULTADO: ${fallos} fallo(s) ==`);
  console.log(lineas.join('\n'));
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(`[verify-supabase] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
