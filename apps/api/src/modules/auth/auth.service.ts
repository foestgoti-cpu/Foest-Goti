import type { Session } from '@supabase/supabase-js';
import { HTTP, type Rol } from '@foest/shared';
import { AppError, auditar, logger, permisosDelRol, supabaseAdmin, supabaseAsUser, type UsuarioAutenticado } from '../../shared';
import { getSupabaseAnon, urlWeb } from './auth.clients';
import { quedaBloqueado, registrarIntento, verificarContadores } from './auth.intentos';
import type { AceptarInvitacionBody, ChangePasswordBody, LoginBody, RegisterBody } from './auth.dto';
import type {
  ConsentimientoVigente,
  ContextoPeticion,
  LoginSalida,
  MeSalida,
  PerfilBeneficiarioBasico,
  PerfilFuncionarioBasico,
  RegistroSalida,
  SesionSalida,
  UsuarioFila,
  UsuarioSalida,
} from './auth.types';

const MENSAJE_CREDENCIALES = 'Credenciales invalidas';

function sesionSalida(s: Session): SesionSalida {
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: s.token_type,
    expires_in: s.expires_in,
    expires_at: s.expires_at ?? null,
  };
}

function usuarioSalida(u: UsuarioFila): UsuarioSalida {
  return { id: u.id, email: u.email, rol: u.rol, forzar_cambio_clave: Boolean(u.forzar_cambio_clave) };
}

async function cargarUsuario(id: string): Promise<UsuarioFila | null> {
  const { data, error } = await supabaseAdmin
    .from('usuario')
    .select('id, email, rol, activo, forzar_cambio_clave, ultimo_login')
    .eq('id', id)
    .maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar el usuario: ${error.message}`);
  return (data as UsuarioFila | null) ?? null;
}

function calcularEsMenor(fechaNacimiento: string, edadMayoria = 18): boolean {
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00Z`);
  const hoy = new Date();
  let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
  const m = hoy.getUTCMonth() - nacimiento.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < nacimiento.getUTCDate())) edad -= 1;
  return edad < edadMayoria;
}

function esErrorCorreoNoConfirmado(mensaje: string | undefined, code?: string): boolean {
  if (code === 'email_not_confirmed') return true;
  return /not confirmed/i.test(mensaje ?? '');
}

