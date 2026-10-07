/**
 * Crea (o actualiza) usuarios de PRUEBA para recorrer la plataforma con cada rol. Idempotente.
 *
 *   QA_PASSWORD='UnaClave#2026' npx tsx --env-file-if-exists=.env scripts/crear-usuarios-prueba.ts
 *   (ejecutar dentro de apps/api; requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en apps/api/.env)
 *
 * Variables:
 *   QA_PASSWORD           obligatoria. La eliges tu; cumple la politica (8-64, mayuscula, numero, especial). No se imprime.
 *   QA_CONVOCATORIA_ID    opcional. Si se indica, los dos funcionarios se agregan al comite de esa convocatoria.
 *
 * Usuarios (dominio .test: solo sirven para pruebas locales, nunca reciben correo real):
 *   prueba.admin@foest.test          ADMINISTRADOR
 *   prueba.funcionario1@foest.test   FUNCIONARIO
 *   prueba.funcionario2@foest.test   FUNCIONARIO
 *   prueba.beneficiario@foest.test   BENEFICIARIO (el perfil se completa desde la web: /beneficiario/perfil)
 */
import { PasswordSchema } from '@foest/shared';
import { getSupabaseAdmin } from '../src/shared/supabase';

type Rol = 'ADMINISTRADOR' | 'FUNCIONARIO' | 'BENEFICIARIO';

interface UsuarioPrueba {
  email: string;
  rol: Rol;
  nombres?: string;
  apellidos?: string;
  cargo?: string;
  dependencia?: string;
}

const USUARIOS: UsuarioPrueba[] = [
  { email: 'prueba.admin@foest.test', rol: 'ADMINISTRADOR' },
  { email: 'prueba.funcionario1@foest.test', rol: 'FUNCIONARIO', nombres: 'Funcionario', apellidos: 'Uno', cargo: 'Profesional universitario', dependencia: 'Secretaria de Educacion' },
  { email: 'prueba.funcionario2@foest.test', rol: 'FUNCIONARIO', nombres: 'Funcionario', apellidos: 'Dos', cargo: 'Tecnico administrativo', dependencia: 'Secretaria de Educacion' },
  { email: 'prueba.beneficiario@foest.test', rol: 'BENEFICIARIO' },
];

async function buscarPorCorreo(email: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`No fue posible listar usuarios: ${error.message}`);
    const hallado = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hallado) return hallado.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main(): Promise<void> {
  const password = PasswordSchema.safeParse(process.env.QA_PASSWORD);
  if (!password.success) {
    throw new Error(
      `QA_PASSWORD invalida: ${password.error.issues.map((i) => i.message).join('; ')} ` +
        '(8-64 caracteres, una mayuscula, un numero y un caracter especial)',
    );
  }
  const convocatoriaId = process.env.QA_CONVOCATORIA_ID?.trim() || null;
  const admin = getSupabaseAdmin();
  const funcionarios: string[] = [];

  for (const u of USUARIOS) {
    let id = await buscarPorCorreo(u.email);
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: password.data,
        email_confirm: true,
        app_metadata: { rol: u.rol },
      });
      if (error || !data.user) throw new Error(`No fue posible crear ${u.email}: ${error?.message}`);
      id = data.user.id;
      console.log(`creado      ${u.rol.padEnd(13)} ${u.email}`);
    } else {
      const { error } = await admin.auth.admin.updateUserById(id, {
        password: password.data,
        email_confirm: true,
        app_metadata: { rol: u.rol },
      });
      if (error) throw new Error(`No fue posible actualizar ${u.email}: ${error.message}`);
      console.log(`actualizado ${u.rol.padEnd(13)} ${u.email} (contrasena restablecida a QA_PASSWORD)`);
    }

    const { error: errUsuario } = await admin
      .from('usuario')
      .upsert({ id, email: u.email, rol: u.rol, activo: true, forzar_cambio_clave: false }, { onConflict: 'id' });
    if (errUsuario) throw new Error(`public.usuario de ${u.email}: ${errUsuario.message}`);

    if (u.rol === 'FUNCIONARIO') {
      const { error } = await admin.from('funcionario').upsert(
        { usuario_id: id, nombres: u.nombres, apellidos: u.apellidos, cargo: u.cargo, dependencia: u.dependencia },
        { onConflict: 'usuario_id' },
      );
      if (error) throw new Error(`public.funcionario de ${u.email}: ${error.message}`);
      funcionarios.push(id);
    }
  }

  if (convocatoriaId) {
    for (const funcionarioId of funcionarios) {
      const { data: existente } = await admin
        .from('asignacion_funcionario')
        .select('id')
        .eq('convocatoria_id', convocatoriaId)
        .eq('funcionario_id', funcionarioId)
        .is('retirado_en', null)
        .maybeSingle();
      if (existente) continue;
      const { error } = await admin
        .from('asignacion_funcionario')
        .insert({ convocatoria_id: convocatoriaId, funcionario_id: funcionarioId });
      if (error) throw new Error(`No fue posible agregar al comite: ${error.message}`);
    }
    console.log(`Funcionarios agregados al comite de la convocatoria ${convocatoriaId}`);
  }

  console.log('\nListo. Inicia sesion en la web con cualquiera de esos correos y la contrasena de QA_PASSWORD.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
