-- =====================================================================
-- EDIFIKA · 0023 Áreas comunes en la app (Etapa 7, RN-30 a RN-37)
--   1. El módulo está habilitado por prueba vigente, activación o plan pagado (RN-17, RN-37)
--   2. Listas para la administración y para el vecino
--   3. Métrica del Inicio: reservas próximas
--   4. Expiración de reservas cada 15 minutos (RN-33)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Módulo habilitado: la misma regla que muestra el Inicio (estado_modulos)
-- ---------------------------------------------------------------------
create or replace function modulo_habilitado(p_edificio uuid, p_modulo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from modulos_edificio where edificio_id = p_edificio and modulo = p_modulo
                 and (estado = 'activo' or (estado = 'prueba' and prueba_hasta >= hoy_lima())))
      or exists (select 1 from edificios e
                 join lateral jsonb_array_elements(planes_vigentes()) p on p->>'id' = e.plan
                 where e.id = p_edificio and e.suscripcion_pagada and (p->'modulos') ? p_modulo)
$$;

-- ---------------------------------------------------------------------
-- 2. Reservas para la administración (con departamento, zona y responsable)
-- ---------------------------------------------------------------------
create or replace function reservas_admin(p_edificio uuid)
returns table (reserva_id uuid, zona_id uuid, zona text, departamento_id uuid, numero text, responsable text,
               inicio timestamptz, fin timestamptz, estado estado_reserva, garantia_monto numeric,
               garantia_estado estado_garantia, garantia_retenida numeric, vence_pago_en timestamptz,
               nota text, pago_en_revision boolean, puede_gestionar boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, z.id, z.nombre, r.departamento_id, d.numero,
         (select p.nombre from personas p where p.id = responsable_de(d.id)),
         r.inicio, r.fin, r.estado, r.garantia_monto, r.garantia_estado, r.garantia_retenida, r.vence_pago_en, r.nota,
         exists (select 1 from compromisos c where c.id in (r.compromiso_tarifa, r.compromiso_garantia) and c.estado = 'en_revision'),
         es_admin(p_edificio) and r.departamento_id is distinct from mi_departamento_en(p_edificio),
         r.created_at
  from reservas r
  join zonas_comunes z on z.id = r.zona_id
  join departamentos d on d.id = r.departamento_id
  where r.edificio_id = p_edificio and es_lector_admin(p_edificio)
  order by r.inicio
$$;

-- Reservas del propio departamento, con el estado de sus cargos
create or replace function mis_reservas(p_edificio uuid)
returns table (reserva_id uuid, zona text, inicio timestamptz, fin timestamptz, estado estado_reserva,
               tarifa numeric, garantia_monto numeric, garantia_estado estado_garantia, garantia_retenida numeric,
               vence_pago_en timestamptz, nota text, cargos_pendientes int, pago_en_revision boolean)
language sql stable security definer set search_path = public as $$
  select r.id, z.nombre, r.inicio, r.fin, r.estado,
         coalesce((select c.monto from compromisos c where c.id = r.compromiso_tarifa), 0),
         r.garantia_monto, r.garantia_estado, r.garantia_retenida, r.vence_pago_en, r.nota,
         (select count(*)::int from compromisos c where c.id in (r.compromiso_tarifa, r.compromiso_garantia) and c.estado = 'pendiente'),
         exists (select 1 from compromisos c where c.id in (r.compromiso_tarifa, r.compromiso_garantia) and c.estado = 'en_revision')
  from reservas r
  join zonas_comunes z on z.id = r.zona_id
  where r.edificio_id = p_edificio and r.departamento_id = mi_departamento_en(p_edificio)
  order by r.inicio desc
$$;

-- ---------------------------------------------------------------------
-- 3. Reservas próximas (métrica de la tarjeta del Inicio)
-- ---------------------------------------------------------------------
create or replace function reservas_proximas(p_edificio uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from reservas
  where edificio_id = p_edificio and estado in ('solicitada','pendiente_pago','confirmada') and fin > now()
    and es_lector_admin(p_edificio)
$$;

do $$
declare f text;
begin
  foreach f in array array['reservas_admin(uuid)', 'mis_reservas(uuid)', 'reservas_proximas(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Expiración automática cada 15 minutos (pg_cron ya corre el corte diario)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'expirar-reservas') then
      perform cron.unschedule('expirar-reservas');
    end if;
    perform cron.schedule('expirar-reservas', '*/15 * * * *', 'select public.expirar_reservas();');
  end if;
end $$;
