-- =============================================================================
-- FOEST - Migracion 0009_admin_dashboard
-- Funciones RPC de agregacion gerencial y motor de alertas (docs/modules/admin_dashboard.md)
-- + utilidades de dias habiles (catalogos_configuracion.md, seccion "Festivos y dias habiles").
--
-- No crea tablas: lee usuario, funcionario, convocatoria, convocatoria_beneficio,
-- asignacion_funcionario, postulacion, postulacion_beneficio,
-- historial_estado_postulacion, configuracion_sistema y festivo (todas de 0001_base.sql).
-- Las tablas de modulos aun no existentes (otorgamiento, desembolso, reporte_generado,
-- evento_outbox, postulacion_asignacion) se consultan SOLO si existen (to_regclass).
--
-- Idempotente: CREATE OR REPLACE en todo. Asume 0001_base.sql aplicada.
-- Seguridad: todas las funciones son SECURITY DEFINER y exigen ADMINISTRADOR
-- (JWT app_metadata.rol) o service_role; las ejecuta la API tras requirePermission.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas y utilidades
-- -----------------------------------------------------------------------------
create or replace function public.fn_exigir_admin()
returns void
language plpgsql
stable
as $$
declare
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
begin
  if public.es_administrador() then
    return;
  end if;
  -- Sin claims (conexion directa) o service_role (API con supabaseAdmin): permitido.
  if v_claims = '' then
    return;
  end if;
  if (v_claims::jsonb ->> 'role') = 'service_role' then
    return;
  end if;
  raise exception 'SIN_PERMISO: la funcion es exclusiva del ADMINISTRADOR' using errcode = '42501';
end;
$$;

-- Lee un entero de configuracion_sistema con valor por defecto.
create or replace function public.fn_config_int(p_clave text, p_defecto integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(valor), '')::integer from public.configuracion_sistema where clave = p_clave),
    p_defecto
  );
$$;

-- Fecha local de hoy en America/Bogota
create or replace function public.fn_hoy_bogota()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- Dia habil: lunes a viernes que no este en festivo
create or replace function public.fn_es_dia_habil(p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select extract(isodow from p_fecha) < 6
     and not exists (select 1 from public.festivo f where f.fecha = p_fecha);
$$;

-- Dias habiles en el intervalo (p_desde, p_hasta]  (0 si p_hasta <= p_desde)
create or replace function public.fn_dias_habiles_entre(p_desde date, p_hasta date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select count(*)::integer
    from generate_series(p_desde + 1, p_hasta, interval '1 day') d
    where public.fn_es_dia_habil(d::date)
  ), 0);
$$;

-- Suma n dias habiles a una fecha (n >= 0). Si la fecha de partida no es habil, el conteo
-- empieza el siguiente dia habil.
create or replace function public.fn_sumar_dias_habiles(p_desde date, p_n integer)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fecha date := p_desde;
  v_restan integer := greatest(p_n, 0);
begin
  if v_restan = 0 then
    while not public.fn_es_dia_habil(v_fecha) loop
      v_fecha := v_fecha + 1;
    end loop;
    return v_fecha;
  end if;
  while v_restan > 0 loop
    v_fecha := v_fecha + 1;
    if public.fn_es_dia_habil(v_fecha) then
      v_restan := v_restan - 1;
    end if;
  end loop;
  return v_fecha;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Resumen global
-- -----------------------------------------------------------------------------
create or replace function public.fn_admin_resumen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v             jsonb;
  v_montos      jsonb;
  v_desembolsado numeric;
begin
  perform public.fn_exigir_admin();

  select jsonb_build_object(
    'generado_en', now(),
    'usuarios', (
      select coalesce(jsonb_agg(jsonb_build_object('rol', rol, 'activos', activos, 'inactivos', inactivos) order by rol), '[]'::jsonb)
      from (
        select u.rol::text as rol,
               count(*) filter (where u.activo)     as activos,
               count(*) filter (where not u.activo) as inactivos
        from public.usuario u
        group by u.rol
      ) s
    ),
    'convocatorias', (
      select coalesce(jsonb_agg(jsonb_build_object('estado', estado, 'total', total) order by estado), '[]'::jsonb)
      from (select c.estado::text as estado, count(*) as total from public.convocatoria c group by c.estado) s
    ),
    'postulaciones', (
      select coalesce(jsonb_agg(jsonb_build_object('estado', estado, 'total', total) order by estado), '[]'::jsonb)
      from (select p.estado::text as estado, count(*) as total from public.postulacion p group by p.estado) s
    ),
    'festivos_anio_siguiente_cargados', exists (
      select 1 from public.festivo f where f.anio = extract(year from public.fn_hoy_bogota())::integer + 1
    )
  ) into v;

  if to_regclass('public.otorgamiento') is not null then
    execute $q$
      select jsonb_build_object(
        'estado', 'disponible',
        'otorgamientos_vigentes', count(*) filter (where o.estado in ('ACTIVO','SUSPENDIDO','CUMPLIDO')),
        'monto_aprobado_total', coalesce(sum(o.monto_aprobado) filter (where o.estado <> 'REVOCADO'), 0)
      )
      from public.otorgamiento o
    $q$ into v_montos;
    if to_regclass('public.desembolso') is not null then
      execute $q$ select coalesce(sum(d.monto), 0) from public.desembolso d where d.estado = 'PAGADO' $q$ into v_desembolsado;
      v_montos := v_montos || jsonb_build_object('monto_desembolsado', v_desembolsado);
    end if;
  else
    v_montos := jsonb_build_object('estado', 'pendiente_modulo');
  end if;

  return v || jsonb_build_object('montos', v_montos);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Motor de alertas
