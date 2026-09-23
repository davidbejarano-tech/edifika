-- =====================================================================
-- Building Buddy · 0002 Autoregistro, importación y depuración por inactividad
-- RN-26 a RN-29
-- =====================================================================

alter table edificios
  add column ultima_actividad   timestamptz not null default now(),
  add column suscripcion_pagada boolean not null default false,   -- lo activa facturación / plataforma
  add column aviso_inactividad  smallint not null default 0 check (aviso_inactividad between 0 and 2),
  add column creado_por         uuid references perfiles on delete set null;

-- Rastro técnico mínimo de lo depurado (sin datos personales)
create table depuraciones (
  id            bigint generated always as identity primary key,
  edificio_id   uuid not null,
  codigo        text not null,
  creado_en     timestamptz,
  depurado_en   timestamptz not null default now(),
  dias_inactivo int not null
);
alter table depuraciones enable row level security;   -- sin políticas: solo service role

-- =====================================================================
-- 1. ACTIVIDAD (RN-28)
--    Cuenta como movimiento cualquier alta, cambio o baja hecha por una persona en:
--    periodos, gastos, compromisos, pagos, departamentos, personas, mensajes
--    (y reservas y zonas en 0003). No cuentan los inicios de sesión ni los
--    procesos automáticos (corte diario, expiraciones).
-- =====================================================================
create or replace function tg_actividad() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ed uuid;
begin
  if auth.uid() is null then return null; end if;          -- procesos automáticos no cuentan
  v_ed := case when tg_op = 'DELETE' then old.edificio_id else new.edificio_id end;
  update edificios set ultima_actividad = now(), aviso_inactividad = 0
  where id = v_ed and (ultima_actividad < now() - interval '1 hour' or aviso_inactividad > 0);
  return null;
end $$;
revoke execute on function tg_actividad() from public, anon, authenticated;

create trigger actividad after insert or update or delete on periodos      for each row execute function tg_actividad();
create trigger actividad after insert or update or delete on gastos        for each row execute function tg_actividad();
create trigger actividad after insert or update or delete on compromisos   for each row execute function tg_actividad();
create trigger actividad after insert or update or delete on pagos         for each row execute function tg_actividad();
create trigger actividad after insert or update or delete on departamentos for each row execute function tg_actividad();
create trigger actividad after insert or update or delete on personas      for each row execute function tg_actividad();
create trigger actividad after insert or update or delete on mensajes      for each row execute function tg_actividad();

-- =====================================================================
-- 2. AUTOREGISTRO (RN-26)
--    Lo llama un usuario con correo ya verificado (Supabase Auth con
--    "Confirm email" activo). Queda como titular.
-- =====================================================================
create or replace function crear_edificio(
  p_nombre text, p_direccion text, p_codigo text, p_total_departamentos int, p_area_total numeric,
  p_tipo_calculo tipo_calculo, p_mes_inicio date, p_mi_nombre text,
  p_organizacion uuid default null, p_organizacion_nombre text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org uuid; v_ed uuid; v_cod text := lower(trim(p_codigo));
begin
  if v_uid is null then raise exception 'Inicia sesión para registrar un edificio'; end if;
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_direccion), '') = '' then
    raise exception 'Nombre y dirección son obligatorios';
  end if;
  if (select count(*) from edificios e join membresias m on m.edificio_id = e.id
      where m.perfil_id = v_uid and m.rol = 'admin' and m.nivel = 'titular' and m.estado = 'activo'
        and not e.suscripcion_pagada) >= 3 then
    raise exception 'Ya tienes 3 edificios sin plan pagado. Activa un plan en alguno para registrar más';
  end if;
  if v_cod !~ '^[a-z0-9-]{3,30}$' then
    raise exception 'El código debe tener de 3 a 30 caracteres: letras minúsculas, números o guiones';
  end if;
  if exists (select 1 from edificios where codigo = v_cod) then
    raise exception 'El código "%" ya está en uso. Elige otro', v_cod;
  end if;

  insert into perfiles (id, nombre) values (v_uid, trim(p_mi_nombre)) on conflict (id) do nothing;

  if p_organizacion is not null then
    if not exists (select 1 from edificios e where e.organizacion_id = p_organizacion and es_titular(e.id)) then
      raise exception 'Solo puedes agregar edificios a una organización donde eres titular';
    end if;
    v_org := p_organizacion;
  else
    insert into organizaciones (nombre) values (coalesce(nullif(trim(p_organizacion_nombre), ''), trim(p_nombre)))
    returning id into v_org;
  end if;

  insert into edificios (organizacion_id, codigo, nombre, direccion, total_departamentos, area_total_m2, tipo_calculo, creado_por)
  values (v_org, v_cod, trim(p_nombre), trim(p_direccion), p_total_departamentos, p_area_total, p_tipo_calculo, v_uid)
  returning id into v_ed;

  insert into membresias (edificio_id, perfil_id, rol, nivel) values (v_ed, v_uid, 'admin', 'titular');
  insert into periodos (edificio_id, mes) values (v_ed, date_trunc('month', coalesce(p_mes_inicio, hoy_lima()))::date);
  insert into auditoria (edificio_id, accion, entidad, entidad_id) values (v_ed, 'crear_edificio', 'edificios', v_ed);
  return v_ed;
