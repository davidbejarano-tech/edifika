-- =====================================================================
-- Building Buddy · 0003 Módulo Áreas comunes (RN-30 a RN-37)
-- Configuración de zonas, disponibilidad por turnos, reservas con pago
-- mediante el flujo normal de compromisos, y garantías en custodia.
-- =====================================================================
create extension if not exists btree_gist;

create type estado_reserva  as enum ('solicitada','pendiente_pago','confirmada','usada','cancelada','rechazada','expirada');
create type estado_garantia as enum ('sin_garantia','por_cobrar','en_custodia','por_devolver','devuelta','retenida');

create or replace function modulo_habilitado(p_edificio uuid, p_modulo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from modulos_edificio where edificio_id = p_edificio and modulo = p_modulo
                 and (estado = 'activo' or (estado = 'prueba' and prueba_hasta >= hoy_lima())))
$$;

-- =====================================================================
-- TABLAS
-- =====================================================================
create table zonas_comunes (
  id                     uuid primary key default gen_random_uuid(),
  edificio_id            uuid not null references edificios on delete cascade,
  nombre                 text not null,
  descripcion            text,
  aforo                  int check (aforo > 0),
  reglamento             text not null default '',
  activa                 boolean not null default true,
  dias_semana            smallint[] not null default '{0,1,2,3,4,5,6}',   -- 0 = domingo
  hora_apertura          time not null default '09:00',
  hora_cierre            time not null default '22:00',
  duracion_turno_min     int  not null default 240 check (duracion_turno_min between 30 and 720),
  anticipacion_min_dias  int  not null default 1 check (anticipacion_min_dias >= 0),
  anticipacion_max_dias  int  not null default 30,
  max_reservas_mes       int  not null default 2 check (max_reservas_mes > 0),
  requiere_aprobacion    boolean not null default false,
  tarifa                 numeric(12,2) not null default 0 check (tarifa >= 0),
  garantia               numeric(12,2) not null default 0 check (garantia >= 0),
  permite_morosos        boolean not null default false,
  plazo_pago_horas       int  not null default 48 check (plazo_pago_horas between 1 and 168),
  created_at             timestamptz not null default now(),
  check (hora_cierre > hora_apertura),
  check (anticipacion_max_dias >= anticipacion_min_dias),
  check (dias_semana <@ '{0,1,2,3,4,5,6}'::smallint[])
);

create table bloqueos_zona (
  id       uuid primary key default gen_random_uuid(),
  zona_id  uuid not null references zonas_comunes on delete cascade,
  desde    timestamptz not null,
  hasta    timestamptz not null check (hasta > desde),
  motivo   text not null
);

create table reservas (
  id                   uuid primary key default gen_random_uuid(),
  edificio_id          uuid not null,
  zona_id              uuid not null references zonas_comunes on delete cascade,
  departamento_id      uuid not null,
  inicio               timestamptz not null,
  fin                  timestamptz not null check (fin > inicio),
  estado               estado_reserva not null,
  compromiso_tarifa    uuid references compromisos on delete set null,
  compromiso_garantia  uuid references compromisos on delete set null,
  garantia_monto       numeric(12,2) not null default 0,
  garantia_estado      estado_garantia not null default 'sin_garantia',
  garantia_retenida    numeric(12,2) not null default 0 check (garantia_retenida >= 0),
  garantia_cerrada_en  date,
  vence_pago_en        timestamptz,
  acepto_reglamento_en timestamptz not null,
  solicitada_por       uuid references perfiles default auth.uid(),
  gestionada_por       uuid references perfiles,
  nota                 text,
  created_at           timestamptz not null default now(),
  foreign key (departamento_id, edificio_id) references departamentos (id, edificio_id) on delete cascade,
  check (garantia_retenida <= garantia_monto),
  -- Un turno no puede tener dos reservas vigentes
  exclude using gist (zona_id with =, tstzrange(inicio, fin) with &&)
    where (estado in ('solicitada','pendiente_pago','confirmada'))
);
create index reservas_depto on reservas (departamento_id, inicio);

