-- =====================================================================
-- Building Buddy · 0004 Registro de edificio en un paso y resumen de Mis edificios
-- RN-25 a RN-29 · Etapa 2a
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Registrar edificio con sus departamentos (asistente, RN-26 y RN-27)
--    Envuelve crear_edificio + importar_departamentos en una sola transacción:
--    si una fila falla, tampoco se crea el edificio y el asistente puede reintentar.
--    Es security invoker: las funciones internas validan al usuario con auth.uid().
-- ---------------------------------------------------------------------
create or replace function registrar_edificio(
  p_nombre text, p_direccion text, p_codigo text, p_total_departamentos int, p_area_total numeric,
  p_tipo_calculo tipo_calculo, p_mes_inicio date, p_mi_nombre text,
  p_filas jsonb default '[]'::jsonb,
  p_organizacion uuid default null, p_organizacion_nombre text default null) returns uuid
language plpgsql set search_path = public as $$
declare v_ed uuid;
begin
  if coalesce(trim(p_mi_nombre), '') = '' then raise exception 'Escribe tu nombre'; end if;
  v_ed := crear_edificio(p_nombre, p_direccion, p_codigo, p_total_departamentos, p_area_total,
                         p_tipo_calculo, p_mes_inicio, p_mi_nombre, p_organizacion, p_organizacion_nombre);
  if jsonb_typeof(p_filas) = 'array' and jsonb_array_length(p_filas) > 0 then
    perform importar_departamentos(v_ed, p_filas);
  end if;
  return v_ed;
end $$;

-- ---------------------------------------------------------------------
-- 2. ¿Está libre el código? (paso 1 del asistente). Los códigos no son secretos:
--    los vecinos los usan para ingresar.
-- ---------------------------------------------------------------------
create or replace function codigo_disponible(p_codigo text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(trim(p_codigo)) ~ '^[a-z0-9-]{3,30}$'
     and not exists (select 1 from edificios where codigo = lower(trim(p_codigo)))
$$;
revoke execute on function codigo_disponible(text) from public, anon;
grant execute on function codigo_disponible(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Mis edificios (SPEC sección 7): nivel, morosidad, pagos por validar y
--    días sin movimiento de cada edificio de la cuenta.
--    Las cifras de gestión solo se calculan para el equipo de administración.
-- ---------------------------------------------------------------------
create or replace function resumen_mis_edificios()
returns table (
  edificio_id uuid, nombre text, codigo text, organizacion_id uuid,
  nivel nivel_admin, departamento_id uuid, departamento_numero text,
  departamentos int, departamentos_morosos int, pagos_por_validar int,
  dias_sin_movimiento int, dias_para_eliminar int)
language sql stable security definer set search_path = public as $$
  select m.edificio_id, e.nombre, e.codigo, e.organizacion_id, m.nivel, m.departamento_id, d.numero,
         case when m.nivel is not null then
           (select count(*)::int from departamentos x where x.edificio_id = e.id) end,
         case when m.nivel is not null then
           (select count(distinct c.departamento_id)::int from compromisos c
             where c.edificio_id = e.id and c.estado = 'pendiente' and c.vence_en < hoy_lima()) end,
         case when m.nivel is not null then
           (select count(*)::int from pagos p
             where p.edificio_id = e.id and p.estado = 'en_revision'
               and puede_validar_pago(e.id, p.departamento_id)) end,
         case when m.nivel is not null then dias_sin_movimiento(e.id) end,
         case when m.nivel is not null and not e.suscripcion_pagada and dias_sin_movimiento(e.id) >= 60
              then greatest(0, 90 - dias_sin_movimiento(e.id)) end
  from mis_edificios() m
  join edificios e on e.id = m.edificio_id
  left join departamentos d on d.id = m.departamento_id
  order by e.nombre
$$;
revoke execute on function resumen_mis_edificios() from public, anon;
grant execute on function resumen_mis_edificios() to authenticated;
