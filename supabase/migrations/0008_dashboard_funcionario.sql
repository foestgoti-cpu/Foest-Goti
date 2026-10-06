-- =============================================================================
-- FOEST - Migracion 0008_dashboard_funcionario (docs/modules/dashboard_funcionario.md, DECISIONES section 15)
--
-- Supone aplicada 0001_base.sql (mv_postulacion_envio, mv_postulacion_beneficio,
-- metricas_refresh y fn_refrescar_metricas ya existen). Idempotente.
--
-- Contenido:
--   1. Recreacion condicional de las vistas materializadas con los LEFT JOIN a
--      revision / revision_beneficio SOLO si esas tablas (modulo evaluacion) ya
--      existen; si no, se conservan las vistas de 0001 (columnas identicas).
--   2. fn_metricas_funcionario(p_funcionario, p_convocatoria, p_desde, p_hasta):
--      RPC de solo lectura (service_role) que aplica el alcance por comite
--      (asignacion_funcionario) y devuelve todos los agregados en un jsonb.
--   3. fn_convocatorias_funcionario(p_funcionario): convocatorias del comite.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Vistas materializadas: recreacion condicional con dictamenes
-- -----------------------------------------------------------------------------
do $$
declare
  v_tiene_revision boolean := to_regclass('public.revision') is not null;
  v_tiene_rev_benef boolean := to_regclass('public.revision_beneficio') is not null;
  v_ya_con_dictamen boolean;
begin
  if not v_tiene_revision then
    raise notice '0008: public.revision no existe todavia; se conservan las vistas de 0001 (horas_dictamen = NULL).';
    return;
  end if;

  -- Si la vista ya depende de revision (p. ej. la migracion de evaluacion ya la recreo), no se toca.
  select exists (
    select 1
    from pg_depend d
    join pg_rewrite rw on rw.oid = d.objid
    join pg_class mv on mv.oid = rw.ev_class
    join pg_class src on src.oid = d.refobjid
    where mv.relname = 'mv_postulacion_envio' and src.relname = 'revision'
  ) into v_ya_con_dictamen;

  if v_ya_con_dictamen then
    raise notice '0008: mv_postulacion_envio ya incluye revision; no se recrea.';
    return;
  end if;

  begin
    execute 'drop materialized view if exists public.mv_postulacion_envio cascade';
    execute $mv$
      create materialized view public.mv_postulacion_envio as
      select
        pe.postulacion_id,
        pe.ciclo,
        p.convocatoria_id,
        p.tipo_solicitud::text                                       as tipo_solicitud,
        p.estado::text                                               as estado_actual,
        (pe.ciclo = p.ciclo)                                         as es_ciclo_actual,
        p.aprobacion_parcial,
        r.resultado::text                                            as resultado_ciclo,
        pe.enviado_en,
        (pe.enviado_en at time zone 'America/Bogota')::date          as dia_envio,
        r.decidida_en,
        (case when r.decidida_en is not null
              then extract(epoch from (r.decidida_en - pe.enviado_en)) / 3600.0
         end)::numeric(12,2)                                         as horas_dictamen
      from public.postulacion_envio pe
      join public.postulacion p on p.id = pe.postulacion_id
      left join public.revision r
             on r.postulacion_id = pe.postulacion_id
            and r.ciclo          = pe.ciclo
            and r.decidida_en    is not null
      where p.estado <> 'BORRADOR'
      with data
    $mv$;

    if v_tiene_rev_benef then
      execute 'drop materialized view if exists public.mv_postulacion_beneficio cascade';
      execute $mv$
        create materialized view public.mv_postulacion_beneficio as
        select
          pb.postulacion_id,
          pb.beneficio_codigo,
          p.convocatoria_id,
          p.tipo_solicitud::text                                     as tipo_solicitud,
          p.estado::text                                             as estado_actual,
          coalesce(rb.decision::text, 'SIN_DECISION')                as decision_beneficio,
          (pe.enviado_en at time zone 'America/Bogota')::date        as dia_envio
        from public.postulacion_beneficio pb
        join public.postulacion p        on p.id = pb.postulacion_id
        join public.postulacion_envio pe on pe.postulacion_id = p.id and pe.ciclo = p.ciclo
        left join public.revision r
               on r.postulacion_id = p.id and r.ciclo = p.ciclo and r.decidida_en is not null
        left join public.revision_beneficio rb
               on rb.revision_id = r.id and rb.beneficio_codigo = pb.beneficio_codigo
        where p.estado <> 'BORRADOR'
        with data
      $mv$;
    end if;
    raise notice '0008: vistas materializadas recreadas con dictamenes.';
  exception when others then
    -- Esquema de revision distinto al esperado: se conservan las vistas previas (si fueron
    -- borradas, el bloque siguiente las vuelve a crear con la definicion de 0001).
    raise notice '0008: no fue posible recrear las vistas con revision (%); se mantiene la definicion base.', sqlerrm;
  end;
