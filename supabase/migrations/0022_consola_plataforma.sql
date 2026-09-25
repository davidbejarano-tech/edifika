-- =====================================================================
-- EDIFIKA · 0022 Consola de plataforma (Etapa 6b, SPEC sección 12 punto 11)
--   1. Sesiones de soporte: Revisión (solo lectura, 2 h) e Intervención (como titular, 1 h)
--   2. Permisos: el soporte entra por nivel_admin_de; nunca valida pagos ni cambia accesos
--   3. Auditoría firmada: cada cambio durante una intervención queda con su sesión
--   4. Aviso al titular de las intervenciones con cambios
--   5. Edificios, solicitudes y plan pagado
--   6. Planes y precios (fijo por edificio y/o por departamento) y correos
--   7. Equipo EDIFIKA
--   8. Depuración manual: posponer o eliminar a pedido
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sesiones de soporte
-- ---------------------------------------------------------------------
create table sesiones_soporte (
  id          uuid primary key default gen_random_uuid(),
  edificio_id uuid not null references edificios on delete cascade,
  perfil_id   uuid not null references perfiles on delete cascade default auth.uid(),
  modo        text not null check (modo in ('revision','intervencion')),
  motivo      text not null check (char_length(motivo) between 5 and 500),
  referencia  text check (char_length(referencia) <= 200),
  inicio      timestamptz not null default now(),
  expira      timestamptz not null,
  cerrada_en  timestamptz,
  check (modo = 'revision' or coalesce(trim(referencia), '') <> '')
);
create index sesiones_soporte_activas on sesiones_soporte (perfil_id, edificio_id) where cerrada_en is null;
alter table sesiones_soporte enable row level security;
create policy soporte_leer on sesiones_soporte for select to authenticated using (es_plataforma());

-- Sesión vigente de la persona en ese edificio (solo miembros del equipo EDIFIKA)
create or replace function sesion_soporte(p_edificio uuid) returns sesiones_soporte
language sql stable security definer set search_path = public as $$
  select s.* from sesiones_soporte s
  where s.edificio_id = p_edificio and s.perfil_id = auth.uid() and s.cerrada_en is null and s.expira > now()
    and exists (select 1 from plataforma_admins pa where pa.perfil_id = auth.uid())
  order by s.inicio desc limit 1
$$;

-- Acceso de soporte sin membresía real en el edificio
create or replace function es_soporte(p_edificio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (sesion_soporte(p_edificio)).id is not null
     and not exists (select 1 from membresias m where m.edificio_id = p_edificio and m.perfil_id = auth.uid()
                     and m.estado = 'activo' and (m.rol = 'habitante' or m.nivel <> 'lectura' or m.vigente_hasta >= hoy_lima()))
$$;

create or replace function iniciar_soporte(p_edificio uuid, p_modo text, p_motivo text, p_referencia text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA da soporte'; end if;
  if not exists (select 1 from edificios where id = p_edificio) then raise exception 'Edificio no encontrado'; end if;
  if p_modo not in ('revision','intervencion') then raise exception 'Modo de soporte inválido'; end if;
  if char_length(coalesce(trim(p_motivo), '')) < 5 then raise exception 'Escribe el motivo del soporte'; end if;
  if p_modo = 'intervencion' and coalesce(trim(p_referencia), '') = '' then
    raise exception 'Para hacer cambios, indica la referencia del reclamo';
  end if;
  update sesiones_soporte set cerrada_en = now() where perfil_id = auth.uid() and cerrada_en is null;
  insert into sesiones_soporte (edificio_id, modo, motivo, referencia, expira)
  values (p_edificio, p_modo, trim(p_motivo), nullif(trim(p_referencia), ''),
          now() + case when p_modo = 'intervencion' then interval '1 hour' else interval '2 hours' end)
  returning id into v_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'soporte_inicio', 'sesiones_soporte', v_id,
          jsonb_build_object('modo', p_modo, 'motivo', trim(p_motivo), 'referencia', nullif(trim(p_referencia), '')));
  return v_id;
end $$;

create or replace function cerrar_soporte() returns void
language plpgsql security definer set search_path = public as $$
declare s sesiones_soporte;
begin
  for s in update sesiones_soporte set cerrada_en = now() where perfil_id = auth.uid() and cerrada_en is null returning * loop
    insert into auditoria (edificio_id, accion, entidad, entidad_id) values (s.edificio_id, 'soporte_fin', 'sesiones_soporte', s.id);
  end loop;
end $$;

-- Sesión vigente para mostrar el aviso de modo soporte en la app
create or replace function mi_soporte(p_edificio uuid)
returns table (modo text, motivo text, referencia text, expira timestamptz)
language sql stable security definer set search_path = public as $$
  select s.modo, s.motivo, s.referencia, s.expira from sesion_soporte(p_edificio) s where s.id is not null
$$;

-- ---------------------------------------------------------------------
-- 2. Permisos
-- ---------------------------------------------------------------------
-- El nivel de administración considera el soporte: Revisión = lectura; Intervención = titular
create or replace function nivel_admin_de(p_edificio uuid) returns nivel_admin
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nivel from membresias
     where edificio_id = p_edificio and perfil_id = auth.uid() and rol = 'admin' and estado = 'activo'
       and (nivel <> 'lectura' or vigente_hasta >= hoy_lima())
     limit 1),
    (select case s.modo when 'intervencion' then 'titular'::nivel_admin else 'lectura'::nivel_admin end
     from sesion_soporte(p_edificio) s where s.id is not null))
