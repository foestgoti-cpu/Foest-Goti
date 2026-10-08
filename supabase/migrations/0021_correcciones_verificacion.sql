-- =============================================================================
-- 0021_correcciones_verificacion.sql
-- Correcciones halladas en la verificacion integral contra la base real (docs/VERIFICACION_REAL.md).
-- Idempotente: solo create or replace.
--
-- D-01 fn_enviar_postulacion usaba pgcrypto digest(), que en Supabase vive en el esquema
--      `extensions` y no es visible con `set search_path = public` (error 42883
--      "function digest(bytea, unknown) does not exist" -> POST /postulaciones/:id/enviar daba 500).
--      Se reemplaza por sha256(bytea), funcion nativa de PostgreSQL (>= 11), igual que 0011.
-- =============================================================================

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
  v_hash := encode(sha256(convert_to((jsonb_build_object('datos_formulario', v_datos, 'perfil_snapshot', v_snapshot))::text, 'UTF8')), 'hex');

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
          encode(sha256(convert_to(v_evento::text, 'UTF8')), 'hex'));

  return jsonb_build_object(
    'postulacion_id', v_post.id, 'estado', v_post.estado, 'ciclo', v_ciclo, 'version', v_post.version,
    'hash_envio', v_hash, 'enviado_en', v_envio.enviado_en, 'repetido', false);
end;
$$;
revoke all on function public.fn_enviar_postulacion(uuid, uuid, text, jsonb, text) from public, anon, authenticated;

-- D-03 (SQL) fn_admin_alertas: el detector TRABAJO_FALLIDO de correos usaba evento_outbox.actualizado_en, columna inexistente
--      (queda en detectores_con_error de GET /dashboard/admin/alertas). Se usa coalesce(procesado_en, creado_en).
create or replace function public.fn_admin_alertas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alertas  jsonb := '[]'::jsonb;
  v_errores  jsonb := '[]'::jsonb;
  v_tmp      jsonb;
  v_hoy      date := public.fn_hoy_bogota();
  v_cierre_dias        integer := public.fn_config_int('ALERTA_CIERRE_DIAS', 7);
  v_sobrecarga_n       integer := public.fn_config_int('ALERTA_SOBRECARGA_PENDIENTES', 50);
  v_sobrecarga_dias    integer := public.fn_config_int('ALERTA_SOBRECARGA_DIAS_HABILES', 5);
  v_pool_dias          integer := public.fn_config_int('ALERTA_POOL_DIAS_HABILES', 3);
  v_subsanacion_dias   integer := public.fn_config_int('ALERTA_SUBSANACION_DIAS_HABILES', 2);
  v_cupo_aviso_pct     integer := public.fn_config_int('ALERTA_CUPO_AVISO_PCT', 90);
  v_trabajos_horas     integer := public.fn_config_int('ALERTA_TRABAJOS_HORAS', 24);
