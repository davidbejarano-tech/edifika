-- =====================================================================
-- EDIFIKA · 0018 Transparencia y comunicación (Etapa 4b)
--   1. Reportes: ingresos, gastos y acumulado de los últimos meses (RN-15)
--   2. Cobranza agregada del edificio, visible para todos los vecinos
--   3. Chat del edificio: autor, departamento y rol guardados en el mensaje,
--      quién puede escribir, eliminar mensajes y Supabase Realtime
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ingresos y gastos por mes (los mismos totales del estado de cuenta)
-- ---------------------------------------------------------------------
create or replace function reporte_meses(p_edificio uuid, p_meses int default 6)
returns table (periodo_id uuid, mes date, ingresos numeric, gastos numeric, acumulado numeric, oficial boolean)
language sql stable security definer set search_path = public as $$
  select pe.id, pe.mes, r.ingresos, r.gastos, r.acumulado, r.oficial
  from (select id, mes from periodos
        where edificio_id = p_edificio and es_miembro(p_edificio)
        order by mes desc limit greatest(1, least(coalesce(p_meses, 6), 24))) pe
  cross join lateral resumen_periodo(pe.id) r
  order by pe.mes
$$;
revoke execute on function reporte_meses(uuid, int) from public, anon;
grant execute on function reporte_meses(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Totales de cobranza del edificio (sin detalle por departamento, RN-15)
-- ---------------------------------------------------------------------
create or replace function cobranza_edificio(p_edificio uuid)
returns table (departamentos int, sin_vencido int, por_cobrar numeric, vencido numeric)
language sql stable security definer set search_path = public as $$
  with d as (
    select dp.id,
           coalesce(sum(c.monto) filter (where c.estado in ('pendiente','en_revision')), 0) as pend,
           coalesce(sum(c.monto) filter (where c.estado = 'pendiente' and c.vence_en < hoy_lima()), 0) as venc
    from departamentos dp
    left join compromisos c on c.departamento_id = dp.id and c.tipo <> 'adelanto'
    where dp.edificio_id = p_edificio and es_miembro(p_edificio)
    group by dp.id)
  select count(*)::int, (count(*) filter (where venc = 0))::int, coalesce(sum(pend), 0), coalesce(sum(venc), 0)
  from d
  where es_miembro(p_edificio)
$$;
revoke execute on function cobranza_edificio(uuid) from public, anon;
grant execute on function cobranza_edificio(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Chat del edificio
--    El autor escribe como vecino (con su departamento) o como administración.
--    Nombre, departamento y rol se guardan al enviar: el mensaje llega completo
--    por Realtime y no depende de poder leer perfiles de otros.
-- ---------------------------------------------------------------------
alter table mensajes
  add column como_admin    boolean not null default false,
  add column autor_nombre  text,
  add column autor_depto   text,
  add column autor_rol     text,
  add column eliminado_en  timestamptz,
  add column eliminado_por uuid references perfiles on delete set null;

create index mensajes_edificio_fecha on mensajes (edificio_id, created_at desc);

create or replace function tg_mensaje_autor() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_depto uuid;
begin
  new.autor_id := auth.uid();
  new.created_at := now();
  new.eliminado_en := null;
  new.eliminado_por := null;
  new.texto := btrim(new.texto);
  if new.texto = '' then raise exception 'Escribe un mensaje'; end if;

  select nombre into new.autor_nombre from perfiles where id = new.autor_id;
  v_depto := mi_departamento_en(new.edificio_id);

  if new.como_admin then
    if not es_admin(new.edificio_id) then raise exception 'Solo la administración escribe como administración'; end if;
    new.autor_rol := case nivel_admin_de(new.edificio_id) when 'titular' then 'Administrador titular' else 'Coadministrador' end;
    new.autor_depto := null;
  else
    if v_depto is null then
      -- Sin departamento en el edificio (administrador externo): siempre escribe como administración
      if not es_admin(new.edificio_id) then raise exception 'Solo los vecinos y la administración escriben en el chat'; end if;
      new.como_admin := true;
      new.autor_rol := case nivel_admin_de(new.edificio_id) when 'titular' then 'Administrador titular' else 'Coadministrador' end;
      new.autor_depto := null;
    else
      new.autor_rol := null;
      new.autor_depto := (select numero from departamentos where id = v_depto);
    end if;
  end if;
  return new;
end $$;

create trigger mensaje_autor before insert on mensajes for each row execute function tg_mensaje_autor();

-- Escriben los vecinos con acceso activo y la administración operativa (no el saliente en lectura)
drop policy msg_enviar on mensajes;
create policy msg_enviar on mensajes for insert to authenticated
  with check (autor_id = auth.uid()
              and (es_admin(edificio_id) or mi_departamento_en(edificio_id) is not null));

-- Eliminar: el autor, o la administración para moderar. El texto se borra; queda la marca.
create or replace function eliminar_mensaje(p_mensaje uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v mensajes;
begin
  select * into v from mensajes where id = p_mensaje for update;
  if not found or not es_miembro(v.edificio_id) then raise exception 'Mensaje no encontrado'; end if;
  if v.eliminado_en is not null then raise exception 'El mensaje ya fue eliminado'; end if;
  if v.autor_id <> auth.uid() and not es_admin(v.edificio_id) then
    raise exception 'Solo el autor o la administración pueden eliminar un mensaje';
  end if;
  update mensajes set texto = 'Mensaje eliminado', eliminado_en = now(), eliminado_por = auth.uid()
  where id = p_mensaje;
end $$;
revoke execute on function eliminar_mensaje(uuid) from public, anon;
grant execute on function eliminar_mensaje(uuid) to authenticated;

-- Mensajes anteriores: completa el autor
update mensajes m set autor_nombre = p.nombre,
       autor_depto = (select d.numero from membresias mb join departamentos d on d.id = mb.departamento_id
                      where mb.perfil_id = m.autor_id and mb.edificio_id = m.edificio_id and mb.rol = 'habitante'
                      order by mb.created_at desc limit 1)
from perfiles p where p.id = m.autor_id and m.autor_nombre is null;

-- Realtime: los mensajes nuevos llegan sin recargar (respeta la política msg_leer)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes') then
    alter publication supabase_realtime add table mensajes;
  end if;
end $$;
