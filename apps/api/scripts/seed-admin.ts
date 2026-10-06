/**
 * Crea el primer ADMINISTRADOR en Supabase Auth (idempotente).
 *
 *   ADMIN_EMAIL=admin@tocancipa.gov.co ADMIN_PASSWORD='...' npm run seed:admin -w apps/api
 *
 * - Si el usuario no existe: `auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { rol: 'ADMINISTRADOR' } })`.
 *   El trigger `on_auth_user_created` crea `public.usuario` con el rol de app_metadata.
 * - Si ya existe: asegura `app_metadata.rol = 'ADMINISTRADOR'` y `public.usuario.rol/activo`; no cambia la contrasena.
 */
import { PasswordSchema, EmailSchema } from '@foest/shared';
import { getSupabaseAdmin } from '../src/shared/supabase';

async function main(): Promise<void> {
  const email = EmailSchema.safeParse(process.env.ADMIN_EMAIL);
  const password = PasswordSchema.safeParse(process.env.ADMIN_PASSWORD);
  if (!email.success) throw new Error('ADMIN_EMAIL es obligatorio y debe ser un correo valido');
  if (!password.success) {
    throw new Error(
      `ADMIN_PASSWORD invalida: ${password.error.issues.map((i) => i.message).join('; ')} ` +
        '(8-64 caracteres, una mayuscula, un numero y un caracter especial)',
    );
  }

  const admin = getSupabaseAdmin(); // lanza con mensaje claro si faltan claves

  // Buscar usuario existente por correo (paginado; el primer administrador es de los primeros).
  let existente: { id: string } | null = null;
  for (let page = 1; page <= 20 && !existente; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`No fue posible listar usuarios: ${error.message}`);
    const encontrado = data.users.find((u) => (u.email ?? '').toLowerCase() === email.data);
    if (encontrado) existente = { id: encontrado.id };
    if (data.users.length < 200) break;
  }

  let id: string;
  if (!existente) {
    const { data, error } = await admin.auth.admin.createUser({
      email: email.data,
      password: password.data,
      email_confirm: true,
      app_metadata: { rol: 'ADMINISTRADOR' },
    });
    if (error || !data.user) throw new Error(`No fue posible crear el administrador: ${error?.message}`);
    id = data.user.id;
    console.log(`Administrador creado: ${email.data} (${id})`);
  } else {
    id = existente.id;
    const { error } = await admin.auth.admin.updateUserById(id, { app_metadata: { rol: 'ADMINISTRADOR' } });
    if (error) throw new Error(`No fue posible actualizar app_metadata: ${error.message}`);
    console.log(`Administrador ya existia: ${email.data} (${id}); se aseguro app_metadata.rol`);
  }

  // Asegurar el perfil en public.usuario (por si el trigger no corrio en un entorno viejo).
  const { error: errPerfil } = await admin
    .from('usuario')
    .upsert({ id, email: email.data, rol: 'ADMINISTRADOR', activo: true }, { onConflict: 'id' });
  if (errPerfil) throw new Error(`No fue posible asegurar public.usuario: ${errPerfil.message}`);

  console.log('Listo. El administrador puede iniciar sesion en la web con ese correo y contrasena.');
}

main().catch((e: unknown) => {
  console.error(`[seed-admin] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
