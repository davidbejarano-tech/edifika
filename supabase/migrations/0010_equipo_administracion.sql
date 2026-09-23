-- =====================================================================
-- Building Buddy · 0010 Equipo de administración (Etapa 2c, RN-19 a RN-23)
-- Consultas para la pantalla "Equipo de administración". Las acciones ya existen
-- en 0001: agregar_coadministrador, quitar_coadministrador, designar_validador,
-- transferir_titularidad y transferencia_forzada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Equipo vigente: titular, coadministradores y saliente en transición (no vencido)
-- ---------------------------------------------------------------------
create or replace function equipo_admin(p_edificio uuid)
returns table (perfil_id uuid, nombre text, nivel nivel_admin, vigente_hasta date,
               departamento_numero text, desde date, soy_yo boolean)
language sql stable security definer set search_path = public as $$
  select m.perfil_id, p.nombre, m.nivel, m.vigente_hasta,
         (select d.numero from membresias h join departamentos d on d.id = h.departamento_id
          where h.edificio_id = m.edificio_id and h.perfil_id = m.perfil_id
            and h.rol = 'habitante' and h.estado = 'activo' limit 1),
         m.created_at::date, m.perfil_id = auth.uid()
  from membresias m join perfiles p on p.id = m.perfil_id
  where m.edificio_id = p_edificio and m.rol = 'admin' and m.estado = 'activo'
    and (m.nivel <> 'lectura' or m.vigente_hasta >= hoy_lima())
    and es_lector_admin(p_edificio)
  order by case m.nivel when 'titular' then 1 when 'operador' then 2 else 3 end, p.nombre
$$;

-- ---------------------------------------------------------------------
-- 2. Vecinos con cuenta activa: candidatos a coadministrador, validador o nuevo titular.
--    Solo el titular los consulta.
-- ---------------------------------------------------------------------
create or replace function vecinos_con_cuenta(p_edificio uuid)
returns table (perfil_id uuid, nombre text, departamento_id uuid, departamento_numero text,
               nivel nivel_admin, es_validador boolean, vive_con_titular boolean)
language sql stable security definer set search_path = public as $$
  select h.perfil_id, p.nombre, h.departamento_id, d.numero,
         (select a.nivel from membresias a where a.edificio_id = h.edificio_id and a.perfil_id = h.perfil_id
            and a.rol = 'admin' and a.estado = 'activo' and (a.nivel <> 'lectura' or a.vigente_hasta >= hoy_lima()) limit 1),
         e.validador_designado_id = h.perfil_id,
         h.departamento_id = depto_del_titular(h.edificio_id)
  from membresias h
  join perfiles p on p.id = h.perfil_id
  join departamentos d on d.id = h.departamento_id
  join edificios e on e.id = h.edificio_id
  where h.edificio_id = p_edificio and h.rol = 'habitante' and h.estado = 'activo'
    and es_titular(p_edificio)
  order by d.piso, d.numero
$$;

-- ---------------------------------------------------------------------
-- 3. Validación de los pagos del titular (RN-22): quién valida y si hay que avisar
-- ---------------------------------------------------------------------
create or replace function estado_validacion(p_edificio uuid)
returns table (titular_vive_en_edificio boolean, titular_departamento text, coadministradores int,
               validador_perfil uuid, validador_nombre text, validador_departamento text,
               quien_valida text, alerta boolean)
language sql stable security definer set search_path = public as $$
  with b as (
    select e.id, e.validador_designado_id as val,
           depto_del_titular(e.id) as dep_tit,
           (select count(*)::int from membresias m where m.edificio_id = e.id and m.rol = 'admin'
              and m.nivel = 'operador' and m.estado = 'activo') as ops
    from edificios e where e.id = p_edificio and es_lector_admin(p_edificio)
  )
  select b.dep_tit is not null,
         (select numero from departamentos where id = b.dep_tit),
         b.ops,
         b.val,
         (select nombre from perfiles where id = b.val),
         (select d.numero from membresias h join departamentos d on d.id = h.departamento_id
          where h.edificio_id = b.id and h.perfil_id = b.val and h.rol = 'habitante' and h.estado = 'activo' limit 1),
         case when b.dep_tit is null then 'no_aplica'
              when b.ops > 0 then 'coadministrador'
              when b.val is not null then 'validador'
              else 'nadie' end,
         b.dep_tit is not null and b.ops = 0 and b.val is null
  from b
$$;

revoke execute on function equipo_admin(uuid) from public, anon;
revoke execute on function vecinos_con_cuenta(uuid) from public, anon;
revoke execute on function estado_validacion(uuid) from public, anon;
grant execute on function equipo_admin(uuid) to authenticated;
grant execute on function vecinos_con_cuenta(uuid) to authenticated;
grant execute on function estado_validacion(uuid) to authenticated;