begin
  perform public.fn_exigir_admin();

  -- CIERRE_PROXIMO: HABILITADA cuyo cierre ocurre en menos de N dias naturales
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', 'CIERRE_PROXIMO',
      'severidad', case when dias_restantes <= 2 then 'ALTA' else 'MEDIA' end,
      'entidad', 'CONVOCATORIA',
      'entidad_id', id,
      'mensaje', 'La convocatoria ' || nombre || ' cierra en ' || dias_restantes || ' dia(s)',
      'detalle', jsonb_build_object('dias_restantes', dias_restantes, 'fecha_cierre_exclusiva', fecha_cierre_exclusiva, 'periodo', anio || '-' || semestre),
      'accion_url', '/admin/convocatorias/' || id
    )), '[]'::jsonb) into v_tmp
    from (
      select c.id, c.nombre, c.anio, c.semestre, c.fecha_cierre_exclusiva,
             greatest(0, ((c.fecha_cierre_exclusiva at time zone 'America/Bogota')::date - v_hoy)) as dias_restantes
      from public.convocatoria c
      where c.estado = 'HABILITADA'
        and c.fecha_cierre_exclusiva > now()
        and (c.fecha_cierre_exclusiva at time zone 'America/Bogota')::date - v_hoy < v_cierre_dias
    ) s;
    v_alertas := v_alertas || v_tmp;
  exception when others then
    v_errores := v_errores || jsonb_build_object('codigo', 'CIERRE_PROXIMO', 'error', sqlerrm);
  end;

  -- SIN_COMITE: HABILITADA sin funcionario activo en el comite (no aplica a BORRADOR)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', 'SIN_COMITE', 'severidad', 'ALTA', 'entidad', 'CONVOCATORIA', 'entidad_id', c.id,
      'mensaje', 'La convocatoria ' || c.nombre || ' esta habilitada y no tiene comite asignado',
      'detalle', jsonb_build_object('periodo', c.anio || '-' || c.semestre),
      'accion_url', '/admin/convocatorias/' || c.id || '/comite'
    )), '[]'::jsonb) into v_tmp
    from public.convocatoria c
    where c.estado = 'HABILITADA'
      and not exists (select 1 from public.asignacion_funcionario af where af.convocatoria_id = c.id and af.retirado_en is null);
    v_alertas := v_alertas || v_tmp;
  exception when others then
    v_errores := v_errores || jsonb_build_object('codigo', 'SIN_COMITE', 'error', sqlerrm);
  end;

  -- SOBRECARGA: evaluador con postulaciones EN_EVALUACION sin cambio en historial por > M dias habiles
  begin
    with ultimo as (
      select distinct on (h.postulacion_id) h.postulacion_id, h.actor_id, h.cambiado_en
      from public.historial_estado_postulacion h
      join public.postulacion p on p.id = h.postulacion_id and p.estado = 'EN_EVALUACION'
      order by h.postulacion_id, h.cambiado_en desc
    ),
    evaluador as (
      select distinct on (h.postulacion_id) h.postulacion_id, h.actor_id as funcionario_id
      from public.historial_estado_postulacion h
      join public.postulacion p on p.id = h.postulacion_id and p.estado = 'EN_EVALUACION'
      where h.estado_nuevo = 'EN_EVALUACION' and h.actor_id is not null
      order by h.postulacion_id, h.cambiado_en desc
    ),
    estancadas as (
      select e.funcionario_id, count(*) as n
      from evaluador e
      join ultimo u on u.postulacion_id = e.postulacion_id
      where public.fn_dias_habiles_entre((u.cambiado_en at time zone 'America/Bogota')::date, v_hoy) > v_sobrecarga_dias
      group by e.funcionario_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', 'SOBRECARGA',
      'severidad', case when s.n >= v_sobrecarga_n then 'ALTA' else 'MEDIA' end,
      'entidad', 'FUNCIONARIO', 'entidad_id', s.funcionario_id,
      'mensaje', coalesce(f.nombres || ' ' || f.apellidos, u.email) || ' tiene ' || s.n || ' expediente(s) en evaluacion sin movimiento por mas de ' || v_sobrecarga_dias || ' dias habiles',
      'detalle', jsonb_build_object('expedientes_sin_movimiento', s.n, 'dias_habiles', v_sobrecarga_dias),
      'accion_url', '/admin/asignaciones?funcionario_id=' || s.funcionario_id
    )), '[]'::jsonb) into v_tmp
    from estancadas s
    join public.usuario u on u.id = s.funcionario_id
    left join public.funcionario f on f.usuario_id = s.funcionario_id;
    v_alertas := v_alertas || v_tmp;
  exception when others then
    v_errores := v_errores || jsonb_build_object('codigo', 'SOBRECARGA', 'error', sqlerrm);
  end;

  -- POOL_SIN_TOMAR: PENDIENTE sin tomar por mas de X dias habiles desde enviada_en (agrupada por convocatoria)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', 'POOL_SIN_TOMAR', 'severidad', 'MEDIA', 'entidad', 'CONVOCATORIA', 'entidad_id', s.convocatoria_id,
      'mensaje', s.n || ' postulacion(es) pendiente(s) de la convocatoria ' || c.nombre || ' llevan mas de ' || v_pool_dias || ' dias habiles sin ser tomadas',
      'detalle', jsonb_build_object('postulaciones', s.n, 'dias_habiles', v_pool_dias, 'mas_antigua', s.mas_antigua),
      'accion_url', '/admin/postulaciones?convocatoria_id=' || s.convocatoria_id || '&estado=PENDIENTE'
    )), '[]'::jsonb) into v_tmp
    from (
      select p.convocatoria_id, count(*) as n, min(p.enviada_en) as mas_antigua
      from public.postulacion p
      where p.estado = 'PENDIENTE'
        and p.enviada_en is not null
        and public.fn_dias_habiles_entre((p.enviada_en at time zone 'America/Bogota')::date, v_hoy) > v_pool_dias
      group by p.convocatoria_id
    ) s
    join public.convocatoria c on c.id = s.convocatoria_id;
    v_alertas := v_alertas || v_tmp;
  exception when others then
    v_errores := v_errores || jsonb_build_object('codigo', 'POOL_SIN_TOMAR', 'error', sqlerrm);
  end;

  -- SUBSANACION_POR_VENCER: EN_CORRECCION cuyo limite vence en menos de N dias habiles
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', 'SUBSANACION_POR_VENCER', 'severidad', 'MEDIA', 'entidad', 'POSTULACION', 'entidad_id', s.id,
      'mensaje', 'La subsanacion de la postulacion vence el ' || to_char(s.limite, 'YYYY-MM-DD') || ' (' || s.dias || ' dia(s) habil(es))',
      'detalle', jsonb_build_object('fecha_limite_subsanacion', s.fecha_limite_subsanacion, 'dias_habiles_restantes', s.dias),
      'accion_url', '/admin/postulaciones/' || s.id
    )), '[]'::jsonb) into v_tmp
    from (
      select p.id, p.fecha_limite_subsanacion,
             (p.fecha_limite_subsanacion at time zone 'America/Bogota')::date as limite,
             public.fn_dias_habiles_entre(v_hoy, (p.fecha_limite_subsanacion at time zone 'America/Bogota')::date) as dias
      from public.postulacion p
      where p.estado = 'EN_CORRECCION'
        and p.fecha_limite_subsanacion is not null
        and p.fecha_limite_subsanacion > now()
    ) s
    where s.dias < v_subsanacion_dias;
    v_alertas := v_alertas || v_tmp;
  exception when others then
    v_errores := v_errores || jsonb_build_object('codigo', 'SUBSANACION_POR_VENCER', 'error', sqlerrm);
  end;

  -- FUNCIONARIO_INACTIVO_CON_ASIGNACIONES: inactivo con expedientes EN_EVALUACION a su cargo
  begin
    with evaluador as (
      select distinct on (h.postulacion_id) h.postulacion_id, h.actor_id as funcionario_id
      from public.historial_estado_postulacion h
      join public.postulacion p on p.id = h.postulacion_id and p.estado = 'EN_EVALUACION'
      where h.estado_nuevo = 'EN_EVALUACION' and h.actor_id is not null
      order by h.postulacion_id, h.cambiado_en desc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', 'FUNCIONARIO_INACTIVO_CON_ASIGNACIONES',
      'severidad', case when s.n >= 10 then 'ALTA' else 'MEDIA' end,
      'entidad', 'FUNCIONARIO', 'entidad_id', s.funcionario_id,
      'mensaje', coalesce(f.nombres || ' ' || f.apellidos, u.email) || ' esta inactivo y conserva ' || s.n || ' expediente(s) en evaluacion',
      'detalle', jsonb_build_object('expedientes', s.n),
      'accion_url', '/admin/asignaciones?funcionario_id=' || s.funcionario_id || '&reasignacion=masiva'
    )), '[]'::jsonb) into v_tmp
    from (select e.funcionario_id, count(*) as n from evaluador e group by e.funcionario_id) s
    join public.usuario u on u.id = s.funcionario_id and u.activo = false
    left join public.funcionario f on f.usuario_id = s.funcionario_id;
    v_alertas := v_alertas || v_tmp;
  exception when others then
    v_errores := v_errores || jsonb_build_object('codigo', 'FUNCIONARIO_INACTIVO_CON_ASIGNACIONES', 'error', sqlerrm);
  end;

  -- CUPOS_SUPERADOS: solo si existe otorgamiento (seguimiento_beneficios)
  if to_regclass('public.otorgamiento') is not null then
    begin
      execute format($q$
        select coalesce(jsonb_agg(jsonb_build_object(
          'codigo', 'CUPOS_SUPERADOS',
          'severidad', case when s.pct_cupos >= 100 or s.pct_presupuesto >= 100 then 'ALTA' else 'MEDIA' end,
          'entidad', 'CONVOCATORIA_BENEFICIO', 'entidad_id', s.convocatoria_id,
          'mensaje', 'Beneficio ' || s.beneficio_codigo || ' de ' || s.nombre || ': ' || s.otorgados || ' de ' || s.cupos_estimados || ' cupos (' || s.pct_cupos || ' %%), presupuesto al ' || s.pct_presupuesto || ' %%',
          'detalle', jsonb_build_object('beneficio_codigo', s.beneficio_codigo, 'otorgados', s.otorgados, 'cupos_estimados', s.cupos_estimados,
                                        'monto_aprobado', s.monto_aprobado, 'presupuesto_asignado', s.presupuesto_asignado,
                                        'pct_cupos', s.pct_cupos, 'pct_presupuesto', s.pct_presupuesto),
          'accion_url', '/admin/convocatorias/' || s.convocatoria_id
        )), '[]'::jsonb)
        from (
          select cb.convocatoria_id, c.nombre, b.codigo as beneficio_codigo, cb.cupos_estimados, cb.presupuesto_asignado,
                 count(o.id) as otorgados, coalesce(sum(o.monto_aprobado), 0) as monto_aprobado,
                 case when cb.cupos_estimados > 0 then round(count(o.id) * 100.0 / cb.cupos_estimados) else 0 end as pct_cupos,
                 case when cb.presupuesto_asignado > 0 then round(coalesce(sum(o.monto_aprobado), 0) * 100.0 / cb.presupuesto_asignado) else 0 end as pct_presupuesto
          from public.convocatoria_beneficio cb
          join public.convocatoria c on c.id = cb.convocatoria_id
          join public.beneficio b on b.id = cb.beneficio_id
          left join public.postulacion p on p.convocatoria_id = cb.convocatoria_id
          left join public.otorgamiento o on o.postulacion_id = p.id and o.beneficio_codigo = b.codigo and o.estado <> 'REVOCADO'
          group by cb.convocatoria_id, c.nombre, b.codigo, cb.cupos_estimados, cb.presupuesto_asignado
        ) s
        where s.pct_cupos >= %s or s.pct_presupuesto >= %s
      $q$, v_cupo_aviso_pct, v_cupo_aviso_pct) into v_tmp;
      v_alertas := v_alertas || v_tmp;
    exception when others then
      v_errores := v_errores || jsonb_build_object('codigo', 'CUPOS_SUPERADOS', 'error', sqlerrm);
    end;
  end if;

  -- TRABAJO_FALLIDO: reportes y correos fallidos recientes (solo si existen las tablas)
  if to_regclass('public.reporte_generado') is not null then
    begin
      execute format($q$
        select coalesce(jsonb_agg(jsonb_build_object(
          'codigo', 'TRABAJO_FALLIDO', 'severidad', case when n >= 5 then 'ALTA' else 'MEDIA' end,
          'entidad', 'REPORTE', 'entidad_id', null,
          'mensaje', n || ' reporte(s) fallido(s) en las ultimas %s horas',
          'detalle', jsonb_build_object('fallidos', n, 'horas', %s), 'accion_url', '/admin/reportes?estado=FALLIDO'
        )), '[]'::jsonb)
        from (select count(*) as n from public.reporte_generado r where r.estado = 'FALLIDO' and r.actualizado_en >= now() - interval '%s hours') s
        where s.n > 0
      $q$, v_trabajos_horas, v_trabajos_horas, v_trabajos_horas) into v_tmp;
      v_alertas := v_alertas || v_tmp;
    exception when others then
      v_errores := v_errores || jsonb_build_object('codigo', 'TRABAJO_FALLIDO', 'error', sqlerrm);
    end;
  end if;
  if to_regclass('public.evento_outbox') is not null then
    begin
      execute format($q$
        select coalesce(jsonb_agg(jsonb_build_object(
          'codigo', 'TRABAJO_FALLIDO', 'severidad', case when n >= 5 then 'ALTA' else 'MEDIA' end,
          'entidad', 'NOTIFICACION', 'entidad_id', null,
          'mensaje', n || ' correo(s) fallido(s) en las ultimas %s horas',
          'detalle', jsonb_build_object('fallidos', n, 'horas', %s), 'accion_url', '/admin/notificaciones?estado=FALLIDO'
        )), '[]'::jsonb)
        from (select count(*) as n from public.evento_outbox e where e.estado = 'FALLIDO' and coalesce(e.procesado_en, e.creado_en) >= now() - interval '%s hours') s
        where s.n > 0
      $q$, v_trabajos_horas, v_trabajos_horas, v_trabajos_horas) into v_tmp;
      v_alertas := v_alertas || v_tmp;
    exception when others then
      v_errores := v_errores || jsonb_build_object('codigo', 'TRABAJO_FALLIDO', 'error', sqlerrm);
    end;
  end if;

  return jsonb_build_object(
    'generado_en', now(),
    'total', jsonb_array_length(v_alertas),
    'alertas', v_alertas,
    'detectores_con_error', v_errores,
    'umbrales', jsonb_build_object(
      'ALERTA_CIERRE_DIAS', v_cierre_dias,
      'ALERTA_SOBRECARGA_PENDIENTES', v_sobrecarga_n,
      'ALERTA_SOBRECARGA_DIAS_HABILES', v_sobrecarga_dias,
      'ALERTA_POOL_DIAS_HABILES', v_pool_dias,
      'ALERTA_SUBSANACION_DIAS_HABILES', v_subsanacion_dias,
      'ALERTA_CUPO_AVISO_PCT', v_cupo_aviso_pct,
      'ALERTA_TRABAJOS_HORAS', v_trabajos_horas
    )
  );
end;
$$;
