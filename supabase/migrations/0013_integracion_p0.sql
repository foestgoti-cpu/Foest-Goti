-- 0013_integracion_p0: integracion de los modulos P0 (notificaciones y catalogos_configuracion)
-- con postulaciones. Idempotente. Asume 0010 aplicada (configuracion_sistema con columnas de catalogo).
insert into public.configuracion_sistema (clave, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar) values
  ('BLOQUEAR_ENVIO_SIN_TEXTO_OFICIAL', 'false', 'BOOL', 'JURIDICO', 'Si es true, /enviar responde 422 DECLARACIONES_SIN_TEXTO_OFICIAL mientras existan declaraciones vigentes sin texto oficial confirmado (GE-F041)', 'false', null, null, true)
on conflict (clave) do nothing;
-- Fin de 0013_integracion_p0.sql