--    Devuelve { generado_en, alertas: [...], detectores_con_error: [...] }.
--    Un detector que falla no tumba el resto (bloques EXCEPTION por detector).
--    Evaluador de una postulacion EN_EVALUACION = actor_id del ultimo registro de
--    historial_estado_postulacion con estado_nuevo = 'EN_EVALUACION' (la tabla
--    postulacion_asignacion del modulo asignaciones no existe aun en este lote).
-- -----------------------------------------------------------------------------
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
        from (select count(*) as n from public.evento_outbox e where e.estado = 'FALLIDO' and e.actualizado_en >= now() - interval '%s hours') s
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

-- Claves de umbral que admin_dashboard.md exige y 0001 no sembro (no sobrescribe valores editados)
insert into public.configuracion_sistema (clave, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar) values
  ('ALERTA_POOL_DIAS_HABILES', '3', 'INT', 'ALERTAS', 'Dias habiles que una postulacion PENDIENTE puede esperar sin ser tomada', '3', '1', '30', false),
  ('ALERTA_SUBSANACION_DIAS_HABILES', '2', 'INT', 'ALERTAS', 'Dias habiles antes del vencimiento de una subsanacion para alertar', '2', '1', '15', false),
  ('ALERTA_CUPO_AVISO_PCT', '90', 'INT', 'ALERTAS', 'Porcentaje de ocupacion de cupos/presupuesto desde el que se avisa', '90', '50', '100', false),
  ('ALERTA_TRABAJOS_HORAS', '24', 'INT', 'ALERTAS', 'Ventana en horas para alertar reportes o correos fallidos', '24', '1', '168', false)
on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Consolidado de convocatorias (avance, comite, cupos y ocupacion)
-- -----------------------------------------------------------------------------
create or replace function public.fn_admin_convocatorias()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v          jsonb;
  v_ocupacion jsonb := null;
begin
  perform public.fn_exigir_admin();

  if to_regclass('public.otorgamiento') is not null then
    execute $q$
      select coalesce(jsonb_object_agg(convocatoria_id, jsonb_build_object('otorgamientos', n, 'monto_aprobado', monto)), '{}'::jsonb)
      from (
        select p.convocatoria_id, count(o.id) as n, coalesce(sum(o.monto_aprobado), 0) as monto
        from public.otorgamiento o
        join public.postulacion p on p.id = o.postulacion_id
        where o.estado <> 'REVOCADO'
        group by p.convocatoria_id
      ) s
    $q$ into v_ocupacion;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'anio', c.anio,
    'semestre', c.semestre,
    'periodo', c.anio || '-' || c.semestre,
    'nombre', c.nombre,
    'estado', c.estado,
    'fecha_apertura', c.fecha_apertura,
    'fecha_cierre_exclusiva', c.fecha_cierre_exclusiva,
    'comite', (
      select coalesce(jsonb_agg(jsonb_build_object('funcionario_id', af.funcionario_id, 'nombre', coalesce(f.nombres || ' ' || f.apellidos, u.email), 'activo', u.activo) order by f.apellidos), '[]'::jsonb)
      from public.asignacion_funcionario af
      join public.usuario u on u.id = af.funcionario_id
      left join public.funcionario f on f.usuario_id = af.funcionario_id
      where af.convocatoria_id = c.id and af.retirado_en is null
    ),
    'postulaciones_por_estado', (
      select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb)
      from (select p.estado::text as estado, count(*) as n from public.postulacion p where p.convocatoria_id = c.id group by p.estado) s
    ),
    'total_enviadas', (select count(*) from public.postulacion p where p.convocatoria_id = c.id and p.estado <> 'BORRADOR'),
    'total_resueltas', (select count(*) from public.postulacion p where p.convocatoria_id = c.id and p.estado in ('APROBADA','RECHAZADA','DESISTIDA')),
    'cupos_estimados', (select coalesce(sum(cb.cupos_estimados), 0) from public.convocatoria_beneficio cb where cb.convocatoria_id = c.id),
    'presupuesto_asignado', (select coalesce(sum(cb.presupuesto_asignado), 0) from public.convocatoria_beneficio cb where cb.convocatoria_id = c.id),
    'ocupacion', case when v_ocupacion is null then jsonb_build_object('estado', 'pendiente_modulo')
                      else coalesce(v_ocupacion -> c.id::text, jsonb_build_object('otorgamientos', 0, 'monto_aprobado', 0)) || jsonb_build_object('estado', 'disponible') end
  ) order by c.anio desc, c.semestre desc), '[]'::jsonb)
  into v
  from public.convocatoria c;

  return jsonb_build_object('generado_en', now(), 'convocatorias', v);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Metricas por periodo (crudas; el k-anonimato lo aplica la API con KANON_UMBRAL)