-- =====================================================================
-- DISPONIBILIDAD: turnos de un día con su estado (sin revelar quién reservó)
-- =====================================================================
create or replace function disponibilidad(p_zona uuid, p_fecha date)
returns table (inicio timestamptz, fin timestamptz, libre boolean, motivo text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare z zonas_comunes;
begin
  select * into z from zonas_comunes where id = p_zona;
  if not found or not es_miembro(z.edificio_id) then raise exception 'Zona no encontrada'; end if;
  return query
  with t as (
    select (gs at time zone 'America/Lima') as ini,
           ((gs + make_interval(mins => z.duracion_turno_min)) at time zone 'America/Lima') as fi
    from generate_series(p_fecha + z.hora_apertura,
                         p_fecha + z.hora_cierre - make_interval(mins => z.duracion_turno_min),
                         make_interval(mins => z.duracion_turno_min)) gs
  )
  select t.ini, t.fi,
    (z.activa and extract(dow from p_fecha)::smallint = any (z.dias_semana)
      and not exists (select 1 from reservas r where r.zona_id = z.id
                      and r.estado in ('solicitada','pendiente_pago','confirmada')
                      and tstzrange(r.inicio, r.fin) && tstzrange(t.ini, t.fi))
      and not exists (select 1 from bloqueos_zona b where b.zona_id = z.id
                      and tstzrange(b.desde, b.hasta) && tstzrange(t.ini, t.fi))),
    case when not z.activa then 'Zona no disponible'
         when not (extract(dow from p_fecha)::smallint = any (z.dias_semana)) then 'No abre este día'
         when exists (select 1 from bloqueos_zona b where b.zona_id = z.id and tstzrange(b.desde, b.hasta) && tstzrange(t.ini, t.fi))
           then (select b.motivo from bloqueos_zona b where b.zona_id = z.id and tstzrange(b.desde, b.hasta) && tstzrange(t.ini, t.fi) limit 1)
         when exists (select 1 from reservas r where r.zona_id = z.id and r.estado in ('solicitada','pendiente_pago','confirmada')
                      and tstzrange(r.inicio, r.fin) && tstzrange(t.ini, t.fi)) then 'Reservado'
    end
  from t order by t.ini;
end $$;

-- =====================================================================
-- CARGOS DE UNA RESERVA: tarifa y garantía como compromisos normales,
-- que el vecino paga con el flujo de siempre (comprobante + validación).
-- =====================================================================
create or replace function _emitir_cargos_reserva(p_reserva uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas; z zonas_comunes; v_mes date; v_vence date; v_txt text; v_t uuid; v_g uuid;
begin
  select * into r from reservas where id = p_reserva for update;
  select * into z from zonas_comunes where id = r.zona_id;
  select mes into v_mes from periodos where edificio_id = r.edificio_id and estado = 'abierto';
  v_mes := coalesce(v_mes, date_trunc('month', hoy_lima())::date);
  v_vence := ((now() + make_interval(hours => z.plazo_pago_horas)) at time zone 'America/Lima')::date;
  v_txt := z.nombre || ', ' || to_char(r.inicio at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI');
  if z.tarifa > 0 then
    insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, vence_en)
    values (r.edificio_id, r.departamento_id, v_mes, 'reserva', 'Reserva: ' || v_txt, z.tarifa, v_vence) returning id into v_t;
  end if;
  if z.garantia > 0 then
    insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, vence_en)
    values (r.edificio_id, r.departamento_id, v_mes, 'garantia', 'Garantía reembolsable: ' || v_txt, z.garantia, v_vence) returning id into v_g;
  end if;
  update reservas set estado = 'pendiente_pago', compromiso_tarifa = v_t, compromiso_garantia = v_g,
    garantia_monto = z.garantia, garantia_estado = (case when z.garantia > 0 then 'por_cobrar' else 'sin_garantia' end)::estado_garantia,
    vence_pago_en = now() + make_interval(hours => z.plazo_pago_horas)
  where id = p_reserva;
end $$;
revoke execute on function _emitir_cargos_reserva(uuid) from public, anon, authenticated;

-- =====================================================================
-- SOLICITAR RESERVA (habitante) · RN-31, RN-32
-- =====================================================================
create or replace function solicitar_reserva(p_zona uuid, p_inicio timestamptz, p_acepto_reglamento boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare z zonas_comunes; v_dep uuid; v_local timestamp; v_fecha date; v_ant int; v_id uuid; v_estado estado_reserva;
begin
  select * into z from zonas_comunes where id = p_zona;
  if not found then raise exception 'Zona no encontrada'; end if;
  if not modulo_habilitado(z.edificio_id, 'areas_comunes') then raise exception 'El módulo Áreas comunes no está activo en tu edificio'; end if;
  v_dep := mi_departamento_en(z.edificio_id);
  if v_dep is null then raise exception 'Solo los vecinos con acceso pueden reservar'; end if;
  if not z.activa then raise exception 'Esta zona no está disponible para reservas'; end if;
  if not coalesce(p_acepto_reglamento, false) then raise exception 'Debes aceptar el reglamento de uso'; end if;

  v_local := p_inicio at time zone 'America/Lima';
  v_fecha := v_local::date;
  if not (extract(dow from v_fecha)::smallint = any (z.dias_semana)) then raise exception 'La zona no abre ese día'; end if;
  if v_local::time < z.hora_apertura or (v_local + make_interval(mins => z.duracion_turno_min))::time > z.hora_cierre
     or (v_local + make_interval(mins => z.duracion_turno_min))::date <> v_fecha
     or (extract(epoch from v_local::time - z.hora_apertura)::int / 60) % z.duracion_turno_min <> 0 then
    raise exception 'Elige uno de los turnos disponibles';
  end if;
  v_ant := v_fecha - hoy_lima();
  if v_ant < z.anticipacion_min_dias then raise exception 'Reserva con al menos % días de anticipación', z.anticipacion_min_dias; end if;
  if v_ant > z.anticipacion_max_dias then raise exception 'Solo puedes reservar hasta % días antes', z.anticipacion_max_dias; end if;
  if (select count(*) from reservas r where r.departamento_id = v_dep and r.zona_id = z.id
        and r.estado in ('solicitada','pendiente_pago','confirmada','usada')
        and date_trunc('month', r.inicio at time zone 'America/Lima') = date_trunc('month', v_local)) >= z.max_reservas_mes then
    raise exception 'Ya usaste tus % reservas de este mes en esta zona', z.max_reservas_mes;
  end if;
  if not z.permite_morosos and exists (select 1 from compromisos c where c.departamento_id = v_dep
        and c.estado = 'pendiente' and c.vence_en < hoy_lima()) then
    raise exception 'Tu departamento tiene deuda vencida. Ponte al día para reservar';
  end if;
  if exists (select 1 from bloqueos_zona b where b.zona_id = z.id
             and tstzrange(b.desde, b.hasta) && tstzrange(p_inicio, p_inicio + make_interval(mins => z.duracion_turno_min))) then
    raise exception 'Ese turno está bloqueado por la administración';
  end if;

  v_estado := case when z.requiere_aprobacion then 'solicitada'
                   when z.tarifa + z.garantia > 0 then 'pendiente_pago'
                   else 'confirmada' end;
  begin
    insert into reservas (edificio_id, zona_id, departamento_id, inicio, fin, estado, acepto_reglamento_en)
    values (z.edificio_id, z.id, v_dep, p_inicio, p_inicio + make_interval(mins => z.duracion_turno_min),
            case when v_estado = 'pendiente_pago' then 'solicitada' else v_estado end, now())
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese turno acaba de ser reservado. Elige otro';
  end;
  if v_estado = 'pendiente_pago' then perform _emitir_cargos_reserva(v_id); end if;
  return v_id;
end $$;

-- =====================================================================
-- GESTIÓN (titular o coadministrador; nadie gestiona las reservas de su propio departamento)
-- =====================================================================
create or replace function _exigir_gestor_reserva(r reservas) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin(r.edificio_id) then raise exception 'Solo la administración gestiona reservas'; end if;
  if r.departamento_id = mi_departamento_en(r.edificio_id) then raise exception 'No puedes gestionar reservas de tu propio departamento'; end if;
end $$;

create or replace function aprobar_reserva(p_reserva uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas; z zonas_comunes;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  perform _exigir_gestor_reserva(r);
  if r.estado <> 'solicitada' then raise exception 'La reserva ya fue gestionada'; end if;
  select * into z from zonas_comunes where id = r.zona_id;
  update reservas set gestionada_por = auth.uid() where id = p_reserva;
  if z.tarifa + z.garantia > 0 then perform _emitir_cargos_reserva(p_reserva);
  else update reservas set estado = 'confirmada' where id = p_reserva; end if;
end $$;

create or replace function rechazar_reserva(p_reserva uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  perform _exigir_gestor_reserva(r);
  if r.estado <> 'solicitada' then raise exception 'La reserva ya fue gestionada'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo del rechazo'; end if;
  update reservas set estado = 'rechazada', nota = trim(p_motivo), gestionada_por = auth.uid() where id = p_reserva;
end $$;

-- Cancelación (RN-34): el vecino, antes del inicio; o la administración.
-- Se anulan los cargos no pagados. La garantía pagada pasa a "por devolver".
-- La tarifa pagada no se devuelve en v1 (si la administración decide devolverla, la registra como gasto).
create or replace function cancelar_reserva(p_reserva uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas; v_admin boolean;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  v_admin := es_admin(r.edificio_id) and r.departamento_id is distinct from mi_departamento_en(r.edificio_id);
  if not (v_admin or es_de_mi_depto(r.departamento_id)) then raise exception 'No puedes cancelar esta reserva'; end if;
  if r.estado not in ('solicitada','pendiente_pago','confirmada') then raise exception 'Esta reserva ya no se puede cancelar'; end if;
  if not v_admin and r.inicio <= now() then raise exception 'La reserva ya empezó; pide a la administración que la cancele'; end if;
  if exists (select 1 from compromisos c where c.id in (r.compromiso_tarifa, r.compromiso_garantia) and c.estado = 'en_revision') then
    raise exception 'Hay un pago en revisión. Espera la validación antes de cancelar';
  end if;
  update compromisos set estado = 'anulado', anulado_motivo = 'Reserva cancelada'
  where id in (r.compromiso_tarifa, r.compromiso_garantia) and estado = 'pendiente';
  update reservas set estado = 'cancelada', nota = coalesce(nullif(trim(p_motivo), ''), nota),
    garantia_estado = case when garantia_estado = 'en_custodia' then 'por_devolver'
                           when garantia_estado = 'por_cobrar' then 'sin_garantia' else garantia_estado end,
    gestionada_por = case when v_admin then auth.uid() else gestionada_por end
  where id = p_reserva;
end $$;

-- Cierre después del uso (RN-35): devolver la garantía o retener todo o parte por daños
create or replace function cerrar_reserva(p_reserva uuid, p_retener numeric default 0, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  perform _exigir_gestor_reserva(r);
  if r.estado <> 'confirmada' then raise exception 'Solo se cierran reservas confirmadas'; end if;
  if r.fin > now() then raise exception 'La reserva aún no termina'; end if;
  if coalesce(p_retener, 0) < 0 or coalesce(p_retener, 0) > r.garantia_monto then
    raise exception 'El monto retenido debe estar entre 0 y la garantía (%)', r.garantia_monto;
  end if;
  if coalesce(p_retener, 0) > 0 and coalesce(trim(p_nota), '') = '' then raise exception 'Describe los daños para retener la garantía'; end if;
  update reservas set estado = 'usada', gestionada_por = auth.uid(), nota = coalesce(nullif(trim(p_nota), ''), nota),
    garantia_retenida = coalesce(p_retener, 0),
    garantia_estado = case when garantia_estado <> 'en_custodia' then garantia_estado
                           when coalesce(p_retener, 0) > 0 then 'retenida' else 'devuelta' end,
    garantia_cerrada_en = case when garantia_estado = 'en_custodia' then hoy_lima() else garantia_cerrada_en end
  where id = p_reserva;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (r.edificio_id, 'cerrar_reserva', 'reservas', p_reserva, jsonb_build_object('retenido', coalesce(p_retener, 0), 'nota', p_nota));
end $$;

-- Registrar la devolución de una garantía de reserva cancelada
create or replace function devolver_garantia(p_reserva uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reservas;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  perform _exigir_gestor_reserva(r);
  if r.garantia_estado <> 'por_devolver' then raise exception 'No hay garantía por devolver en esta reserva'; end if;
  update reservas set garantia_estado = 'devuelta', garantia_cerrada_en = hoy_lima(), gestionada_por = auth.uid() where id = p_reserva;
  insert into auditoria (edificio_id, accion, entidad, entidad_id) values (r.edificio_id, 'devolver_garantia', 'reservas', p_reserva);
end $$;

-- Expiración automática (RN-33): pendiente de pago vencido y sin pagos en revisión
create or replace function expirar_reservas() returns int
language plpgsql security definer set search_path = public as $$
declare r reservas; v_n int := 0;
begin
  for r in select * from reservas where estado = 'pendiente_pago' and vence_pago_en < now() for update loop
    continue when exists (select 1 from compromisos c where c.id in (r.compromiso_tarifa, r.compromiso_garantia) and c.estado = 'en_revision');
    update compromisos set estado = 'anulado', anulado_motivo = 'Reserva expirada por falta de pago'
    where id in (r.compromiso_tarifa, r.compromiso_garantia) and estado = 'pendiente';
    update reservas set estado = 'expirada',
      garantia_estado = (case when garantia_estado = 'en_custodia' then 'por_devolver' else 'sin_garantia' end)::estado_garantia
    where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function expirar_reservas() from public, anon, authenticated;
-- select cron.schedule('expirar-reservas', '*/15 * * * *', $$ select public.expirar_reservas(); $$);

-- Confirmación automática al validarse los pagos
create or replace function tg_compromiso_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
declare r reservas;
begin
  if new.estado <> 'pagado' or old.estado = 'pagado' or new.tipo not in ('reserva','garantia') then return null; end if;
  select * into r from reservas where compromiso_tarifa = new.id or compromiso_garantia = new.id for update;
  if not found then return null; end if;
  if new.tipo = 'garantia' then
    update reservas set garantia_estado = (case when estado in ('cancelada','expirada') then 'por_devolver' else 'en_custodia' end)::estado_garantia
    where id = r.id;
  end if;
  if r.estado = 'pendiente_pago' and not exists (
       select 1 from compromisos c where c.id in (r.compromiso_tarifa, r.compromiso_garantia) and c.estado <> 'pagado') then
    update reservas set estado = 'confirmada' where id = r.id;
  end if;
  return null;
end $$;
revoke execute on function tg_compromiso_reserva() from public, anon, authenticated;
create trigger compromiso_reserva after update of estado on compromisos for each row execute function tg_compromiso_reserva();

create trigger actividad after insert or update or delete on reservas      for each row execute function tg_actividad();
create trigger actividad after insert or update or delete on zonas_comunes for each row execute function tg_actividad();

-- =====================================================================
-- FINANZAS: la tarifa es ingreso; la garantía NO (RN-36).
-- Solo la garantía retenida por daños pasa a ingreso, en el mes en que se retiene.
-- =====================================================================
create or replace function resumen_periodo(p_periodo uuid)
returns table (mes date, saldo_anterior numeric, ingresos numeric, gastos numeric, acumulado numeric,
               oficial boolean, administrador text)
language sql stable security definer set search_path = public as $$
  with p as (
    select pe.*, e.saldo_inicial from periodos pe join edificios e on e.id = pe.edificio_id
    where pe.id = p_periodo and es_miembro(pe.edificio_id)),
  ing as (
    select coalesce(sum(pg.monto) filter (where pg.fecha_pago < p.mes), 0) as ant,
           coalesce(sum(pg.monto) filter (where date_trunc('month', pg.fecha_pago)::date = p.mes), 0) as act
    from p left join (pagos pg join compromisos c on c.id = pg.compromiso_id and c.tipo <> 'garantia')
      on pg.edificio_id = p.edificio_id and pg.estado = 'validado'),
  ret as (
    select coalesce(sum(r.garantia_retenida) filter (where r.garantia_cerrada_en < p.mes), 0) as ant,
           coalesce(sum(r.garantia_retenida) filter (where date_trunc('month', r.garantia_cerrada_en)::date = p.mes), 0) as act
    from p left join reservas r on r.edificio_id = p.edificio_id and r.garantia_estado = 'retenida'),
  gas as (
    select coalesce(sum(g.monto) filter (where pe2.mes < p.mes), 0) as ant,
           coalesce(sum(g.monto) filter (where pe2.mes = p.mes), 0) as act
    from p left join gastos g on g.edificio_id = p.edificio_id
           left join periodos pe2 on pe2.id = g.periodo_id)
  select p.mes,
         p.saldo_inicial + ing.ant + ret.ant - gas.ant,
         ing.act + ret.act, gas.act,
         p.saldo_inicial + ing.ant + ret.ant - gas.ant + ing.act + ret.act - gas.act,
         p.gastos_confirmados_en is not null,
         coalesce(p.titular_nombre, titular_nombre(p.edificio_id))
  from p, ing, ret, gas
$$;

drop function ingresos_por_tipo(uuid);
create or replace function ingresos_por_tipo(p_periodo uuid)
returns table (tipo text, monto numeric, pagos bigint)
language sql stable security definer set search_path = public as $$
  select c.tipo::text, sum(pg.monto), count(*)
  from periodos pe
  join pagos pg on pg.edificio_id = pe.edificio_id and pg.estado = 'validado'
               and date_trunc('month', pg.fecha_pago)::date = pe.mes
  join compromisos c on c.id = pg.compromiso_id and c.tipo <> 'garantia'
  where pe.id = p_periodo and es_miembro(pe.edificio_id)
  group by c.tipo
  union all
  select 'garantia_retenida', sum(r.garantia_retenida), count(*)
  from periodos pe join reservas r on r.edificio_id = pe.edificio_id and r.garantia_estado = 'retenida'
   and date_trunc('month', r.garantia_cerrada_en)::date = pe.mes
  where pe.id = p_periodo and es_miembro(pe.edificio_id)
  having count(*) > 0
$$;

-- Garantías en custodia: dinero de los vecinos, fuera del saldo del edificio
create or replace function garantias_en_custodia(p_edificio uuid)
returns table (en_custodia numeric, por_devolver numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(garantia_monto) filter (where garantia_estado = 'en_custodia'), 0),
         coalesce(sum(garantia_monto) filter (where garantia_estado = 'por_devolver'), 0)
  from reservas where edificio_id = p_edificio and es_miembro(p_edificio)
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table zonas_comunes enable row level security;
alter table bloqueos_zona enable row level security;
alter table reservas      enable row level security;

create policy zona_leer on zonas_comunes for select to authenticated using (es_miembro(edificio_id));
create policy zona_titular on zonas_comunes for all to authenticated using (es_titular(edificio_id)) with check (es_titular(edificio_id));

create policy bloq_leer on bloqueos_zona for select to authenticated
  using (es_miembro((select edificio_id from zonas_comunes where id = zona_id)));
create policy bloq_operar on bloqueos_zona for all to authenticated
  using (es_admin((select edificio_id from zonas_comunes where id = zona_id)))
  with check (es_admin((select edificio_id from zonas_comunes where id = zona_id)));

-- Los vecinos ven sus reservas; la ocupación de los demás solo por disponibilidad() (sin datos de quién reservó)
create policy res_leer on reservas for select to authenticated using (es_lector_admin(edificio_id) or es_de_mi_depto(departamento_id));
-- Sin escritura directa: todo pasa por las funciones
