-- =====================================================================
-- EDIFIKA · 0021 Dashboard comercial (Etapa 6, parte A)
--   1. Configuración de la plataforma: planes, precios y correos (editable luego
--      desde la consola de plataforma, Etapa 6b; hoy solo con la service role)
--   2. Plan del edificio y estado de los módulos (RN-17)
--   3. Solicitudes de plan
--   4. Aceptación de términos y política de privacidad
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Configuración de la plataforma (clave → valor). Sin políticas: se lee
--    con funciones que exponen solo lo público.
-- ---------------------------------------------------------------------
create table plataforma_config (
  clave          text primary key,
  valor          jsonb not null,
  actualizado_en timestamptz not null default now()
);
alter table plataforma_config enable row level security;

insert into plataforma_config (clave, valor) values
  ('planes', '[
     {"id":"basico","nombre":"Básico","precio":149,"moneda":"PEN","max_departamentos":20,
      "incluye":"Gestión del edificio, Finanzas y cuotas, Comunicación. Hasta 20 departamentos.","modulos":[]},
     {"id":"pro","nombre":"Pro","precio":249,"moneda":"PEN","max_departamentos":60,
      "incluye":"Todo lo del Básico, más Áreas comunes y Mantenimiento. Hasta 60 departamentos.","modulos":["areas_comunes","mantenimiento"]},
     {"id":"premium","nombre":"Premium","precio":349,"moneda":"PEN","max_departamentos":null,
      "incluye":"Todo lo del Pro, más Marketplace de servicios y reportes avanzados. Departamentos ilimitados.","modulos":["areas_comunes","mantenimiento","marketplace"]}
   ]'::jsonb),
  ('correo_avisos', '"david.bejarano@gmail.com"'::jsonb),     -- avisos internos (solicitudes de plan)
  ('correo_contacto', '"david.bejarano@gmail.com"'::jsonb);   -- contacto en privacidad y términos

-- Planes vigentes: públicos (también para la bienvenida y los términos)
create or replace function planes_vigentes() returns jsonb
language sql stable security definer set search_path = public as $$
  select valor from plataforma_config where clave = 'planes'
$$;
grant execute on function planes_vigentes() to anon, authenticated;

create or replace function correo_contacto() returns text
language sql stable security definer set search_path = public as $$
  select valor #>> '{}' from plataforma_config where clave = 'correo_contacto'
$$;
grant execute on function correo_contacto() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Plan del edificio y estado de los módulos
-- ---------------------------------------------------------------------
alter table edificios add column plan text check (plan in ('basico','pro','premium'));
comment on column edificios.plan is 'Plan contratado. Lo asigna la plataforma junto con suscripcion_pagada';

-- Estado visible de cada módulo adicional: activo (por plan o activado), prueba vigente o bloqueado.
-- Una prueba vencida vuelve a bloqueado y no se puede repetir (RN-17).
create or replace function estado_modulos(p_edificio uuid)
returns table (modulo text, estado text, prueba_hasta date, dias_prueba int, prueba_usada boolean)
language sql stable security definer set search_path = public as $$
  with m(modulo) as (values ('areas_comunes'), ('mantenimiento'), ('marketplace')),
  plan as (
    select coalesce(p->'modulos', '[]'::jsonb) as modulos
    from edificios e
    left join lateral jsonb_array_elements(planes_vigentes()) p on p->>'id' = e.plan and e.suscripcion_pagada
    where e.id = p_edificio)
  select m.modulo,
         case when (select modulos from plan) ? m.modulo or me.estado = 'activo' then 'activo'
              when me.estado = 'prueba' and me.prueba_hasta >= hoy_lima() then 'prueba'
              else 'bloqueado' end,
         me.prueba_hasta,
         case when me.estado = 'prueba' and me.prueba_hasta >= hoy_lima() then me.prueba_hasta - hoy_lima() end,
         me.prueba_hasta is not null
  from m left join modulos_edificio me on me.edificio_id = p_edificio and me.modulo = m.modulo
  where es_miembro(p_edificio)
$$;
revoke execute on function estado_modulos(uuid) from public, anon;
grant execute on function estado_modulos(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Solicitudes de plan (el aviso por correo lo envía la Edge Function
--    "avisar-solicitud-plan", que marca avisado_en)
-- ---------------------------------------------------------------------
create table solicitudes_plan (
  id             uuid primary key default gen_random_uuid(),
  edificio_id    uuid not null references edificios on delete cascade,
  plan           text not null check (plan in ('basico','pro','premium')),
  nota           text check (char_length(nota) <= 500),
  estado         text not null default 'pendiente' check (estado in ('pendiente','atendida','cancelada')),
  solicitado_por uuid references perfiles on delete set null default auth.uid(),
  avisado_en     timestamptz,
  created_at     timestamptz not null default now()
);
alter table solicitudes_plan enable row level security;
create policy sol_leer on solicitudes_plan for select to authenticated using (es_lector_admin(edificio_id));

create or replace function solicitar_plan(p_edificio uuid, p_plan text, p_nota text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular solicita planes'; end if;
  if not exists (select 1 from jsonb_array_elements(planes_vigentes()) p where p->>'id' = p_plan) then
    raise exception 'Plan no disponible';
  end if;
  if exists (select 1 from solicitudes_plan where edificio_id = p_edificio and plan = p_plan and estado = 'pendiente') then
    raise exception 'Ya solicitaste este plan. Te contactaremos pronto';
  end if;
  insert into solicitudes_plan (edificio_id, plan, nota) values (p_edificio, p_plan, nullif(trim(p_nota), ''))
  returning id into v_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'solicitar_plan', 'solicitudes_plan', v_id, jsonb_build_object('plan', p_plan));
  return v_id;
end $$;
revoke execute on function solicitar_plan(uuid, text, text) from public, anon;
grant execute on function solicitar_plan(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Términos y privacidad: cada cuenta acepta la versión vigente
-- ---------------------------------------------------------------------
alter table perfiles
  add column terminos_version   text,
  add column terminos_aceptados timestamptz;

create or replace function aceptar_terminos(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'Falta la versión de los términos'; end if;
  update perfiles set terminos_version = p_version, terminos_aceptados = now() where id = auth.uid();
  if not found then raise exception 'Tu cuenta aún no tiene perfil'; end if;
end $$;
revoke execute on function aceptar_terminos(text) from public, anon;
grant execute on function aceptar_terminos(text) to authenticated;