-- -----------------------------------------------------------------------------
create or replace function public.fn_admin_metricas_periodo(p_anio integer, p_semestre integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v         jsonb;
  v_montos  jsonb;
begin
  perform public.fn_exigir_admin();

  select c.id into v_conv_id from public.convocatoria c where c.anio = p_anio and c.semestre = p_semestre;
  if v_conv_id is null then
    return jsonb_build_object('periodo', p_anio || '-' || p_semestre, 'existe', false);
  end if;

  select jsonb_build_object(
    'periodo', p_anio || '-' || p_semestre,
    'existe', true,
    'convocatoria', (select jsonb_build_object('id', c.id, 'nombre', c.nombre, 'estado', c.estado) from public.convocatoria c where c.id = v_conv_id),
    'postulaciones_por_estado', (
      select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb)
      from (select p.estado::text as estado, count(*) as n from public.postulacion p where p.convocatoria_id = v_conv_id group by p.estado) s
    ),
    'postulaciones_por_tipo', (
      select coalesce(jsonb_object_agg(tipo, n), '{}'::jsonb)
      from (select p.tipo_solicitud::text as tipo, count(*) as n from public.postulacion p where p.convocatoria_id = v_conv_id and p.estado <> 'BORRADOR' group by p.tipo_solicitud) s
    ),
    'postulaciones_por_beneficio', (
      select coalesce(jsonb_object_agg(cod, n), '{}'::jsonb)
      from (select pb.beneficio_codigo as cod, count(*) as n
            from public.postulacion_beneficio pb join public.postulacion p on p.id = pb.postulacion_id
            where p.convocatoria_id = v_conv_id and p.estado <> 'BORRADOR' group by pb.beneficio_codigo) s
    ),
    'total_enviadas', (select count(*) from public.postulacion p where p.convocatoria_id = v_conv_id and p.estado <> 'BORRADOR'),
    'aprobaciones_totales', (select count(*) from public.postulacion p where p.convocatoria_id = v_conv_id and p.estado = 'APROBADA' and not p.aprobacion_parcial),
    'aprobaciones_parciales', (select count(*) from public.postulacion p where p.convocatoria_id = v_conv_id and p.estado = 'APROBADA' and p.aprobacion_parcial)
  ) into v;

  if to_regclass('public.otorgamiento') is not null then
    execute $q$
      select jsonb_build_object(
        'estado', 'disponible',
        'monto_aprobado_total', coalesce(sum(o.monto_aprobado), 0),
        'monto_aprobado_por_beneficio', (
          select coalesce(jsonb_object_agg(cod, monto), '{}'::jsonb)
          from (select o2.beneficio_codigo as cod, sum(o2.monto_aprobado) as monto
                from public.otorgamiento o2 join public.postulacion p2 on p2.id = o2.postulacion_id
                where p2.convocatoria_id = $1 and o2.estado <> 'REVOCADO' group by o2.beneficio_codigo) s
        )
      )
      from public.otorgamiento o
      join public.postulacion p on p.id = o.postulacion_id
      where p.convocatoria_id = $1 and o.estado <> 'REVOCADO'
    $q$ into v_montos using v_conv_id;
    if to_regclass('public.desembolso') is not null then
      declare v_des numeric;
      begin
        execute $q$
          select coalesce(sum(d.monto), 0)
          from public.desembolso d
          join public.otorgamiento o on o.id = d.otorgamiento_id
          join public.postulacion p on p.id = o.postulacion_id
          where p.convocatoria_id = $1 and d.estado = 'PAGADO'
        $q$ into v_des using v_conv_id;
        v_montos := v_montos || jsonb_build_object('monto_desembolsado', v_des);
      end;
    end if;
  else
    v_montos := jsonb_build_object('estado', 'pendiente_modulo');
  end if;

  return v || jsonb_build_object('montos', v_montos);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Carga nominal por evaluador (exclusiva del administrador)