export const authService = {
  /** Texto y version vigente del consentimiento (configuracion_sistema). */
  async consentimientoVigente(): Promise<ConsentimientoVigente> {
    const { data, error } = await supabaseAdmin
      .from('configuracion_sistema')
      .select('clave, valor')
      .in('clave', ['CONSENTIMIENTO_TEXTO_VERSION_VIGENTE', 'CONSENTIMIENTO_TEXTO']);
    if (error) throw AppError.interno(`No fue posible leer el consentimiento: ${error.message}`);
    const filas = (data ?? []) as Array<{ clave: string; valor: string | null }>;
    const version = Number.parseInt(filas.find((f) => f.clave === 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE')?.valor ?? '1', 10);
    const texto = filas.find((f) => f.clave === 'CONSENTIMIENTO_TEXTO')?.valor ?? '';
    return { version: Number.isFinite(version) && version > 0 ? version : 1, texto };
  },

  /**
   * Registro publico de BENEFICIARIO: valida consentimiento, crea el usuario en
   * Supabase Auth (signUp con verificacion de correo), fija app_metadata.rol,
   * crea el perfil basico de beneficiario y registra el consentimiento.
   */
  async registrar(body: RegisterBody, ctx: ContextoPeticion): Promise<RegistroSalida> {
    if (body.aceptar_consentimiento !== true) {
      throw AppError.datosInvalidos('CONSENTIMIENTO_REQUERIDO', 'Debe aceptar el tratamiento de datos personales');
    }
    const vigente = await this.consentimientoVigente();
    if (body.version_consentimiento !== undefined && body.version_consentimiento !== vigente.version) {
      throw AppError.datosInvalidos(
        'CONSENTIMIENTO_DESACTUALIZADO',
        'El texto de consentimiento cambio; vuelva a leerlo y aceptarlo',
        { version_vigente: vigente.version },
      );
    }
    const esMenor = calcularEsMenor(body.fecha_nacimiento);
    if (esMenor && !body.acudiente) {
      throw AppError.datosInvalidos('ACUDIENTE_REQUERIDO', 'Los menores de edad deben registrar los datos de su acudiente');
    }

    // Unico endpoint que revela existencia del correo (409), protegido por rate limit.
    const { data: existente, error: errExistente } = await supabaseAdmin
      .from('usuario')
      .select('id')
      .eq('email', body.email)
      .maybeSingle();
    if (errExistente) throw AppError.interno(`No fue posible verificar el correo: ${errExistente.message}`);
    if (existente) throw AppError.conflicto('EMAIL_EN_USO', 'Ya existe una cuenta con este correo');

    const anon = getSupabaseAnon();
    const { data: alta, error: errAlta } = await anon.auth.signUp({
      email: body.email,
      password: body.password,
      options: { emailRedirectTo: urlWeb('/verificar-correo'), data: { nombres: body.nombres, apellidos: body.apellidos } },
    });
    if (errAlta || !alta?.user) {
      const mensaje = errAlta?.message ?? '';
      const codigo = (errAlta as { code?: string } | null)?.code;
      logger.warn({ code: codigo, status: errAlta?.status, mensaje }, 'signUp de Supabase fallo en el registro');
      // Limite de envio de correos del proyecto Supabase (SMTP por defecto): no es un error del servidor.
      if (errAlta?.status === 429 || codigo === 'over_email_send_rate_limit' || /rate limit/i.test(mensaje)) {
        throw new AppError(
          HTTP.DEMASIADAS_PETICIONES,
          'DEMASIADAS_PETICIONES',
          'Se alcanzo el limite temporal de envio de correos de verificacion; intente de nuevo en unos minutos',
        );
      }
      if (/already|registered|exists/i.test(mensaje)) throw AppError.conflicto('EMAIL_EN_USO', 'Ya existe una cuenta con este correo');
      if (/password/i.test(mensaje)) throw AppError.datosInvalidos('PASSWORD_DEBIL', 'La contrasena no cumple la politica');
      throw AppError.interno('No fue posible crear la cuenta');
    }
    // Supabase devuelve un usuario sin identidades cuando el correo ya existe (anti enumeracion).
    if (Array.isArray(alta.user.identities) && alta.user.identities.length === 0) {
      throw AppError.conflicto('EMAIL_EN_USO', 'Ya existe una cuenta con este correo');
    }
    const usuarioId = alta.user.id;

    // Rol escrito SOLO desde la API con service role (DECISIONES seccion 19).
    const { error: errRol } = await supabaseAdmin.auth.admin.updateUserById(usuarioId, {
      app_metadata: { rol: 'BENEFICIARIO' satisfies Rol },
    });
    if (errRol) throw AppError.interno('No fue posible asignar el rol al usuario');

    const { error: errBen } = await supabaseAdmin.from('beneficiario').insert({
      usuario_id: usuarioId,
      nombres: body.nombres,
      apellidos: body.apellidos,
      fecha_nacimiento: body.fecha_nacimiento,
      es_menor: esMenor,
      tipo_documento: body.tipo_documento ?? null,
      numero_documento: body.numero_documento ?? null,
    });
    if (errBen) {
      // Deshace el alta para no dejar cuentas sin perfil.
      await supabaseAdmin.auth.admin.deleteUser(usuarioId).catch(() => undefined);
      if (errBen.code === '23505') {
        throw AppError.conflicto('DOCUMENTO_EN_USO', 'Ya existe una cuenta con este numero de documento');
      }
      throw AppError.interno(`No fue posible crear el perfil: ${errBen.message}`);
    }

    const { error: errCons } = await supabaseAdmin.from('consentimiento_datos').insert({
      usuario_id: usuarioId,
      version_texto: vigente.version,
      ip: ctx.ip,
      es_menor_al_aceptar: esMenor,
      acudiente_nombre: esMenor ? body.acudiente?.nombre ?? null : null,
      acudiente_tipo_documento: esMenor ? body.acudiente?.tipo_documento ?? null : null,
      acudiente_numero_documento: esMenor ? body.acudiente?.numero_documento ?? null : null,
      acudiente_correo: esMenor ? body.acudiente?.correo ?? null : null,
    });
    if (errCons) throw AppError.interno(`No fue posible registrar el consentimiento: ${errCons.message}`);

    await auditar({
      actor_id: usuarioId,
      actor_tipo: 'USUARIO',
      actor_rol: 'BENEFICIARIO',
      accion: 'CREAR',
      entidad: 'USUARIO',
      entidad_id: usuarioId,
      datos_despues: { email: body.email, rol: 'BENEFICIARIO', es_menor: esMenor, version_consentimiento: vigente.version },
      metadatos: { flujo: 'REGISTRO' },
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });

    return { id: usuarioId, email: body.email, rol: 'BENEFICIARIO', requiere_verificacion: !alta.session };
  },

  /** Inicio de sesion con contadores de fuerza bruta, mensajes genericos y auditoria. */
  async login(body: LoginBody, ctx: ContextoPeticion): Promise<LoginSalida> {
    await verificarContadores(body.email, ctx.ip);

    const anon = getSupabaseAnon();
    const { data, error } = await anon.auth.signInWithPassword({ email: body.email, password: body.password });

    if (error || !data?.session || !data.user) {
      if (esErrorCorreoNoConfirmado(error?.message, (error as { code?: string } | null)?.code)) {
        await registrarIntento(body.email, ctx.ip, false);
        await auditar({
          actor_tipo: 'ANONIMO',
          accion: 'LOGIN_FALLIDO',
          entidad: 'USUARIO',
          resultado: 'DENEGADO',
          metadatos: { email: body.email, motivo: 'EMAIL_NO_VERIFICADO' },
          ip: ctx.ip,
          user_agent: ctx.user_agent,
          request_id: ctx.request_id,
        });
        throw AppError.sinPermiso('EMAIL_NO_VERIFICADO', 'Debe confirmar su correo electronico antes de iniciar sesion');
      }
      await registrarIntento(body.email, ctx.ip, false);
      const bloqueado = await quedaBloqueado(body.email);
      await auditar({
        actor_tipo: 'ANONIMO',
        accion: 'LOGIN_FALLIDO',
        entidad: 'USUARIO',
        resultado: 'FALLO',
        metadatos: { email: body.email, bloqueo_email: bloqueado },
        ip: ctx.ip,
        user_agent: ctx.user_agent,
        request_id: ctx.request_id,
      });
      throw AppError.noAutenticado('CREDENCIALES_INVALIDAS', MENSAJE_CREDENCIALES);
    }

    const usuario = await cargarUsuario(data.user.id);
    if (!usuario) {
      await anon.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw AppError.noAutenticado('CREDENCIALES_INVALIDAS', MENSAJE_CREDENCIALES);
    }
    if (!usuario.activo) {
      // Credenciales correctas pero cuenta deshabilitada: se invalida la sesion recien emitida.
      await supabaseAdmin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
      await registrarIntento(body.email, ctx.ip, false);
      await auditar({
        actor_id: usuario.id,
        actor_rol: usuario.rol,
        accion: 'LOGIN_FALLIDO',
        entidad: 'USUARIO',
        entidad_id: usuario.id,
        resultado: 'DENEGADO',
        metadatos: { motivo: 'CUENTA_INACTIVA' },
        ip: ctx.ip,
        user_agent: ctx.user_agent,
        request_id: ctx.request_id,
      });
      throw AppError.cuentaInactiva();
    }

    const rolClaim = (data.user.app_metadata as Record<string, unknown> | undefined)?.rol;
    const rol: Rol = typeof rolClaim === 'string' && ['ADMINISTRADOR', 'FUNCIONARIO', 'BENEFICIARIO'].includes(rolClaim)
      ? (rolClaim as Rol)
      : usuario.rol;

    await registrarIntento(body.email, ctx.ip, true);
    await supabaseAdmin.from('usuario').update({ ultimo_login: new Date().toISOString() }).eq('id', usuario.id);
    await auditar({
      actor_id: usuario.id,
      actor_rol: rol,
      accion: 'LOGIN',
      entidad: 'USUARIO',
      entidad_id: usuario.id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });

    return { ...sesionSalida(data.session), usuario: usuarioSalida({ ...usuario, rol }) };
  },

  async refresh(refreshToken: string): Promise<SesionSalida> {
    const anon = getSupabaseAnon();
    const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) throw AppError.noAutenticado('TOKEN_INVALIDO', 'La sesion no es valida o expiro');
    return sesionSalida(data.session);
  },

  async logout(user: UsuarioAutenticado, ctx: ContextoPeticion): Promise<void> {
    const { error } = await supabaseAdmin.auth.admin.signOut(user.token, 'global');
    if (error && !/not found|invalid|expired/i.test(error.message)) {
      throw AppError.interno('No fue posible cerrar la sesion');
    }
    await auditar({
      actor_id: user.id,
      actor_rol: user.rol,
      accion: 'LOGOUT',
      entidad: 'USUARIO',
      entidad_id: user.id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  },

  /** Siempre responde igual (no revela si el correo existe). */
  async olvidePassword(email: string): Promise<void> {
    const anon = getSupabaseAnon();
    await anon.auth.resetPasswordForEmail(email, { redirectTo: urlWeb('/restablecer') }).catch(() => undefined);
  },

  async reenviarVerificacion(email: string): Promise<void> {
    const anon = getSupabaseAnon();
    await anon.auth
      .resend({ type: 'signup', email, options: { emailRedirectTo: urlWeb('/verificar-correo') } })
      .catch(() => undefined);
  },

  /** Cambio autenticado: exige la contrasena actual; apaga forzar_cambio_clave. */
  async cambiarPassword(user: UsuarioAutenticado, body: ChangePasswordBody, ctx: ContextoPeticion): Promise<SesionSalida> {
    const anon = getSupabaseAnon();
    const { data, error } = await anon.auth.signInWithPassword({ email: user.email, password: body.password_actual });
    if (error || !data?.session) {
      throw AppError.datosInvalidos('CLAVE_ACTUAL_INCORRECTA', 'La contrasena actual no es correcta');
    }
    // admin.updateUserById(password) invalida TODAS las sesiones del usuario en Supabase
    // (verificado contra el proyecto): se emite una sesion nueva y se devuelve al cliente.
    const { error: errUpd } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password: body.password_nueva });
    if (errUpd) {
      if (/password/i.test(errUpd.message)) throw AppError.datosInvalidos('PASSWORD_DEBIL', 'La contrasena no cumple la politica');
      throw AppError.interno('No fue posible actualizar la contrasena');
    }
    const { error: errFlag } = await supabaseAdmin.from('usuario').update({ forzar_cambio_clave: false }).eq('id', user.id);
    if (errFlag) throw AppError.interno('No fue posible actualizar el estado de la cuenta');

    const nueva = await anon.auth.signInWithPassword({ email: user.email, password: body.password_nueva });
    if (nueva.error || !nueva.data?.session) throw AppError.interno('La contrasena se actualizo pero no fue posible renovar la sesion');

    await auditar({
      actor_id: user.id,
      actor_rol: user.rol,
      accion: 'CAMBIO_CLAVE',
      entidad: 'USUARIO',
      entidad_id: user.id,
      metadatos: { flujo: 'CAMBIO_AUTENTICADO' },
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
    return sesionSalida(nueva.data.session);
  },

  /**
   * Aceptacion de invitacion de funcionario: el web ya establecio la sesion con
   * el enlace de Supabase (inviteUserByEmail); aqui se fija la contrasena, se
   * marca la cuenta activa y se audita.
   */
  async aceptarInvitacion(user: UsuarioAutenticado, body: AceptarInvitacionBody, ctx: ContextoPeticion): Promise<LoginSalida> {
    const { error: errUpd } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: body.password,
      email_confirm: true,
    });
    if (errUpd) {
      if (/password/i.test(errUpd.message)) throw AppError.datosInvalidos('PASSWORD_DEBIL', 'La contrasena no cumple la politica');
      throw AppError.interno('No fue posible definir la contrasena');
    }
    const { data, error } = await supabaseAdmin
      .from('usuario')
      .update({ activo: true, forzar_cambio_clave: false, ultimo_login: new Date().toISOString() })
      .eq('id', user.id)
      .select('id, email, rol, activo, forzar_cambio_clave, ultimo_login')
      .single();
    if (error || !data) throw AppError.interno('No fue posible activar la cuenta');

    await auditar({
      actor_id: user.id,
      actor_rol: user.rol,
      accion: 'INVITACION_ACEPTADA',
      entidad: 'USUARIO',
      entidad_id: user.id,
      datos_despues: { activo: true, forzar_cambio_clave: false },
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
    // Fijar la contrasena invalida la sesion del enlace de invitacion: se emite una nueva.
    const nueva = await getSupabaseAnon().auth.signInWithPassword({ email: user.email, password: body.password });
    if (nueva.error || !nueva.data?.session) throw AppError.interno('La cuenta se activo pero no fue posible iniciar la sesion');
    return { ...sesionSalida(nueva.data.session), usuario: usuarioSalida({ ...(data as UsuarioFila), rol: user.rol }) };
  },

  /** Usuario en sesion + permisos resueltos en servidor + perfil basico (lectura con RLS). */
  async me(user: UsuarioAutenticado): Promise<MeSalida> {
    const usuario = await cargarUsuario(user.id);
    if (!usuario) throw AppError.noAutenticado('USUARIO_SIN_PERFIL', 'El usuario no tiene perfil en la plataforma');
    const salida = usuarioSalida({ ...usuario, rol: user.rol });

    let perfil: PerfilBeneficiarioBasico | PerfilFuncionarioBasico | null = null;
    const db = supabaseAsUser(user.token);
    if (user.rol === 'BENEFICIARIO') {
      const { data } = await db
        .from('beneficiario')
        .select('id, nombres, apellidos, tipo_documento, numero_documento, es_menor, perfil_completo')
        .eq('usuario_id', user.id)
        .maybeSingle();
      if (data) perfil = { tipo: 'BENEFICIARIO', ...(data as Omit<PerfilBeneficiarioBasico, 'tipo'>) };
    } else if (user.rol === 'FUNCIONARIO') {
      const { data } = await db
        .from('funcionario')
        .select('id, nombres, apellidos, cargo, dependencia')
        .eq('usuario_id', user.id)
        .maybeSingle();
      if (data) perfil = { tipo: 'FUNCIONARIO', ...(data as Omit<PerfilFuncionarioBasico, 'tipo'>) };
    }

    return {
      usuario: salida,
      permisos: permisosDelRol(user.rol),
      perfil,
      forzar_cambio_clave: salida.forzar_cambio_clave,
    };
  },
};