end $$;

-- Garantia: si alguna vista no existe (p. ej. fallo en el bloque anterior), se crea con la definicion base de 0001.
do $$ begin
  if not exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_postulacion_envio') then
    create materialized view public.mv_postulacion_envio as
    select
      pe.postulacion_id, pe.ciclo, p.convocatoria_id,
      p.tipo_solicitud::text as tipo_solicitud, p.estado::text as estado_actual,
      (pe.ciclo = p.ciclo) as es_ciclo_actual, p.aprobacion_parcial,
      null::text as resultado_ciclo, pe.enviado_en,
      (pe.enviado_en at time zone 'America/Bogota')::date as dia_envio,
      null::timestamptz as decidida_en, null::numeric(12,2) as horas_dictamen
    from public.postulacion_envio pe
    join public.postulacion p on p.id = pe.postulacion_id
    where p.estado <> 'BORRADOR'
    with data;
  end if;
  if not exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_postulacion_beneficio') then
    create materialized view public.mv_postulacion_beneficio as
    select
      pb.postulacion_id, pb.beneficio_codigo, p.convocatoria_id,
      p.tipo_solicitud::text as tipo_solicitud, p.estado::text as estado_actual,
      'SIN_DECISION'::text as decision_beneficio,
      (pe.enviado_en at time zone 'America/Bogota')::date as dia_envio
    from public.postulacion_beneficio pb
    join public.postulacion p        on p.id = pb.postulacion_id
    join public.postulacion_envio pe on pe.postulacion_id = p.id and pe.ciclo = p.ciclo
    where p.estado <> 'BORRADOR'
    with data;
  end if;
end $$;

-- Indices (unicos sin predicado: requisito de REFRESH MATERIALIZED VIEW CONCURRENTLY)
create unique index if not exists ux_mv_postulacion_envio on public.mv_postulacion_envio (postulacion_id, ciclo);
create index if not exists ix_mv_envio_convocatoria on public.mv_postulacion_envio (convocatoria_id, es_ciclo_actual, estado_actual);
create index if not exists ix_mv_envio_dia on public.mv_postulacion_envio (convocatoria_id, dia_envio);
create index if not exists ix_mv_envio_decidida on public.mv_postulacion_envio (convocatoria_id, decidida_en) where decidida_en is not null;

create unique index if not exists ux_mv_postulacion_beneficio on public.mv_postulacion_beneficio (postulacion_id, beneficio_codigo);
create index if not exists ix_mv_beneficio_convocatoria on public.mv_postulacion_beneficio (convocatoria_id, beneficio_codigo);

