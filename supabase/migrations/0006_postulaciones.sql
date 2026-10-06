-- =============================================================================
-- FOEST - Migracion 0006_postulaciones (docs/modules/postulaciones.md)
--
-- Asume 0001_base.sql aplicada (postulacion, postulacion_envio, postulacion_beneficio,
-- historial_estado_postulacion, declaracion_juramentada, notificacion, auditoria_evento).
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
--
-- Contenido:
--   1. datos_pago_st: datos de pago del subsidio de transporte, cifrados en la API
--      (AES-256-GCM en Node con clave DATOS_PAGO_KEY; `clave_version` permite rotar).
--   2. fn_transicionar_postulacion: unico cambio de estado atomico (FOR UPDATE, version,
--      historial, notificacion). La tabla de transiciones se valida en la API.
--   3. fn_enviar_postulacion: envio / subsanacion atomico e idempotente (perfil_snapshot,
--      hash_envio, ciclo, PENDIENTE, historial, notificacion, auditoria).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Datos de pago del ST (cifrado a nivel de campo en la API; DECISIONES seccion 12)
-- -----------------------------------------------------------------------------
create table if not exists public.datos_pago_st (
  postulacion_id   uuid primary key references public.postulacion(id) on delete cascade,
  tipo             text not null check (tipo in ('CUENTA_BANCARIA', 'BILLETERA')),
  entidad          text not null,
  -- Formato: v1:<iv_b64>:<tag_b64>:<cifrado_b64> (AES-256-GCM, Node). Nunca se devuelve por la API.
  numero_cifrado   text not null,
  ultimos4         text not null check (ultimos4 ~ '^\d{4}$'),
  clave_version    text not null default 'v1',
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
comment on table public.datos_pago_st is 'Datos de pago del subsidio de transporte. numero_cifrado se cifra/descifra solo en la API (DATOS_PAGO_KEY).';

drop trigger if exists trg_datos_pago_st_actualizado_en on public.datos_pago_st;
create trigger trg_datos_pago_st_actualizado_en before update on public.datos_pago_st
  for each row execute function public.fn_set_actualizado_en();

alter table public.datos_pago_st enable row level security;

-- Solo el titular ve la fila (y unicamente para saber tipo/entidad/ultimos4; la API nunca expone numero_cifrado).
-- Escrituras exclusivamente por service_role (API). El administrador y el funcionario NO leen esta tabla
-- directamente: el descifrado para desembolsos ocurre en seguimiento_beneficios con auditoria.
drop policy if exists datos_pago_st_select_propio on public.datos_pago_st;
create policy datos_pago_st_select_propio on public.datos_pago_st for select to authenticated
  using (exists (
    select 1 from public.postulacion p
    where p.id = postulacion_id and public.es_beneficiario() and public.es_mi_beneficiario(p.beneficiario_id)
  ));
revoke insert, update, delete on public.datos_pago_st from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Transicion atomica de estado (la API valida la tabla de transiciones antes de llamar)
-- -----------------------------------------------------------------------------
create or replace function public.fn_transicionar_postulacion(
  p_postulacion_id   uuid,
  p_estado_nuevo     text,
  p_motivo           text,
  p_actor_tipo       text,
  p_actor_id         uuid default null,
  p_observaciones    text default null,
  p_version_esperada integer default null,
  p_payload          jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post        public.postulacion%rowtype;
  v_estado_ant  public.estado_postulacion;
  v_usuario_id  uuid;
  v_titulo      text;
  v_mensaje     text;
  v_tipo_notif  text;
  v_severidad   public.severidad_notificacion := 'INFO';
begin
  select * into v_post from public.postulacion where id = p_postulacion_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO: postulacion % no existe', p_postulacion_id using errcode = 'P0002';
  end if;
  if p_version_esperada is not null and v_post.version <> p_version_esperada then
    raise exception 'VERSION_CONFLICTO: version actual % distinta de la esperada %', v_post.version, p_version_esperada
      using errcode = 'P0001';
  end if;
  if v_post.estado in ('APROBADA', 'RECHAZADA', 'DESISTIDA') then
    raise exception 'TRANSICION_INVALIDA: la postulacion esta en estado terminal %', v_post.estado using errcode = 'P0001';
  end if;
  if v_post.estado::text = p_estado_nuevo then
    raise exception 'TRANSICION_INVALIDA: la postulacion ya esta en %', p_estado_nuevo using errcode = 'P0001';
  end if;
  v_estado_ant := v_post.estado;

  update public.postulacion
     set estado                   = p_estado_nuevo::public.estado_postulacion,
         version                  = version + 1,
         fecha_limite_subsanacion = case
             when p_estado_nuevo = 'EN_CORRECCION' then coalesce((p_payload ->> 'fecha_limite_subsanacion')::timestamptz, fecha_limite_subsanacion)
             when p_estado_nuevo in ('PENDIENTE', 'RECHAZADA', 'DESISTIDA', 'APROBADA') then null
             else fecha_limite_subsanacion end,
         correccion_vigente       = case
             when p_estado_nuevo = 'EN_CORRECCION' then coalesce(p_payload -> 'correccion_vigente', correccion_vigente)
             else correccion_vigente end,
         aprobacion_parcial       = case
             when p_estado_nuevo = 'APROBADA' then coalesce((p_payload ->> 'aprobacion_parcial')::boolean, false)
             else aprobacion_parcial end
   where id = p_postulacion_id
   returning * into v_post;

  insert into public.historial_estado_postulacion
    (postulacion_id, ciclo, estado_anterior, estado_nuevo, motivo, actor_tipo, actor_id, observaciones)
  values
    (p_postulacion_id, v_post.ciclo, v_estado_ant,
     p_estado_nuevo::public.estado_postulacion, p_motivo, p_actor_tipo::public.actor_tipo, p_actor_id, p_observaciones);

  -- Notificacion in-app al beneficiario segun el destino (correo: TODO modulo notificaciones / outbox)
  select b.usuario_id into v_usuario_id from public.beneficiario b where b.id = v_post.beneficiario_id;
  v_tipo_notif := null;
  if p_estado_nuevo = 'EN_CORRECCION' then
    v_tipo_notif := 'POSTULACION_EN_CORRECCION'; v_severidad := 'CRITICA';
    v_titulo := 'Su postulacion requiere correcciones';
    v_mensaje := 'El Equipo FOEST solicito correcciones a su postulacion. Plazo: ' ||
                 coalesce(to_char(v_post.fecha_limite_subsanacion at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI'), 'ver detalle') || '.';
  elsif p_estado_nuevo = 'APROBADA' then
    v_tipo_notif := 'POSTULACION_APROBADA';
    v_titulo := 'Su postulacion fue aprobada';
    v_mensaje := case when v_post.aprobacion_parcial then 'Su postulacion fue aprobada parcialmente. Revise el resultado por beneficio.'
                      else 'Su postulacion fue aprobada. Felicitaciones.' end;
  elsif p_estado_nuevo = 'RECHAZADA' then
    v_tipo_notif := 'POSTULACION_RECHAZADA'; v_severidad := 'ADVERTENCIA';
    v_titulo := 'Su postulacion no fue aprobada';
    v_mensaje := case when p_motivo = 'VENCIMIENTO_SUBSANACION'
                      then 'El plazo para corregir su postulacion vencio sin recibir la subsanacion. La postulacion quedo como no aprobada.'
                      else 'Su postulacion no fue aprobada. Revise las observaciones del Equipo FOEST.' end;
  elsif p_estado_nuevo = 'DESISTIDA' then
    v_tipo_notif := 'POSTULACION_DESISTIDA';
    v_titulo := 'Desistimiento registrado';
    v_mensaje := 'Usted desistio de su postulacion. Esta accion no puede deshacerse.';
  end if;

  if v_tipo_notif is not null and v_usuario_id is not null then
    insert into public.notificacion (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url_destino, severidad, clave_dedup)
    values (v_usuario_id, v_tipo_notif, v_titulo, v_mensaje, 'POSTULACION', p_postulacion_id::text,
            '/beneficiario/postulaciones/' || p_postulacion_id::text, v_severidad,
            v_tipo_notif || ':' || p_postulacion_id::text || ':' || v_post.ciclo::text || ':' || v_post.version::text)
    on conflict do nothing;
  end if;

  return to_jsonb(v_post);
end;
$$;
revoke all on function public.fn_transicionar_postulacion(uuid, text, text, text, uuid, text, integer, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Envio / subsanacion atomico e idempotente
-- -----------------------------------------------------------------------------
create or replace function public.fn_enviar_postulacion(
  p_postulacion_id   uuid,
  p_actor_id         uuid,
  p_idempotency_key  text,
  p_declaraciones    jsonb default '[]'::jsonb,
  p_modo             text default 'ENVIO'          -- ENVIO (BORRADOR->PENDIENTE) | SUBSANACION (EN_CORRECCION->PENDIENTE)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post          public.postulacion%rowtype;
  v_envio         public.postulacion_envio%rowtype;
  v_ben           public.beneficiario%rowtype;
  v_acu           public.acudiente%rowtype;
  v_snapshot      jsonb;
  v_datos         jsonb;
  v_hash          text;
  v_ciclo         integer;
  v_estado_ant    public.estado_postulacion;
  v_motivo        text;
  v_accion        text;
  v_evento        jsonb;
begin
  if p_modo not in ('ENVIO', 'SUBSANACION') then
    raise exception 'DATOS_INVALIDOS: modo % no soportado', p_modo using errcode = 'P0001';
  end if;

  select * into v_post from public.postulacion where id = p_postulacion_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO: postulacion % no existe', p_postulacion_id using errcode = 'P0002';
  end if;

  -- Idempotencia: misma llave ya aplicada -> mismo resultado, sin duplicar
  if p_idempotency_key is not null then
    select * into v_envio from public.postulacion_envio
     where postulacion_id = p_postulacion_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'postulacion_id', v_post.id, 'estado', v_post.estado, 'ciclo', v_envio.ciclo, 'version', v_post.version,
        'hash_envio', v_envio.hash_envio, 'enviado_en', v_envio.enviado_en, 'repetido', true);
    end if;
  end if;

  v_estado_ant := v_post.estado;
  if p_modo = 'ENVIO' then
    if v_post.estado <> 'BORRADOR' then
      raise exception 'TRANSICION_INVALIDA: solo se envia desde BORRADOR (estado actual %)', v_post.estado using errcode = 'P0001';
    end if;
    v_motivo := 'ENVIO'; v_accion := 'ENVIAR';
  else
    if v_post.estado <> 'EN_CORRECCION' then
      raise exception 'TRANSICION_INVALIDA: solo se subsana desde EN_CORRECCION (estado actual %)', v_post.estado using errcode = 'P0001';
    end if;
    if v_post.fecha_limite_subsanacion is not null and now() > v_post.fecha_limite_subsanacion then
      raise exception 'PLAZO_SUBSANACION_VENCIDO: el plazo vencio el %', v_post.fecha_limite_subsanacion using errcode = 'P0001';
    end if;
    v_motivo := 'SUBSANACION'; v_accion := 'SUBSANAR';
  end if;

  -- Perfil congelado desde BENEFICIARIO (+ acudiente). Estrato y SISBEN solo viven aqui.
  select * into v_ben from public.beneficiario where id = v_post.beneficiario_id;
  if not found or not v_ben.perfil_completo then
    raise exception 'PERFIL_INCOMPLETO: el perfil del beneficiario no esta completo' using errcode = 'P0001';
  end if;
  select * into v_acu from public.acudiente where beneficiario_id = v_ben.id;

  v_snapshot := jsonb_build_object(
    'beneficiario_id', v_ben.id,
    'tipo_documento', v_ben.tipo_documento, 'numero_documento', v_ben.numero_documento, 'expedido_en', v_ben.expedido_en,
    'nombres', v_ben.nombres, 'apellidos', v_ben.apellidos, 'fecha_nacimiento', v_ben.fecha_nacimiento, 'es_menor', v_ben.es_menor,
    'genero', v_ben.genero, 'estado_civil', v_ben.estado_civil, 'direccion', v_ben.direccion, 'sector', v_ben.sector,
    'celular_1', v_ben.celular_1, 'celular_2', v_ben.celular_2,
    'correo_principal', (select email from public.usuario where id = v_ben.usuario_id),
    'correo_notificacion_2', v_ben.correo_notificacion_2,
    'estrato', v_ben.estrato, 'sisben_categoria', v_ben.sisben_categoria, 'sisben_puntaje', v_ben.sisben_puntaje,
    'acudiente', case when v_acu.id is null then null else jsonb_build_object(
        'tipo_documento', v_acu.tipo_documento, 'numero_documento', v_acu.numero_documento,
        'nombres', v_acu.nombres, 'apellidos', v_acu.apellidos, 'parentesco', v_acu.parentesco,
        'celular', v_acu.celular, 'correo', v_acu.correo) end,
    'congelado_en', now()
  );

  -- Declaraciones aceptadas (seccion 9) se fijan en el formulario enviado
  v_datos := v_post.datos_formulario;
  if jsonb_typeof(p_declaraciones) = 'array' and jsonb_array_length(p_declaraciones) > 0 then
    v_datos := jsonb_set(v_datos, '{seccion_9}', jsonb_build_object('declaraciones', p_declaraciones), true);
  end if;

  v_ciclo := v_post.ciclo + 1;
  -- Hash SHA-256 canonico (jsonb normaliza el orden de claves) de formulario + perfil
  v_hash := encode(digest(convert_to((jsonb_build_object('datos_formulario', v_datos, 'perfil_snapshot', v_snapshot))::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.postulacion_envio (postulacion_id, ciclo, datos_formulario, perfil_snapshot, hash_envio, idempotency_key)
  values (p_postulacion_id, v_ciclo, v_datos, v_snapshot, v_hash, p_idempotency_key)
  returning * into v_envio;

  update public.postulacion
     set estado = 'PENDIENTE',
         ciclo = v_ciclo,
         version = version + 1,
         datos_formulario = v_datos,
         enviada_en = coalesce(enviada_en, now()),
         fecha_limite_subsanacion = null
   where id = p_postulacion_id
   returning * into v_post;

  insert into public.historial_estado_postulacion
    (postulacion_id, ciclo, estado_anterior, estado_nuevo, motivo, actor_tipo, actor_id, observaciones)
  values (p_postulacion_id, v_ciclo, v_estado_ant, 'PENDIENTE', v_motivo, 'BENEFICIARIO', p_actor_id,
          case when p_modo = 'ENVIO' then 'Envio del expediente (ciclo ' || v_ciclo || ')' else 'Subsanacion (ciclo ' || v_ciclo || ')' end);

  -- Notificacion in-app (el correo lo gestionara el modulo notificaciones: TODO outbox)
  insert into public.notificacion (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url_destino, severidad, clave_dedup)
  values (v_ben.usuario_id,
          case when p_modo = 'ENVIO' then 'POSTULACION_ENVIADA' else 'POSTULACION_SUBSANADA' end,
          case when p_modo = 'ENVIO' then 'Postulacion enviada' else 'Subsanacion enviada' end,
          case when p_modo = 'ENVIO'
               then 'Su postulacion fue recibida (ciclo ' || v_ciclo || '). Sera revisada por el Comite FOEST.'
               else 'Su subsanacion fue recibida (ciclo ' || v_ciclo || '). Sera revisada por el Comite FOEST.' end,
          'POSTULACION', p_postulacion_id::text, '/beneficiario/postulaciones/' || p_postulacion_id::text, 'INFO',
          'POSTULACION_ENVIADA:' || p_postulacion_id::text || ':' || v_ciclo::text)
  on conflict do nothing;

  -- Auditoria en la misma transaccion (append-only)
  v_evento := jsonb_build_object(
    'actor_id', p_actor_id, 'actor_tipo', 'USUARIO', 'actor_rol', 'BENEFICIARIO', 'accion', v_accion,
    'entidad', 'POSTULACION', 'entidad_id', p_postulacion_id::text, 'resultado', 'EXITO',
    'datos_despues', jsonb_build_object('estado', 'PENDIENTE', 'ciclo', v_ciclo, 'hash_envio', v_hash),
    'metadatos', jsonb_build_object('idempotency_key', p_idempotency_key, 'modo', p_modo), 'registrado_en', now());
  insert into public.auditoria_evento (actor_id, actor_tipo, actor_rol, accion, entidad, entidad_id, resultado, datos_antes, datos_despues, metadatos, hash_evento)
  values (p_actor_id, 'USUARIO', 'BENEFICIARIO', v_accion, 'POSTULACION', p_postulacion_id::text, 'EXITO',
          jsonb_build_object('estado', v_estado_ant, 'ciclo', v_ciclo - 1),
          v_evento -> 'datos_despues', v_evento -> 'metadatos',
          encode(digest(convert_to(v_evento::text, 'UTF8'), 'sha256'), 'hex'));

  return jsonb_build_object(
    'postulacion_id', v_post.id, 'estado', v_post.estado, 'ciclo', v_ciclo, 'version', v_post.version,
    'hash_envio', v_hash, 'enviado_en', v_envio.enviado_en, 'repetido', false);
end;
$$;
revoke all on function public.fn_enviar_postulacion(uuid, uuid, text, jsonb, text) from public, anon, authenticated;

-- Fin de 0006_postulaciones.sql