end $$;

-- =====================================================================
-- 3. IMPORTACIÓN DE DEPARTAMENTOS (RN-27)
--    p_filas: [{"numero":"101","piso":1,"area":72,"propietario":"...","inquilino":"...",
--               "email":"...","telefono":"..."}]
--    Todo o nada: si una fila falla, no se guarda ninguna y el error indica la fila.
--    Las invitaciones se envían después con la Edge Function "invitar-habitante".
-- =====================================================================
create or replace function importar_departamentos(p_edificio uuid, p_filas jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare f jsonb; k int := 0; v_dep uuid; v_per uuid; v_num text; v_area numeric; v_piso int;
        v_prop text; v_inq text; v_email text; v_tel text;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular importa departamentos'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'No hay filas para importar'; end if;
  if jsonb_array_length(p_filas) > 500 then raise exception 'Máximo 500 departamentos por importación'; end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    k := k + 1;
    v_num  := trim(f->>'numero');
    v_prop := nullif(trim(f->>'propietario'), '');
    v_inq  := nullif(trim(f->>'inquilino'), '');
    v_email := nullif(lower(trim(f->>'email')), '');
    v_tel  := nullif(trim(f->>'telefono'), '');
    begin
      v_area := (f->>'area')::numeric;
      v_piso := coalesce(nullif(f->>'piso', '')::int, nullif(regexp_replace(v_num, '\D.*$', ''), '')::int / 100);
    exception when others then
      raise exception 'Fila %: el área y el piso deben ser números', k;
    end;
    if coalesce(v_num, '') !~ '^[0-9A-Za-z-]{1,8}$' then raise exception 'Fila %: número de departamento no válido', k; end if;
    if v_area is null or v_area <= 0 then raise exception 'Fila % (depto %): el área debe ser mayor que cero', k, v_num; end if;
    if v_prop is null then raise exception 'Fila % (depto %): falta el propietario', k, v_num; end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Fila % (depto %): correo no válido', k, v_num; end if;
    if exists (select 1 from departamentos where edificio_id = p_edificio and numero = v_num) then
      raise exception 'Fila %: el departamento % ya existe', k, v_num;
    end if;

    insert into departamentos (edificio_id, numero, piso, area_m2) values (p_edificio, v_num, coalesce(v_piso, 0), v_area)
    returning id into v_dep;
    insert into personas (edificio_id, nombre, email, telefono)
    values (p_edificio, v_prop, case when v_inq is null then v_email end, case when v_inq is null then v_tel end)
    returning id into v_per;
    insert into ocupaciones (departamento_id, persona_id, tipo, desde) values (v_dep, v_per, 'propietario', hoy_lima());
    if v_inq is not null then
      insert into personas (edificio_id, nombre, email, telefono) values (p_edificio, v_inq, v_email, v_tel) returning id into v_per;
      insert into ocupaciones (departamento_id, persona_id, tipo, desde) values (v_dep, v_per, 'inquilino', hoy_lima());
    end if;
  end loop;

  insert into auditoria (edificio_id, accion, entidad, datos)
  values (p_edificio, 'importar_departamentos', 'departamentos', jsonb_build_object('cantidad', k));
  return k;
end $$;

-- =====================================================================
-- 4. DEPURACIÓN POR INACTIVIDAD (RN-28, RN-29)
--    Solo edificios sin plan pagado. Avisos al titular en el día 60 y el día 83;
--    eliminación total en el día 90 sin movimiento.
--    Lo ejecuta a diario la Edge Function "depurar-edificios-inactivos" con la
--    service role: envía los avisos, borra los archivos de Storage, llama a
--    depurar_edificio() y elimina de Auth las cuentas que quedan sin edificio.
-- =====================================================================
create or replace function dias_sin_movimiento(p_edificio uuid) returns int
language sql stable security definer set search_path = public as $$
  select hoy_lima() - (ultima_actividad at time zone 'America/Lima')::date from edificios where id = p_edificio
$$;

-- Para mostrar el aviso dentro de la app al equipo de administración
create or replace function estado_inactividad(p_edificio uuid)
returns table (dias_sin_movimiento int, dias_para_eliminar int, protegido boolean)
language sql stable security definer set search_path = public as $$
  select dias_sin_movimiento(e.id), greatest(0, 90 - dias_sin_movimiento(e.id)), e.suscripcion_pagada
  from edificios e where e.id = p_edificio and es_lector_admin(e.id)
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

create or replace function marcar_aviso_inactividad(p_edificio uuid, p_aviso smallint) returns void
language sql security definer set search_path = public as $$
  update edificios set aviso_inactividad = greatest(aviso_inactividad, p_aviso) where id = p_edificio
$$;

-- Elimina el edificio y todos sus datos. Devuelve los perfiles que quedaron sin ningún
-- edificio, para que la Edge Function borre esas cuentas de Auth.
create or replace function depurar_edificio(p_edificio uuid) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare v edificios; v_perfiles uuid[]; v_huerfanos uuid[]; v_dias int;
begin
  select * into v from edificios where id = p_edificio for update;
  if not found then return '{}'; end if;
  v_dias := dias_sin_movimiento(p_edificio);
  if v.suscripcion_pagada then raise exception 'Edificio con plan pagado: no se depura'; end if;
  if v_dias < 90 then raise exception 'El edificio tiene movimiento reciente (% días)', v_dias; end if;

  select coalesce(array_agg(distinct perfil_id), '{}') into v_perfiles from membresias where edificio_id = p_edificio;

  delete from pagos        where edificio_id = p_edificio;
  delete from compromisos  where edificio_id = p_edificio;
  delete from membresias   where edificio_id = p_edificio;
  delete from ocupaciones  where departamento_id in (select id from departamentos where edificio_id = p_edificio);
  delete from auditoria    where edificio_id = p_edificio;
  delete from edificios    where id = p_edificio;              -- el resto cae en cascada
  delete from organizaciones o where o.id = v.organizacion_id
    and not exists (select 1 from edificios e where e.organizacion_id = o.id);

  insert into depuraciones (edificio_id, codigo, creado_en, dias_inactivo) values (p_edificio, v.codigo, v.created_at, v_dias);

  select coalesce(array_agg(p), '{}') into v_huerfanos from unnest(v_perfiles) p
  where not exists (select 1 from membresias m where m.perfil_id = p)
    and not exists (select 1 from plataforma_admins pa where pa.perfil_id = p);
  return v_huerfanos;
end $$;

revoke execute on function edificios_por_depurar() from public, anon, authenticated;
revoke execute on function marcar_aviso_inactividad(uuid, smallint) from public, anon, authenticated;
revoke execute on function depurar_edificio(uuid) from public, anon, authenticated;

-- Programación (Supabase: Integrations → Cron, o pg_cron + pg_net):
--   select cron.schedule('depurar-inactivos', '30 13 * * *',
--     $$ select net.http_post(url := '<URL>/functions/v1/depurar-edificios-inactivos',
--                             headers := '{"Authorization":"Bearer <SERVICE_ROLE>"}'::jsonb) $$);
--   -- 13:30 UTC = 08:30 en Lima (los avisos llegan en horario de oficina)