$$;

create or replace function mis_edificios()
returns table (edificio_id uuid, nombre text, codigo text, nivel nivel_admin, departamento_id uuid)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.codigo, nivel_admin_de(e.id),
         (select m.departamento_id from membresias m where m.edificio_id = e.id and m.perfil_id = auth.uid()
            and m.rol = 'habitante' and m.estado = 'activo' limit 1)
  from edificios e
  where es_miembro(e.id)
  order by e.nombre
$$;

-- El soporte nunca valida pagos ni registra efectivo: eso es del edificio (RN-22)
create or replace function puede_validar_pago(p_edificio uuid, p_departamento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when es_soporte(p_edificio) then false
    when p_departamento = mi_departamento_en(p_edificio) then false
    when p_departamento = depto_del_titular(p_edificio) then
         coalesce(nivel_admin_de(p_edificio) = 'operador', false)
         or (es_validador_designado(p_edificio) and not hay_operador(p_edificio))
    else es_admin(p_edificio)
  end
$$;

-- El soporte no cambia quién tiene acceso al edificio (equipo, vecinos, validador ni titularidad)
create or replace function tg_soporte_sin_accesos() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ed uuid := case when tg_op = 'DELETE' then old.edificio_id else new.edificio_id end;
begin
  if es_soporte(v_ed) then
    raise exception 'El soporte de EDIFIKA no cambia los accesos del edificio. Para cambiar al titular usa la transferencia forzada con acta';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger soporte_sin_accesos before insert or update or delete on membresias
  for each row execute function tg_soporte_sin_accesos();

create or replace function tg_soporte_sin_validador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.validador_designado_id is distinct from old.validador_designado_id and es_soporte(new.id) then
    raise exception 'El soporte de EDIFIKA no cambia los accesos del edificio';
  end if;
  return new;
end $$;
create trigger soporte_sin_validador before update on edificios
  for each row execute function tg_soporte_sin_validador();

-- En el chat, el soporte firma como "Soporte EDIFIKA"
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

  if es_soporte(new.edificio_id) then
    if not es_admin(new.edificio_id) then raise exception 'En modo Revisión solo se puede leer el chat'; end if;
    new.como_admin := true;
    new.autor_rol := 'Soporte EDIFIKA';
    new.autor_depto := null;
  elsif new.como_admin then
    if not es_admin(new.edificio_id) then raise exception 'Solo la administración escribe como administración'; end if;
    new.autor_rol := case nivel_admin_de(new.edificio_id) when 'titular' then 'Administrador titular' else 'Coadministrador' end;
    new.autor_depto := null;
  else
    if v_depto is null then
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

-- ---------------------------------------------------------------------
-- 3. Auditoría firmada por la sesión de soporte
-- ---------------------------------------------------------------------
alter table auditoria add column soporte_id uuid references sesiones_soporte on delete set null;

create or replace function tg_auditoria_soporte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.soporte_id is null and new.edificio_id is not null and es_soporte(new.edificio_id) then
    new.soporte_id := (sesion_soporte(new.edificio_id)).id;
  end if;
  return new;
end $$;
create trigger auditoria_soporte before insert on auditoria for each row execute function tg_auditoria_soporte();

-- Cambios directos en tablas (sin función de negocio) durante una intervención
create or replace function tg_registrar_soporte() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ed uuid; v_id uuid; v_fila jsonb;
begin
  if auth.uid() is null or not exists (select 1 from plataforma_admins where perfil_id = auth.uid()) then return null; end if;
  v_fila := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_ed := coalesce((v_fila->>'edificio_id')::uuid, case when tg_table_name = 'edificios' then (v_fila->>'id')::uuid end);
  if v_ed is null or not es_soporte(v_ed) then return null; end if;
  v_id := (v_fila->>'id')::uuid;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v_ed, 'soporte_' || lower(tg_op), tg_table_name, v_id,
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
               else jsonb_build_object('fila', v_fila) end);
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['edificios','departamentos','personas','gastos','compromisos','periodos','recibos','mensajes'] loop
    execute format('create trigger registrar_soporte after insert or update or delete on %I for each row execute function tg_registrar_soporte()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Aviso al titular: intervenciones con cambios de los últimos 30 días
-- ---------------------------------------------------------------------
create or replace function intervenciones_soporte(p_edificio uuid)
returns table (sesion_id uuid, fecha timestamptz, persona text, motivo text, referencia text, cambios int)
language sql stable security definer set search_path = public as $$
  select s.id, s.inicio, p.nombre, s.motivo, s.referencia,
         (select count(*)::int from auditoria a where a.soporte_id = s.id and a.accion not like 'soporte\_inicio' and a.accion <> 'soporte_fin')
  from sesiones_soporte s
  join perfiles p on p.id = s.perfil_id
  where s.edificio_id = p_edificio and s.modo = 'intervencion' and s.inicio > now() - interval '30 days'
    and es_lector_admin(p_edificio) and not es_soporte(p_edificio)
    and exists (select 1 from auditoria a where a.soporte_id = s.id and a.accion not in ('soporte_inicio','soporte_fin'))
  order by s.inicio desc
$$;

-- ---------------------------------------------------------------------
-- 5. Edificios, solicitudes y plan pagado
-- ---------------------------------------------------------------------
alter table edificios add column no_depurar_hasta date;
alter table depuraciones add column motivo text;

create or replace function plataforma_edificios()
returns table (edificio_id uuid, nombre text, codigo text, direccion text, creado date, titular text, correo_titular text,
               departamentos int, plan text, pagado boolean, dias_sin_movimiento int, aviso_inactividad smallint,
               no_depurar_hasta date, solicitudes int, soporte_activo text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.codigo, e.direccion, (e.created_at at time zone 'America/Lima')::date,
         p.nombre, u.email::text,
         (select count(*)::int from departamentos d where d.edificio_id = e.id),
         e.plan, e.suscripcion_pagada, dias_sin_movimiento(e.id), e.aviso_inactividad, e.no_depurar_hasta,
         (select count(*)::int from solicitudes_plan s where s.edificio_id = e.id and s.estado = 'pendiente'),
         (sesion_soporte(e.id)).modo
  from edificios e
  left join perfiles p on p.id = titular_perfil(e.id)
  left join auth.users u on u.id = titular_perfil(e.id)
  where es_plataforma()
  order by e.created_at desc
$$;

create or replace function plataforma_solicitudes()
returns table (solicitud_id uuid, edificio_id uuid, edificio text, codigo text, plan text, nota text, estado text,
               solicitante text, correo text, departamentos int, creada timestamptz, avisado boolean)
language sql stable security definer set search_path = public as $$
  select s.id, e.id, e.nombre, e.codigo, s.plan, s.nota, s.estado, p.nombre, u.email::text,
         (select count(*)::int from departamentos d where d.edificio_id = e.id), s.created_at, s.avisado_en is not null
  from solicitudes_plan s
  join edificios e on e.id = s.edificio_id
  left join perfiles p on p.id = s.solicitado_por
  left join auth.users u on u.id = s.solicitado_por
  where es_plataforma()
  order by (s.estado = 'pendiente') desc, s.created_at desc
$$;

create or replace function atender_solicitud(p_solicitud uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare v solicitudes_plan;
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA'; end if;
  if p_estado not in ('atendida','cancelada','pendiente') then raise exception 'Estado inválido'; end if;
  update solicitudes_plan set estado = p_estado where id = p_solicitud returning * into v;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v.edificio_id, 'solicitud_' || p_estado, 'solicitudes_plan', v.id, jsonb_build_object('plan', v.plan));
end $$;

-- Asigna (o quita) el plan pagado. Un plan pagado protege al edificio de la depuración (RN-29).
create or replace function asignar_plan(p_edificio uuid, p_plan text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA asigna planes'; end if;
  if p_plan is not null and not exists (select 1 from jsonb_array_elements(planes_vigentes()) x where x->>'id' = p_plan) then
    raise exception 'Plan no disponible';
  end if;
  update edificios set plan = p_plan, suscripcion_pagada = p_plan is not null where id = p_edificio;
  if not found then raise exception 'Edificio no encontrado'; end if;
  if p_plan is not null then
    update solicitudes_plan set estado = 'atendida' where edificio_id = p_edificio and plan = p_plan and estado = 'pendiente';
  end if;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'asignar_plan', 'edificios', p_edificio, jsonb_build_object('plan', p_plan));
end $$;

-- ---------------------------------------------------------------------
-- 6. Planes, precios y correos
--    Precio mensual = máximo(mínimo, precio fijo + precio por departamento × departamentos)
-- ---------------------------------------------------------------------
create or replace function precio_plan(p_plan jsonb, p_departamentos int) returns numeric
language sql immutable as $$
  select round(greatest(coalesce((p_plan->>'minimo')::numeric, 0),
                        coalesce((p_plan->>'precio')::numeric, 0)
                          + coalesce((p_plan->>'precio_departamento')::numeric, 0) * greatest(p_departamentos, 0)), 2)
$$;

-- Planes con el precio calculado para un edificio (para el Inicio del titular)
create or replace function planes_para_edificio(p_edificio uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x || jsonb_build_object('total', precio_plan(x, n.cnt), 'departamentos', n.cnt) order by o), '[]'::jsonb)
  from jsonb_array_elements(planes_vigentes()) with ordinality as p(x, o),
       (select count(*)::int as cnt from departamentos where edificio_id = p_edificio) n
  where es_miembro(p_edificio)
$$;

create or replace function plataforma_config_leer() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(clave, valor) from plataforma_config where es_plataforma()
$$;

create or replace function guardar_planes(p_planes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb; v_ids text[] := '{}';
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA configura los planes'; end if;
  if jsonb_typeof(p_planes) <> 'array' or jsonb_array_length(p_planes) <> 3 then raise exception 'Deben existir los 3 planes'; end if;
  for x in select * from jsonb_array_elements(p_planes) loop
    if x->>'id' not in ('basico','pro','premium') or x->>'id' = any(v_ids) then raise exception 'Planes inválidos'; end if;
    v_ids := v_ids || (x->>'id');
    if coalesce(trim(x->>'nombre'), '') = '' then raise exception 'Cada plan necesita un nombre'; end if;
    if x->>'moneda' not in ('PEN','USD') then raise exception 'La moneda debe ser PEN o USD'; end if;
    if coalesce((x->>'precio')::numeric, 0) < 0 or coalesce((x->>'precio_departamento')::numeric, 0) < 0
       or coalesce((x->>'minimo')::numeric, 0) < 0 then
      raise exception 'Los precios no pueden ser negativos (plan %)', x->>'nombre';
    end if;
    if coalesce((x->>'precio')::numeric, 0) = 0 and coalesce((x->>'precio_departamento')::numeric, 0) = 0 then
      raise exception 'El plan % necesita un precio fijo o por departamento', x->>'nombre';
    end if;
    if (x->>'max_departamentos') is not null and (x->>'max_departamentos')::int < 1 then
      raise exception 'El límite de departamentos debe ser mayor que cero';
    end if;
  end loop;
  update plataforma_config set valor = p_planes, actualizado_en = now() where clave = 'planes';
end $$;

create or replace function guardar_correo_plataforma(p_clave text, p_correo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA configura los correos'; end if;
  if p_clave not in ('correo_avisos','correo_contacto') then raise exception 'Correo desconocido'; end if;
  if lower(trim(p_correo)) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe un correo válido'; end if;
  update plataforma_config set valor = to_jsonb(lower(trim(p_correo))), actualizado_en = now() where clave = p_clave;
end $$;

-- ---------------------------------------------------------------------
-- 7. Equipo EDIFIKA (plataforma_admins sigue sin políticas: solo estas funciones)
-- ---------------------------------------------------------------------
create or replace function plataforma_equipo()
returns table (perfil_id uuid, nombre text, correo text, desde timestamptz, soy_yo boolean)
language sql stable security definer set search_path = public as $$
  select pa.perfil_id, p.nombre, u.email::text, pa.created_at, pa.perfil_id = auth.uid()
  from plataforma_admins pa join perfiles p on p.id = pa.perfil_id left join auth.users u on u.id = pa.perfil_id
  where es_plataforma()
  order by pa.created_at
$$;

create or replace function agregar_plataforma(p_correo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA agrega miembros'; end if;
  select u.id into v_id from auth.users u join perfiles p on p.id = u.id where lower(u.email) = lower(trim(p_correo));
  if v_id is null then raise exception 'No hay una cuenta de EDIFIKA con ese correo. La persona debe registrarse primero'; end if;
  insert into plataforma_admins (perfil_id) values (v_id) on conflict do nothing;
end $$;

create or replace function quitar_plataforma(p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA quita miembros'; end if;
  if p_perfil = auth.uid() then raise exception 'No puedes quitarte a ti mismo'; end if;
  delete from plataforma_admins where perfil_id = p_perfil;
  update sesiones_soporte set cerrada_en = now() where perfil_id = p_perfil and cerrada_en is null;
end $$;

-- ---------------------------------------------------------------------
-- 8. Depuración manual
-- ---------------------------------------------------------------------
-- Posponer la eliminación automática hasta una fecha (la actividad real no se toca)
create or replace function posponer_depuracion(p_edificio uuid, p_dias int, p_motivo text) returns date
language plpgsql security definer set search_path = public as $$
declare v_hasta date := hoy_lima() + p_dias;
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA pospone la depuración'; end if;
  if p_dias not between 1 and 180 then raise exception 'Se puede posponer de 1 a 180 días'; end if;
  if char_length(coalesce(trim(p_motivo), '')) < 5 then raise exception 'Escribe el motivo'; end if;
  update edificios set no_depurar_hasta = v_hasta, aviso_inactividad = 0 where id = p_edificio;
  if not found then raise exception 'Edificio no encontrado'; end if;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'posponer_depuracion', 'edificios', p_edificio, jsonb_build_object('hasta', v_hasta, 'motivo', trim(p_motivo)));
  return v_hasta;
end $$;

-- Los días sin movimiento se cuentan desde lo último entre la actividad y el fin de la postergación
create or replace function dias_sin_movimiento(p_edificio uuid) returns int
language sql stable security definer set search_path = public as $$
  select hoy_lima() - greatest((ultima_actividad at time zone 'America/Lima')::date, coalesce(no_depurar_hasta, '-infinity'::date))
  from edificios where id = p_edificio
$$;

create or replace function edificios_por_depurar()
returns table (edificio_id uuid, codigo text, nombre text, dias int, aviso smallint, titular uuid, accion text)
language sql stable security definer set search_path = public as $$
  select e.id, e.codigo, e.nombre, dias_sin_movimiento(e.id), e.aviso_inactividad, titular_perfil(e.id),
         case when dias_sin_movimiento(e.id) >= 90 then 'eliminar'
              when dias_sin_movimiento(e.id) >= 83 and e.aviso_inactividad < 2 then 'aviso_final'
              when dias_sin_movimiento(e.id) >= 60 and e.aviso_inactividad < 1 then 'primer_aviso'
         end
  from edificios e
  where not e.suscripcion_pagada and dias_sin_movimiento(e.id) >= 60
$$;
revoke execute on function edificios_por_depurar() from public, anon, authenticated;

-- Borrado total de un edificio (datos; los archivos y cuentas los borra la Edge Function)
create or replace function _borrar_edificio(p_edificio uuid, p_motivo text) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare v edificios; v_perfiles uuid[]; v_huerfanos uuid[]; v_dias int;
begin
  select * into v from edificios where id = p_edificio for update;
  if not found then return '{}'; end if;
  v_dias := dias_sin_movimiento(p_edificio);
  select coalesce(array_agg(distinct perfil_id), '{}') into v_perfiles from membresias where edificio_id = p_edificio;

  delete from pagos        where edificio_id = p_edificio;
  delete from compromisos  where edificio_id = p_edificio;
  delete from membresias   where edificio_id = p_edificio;
  delete from ocupaciones  where departamento_id in (select id from departamentos where edificio_id = p_edificio);
  delete from auditoria    where edificio_id = p_edificio;
  delete from edificios    where id = p_edificio;
  delete from organizaciones o where o.id = v.organizacion_id and not exists (select 1 from edificios e where e.organizacion_id = o.id);

  insert into depuraciones (edificio_id, codigo, creado_en, dias_inactivo, motivo) values (p_edificio, v.codigo, v.created_at, v_dias, p_motivo);

  select coalesce(array_agg(p), '{}') into v_huerfanos from unnest(v_perfiles) p
  where not exists (select 1 from membresias m where m.perfil_id = p)
    and not exists (select 1 from plataforma_admins pa where pa.perfil_id = p);
  return v_huerfanos;
end $$;
revoke execute on function _borrar_edificio(uuid, text) from public, anon, authenticated;

create or replace function depurar_edificio(p_edificio uuid) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare v edificios;
begin
  select * into v from edificios where id = p_edificio;
  if not found then return '{}'; end if;
  if v.suscripcion_pagada then raise exception 'Edificio con plan pagado: no se depura'; end if;
  if dias_sin_movimiento(p_edificio) < 90 then raise exception 'El edificio tiene movimiento reciente (% días)', dias_sin_movimiento(p_edificio); end if;
  return _borrar_edificio(p_edificio, 'Inactividad de 90 días (RN-29)');
end $$;
revoke execute on function depurar_edificio(uuid) from public, anon, authenticated;

-- Eliminación a pedido (la llama la Edge Function "eliminar-edificio" tras validar al equipo EDIFIKA)
create or replace function eliminar_edificio_a_pedido(p_edificio uuid, p_motivo text) returns uuid[]
language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(trim(p_motivo), '')) < 5 then raise exception 'Escribe el motivo de la eliminación'; end if;
  return _borrar_edificio(p_edificio, 'A pedido: ' || trim(p_motivo));
end $$;
revoke execute on function eliminar_edificio_a_pedido(uuid, text) from public, anon, authenticated;

create or replace function plataforma_depuraciones()
returns table (codigo text, creado_en timestamptz, depurado_en timestamptz, dias_inactivo int, motivo text)
language sql stable security definer set search_path = public as $$
  select codigo, creado_en, depurado_en, dias_inactivo, motivo from depuraciones where es_plataforma()
  order by depurado_en desc limit 100
$$;

-- El banner de la app respeta la postergación
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

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function es_soporte(uuid) from public, anon;
grant execute on function es_soporte(uuid) to authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'iniciar_soporte(uuid, text, text, text)', 'cerrar_soporte()', 'mi_soporte(uuid)', 'intervenciones_soporte(uuid)',
    'plataforma_edificios()', 'plataforma_solicitudes()', 'atender_solicitud(uuid, text)', 'asignar_plan(uuid, text)',
    'planes_para_edificio(uuid)', 'plataforma_config_leer()', 'guardar_planes(jsonb)', 'guardar_correo_plataforma(text, text)',
    'plataforma_equipo()', 'agregar_plataforma(text)', 'quitar_plataforma(uuid)', 'posponer_depuracion(uuid, int, text)',
    'plataforma_depuraciones()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