--    en_evaluacion: expedientes EN_EVALUACION cuyo ultimo TOMA (estado_nuevo = EN_EVALUACION) es del funcionario.
--    dictaminadas_periodo: dictamenes (APROBADA / RECHAZADA / EN_CORRECCION) emitidos por el funcionario
--    sobre postulaciones de la convocatoria del periodo indicado (o de todas si p_anio es null).
-- -----------------------------------------------------------------------------
create or replace function public.fn_admin_carga_evaluadores(p_anio integer default null, p_semestre integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public.fn_exigir_admin();

  with evaluador as (
    select distinct on (h.postulacion_id) h.postulacion_id, h.actor_id as funcionario_id, h.cambiado_en
    from public.historial_estado_postulacion h
    join public.postulacion p on p.id = h.postulacion_id and p.estado = 'EN_EVALUACION'
    where h.estado_nuevo = 'EN_EVALUACION' and h.actor_id is not null
    order by h.postulacion_id, h.cambiado_en desc
  ),
  dictamenes as (
    select h.actor_id as funcionario_id, count(*) as n
    from public.historial_estado_postulacion h
    join public.postulacion p on p.id = h.postulacion_id
    join public.convocatoria c on c.id = p.convocatoria_id
    where h.estado_nuevo in ('APROBADA','RECHAZADA','EN_CORRECCION')
      and h.actor_tipo = 'FUNCIONARIO'
      and h.actor_id is not null
      and (p_anio is null or (c.anio = p_anio and c.semestre = p_semestre))
    group by h.actor_id
  ),
  pool as (
    select af.funcionario_id, count(distinct p.id) as n
    from public.asignacion_funcionario af
    join public.postulacion p on p.convocatoria_id = af.convocatoria_id and p.estado = 'PENDIENTE'
    where af.retirado_en is null
    group by af.funcionario_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'funcionario_id', u.id,
    'nombre', coalesce(f.nombres || ' ' || f.apellidos, u.email),
    'activo', u.activo,
    'en_evaluacion', coalesce((select count(*) from evaluador e where e.funcionario_id = u.id), 0),
    'dictaminadas_periodo', coalesce((select d.n from dictamenes d where d.funcionario_id = u.id), 0),
    'pendientes_pool_del_comite', coalesce((select pl.n from pool pl where pl.funcionario_id = u.id), 0),
    'comites_activos', (select count(*) from public.asignacion_funcionario af where af.funcionario_id = u.id and af.retirado_en is null)
  ) order by f.apellidos, f.nombres, u.email), '[]'::jsonb)
  into v
  from public.usuario u
  left join public.funcionario f on f.usuario_id = u.id
  where u.rol = 'FUNCIONARIO';

  return jsonb_build_object('generado_en', now(), 'periodo', case when p_anio is null then null else p_anio || '-' || p_semestre end, 'evaluadores', v);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Privilegios: solo usuarios autenticados (la guarda interna exige ADMINISTRADOR) y service_role
-- -----------------------------------------------------------------------------
revoke all on function public.fn_admin_resumen() from public, anon;
revoke all on function public.fn_admin_alertas() from public, anon;
revoke all on function public.fn_admin_convocatorias() from public, anon;
revoke all on function public.fn_admin_metricas_periodo(integer, integer) from public, anon;
revoke all on function public.fn_admin_carga_evaluadores(integer, integer) from public, anon;
grant execute on function public.fn_admin_resumen() to authenticated, service_role;
grant execute on function public.fn_admin_alertas() to authenticated, service_role;
grant execute on function public.fn_admin_convocatorias() to authenticated, service_role;
grant execute on function public.fn_admin_metricas_periodo(integer, integer) to authenticated, service_role;
grant execute on function public.fn_admin_carga_evaluadores(integer, integer) to authenticated, service_role;
grant execute on function public.fn_es_dia_habil(date) to authenticated, service_role;
grant execute on function public.fn_dias_habiles_entre(date, date) to authenticated, service_role;
grant execute on function public.fn_sumar_dias_habiles(date, integer) to authenticated, service_role;

-- Fin de 0009_admin_dashboard.sql