-- Las vistas materializadas no soportan RLS: lectura solo via service_role / funciones SECURITY DEFINER.
revoke all on public.mv_postulacion_envio from public, anon, authenticated;
revoke all on public.mv_postulacion_beneficio from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Convocatorias del comite del funcionario (para el filtro del panel)
-- -----------------------------------------------------------------------------
create or replace function public.fn_convocatorias_funcionario(p_funcionario uuid)
returns table (id uuid, nombre text, anio integer, semestre smallint, estado text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nombre, c.anio, c.semestre, c.estado::text
  from public.asignacion_funcionario af
  join public.convocatoria c on c.id = af.convocatoria_id
  where af.funcionario_id = p_funcionario
    and af.retirado_en is null
  order by c.anio desc, c.semestre desc, c.nombre;
$$;
revoke all on function public.fn_convocatorias_funcionario(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Agregados del panel del funcionario (alcance por comite)
--
-- Devuelve jsonb:
-- {
--   alcance_invalido: boolean,          -- p_convocatoria no pertenece al comite -> la API responde 404
--   convocatorias: [uuid...],           -- convocatorias consideradas (vacio -> ceros)
--   resumen: [{ estado, total }],       -- COUNT(DISTINCT postulacion_id), solo ciclo vigente
--   por_beneficio: [{ clave, total }],  -- crudo; el k-anonimato lo aplica la API
--   por_tipo_solicitud: [{ clave, total }],
--   serie: [{ dia, total }],            -- envios por dia (YYYY-MM-DD), rango inclusivo
--   tiempos: { n, promedio_horas, p90_horas },
--   carga: { propia: {activas, dictaminadas_periodo}, comite: {activas, dictaminadas_periodo}, miembros_comite },
--   datos_actualizados_en: timestamptz | null   -- minimo de refrescada_en (estado OK) de las dos vistas
-- }
-- -----------------------------------------------------------------------------
create or replace function public.fn_metricas_funcionario(
  p_funcionario uuid,
  p_convocatoria uuid default null,
  p_desde date default null,
  p_hasta date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_convs uuid[];
  v_resumen jsonb := '[]'::jsonb;
  v_benef jsonb := '[]'::jsonb;
  v_tipo jsonb := '[]'::jsonb;
  v_serie jsonb := '[]'::jsonb;
  v_tiempos jsonb := jsonb_build_object('n', 0, 'promedio_horas', null, 'p90_horas', null);
  v_carga jsonb := jsonb_build_object(
    'propia', jsonb_build_object('activas', 0, 'dictaminadas_periodo', 0),
    'comite', jsonb_build_object('activas', 0, 'dictaminadas_periodo', 0),
    'miembros_comite', 0);
  v_sello timestamptz;
  v_miembros integer := 0;
  v_prop_act integer := 0;
  v_prop_dic integer := 0;
  v_com_act integer := 0;
  v_com_dic integer := 0;
  v_desde date := coalesce(p_desde, date '1900-01-01');
  v_hasta date := coalesce(p_hasta, date '2999-12-31');
begin
  -- Sello de actualizacion (minimo de las dos vistas con estado OK)
  select min(refrescada_en) into v_sello
  from public.metricas_refresh
  where vista in ('mv_postulacion_envio', 'mv_postulacion_beneficio') and estado = 'OK';

  -- Alcance: convocatorias donde el funcionario pertenece al comite (asignacion vigente)
  select coalesce(array_agg(af.convocatoria_id), '{}'::uuid[]) into v_convs
  from public.asignacion_funcionario af
  where af.funcionario_id = p_funcionario and af.retirado_en is null;

  if p_convocatoria is not null then
    if not (p_convocatoria = any(v_convs)) then
      return jsonb_build_object('alcance_invalido', true, 'convocatorias', '[]'::jsonb, 'datos_actualizados_en', v_sello);
    end if;
    v_convs := array[p_convocatoria];
  end if;

  if coalesce(array_length(v_convs, 1), 0) = 0 then
    return jsonb_build_object(
      'alcance_invalido', false, 'convocatorias', '[]'::jsonb,
      'resumen', v_resumen, 'por_beneficio', v_benef, 'por_tipo_solicitud', v_tipo, 'serie', v_serie,
      'tiempos', v_tiempos, 'carga', v_carga, 'datos_actualizados_en', v_sello);
  end if;

  -- Resumen por estado (una fila por postulacion, ciclo vigente)
  select coalesce(jsonb_agg(jsonb_build_object('estado', t.estado_actual, 'total', t.total) order by t.estado_actual), '[]'::jsonb)
    into v_resumen
  from (
    select estado_actual, count(distinct postulacion_id) as total
    from public.mv_postulacion_envio
    where es_ciclo_actual
      and convocatoria_id = any(v_convs)
      and dia_envio between v_desde and v_hasta
    group by estado_actual
  ) t;

  -- Por beneficio (nunca se suman estas filas para totales de postulaciones)
  select coalesce(jsonb_agg(jsonb_build_object('clave', t.beneficio_codigo, 'total', t.total) order by t.total desc, t.beneficio_codigo), '[]'::jsonb)
    into v_benef
  from (
    select beneficio_codigo, count(distinct postulacion_id) as total
    from public.mv_postulacion_beneficio
    where convocatoria_id = any(v_convs)
      and dia_envio between v_desde and v_hasta
    group by beneficio_codigo
  ) t;

  -- Por tipo de solicitud
  select coalesce(jsonb_agg(jsonb_build_object('clave', t.tipo_solicitud, 'total', t.total) order by t.total desc, t.tipo_solicitud), '[]'::jsonb)
    into v_tipo
  from (
    select tipo_solicitud, count(distinct postulacion_id) as total
    from public.mv_postulacion_envio
    where es_ciclo_actual
      and convocatoria_id = any(v_convs)
      and dia_envio between v_desde and v_hasta
    group by tipo_solicitud
  ) t;

  -- Serie temporal: envios por dia (incluye reenvios; cada postulacion cuenta una vez por dia)
  select coalesce(jsonb_agg(jsonb_build_object('dia', to_char(t.dia_envio, 'YYYY-MM-DD'), 'total', t.total) order by t.dia_envio), '[]'::jsonb)
    into v_serie
  from (
    select dia_envio, count(distinct postulacion_id) as total
    from public.mv_postulacion_envio
    where convocatoria_id = any(v_convs)
      and dia_envio between v_desde and v_hasta
    group by dia_envio
  ) t;

  -- Tiempos de revision: promedio y p90 EN CONSULTA sobre filas (postulacion, ciclo) ya filtradas
  select jsonb_build_object(
           'n', count(*),
           'promedio_horas', round(avg(horas_dictamen)::numeric, 2),
           'p90_horas', round((percentile_cont(0.90) within group (order by horas_dictamen))::numeric, 2))
    into v_tiempos
  from public.mv_postulacion_envio
  where decidida_en is not null
    and horas_dictamen is not null
    and convocatoria_id = any(v_convs)
    and dia_envio between v_desde and v_hasta;

  -- Carga: miembros del comite (asignaciones vigentes de las convocatorias consideradas)
  select count(distinct af.funcionario_id) into v_miembros
  from public.asignacion_funcionario af
  where af.convocatoria_id = any(v_convs) and af.retirado_en is null;

  -- postulacion_asignacion pertenece al modulo asignaciones; si aun no existe, la carga queda en cero.
  if to_regclass('public.postulacion_asignacion') is not null then
    begin
      execute $q$
        select
          count(*) filter (where pa.estado = 'ACTIVA' and pa.funcionario_id = $1),
          count(*) filter (where pa.estado = 'LIBERADA' and pa.motivo_liberacion = 'DICTAMEN_EMITIDO'
                             and pa.funcionario_id = $1
                             and (pa.liberada_en at time zone 'America/Bogota')::date between $3 and $4),
          count(*) filter (where pa.estado = 'ACTIVA'),
          count(*) filter (where pa.estado = 'LIBERADA' and pa.motivo_liberacion = 'DICTAMEN_EMITIDO'
                             and (pa.liberada_en at time zone 'America/Bogota')::date between $3 and $4)
        from public.postulacion_asignacion pa
        join public.postulacion p on p.id = pa.postulacion_id
        where p.convocatoria_id = any($2)
      $q$
      into v_prop_act, v_prop_dic, v_com_act, v_com_dic
      using p_funcionario, v_convs, v_desde, v_hasta;
    exception when others then
      -- Esquema distinto al esperado: no se rompe el panel; la carga queda en cero.
      v_prop_act := 0; v_prop_dic := 0; v_com_act := 0; v_com_dic := 0;
    end;
  end if;

  v_carga := jsonb_build_object(
    'propia', jsonb_build_object('activas', v_prop_act, 'dictaminadas_periodo', v_prop_dic),
    'comite', jsonb_build_object('activas', v_com_act, 'dictaminadas_periodo', v_com_dic),
    'miembros_comite', v_miembros);

  return jsonb_build_object(
    'alcance_invalido', false,
    'convocatorias', to_jsonb(v_convs),
    'resumen', v_resumen,
    'por_beneficio', v_benef,
    'por_tipo_solicitud', v_tipo,
    'serie', v_serie,
    'tiempos', v_tiempos,
    'carga', v_carga,
    'datos_actualizados_en', v_sello);
end;
$$;
revoke all on function public.fn_metricas_funcionario(uuid, uuid, date, date) from public, anon, authenticated;

comment on function public.fn_metricas_funcionario(uuid, uuid, date, date) is
  'Dashboard del funcionario: agregados con alcance por comite (asignacion_funcionario). Solo service_role; la API aplica k-anonimato.';

-- Fin de 0008_dashboard_funcionario.sql
