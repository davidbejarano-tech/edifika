-- =====================================================================
-- Building Buddy · Esquema inicial (Supabase / PostgreSQL 15+)
-- Migración: supabase/migrations/0001_esquema_inicial.sql
-- Versión 1.1: jerarquía de administración (titular / coadministrador),
-- transferencias y validación cruzada de pagos propios.
--
-- Contenido
--   1. Tipos y utilidades
--   2. Tablas
--   3. Funciones de permisos
--   4. Vistas
--   5. Reglas de negocio financieras
--   6. Equipo de administración y transferencias
--   7. Triggers
--   8. Seguridad por fila (RLS)
--   9. Storage
--  10. Corte diario (pg_cron)
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. TIPOS Y UTILIDADES
-- =====================================================================
create type rol_membresia     as enum ('admin','habitante');
create type nivel_admin       as enum ('titular','operador','lectura');
  -- titular:  nivel 1, todos los permisos, único por edificio
  -- operador: nivel 2 (coadministrador), solo datos operativos; máximo 2
  -- lectura:  administrador saliente, solo lectura por 15 días tras una transferencia
create type estado_membresia  as enum ('activo','inactivo');
create type tipo_ocupacion    as enum ('propietario','inquilino');
create type tipo_calculo      as enum ('alicuota','mixta_agua');
create type estado_periodo    as enum ('abierto','cerrado');
create type tipo_gasto        as enum ('recurrente','extraordinario');
create type tipo_compromiso   as enum ('cuota','mora','extraordinario','adelanto','ajuste','reserva','garantia');
  -- reserva y garantia los usa el módulo Áreas comunes (0003)
create type estado_compromiso as enum ('pendiente','en_revision','pagado','anulado');
create type estado_pago       as enum ('en_revision','validado','rechazado');
create type estado_modulo     as enum ('activo','prueba','bloqueado');
create type plan_saas         as enum ('basico','pro','premium');

create or replace function hoy_lima() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

create or replace function mes_es(p date) returns text
language sql immutable as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                'setiembre','octubre','noviembre','diciembre'])[extract(month from p)::int]
         || ' ' || extract(year from p)::int
$$;

-- Días de acceso de solo lectura del administrador saliente
create or replace function dias_transicion() returns int language sql immutable as $$ select 15 $$;

-- =====================================================================
-- 2. TABLAS
-- =====================================================================
create table organizaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  plan        plan_saas not null default 'basico',
  created_at  timestamptz not null default now()
);

create table edificios (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references organizaciones on delete restrict,
  codigo                text not null unique check (codigo ~ '^[a-z0-9-]{3,30}$'),
  nombre                text not null,
  direccion             text not null,
  total_departamentos   int  not null check (total_departamentos > 0),
  area_total_m2         numeric(10,2) not null check (area_total_m2 > 0),
  tipo_calculo          tipo_calculo not null default 'alicuota',
  dia_corte             smallint not null default 15 check (dia_corte between 1 and 27),
  mora_monto            numeric(12,2) not null default 0 check (mora_monto >= 0),
  saldo_inicial         numeric(12,2) not null default 0,
  cuenta_bancaria       text,
  yape_plin             text,
  publicar_desglose     boolean not null default true,
  created_at            timestamptz not null default now()
  -- validador_designado_id se agrega después de crear perfiles
);

create table modulos_edificio (
  edificio_id   uuid not null references edificios on delete cascade,
  modulo        text not null check (modulo in ('areas_comunes','mantenimiento','marketplace')),
  estado        estado_modulo not null default 'bloqueado',
  prueba_hasta  date,
  primary key (edificio_id, modulo)
);

create table perfiles (
  id          uuid primary key references auth.users on delete cascade,
  nombre      text not null,
  telefono    text,
  created_at  timestamptz not null default now()
);

-- Vecino designado para validar los pagos del titular cuando no hay coadministrador
alter table edificios add column validador_designado_id uuid references perfiles on delete set null;

-- Equipo de Building Buddy (transferencias forzadas y soporte). Solo se gestiona con la service role.
create table plataforma_admins (
  perfil_id  uuid primary key references perfiles on delete cascade,
  created_at timestamptz not null default now()
);

create table departamentos (
  id           uuid primary key default gen_random_uuid(),
  edificio_id  uuid not null references edificios on delete cascade,
  numero       text not null check (numero ~ '^[0-9A-Za-z-]{1,8}$'),
  piso         smallint not null,
  area_m2      numeric(10,2) not null check (area_m2 > 0),
  created_at   timestamptz not null default now(),
  unique (edificio_id, numero),
  unique (id, edificio_id)
);

create table personas (
  id           uuid primary key default gen_random_uuid(),
  edificio_id  uuid not null references edificios on delete cascade,
  perfil_id    uuid references perfiles on delete set null,
  nombre       text not null,
  documento    text check (documento is null or char_length(documento) between 8 and 12),
  email        text,
  telefono     text,
  created_at   timestamptz not null default now()
);

create table ocupaciones (
  id               uuid primary key default gen_random_uuid(),
  departamento_id  uuid not null references departamentos on delete cascade,
  persona_id       uuid not null references personas on delete restrict,
  tipo             tipo_ocupacion not null,
  desde            date not null,
  hasta            date,
  activo           boolean generated always as (hasta is null) stored,
  check (hasta is null or hasta >= desde)
);
create unique index ocupacion_activa_unica on ocupaciones (departamento_id, tipo) where hasta is null;

-- Acceso de un perfil a un edificio. Un vecino administrador tiene DOS membresías:
-- una de habitante (su departamento) y una de admin (su nivel).
create table membresias (
  id               uuid primary key default gen_random_uuid(),
  edificio_id      uuid not null references edificios on delete cascade,
  perfil_id        uuid not null references perfiles on delete cascade,
  rol              rol_membresia not null,
  nivel            nivel_admin,
  departamento_id  uuid,
  estado           estado_membresia not null default 'activo',
  vigente_hasta    date,           -- solo para nivel 'lectura'
  baja_en          date,
  created_at       timestamptz not null default now(),
  foreign key (departamento_id, edificio_id) references departamentos (id, edificio_id),
  check ((rol = 'habitante') = (departamento_id is not null)),
  check ((rol = 'admin') = (nivel is not null)),
  check ((nivel = 'lectura') = (vigente_hasta is not null) or nivel is null)
);
create unique index habitante_activo_unico on membresias (departamento_id) where rol = 'habitante' and estado = 'activo';
create unique index admin_activo_unico on membresias (edificio_id, perfil_id) where rol = 'admin' and estado = 'activo';
create unique index titular_unico on membresias (edificio_id) where rol = 'admin' and nivel = 'titular' and estado = 'activo';

create table periodos (
  id                     uuid primary key default gen_random_uuid(),
  edificio_id            uuid not null references edificios on delete cascade,
  mes                    date not null check (extract(day from mes) = 1),
  estado                 estado_periodo not null default 'abierto',
  gastos_confirmados_en  timestamptz,
  confirmado_por         uuid references perfiles,
  titular_nombre         text,     -- titular al confirmar: es el que figura en el estado de cuenta oficial
  unique (edificio_id, mes),
  unique (id, edificio_id)
);
create unique index un_periodo_abierto on periodos (edificio_id) where estado = 'abierto';

create table gastos (
  id           uuid primary key default gen_random_uuid(),
  edificio_id  uuid not null,
  periodo_id   uuid not null,
  tipo         tipo_gasto not null,
  categoria    text not null,
  descripcion  text not null,
  monto        numeric(12,2) not null check (monto > 0),
  fecha        date not null,
  origen       text not null default 'manual' check (origen in ('manual','agua')),
  creado_por   uuid references perfiles default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (periodo_id, edificio_id) references periodos (id, edificio_id) on delete cascade
);
create unique index gasto_agua_unico on gastos (periodo_id) where origen = 'agua';

create table recibos_agua (
  periodo_id  uuid primary key references periodos on delete cascade,
  monto       numeric(12,2) not null check (monto >= 0),
  consumo_m3  numeric(10,2) not null check (consumo_m3 >= 0),
  riego_m3    numeric(10,2) not null default 0 check (riego_m3 >= 0),
  check (riego_m3 <= consumo_m3)
);

create table lecturas_agua (
  periodo_id       uuid not null references periodos on delete cascade,
  departamento_id  uuid not null references departamentos on delete cascade,
  m3               numeric(10,2) not null check (m3 >= 0),
  primary key (periodo_id, departamento_id)
);

create table compromisos (
  id               uuid primary key default gen_random_uuid(),
  edificio_id      uuid not null,
  departamento_id  uuid not null,
  mes              date not null check (extract(day from mes) = 1),
  tipo             tipo_compromiso not null,
  concepto         text not null,
  monto            numeric(12,2) not null check (monto > 0),
  emitido_en       date not null default hoy_lima(),
  vence_en         date not null,
  estado           estado_compromiso not null default 'pendiente',
  moroso           boolean not null default false,
  detalle          jsonb,
  anulado_motivo   text,
  created_at       timestamptz not null default now(),
  foreign key (departamento_id, edificio_id) references departamentos (id, edificio_id) on delete restrict
);
create unique index cuota_unica on compromisos (departamento_id, mes)
  where tipo in ('cuota','adelanto') and estado <> 'anulado';
create index compromisos_depto on compromisos (departamento_id, estado);

create table pagos (
  id                uuid primary key default gen_random_uuid(),
  edificio_id       uuid not null,
  departamento_id   uuid not null,
  compromiso_id     uuid not null references compromisos on delete restrict,
  monto             numeric(12,2) not null check (monto > 0),
  metodo            text not null,
  operacion         text,
  fecha_pago        date not null default hoy_lima(),
  comprobante_path  text,
  estado            estado_pago not null default 'en_revision',
  nota_rechazo      text,
  registrado_por    uuid references perfiles default auth.uid(),
  validado_por      uuid references perfiles,
  validado_en       timestamptz,
  created_at        timestamptz not null default now(),
  foreign key (departamento_id, edificio_id) references departamentos (id, edificio_id) on delete restrict
);
create unique index pago_en_revision_unico on pagos (compromiso_id) where estado = 'en_revision';
create index pagos_edificio_fecha on pagos (edificio_id, fecha_pago) where estado = 'validado';

create table cortes (
  periodo_id     uuid primary key references periodos on delete cascade,
  ejecutado_en   date not null,
  departamentos  uuid[] not null default '{}'
);

create table recibos (
  id               uuid primary key default gen_random_uuid(),
  edificio_id      uuid not null,
  departamento_id  uuid not null,
  mes              date not null,
  numero           text not null,
  total            numeric(12,2) not null,
  titular_nombre   text,           -- se completa solo al generar (trigger)
  pdf_path         text,
  enviado_en       timestamptz,
  canal            text check (canal in ('correo','whatsapp')),
  created_at       timestamptz not null default now(),
  unique (departamento_id, mes),
  foreign key (departamento_id, edificio_id) references departamentos (id, edificio_id) on delete cascade
);

create table mensajes (
  id           uuid primary key default gen_random_uuid(),
  edificio_id  uuid not null references edificios on delete cascade,
  autor_id     uuid not null references perfiles default auth.uid(),
  texto        text not null check (char_length(texto) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create table auditoria (
  id          bigint generated always as identity primary key,
  edificio_id uuid,
  actor       uuid default auth.uid(),
  accion      text not null,
  entidad     text not null,
  entidad_id  uuid,
  datos       jsonb,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 3. FUNCIONES DE PERMISOS
--    es_titular      → nivel 1: todo
--    es_admin        → titular u operador: puede ingresar datos operativos
--    es_lector_admin → cualquier nivel vigente (incluye saliente en transición): puede leer
-- =====================================================================
create or replace function nivel_admin_de(p_edificio uuid) returns nivel_admin
language sql stable security definer set search_path = public as $$
  select nivel from membresias
  where edificio_id = p_edificio and perfil_id = auth.uid() and rol = 'admin' and estado = 'activo'
    and (nivel <> 'lectura' or vigente_hasta >= hoy_lima())
  limit 1
$$;

create or replace function es_titular(p_edificio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(nivel_admin_de(p_edificio) = 'titular', false)
$$;

create or replace function es_admin(p_edificio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(nivel_admin_de(p_edificio) in ('titular','operador'), false)
$$;

create or replace function es_lector_admin(p_edificio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select nivel_admin_de(p_edificio) is not null
$$;

create or replace function es_miembro(p_edificio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_lector_admin(p_edificio) or exists (
    select 1 from membresias where edificio_id = p_edificio and perfil_id = auth.uid()
      and rol = 'habitante' and estado = 'activo')
$$;

create or replace function es_de_mi_depto(p_departamento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membresias
                 where departamento_id = p_departamento and perfil_id = auth.uid()
                   and rol = 'habitante' and estado = 'activo')
$$;

create or replace function edificio_de_depto(p_departamento uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select edificio_id from departamentos where id = p_departamento
$$;

create or replace function mi_departamento_en(p_edificio uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select departamento_id from membresias
  where edificio_id = p_edificio and perfil_id = auth.uid() and rol = 'habitante' and estado = 'activo'
  limit 1
$$;

create or replace function es_plataforma() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from plataforma_admins where perfil_id = auth.uid())
$$;

create or replace function titular_perfil(p_edificio uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select perfil_id from membresias
  where edificio_id = p_edificio and rol = 'admin' and nivel = 'titular' and estado = 'activo'
$$;

create or replace function titular_nombre(p_edificio uuid) returns text
language sql stable security definer set search_path = public as $$
  select nombre from perfiles where id = titular_perfil(p_edificio)
$$;

-- Departamento donde vive el titular (null si el titular es externo)
create or replace function depto_del_titular(p_edificio uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select departamento_id from membresias
  where edificio_id = p_edificio and perfil_id = titular_perfil(p_edificio)
    and rol = 'habitante' and estado = 'activo'
  limit 1
$$;

create or replace function hay_operador(p_edificio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membresias where edificio_id = p_edificio and rol = 'admin'
                 and nivel = 'operador' and estado = 'activo')
$$;

create or replace function es_validador_designado(p_edificio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from edificios where id = p_edificio and validador_designado_id = auth.uid())
     and es_miembro(p_edificio)
$$;

-- Segregación de funciones (RN-22):
--   · nadie valida pagos de su propio departamento;
--   · los pagos del departamento del titular los valida un coadministrador,
--     o el vecino designado si no hay coadministrador activo;
--   · los demás pagos los valida el titular o un coadministrador.
create or replace function puede_validar_pago(p_edificio uuid, p_departamento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_departamento = mi_departamento_en(p_edificio) then false
    when p_departamento = depto_del_titular(p_edificio) then
         coalesce(nivel_admin_de(p_edificio) = 'operador', false)
         or (es_validador_designado(p_edificio) and not hay_operador(p_edificio))
    else es_admin(p_edificio)
  end
$$;

-- =====================================================================
-- 4. VISTAS
-- =====================================================================
create view v_departamentos with (security_invoker = true) as
select d.*, round(d.area_m2 / e.area_total_m2, 6) as alicuota
from departamentos d join edificios e on e.id = d.edificio_id;

create view v_compromisos with (security_invoker = true) as
select c.*,
  case when c.estado in ('pagado','en_revision','anulado') then c.estado::text
       when c.vence_en < hoy_lima() then 'vencido'
       else 'pendiente' end as estado_visible,
  (c.estado in ('pendiente','en_revision')
     and not (c.tipo = 'adelanto' and c.vence_en >= hoy_lima())) as por_cobrar
from compromisos c;

-- Equipo de administración visible para el propio equipo
create view v_equipo_admin with (security_invoker = true) as
select m.edificio_id, m.perfil_id, p.nombre, m.nivel, m.vigente_hasta, m.created_at,
       (select departamento_id from membresias h where h.edificio_id = m.edificio_id
          and h.perfil_id = m.perfil_id and h.rol = 'habitante' and h.estado = 'activo' limit 1) as departamento_id
from membresias m join perfiles p on p.id = m.perfil_id
where m.rol = 'admin' and m.estado = 'activo';

-- =====================================================================
-- 5. REGLAS DE NEGOCIO FINANCIERAS
-- =====================================================================

-- 5.1 Cálculo de cuotas (ver RN-03)
create or replace function calcular_cuotas(p_periodo uuid)
returns table (departamento_id uuid, numero text, area_m2 numeric, alicuota numeric,
               comun numeric, m3 numeric, agua numeric, total numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ed edificios; v_agua recibos_agua; v_total numeric; v_mixta boolean;
  v_riego numeric := 0; v_agua_dep numeric := 0; v_comun numeric; v_sum_l numeric := 0;
begin
  select e.* into v_ed from edificios e join periodos p on p.edificio_id = e.id where p.id = p_periodo;
  if not found then raise exception 'Periodo no encontrado'; end if;
  if not es_miembro(v_ed.id) then raise exception 'Sin acceso a este edificio'; end if;

  select coalesce(sum(g.monto), 0) into v_total from gastos g where g.periodo_id = p_periodo;
  select * into v_agua from recibos_agua ra where ra.periodo_id = p_periodo;
  v_mixta := v_ed.tipo_calculo = 'mixta_agua' and v_agua.periodo_id is not null and v_agua.monto > 0;
  v_comun := v_total;

  if v_mixta then
    if v_agua.consumo_m3 > 0 then
      v_riego := v_agua.monto * least(v_agua.riego_m3, v_agua.consumo_m3) / v_agua.consumo_m3;
    end if;
    v_agua_dep := v_agua.monto - v_riego;
    v_comun    := v_total - v_agua.monto + v_riego;
    select coalesce(sum(l.m3), 0) into v_sum_l from lecturas_agua l where l.periodo_id = p_periodo;
  end if;

  return query
  select x.id, x.numero, x.area_m2, x.alic, x.comun, x.m3, x.agua, x.comun + x.agua
  from (
    select d.id, d.numero, d.area_m2,
           round(d.area_m2 / v_ed.area_total_m2, 6) as alic,
           round(v_comun * d.area_m2 / v_ed.area_total_m2, 2) as comun,
           coalesce(l.m3, 0)::numeric as m3,
           case when not v_mixta then 0::numeric
                when v_sum_l > 0 then round(v_agua_dep * coalesce(l.m3, 0) / v_sum_l, 2)
                else round(v_agua_dep * d.area_m2 / v_ed.area_total_m2, 2) end as agua
    from departamentos d
    left join lecturas_agua l on l.departamento_id = d.id and l.periodo_id = p_periodo
    where d.edificio_id = v_ed.id
  ) x
  order by x.numero;
end $$;

-- 5.2 Confirmar gastos (solo titular). Guarda el nombre del titular para el estado de cuenta oficial.
create or replace function confirmar_gastos(p_periodo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_ed uuid;
begin
  select edificio_id into v_ed from periodos where id = p_periodo;
  if not es_titular(v_ed) then raise exception 'Solo el administrador titular puede confirmar los gastos'; end if;
  update periodos set gastos_confirmados_en = now(), confirmado_por = auth.uid(), titular_nombre = titular_nombre(v_ed)
  where id = p_periodo and gastos_confirmados_en is null;
  insert into auditoria (edificio_id, accion, entidad, entidad_id) values (v_ed, 'confirmar_gastos', 'periodos', p_periodo);
end $$;

-- 5.3 Abrir el mes siguiente (solo titular)
create or replace function abrir_periodo(p_edificio uuid, p_recurrentes jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ed edificios; v_act periodos; v_nuevo uuid; v_mes date; v_vence date;
  r record; v_ad compromisos; v_total numeric; i jsonb; v_emitidas int := 0;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular puede abrir un periodo'; end if;
  select * into v_ed from edificios where id = p_edificio;
  select * into v_act from periodos where edificio_id = p_edificio and estado = 'abierto' for update;
  if not found then raise exception 'No hay un periodo abierto'; end if;
  if v_act.gastos_confirmados_en is null then
    raise exception 'Confirma los gastos de % antes de abrir el siguiente mes', mes_es(v_act.mes);
  end if;
  select coalesce(sum(monto), 0) into v_total from gastos where periodo_id = v_act.id;
  if v_total <= 0 then raise exception 'No hay gastos en % para calcular las cuotas', mes_es(v_act.mes); end if;

  v_mes   := (v_act.mes + interval '1 month')::date;
  v_vence := v_mes + (v_ed.dia_corte - 1);

  update periodos set estado = 'cerrado' where id = v_act.id;
  insert into periodos (edificio_id, mes) values (p_edificio, v_mes) returning id into v_nuevo;

  for r in select * from calcular_cuotas(v_act.id) loop
    select * into v_ad from compromisos
    where departamento_id = r.departamento_id and mes = v_mes and tipo = 'adelanto' and estado <> 'anulado';
    if found then
      update compromisos set detalle = jsonb_build_object('base_mes', v_act.mes, 'alicuota', r.alicuota,
                                                          'comun', r.comun, 'm3', r.m3, 'agua', r.agua)
      where id = v_ad.id;
      if r.total - v_ad.monto > 0 then
        insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, emitido_en, vence_en)
        values (p_edificio, r.departamento_id, v_mes, 'ajuste', 'Ajuste de cuota adelantada, ' || mes_es(v_mes),
                r.total - v_ad.monto, v_mes, v_vence);
      end if;
    elsif r.total > 0 then
      insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, emitido_en, vence_en, detalle)
      values (p_edificio, r.departamento_id, v_mes, 'cuota', 'Cuota de mantenimiento, ' || mes_es(v_mes),
              r.total, v_mes, v_vence,
              jsonb_build_object('base_mes', v_act.mes, 'alicuota', r.alicuota, 'comun', r.comun, 'm3', r.m3, 'agua', r.agua));
      v_emitidas := v_emitidas + 1;
    end if;
  end loop;

  for i in select * from jsonb_array_elements(coalesce(p_recurrentes, '[]'::jsonb)) loop
    if coalesce((i->>'monto')::numeric, 0) > 0 then
      insert into gastos (edificio_id, periodo_id, tipo, categoria, descripcion, monto, fecha)
      values (p_edificio, v_nuevo, 'recurrente', i->>'categoria',
              coalesce(nullif(i->>'descripcion', ''), i->>'categoria'), (i->>'monto')::numeric, v_mes);
    end if;
  end loop;

  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'abrir_periodo', 'periodos', v_nuevo, jsonb_build_object('mes', v_mes, 'cuotas', v_emitidas));
  return v_nuevo;
end $$;

-- 5.4 Corte automático diario (pg_cron). Idempotente.
create or replace function ejecutar_cortes() returns int
language plpgsql security definer set search_path = public as $$
declare p record; v_deps uuid[]; v_n int := 0;
begin
  for p in
    select pe.id, pe.edificio_id, pe.mes, e.mora_monto
    from periodos pe join edificios e on e.id = pe.edificio_id
    where not exists (select 1 from cortes c where c.periodo_id = pe.id)
      and hoy_lima() > pe.mes + (e.dia_corte - 1)
  loop
    with m as (
      update compromisos set moroso = true
      where edificio_id = p.edificio_id and mes = p.mes and tipo in ('cuota','adelanto')
        and estado = 'pendiente' and vence_en < hoy_lima()
      returning departamento_id)
    select coalesce(array_agg(distinct departamento_id), '{}') into v_deps from m;

    if p.mora_monto > 0 and cardinality(v_deps) > 0 then
      insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, emitido_en, vence_en)
      select p.edificio_id, d, p.mes, 'mora', 'Mora por pago fuera de plazo, ' || mes_es(p.mes),
             p.mora_monto, hoy_lima(), (p.mes + interval '1 month - 1 day')::date
      from unnest(v_deps) d;
    end if;

    insert into cortes (periodo_id, ejecutado_en, departamentos) values (p.id, hoy_lima(), v_deps);
    insert into auditoria (edificio_id, actor, accion, entidad, entidad_id, datos)
    values (p.edificio_id, null, 'corte_automatico', 'periodos', p.id, jsonb_build_object('departamentos', v_deps));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- 5.5 Validación de pagos con segregación de funciones (RN-22)
create or replace function exigir_puede_validar(p_edificio uuid, p_departamento uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_departamento = mi_departamento_en(p_edificio) then
    raise exception 'No puedes validar ni registrar pagos de tu propio departamento';
  end if;
  if not puede_validar_pago(p_edificio, p_departamento) then
    if p_departamento = depto_del_titular(p_edificio) then
      raise exception 'Los pagos del departamento del titular los valida un coadministrador o, si no hay, el vecino designado';
    end if;
    raise exception 'No tienes permiso para validar este pago';
  end if;
end $$;

create or replace function validar_pago(p_pago uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v pagos;
begin
  select * into v from pagos where id = p_pago for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  perform exigir_puede_validar(v.edificio_id, v.departamento_id);
  if v.estado <> 'en_revision' then raise exception 'El pago ya fue procesado'; end if;
  update pagos set estado = 'validado', validado_por = auth.uid(), validado_en = now() where id = p_pago;
  update compromisos set estado = 'pagado' where id = v.compromiso_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id) values (v.edificio_id, 'validar_pago', 'pagos', p_pago);
end $$;

create or replace function rechazar_pago(p_pago uuid, p_nota text) returns void
language plpgsql security definer set search_path = public as $$
declare v pagos;
begin
  if coalesce(trim(p_nota), '') = '' then raise exception 'Indica el motivo del rechazo'; end if;
  select * into v from pagos where id = p_pago for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  perform exigir_puede_validar(v.edificio_id, v.departamento_id);
  if v.estado <> 'en_revision' then raise exception 'El pago ya fue procesado'; end if;
  update pagos set estado = 'rechazado', nota_rechazo = trim(p_nota), validado_por = auth.uid(), validado_en = now() where id = p_pago;
  update compromisos set estado = 'pendiente' where id = v.compromiso_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v.edificio_id, 'rechazar_pago', 'pagos', p_pago, jsonb_build_object('nota', p_nota));
end $$;

create or replace function registrar_pago_efectivo(p_compromiso uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare c compromisos; v_id uuid;
begin
  select * into c from compromisos where id = p_compromiso for update;
  if not found then raise exception 'Compromiso no encontrado'; end if;
  perform exigir_puede_validar(c.edificio_id, c.departamento_id);
  insert into pagos (edificio_id, departamento_id, compromiso_id, monto, metodo, estado, validado_por, validado_en)
  values (c.edificio_id, c.departamento_id, c.id, c.monto, 'Efectivo', 'validado', auth.uid(), now())
  returning id into v_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id) values (c.edificio_id, 'pago_efectivo', 'pagos', v_id);
  return v_id;
end $$;

-- 5.6 Adelantos del habitante
create or replace function solicitar_adelanto(p_meses int) returns int
language plpgsql security definer set search_path = public as $$
declare v_m membresias; v_ed edificios; v_mes date; v_est numeric; v_n int := 0; k int;
begin
  if p_meses not between 1 and 6 then raise exception 'Puedes adelantar entre 1 y 6 meses'; end if;
  select * into v_m from membresias where perfil_id = auth.uid() and rol = 'habitante' and estado = 'activo' limit 1;
  if not found then raise exception 'Solo un habitante puede solicitar adelantos'; end if;
  select * into v_ed from edificios where id = v_m.edificio_id;
  select mes into v_mes from periodos where edificio_id = v_ed.id and estado = 'abierto';
  select monto into v_est from compromisos
  where departamento_id = v_m.departamento_id and tipo in ('cuota','adelanto') and estado <> 'anulado'
  order by mes desc limit 1;
  if v_est is null then raise exception 'Aún no hay una cuota de referencia para estimar el adelanto'; end if;
  for k in 1..p_meses loop
    v_mes := (v_mes + interval '1 month')::date;
    if not exists (select 1 from compromisos where departamento_id = v_m.departamento_id and mes = v_mes
                   and tipo in ('cuota','adelanto') and estado <> 'anulado') then
      insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, vence_en)
      values (v_ed.id, v_m.departamento_id, v_mes, 'adelanto', 'Cuota adelantada, ' || mes_es(v_mes),
              v_est, v_mes + (v_ed.dia_corte - 1));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- 5.7 Compromiso extraordinario (solo titular)
create or replace function emitir_extraordinario(p_edificio uuid, p_concepto text, p_monto numeric,
  p_reparto text, p_vence date, p_departamento uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_mes date; v_area numeric; v_n int;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular emite compromisos'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  select mes into v_mes from periodos where edificio_id = p_edificio and estado = 'abierto';
  select sum(area_m2) into v_area from departamentos
  where edificio_id = p_edificio and (p_departamento is null or id = p_departamento);
  insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, vence_en)
  select p_edificio, d.id, v_mes, 'extraordinario', p_concepto,
         case when p_reparto = 'alicuota' then round(p_monto * d.area_m2 / v_area, 2) else p_monto end, p_vence
  from departamentos d
  where d.edificio_id = p_edificio and (p_departamento is null or d.id = p_departamento);
  get diagnostics v_n = row_count;
  insert into auditoria (edificio_id, accion, entidad, datos)
  values (p_edificio, 'emitir_extraordinario', 'compromisos', jsonb_build_object('concepto', p_concepto, 'monto', p_monto, 'cantidad', v_n));
  return v_n;
end $$;

-- 5.8 Anular un compromiso (solo titular, nunca de su propio departamento)
create or replace function anular_compromiso(p_compromiso uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare c compromisos;
begin
  select * into c from compromisos where id = p_compromiso for update;
  if not found then raise exception 'Compromiso no encontrado'; end if;
  if not es_titular(c.edificio_id) then raise exception 'Solo el administrador titular puede anular compromisos'; end if;
  if c.departamento_id = mi_departamento_en(c.edificio_id) then raise exception 'No puedes anular compromisos de tu propio departamento'; end if;
  if c.estado <> 'pendiente' then raise exception 'Solo se anulan compromisos pendientes'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la anulación'; end if;
  update compromisos set estado = 'anulado', anulado_motivo = trim(p_motivo) where id = p_compromiso;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (c.edificio_id, 'anular_compromiso', 'compromisos', p_compromiso, jsonb_build_object('motivo', p_motivo, 'monto', c.monto));
end $$;

-- 5.9 Cambio de ocupante (solo titular). La cuenta la crea la Edge Function "invitar-habitante".
create or replace function registrar_cambio_ocupante(p_departamento uuid, p_tipo tipo_ocupacion,
  p_nombre text, p_documento text, p_email text, p_telefono text, p_desde date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ed uuid := edificio_de_depto(p_departamento); v_persona uuid;
begin
  if not es_titular(v_ed) then raise exception 'Solo el administrador titular registra cambios de ocupante'; end if;
  update membresias set estado = 'inactivo', baja_en = p_desde
  where departamento_id = p_departamento and rol = 'habitante' and estado = 'activo';
  update ocupaciones set hasta = p_desde
  where departamento_id = p_departamento and hasta is null
    and (tipo = p_tipo or p_tipo = 'propietario');
  insert into personas (edificio_id, nombre, documento, email, telefono)
  values (v_ed, p_nombre, nullif(p_documento, ''), nullif(p_email, ''), nullif(p_telefono, ''))
  returning id into v_persona;
  insert into ocupaciones (departamento_id, persona_id, tipo, desde) values (p_departamento, v_persona, p_tipo, p_desde);
  -- Si el validador designado vivía ahí, pierde la designación
  update edificios set validador_designado_id = null
  where id = v_ed and validador_designado_id is not null
    and not exists (select 1 from membresias m where m.perfil_id = validador_designado_id
                    and m.edificio_id = v_ed and m.estado = 'activo');
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v_ed, 'cambio_ocupante', 'departamentos', p_departamento, jsonb_build_object('tipo', p_tipo, 'persona', v_persona));
  return v_persona;
end $$;

-- 5.10 Estado de cuenta: totales y titular que figura en el documento (RN-14, RN-24)
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
    from p left join pagos pg on pg.edificio_id = p.edificio_id and pg.estado = 'validado'),
  gas as (
    select coalesce(sum(g.monto) filter (where pe2.mes < p.mes), 0) as ant,
           coalesce(sum(g.monto) filter (where pe2.mes = p.mes), 0) as act
    from p left join gastos g on g.edificio_id = p.edificio_id
           left join periodos pe2 on pe2.id = g.periodo_id)
  select p.mes, p.saldo_inicial + ing.ant - gas.ant, ing.act, gas.act,
         p.saldo_inicial + ing.ant - gas.ant + ing.act - gas.act,
         p.gastos_confirmados_en is not null,
         coalesce(p.titular_nombre, titular_nombre(p.edificio_id))
  from p, ing, gas
$$;

create or replace function ingresos_por_tipo(p_periodo uuid)
returns table (tipo tipo_compromiso, monto numeric, pagos bigint)
language sql stable security definer set search_path = public as $$
  select c.tipo, sum(pg.monto), count(*)
  from periodos pe
  join pagos pg on pg.edificio_id = pe.edificio_id and pg.estado = 'validado'
               and date_trunc('month', pg.fecha_pago)::date = pe.mes
  join compromisos c on c.id = pg.compromiso_id
  where pe.id = p_periodo and es_miembro(pe.edificio_id)
  group by c.tipo
$$;

create or replace function cuentas_por_cobrar(p_edificio uuid)
returns table (departamento_id uuid, numero text, pendiente numeric, vencido numeric)
language sql stable security definer set search_path = public as $$
  select d.id, d.numero,
         coalesce(sum(c.monto) filter (where c.estado in ('pendiente','en_revision')
                  and not (c.tipo = 'adelanto' and c.vence_en >= hoy_lima())), 0),
         coalesce(sum(c.monto) filter (where c.estado = 'pendiente' and c.vence_en < hoy_lima()), 0)
  from departamentos d
  join edificios e on e.id = d.edificio_id
  left join compromisos c on c.departamento_id = d.id
  where d.edificio_id = p_edificio
    and (es_lector_admin(p_edificio) or (es_miembro(p_edificio) and e.publicar_desglose))
  group by d.id, d.numero
  order by d.numero
$$;

create or replace function activar_prueba(p_edificio uuid, p_modulo text) returns date
language plpgsql security definer set search_path = public as $$
declare v modulos_edificio; v_hasta date := hoy_lima() + 14;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular activa pruebas'; end if;
  select * into v from modulos_edificio where edificio_id = p_edificio and modulo = p_modulo;
  if found and v.prueba_hasta is not null then raise exception 'La prueba de este módulo ya se usó'; end if;
  insert into modulos_edificio (edificio_id, modulo, estado, prueba_hasta) values (p_edificio, p_modulo, 'prueba', v_hasta)
  on conflict (edificio_id, modulo) do update set estado = 'prueba', prueba_hasta = v_hasta;
  return v_hasta;
end $$;

-- =====================================================================
-- 6. EQUIPO DE ADMINISTRACIÓN Y TRANSFERENCIAS (RN-19 a RN-23)
--    Las altas de externos las hace la Edge Function "invitar-administrador":
--    crea la cuenta en Auth y el perfil, y luego llama a agregar_coadministrador.
-- =====================================================================

-- 6.1 Agregar coadministrador (máximo 2)
create or replace function agregar_coadministrador(p_edificio uuid, p_perfil uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_actual membresias;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular gestiona el equipo de administración'; end if;
  if not exists (select 1 from perfiles where id = p_perfil) then raise exception 'La persona no tiene cuenta. Invítala primero'; end if;
  select * into v_actual from membresias
  where edificio_id = p_edificio and perfil_id = p_perfil and rol = 'admin' and estado = 'activo' for update;
  if found and v_actual.nivel in ('titular','operador') then raise exception 'Esta persona ya es parte del equipo de administración'; end if;
  if (select count(*) from membresias where edificio_id = p_edificio and rol = 'admin' and nivel = 'operador' and estado = 'activo') >= 2 then
    raise exception 'El edificio ya tiene 2 coadministradores, el máximo permitido';
  end if;
  if found then   -- administrador saliente en transición que vuelve como coadministrador
    update membresias set nivel = 'operador', vigente_hasta = null where id = v_actual.id returning id into v_id;
  else
    insert into membresias (edificio_id, perfil_id, rol, nivel) values (p_edificio, p_perfil, 'admin', 'operador') returning id into v_id;
  end if;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'agregar_coadministrador', 'membresias', v_id, jsonb_build_object('perfil', p_perfil));
  return v_id;
end $$;

-- 6.2 Quitar coadministrador
create or replace function quitar_coadministrador(p_edificio uuid, p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular gestiona el equipo de administración'; end if;
  update membresias set estado = 'inactivo', baja_en = hoy_lima()
  where edificio_id = p_edificio and perfil_id = p_perfil and rol = 'admin' and nivel = 'operador' and estado = 'activo';
  if not found then raise exception 'Esta persona no es coadministrador del edificio'; end if;
  insert into auditoria (edificio_id, accion, entidad, datos)
  values (p_edificio, 'quitar_coadministrador', 'membresias', jsonb_build_object('perfil', p_perfil));
end $$;

-- 6.3 Designar al vecino que valida los pagos del titular (null = quitar designación)
create or replace function designar_validador(p_edificio uuid, p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_dep uuid;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular designa al validador'; end if;
  if p_perfil is not null then
    if p_perfil = titular_perfil(p_edificio) then raise exception 'El titular no puede designarse a sí mismo'; end if;
    select departamento_id into v_dep from membresias
    where edificio_id = p_edificio and perfil_id = p_perfil and rol = 'habitante' and estado = 'activo';
    if v_dep is null then raise exception 'El validador debe ser un vecino con acceso activo'; end if;
    if v_dep = depto_del_titular(p_edificio) then raise exception 'El validador no puede vivir en el departamento del titular'; end if;
  end if;
  update edificios set validador_designado_id = p_perfil where id = p_edificio;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'designar_validador', 'edificios', p_edificio, jsonb_build_object('perfil', p_perfil));
end $$;

-- 6.4 Transferencia de titularidad (interna). p_saliente: 'lectura' (15 días) u 'operador'.
create or replace function _transferir_titularidad(p_edificio uuid, p_nuevo uuid, p_saliente text,
  p_forzada boolean, p_acta text) returns void
language plpgsql security definer set search_path = public as $$
declare v_old membresias; v_new membresias;
begin
  if p_saliente not in ('lectura','operador') then raise exception 'Opción de salida no válida'; end if;
  if not exists (select 1 from perfiles where id = p_nuevo) then raise exception 'La persona no tiene cuenta. Invítala primero'; end if;
  select * into v_old from membresias
  where edificio_id = p_edificio and rol = 'admin' and nivel = 'titular' and estado = 'activo' for update;

  if found then
    if v_old.perfil_id = p_nuevo then raise exception 'Esta persona ya es el titular'; end if;
    if p_saliente = 'operador' then
      update membresias set nivel = 'operador', vigente_hasta = null where id = v_old.id;
    else
      update membresias set nivel = 'lectura', vigente_hasta = hoy_lima() + dias_transicion() where id = v_old.id;
    end if;
  end if;

  select * into v_new from membresias
  where edificio_id = p_edificio and perfil_id = p_nuevo and rol = 'admin' and estado = 'activo' for update;
  if found then
    update membresias set nivel = 'titular', vigente_hasta = null where id = v_new.id;
  else
    insert into membresias (edificio_id, perfil_id, rol, nivel) values (p_edificio, p_nuevo, 'admin', 'titular');
  end if;

  if (select count(*) from membresias where edificio_id = p_edificio and rol = 'admin' and nivel = 'operador' and estado = 'activo') > 2 then
    raise exception 'Con este cambio habría más de 2 coadministradores. Elige que el saliente quede solo con lectura';
  end if;

  -- El validador designado no puede vivir con el nuevo titular ni ser él mismo
  update edificios set validador_designado_id = null
  where id = p_edificio and (validador_designado_id = p_nuevo
     or exists (select 1 from membresias m where m.perfil_id = validador_designado_id and m.edificio_id = p_edificio
                and m.rol = 'habitante' and m.estado = 'activo' and m.departamento_id = depto_del_titular(p_edificio)));

  insert into auditoria (edificio_id, accion, entidad, datos)
  values (p_edificio, case when p_forzada then 'transferencia_forzada' else 'transferir_titularidad' end, 'membresias',
          jsonb_build_object('saliente', v_old.perfil_id, 'entrante', p_nuevo, 'saliente_queda', p_saliente, 'acta', p_acta));
end $$;
revoke execute on function _transferir_titularidad(uuid, uuid, text, boolean, text) from public, anon, authenticated;

-- 6.5 Transferencia voluntaria: la hace el titular
create or replace function transferir_titularidad(p_edificio uuid, p_nuevo uuid, p_saliente text default 'lectura') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular puede transferir la administración'; end if;
  perform _transferir_titularidad(p_edificio, p_nuevo, p_saliente, false, null);
end $$;

-- 6.6 Transferencia forzada: la hace Building Buddy con el acta de la junta (el saliente queda en lectura)
create or replace function transferencia_forzada(p_edificio uuid, p_nuevo uuid, p_acta_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_plataforma() then raise exception 'Solo el equipo de Building Buddy puede hacer una transferencia forzada'; end if;
  if coalesce(trim(p_acta_path), '') = '' then raise exception 'Adjunta el acta de la junta de propietarios'; end if;
  perform _transferir_titularidad(p_edificio, p_nuevo, 'lectura', true, p_acta_path);
end $$;

-- 6.7 Edificios que administra el usuario (selector de edificio para externos)
create or replace function mis_edificios()
returns table (edificio_id uuid, nombre text, codigo text, nivel nivel_admin, departamento_id uuid)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.codigo,
         (select m.nivel from membresias m where m.edificio_id = e.id and m.perfil_id = auth.uid() and m.rol = 'admin'
            and m.estado = 'activo' and (m.nivel <> 'lectura' or m.vigente_hasta >= hoy_lima()) limit 1),
         (select m.departamento_id from membresias m where m.edificio_id = e.id and m.perfil_id = auth.uid()
            and m.rol = 'habitante' and m.estado = 'activo' limit 1)
  from edificios e
  where es_miembro(e.id)
  order by e.nombre
$$;

-- =====================================================================
-- 7. TRIGGERS
-- =====================================================================
create or replace function tg_bloquear_periodo_confirmado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_conf timestamptz;
begin
  select gastos_confirmados_en into v_conf from periodos
  where id = coalesce(case when tg_op = 'DELETE' then null else new.periodo_id end, old.periodo_id);
  if v_conf is not null then raise exception 'Los gastos de este periodo ya están confirmados'; end if;
  return coalesce(new, old);
end $$;
create trigger bloquear_gastos   before insert or update or delete on gastos        for each row execute function tg_bloquear_periodo_confirmado();
create trigger bloquear_agua     before insert or update or delete on recibos_agua  for each row execute function tg_bloquear_periodo_confirmado();
create trigger bloquear_lecturas before insert or update or delete on lecturas_agua for each row execute function tg_bloquear_periodo_confirmado();

create or replace function tg_sync_agua() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ed uuid; v_mes date;
begin
  if tg_op = 'DELETE' then
    delete from gastos where periodo_id = old.periodo_id and origen = 'agua';
    return old;
  end if;
  select edificio_id, mes into v_ed, v_mes from periodos where id = new.periodo_id;
  if new.monto > 0 then
    insert into gastos (edificio_id, periodo_id, tipo, categoria, descripcion, monto, fecha, origen)
    values (v_ed, new.periodo_id, 'recurrente', 'Agua', 'Recibo de agua del edificio', new.monto, v_mes + 9, 'agua')
    on conflict (periodo_id) where origen = 'agua' do update set monto = excluded.monto;
  else
    delete from gastos where periodo_id = new.periodo_id and origen = 'agua';
  end if;
  return new;
end $$;
create trigger sync_agua after insert or update or delete on recibos_agua for each row execute function tg_sync_agua();

create or replace function tg_pago_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare c compromisos;
begin
  select * into c from compromisos where id = new.compromiso_id for update;
  if not found then raise exception 'Compromiso no encontrado'; end if;
  if c.estado <> 'pendiente' then raise exception 'Este compromiso no está pendiente de pago'; end if;
  new.edificio_id     := c.edificio_id;
  new.departamento_id := c.departamento_id;
  new.monto           := c.monto;
  return new;
end $$;
create trigger pago_antes before insert on pagos for each row execute function tg_pago_antes();

create or replace function tg_pago_despues() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update compromisos
  set estado = case new.estado when 'validado' then 'pagado'::estado_compromiso else 'en_revision'::estado_compromiso end
  where id = new.compromiso_id;
  return new;
end $$;
create trigger pago_despues after insert on pagos for each row execute function tg_pago_despues();

-- El recibo guarda al titular vigente al generarse
create or replace function tg_recibo_titular() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.titular_nombre := coalesce(new.titular_nombre, titular_nombre(new.edificio_id));
  return new;
end $$;
create trigger recibo_titular before insert on recibos for each row execute function tg_recibo_titular();

-- =====================================================================
-- 8. SEGURIDAD POR FILA (RLS)
--    Lectura: todo el equipo de administración (incluido el saliente en transición).
--    Datos operativos (gastos, agua, lecturas, recibos): titular y coadministradores.
--    Estructura (edificio, departamentos, personas, ocupantes, usuarios): solo titular.
--    Compromisos, pagos y membresías solo cambian mediante funciones (sin escritura directa).
-- =====================================================================
alter table organizaciones    enable row level security;
alter table edificios         enable row level security;
alter table modulos_edificio  enable row level security;
alter table perfiles          enable row level security;
alter table plataforma_admins enable row level security;
alter table departamentos     enable row level security;
alter table personas          enable row level security;
alter table ocupaciones       enable row level security;
alter table membresias        enable row level security;
alter table periodos          enable row level security;
alter table gastos            enable row level security;
alter table recibos_agua      enable row level security;
alter table lecturas_agua     enable row level security;
alter table compromisos       enable row level security;
alter table pagos             enable row level security;
alter table cortes            enable row level security;
alter table recibos           enable row level security;
alter table mensajes          enable row level security;
alter table auditoria         enable row level security;

create policy org_leer on organizaciones for select to authenticated
  using (exists (select 1 from edificios e where e.organizacion_id = organizaciones.id and es_miembro(e.id)));

create policy edif_leer on edificios for select to authenticated using (es_miembro(id));
create policy edif_editar on edificios for update to authenticated using (es_titular(id)) with check (es_titular(id));

create policy mod_leer on modulos_edificio for select to authenticated using (es_miembro(edificio_id));

create policy perfil_leer on perfiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from membresias m1 join membresias m2 on m1.edificio_id = m2.edificio_id
    where m1.perfil_id = auth.uid() and m1.estado = 'activo' and m2.perfil_id = perfiles.id));
create policy perfil_editar on perfiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy dep_leer on departamentos for select to authenticated using (es_miembro(edificio_id));
create policy dep_titular on departamentos for all to authenticated using (es_titular(edificio_id)) with check (es_titular(edificio_id));

create policy per_leer on personas for select to authenticated using (
  es_lector_admin(edificio_id) or perfil_id = auth.uid()
  or exists (select 1 from ocupaciones o where o.persona_id = personas.id and es_de_mi_depto(o.departamento_id)));
create policy per_titular on personas for all to authenticated using (es_titular(edificio_id)) with check (es_titular(edificio_id));

create policy ocu_leer on ocupaciones for select to authenticated
  using (es_lector_admin(edificio_de_depto(departamento_id)) or es_de_mi_depto(departamento_id));
create policy ocu_titular on ocupaciones for all to authenticated
  using (es_titular(edificio_de_depto(departamento_id))) with check (es_titular(edificio_de_depto(departamento_id)));

-- Membresías: solo lectura; los cambios pasan por funciones o Edge Functions
create policy mem_leer on membresias for select to authenticated using (perfil_id = auth.uid() or es_lector_admin(edificio_id));

create policy periodos_leer on periodos for select to authenticated using (es_miembro(edificio_id));

create policy gas_leer on gastos for select to authenticated using (es_miembro(edificio_id));
create policy gas_insert on gastos for insert to authenticated with check (es_admin(edificio_id) and origen = 'manual');
create policy gas_update on gastos for update to authenticated using (es_admin(edificio_id) and origen = 'manual') with check (es_admin(edificio_id) and origen = 'manual');
create policy gas_delete on gastos for delete to authenticated using (es_admin(edificio_id) and origen = 'manual');

create policy agua_leer on recibos_agua for select to authenticated
  using (es_miembro((select edificio_id from periodos where id = periodo_id)));
create policy agua_operar on recibos_agua for all to authenticated
  using (es_admin((select edificio_id from periodos where id = periodo_id)))
  with check (es_admin((select edificio_id from periodos where id = periodo_id)));

create policy lect_leer on lecturas_agua for select to authenticated
  using (es_lector_admin(edificio_de_depto(departamento_id)) or es_de_mi_depto(departamento_id));
create policy lect_operar on lecturas_agua for all to authenticated
  using (es_admin(edificio_de_depto(departamento_id))) with check (es_admin(edificio_de_depto(departamento_id)));

create policy comp_leer on compromisos for select to authenticated using (
  es_lector_admin(edificio_id) or es_de_mi_depto(departamento_id)
  or (es_validador_designado(edificio_id) and departamento_id = depto_del_titular(edificio_id)));

create policy pago_leer on pagos for select to authenticated using (
  es_lector_admin(edificio_id) or es_de_mi_depto(departamento_id)
  or (es_validador_designado(edificio_id) and departamento_id = depto_del_titular(edificio_id)));
create policy pago_habitante on pagos for insert to authenticated
  with check (es_de_mi_depto(departamento_id) and estado = 'en_revision' and registrado_por = auth.uid());

create policy corte_leer on cortes for select to authenticated
  using (es_miembro((select edificio_id from periodos where id = periodo_id)));

create policy rec_leer on recibos for select to authenticated using (es_lector_admin(edificio_id) or es_de_mi_depto(departamento_id));
create policy rec_operar on recibos for all to authenticated using (es_admin(edificio_id)) with check (es_admin(edificio_id));

create policy msg_leer on mensajes for select to authenticated using (es_miembro(edificio_id));
create policy msg_enviar on mensajes for insert to authenticated with check (es_miembro(edificio_id) and autor_id = auth.uid());

create policy aud_leer on auditoria for select to authenticated using (es_lector_admin(edificio_id));

-- plataforma_admins: sin políticas (solo service role)

revoke execute on function ejecutar_cortes() from public, anon, authenticated;
revoke execute on function tg_bloquear_periodo_confirmado() from public, anon, authenticated;
revoke execute on function tg_sync_agua() from public, anon, authenticated;
revoke execute on function tg_pago_antes() from public, anon, authenticated;
revoke execute on function tg_pago_despues() from public, anon, authenticated;
revoke execute on function tg_recibo_titular() from public, anon, authenticated;

-- =====================================================================
-- 9. STORAGE (buckets privados)
--    comprobantes/{edificio_id}/{departamento_id}/{uuid}.{ext}
--    recibos/{edificio_id}/{departamento_id}/{AAAAMM}.pdf
--    actas/{edificio_id}/{uuid}.pdf   (transferencias forzadas; solo service role)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('recibos', 'recibos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('actas', 'actas', false) on conflict (id) do nothing;

create policy comprobantes_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'comprobantes' and es_de_mi_depto(((storage.foldername(name))[2])::uuid));
create policy comprobantes_leer on storage.objects for select to authenticated using (
  bucket_id = 'comprobantes' and (
    es_lector_admin(((storage.foldername(name))[1])::uuid)
    or es_de_mi_depto(((storage.foldername(name))[2])::uuid)
    or (es_validador_designado(((storage.foldername(name))[1])::uuid)
        and ((storage.foldername(name))[2])::uuid = depto_del_titular(((storage.foldername(name))[1])::uuid))));
create policy recibos_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'recibos' and es_admin(((storage.foldername(name))[1])::uuid));
create policy recibos_leer on storage.objects for select to authenticated using (
  bucket_id = 'recibos' and (es_lector_admin(((storage.foldername(name))[1])::uuid)
                             or es_de_mi_depto(((storage.foldername(name))[2])::uuid)));

-- =====================================================================
-- 10. CORTE DIARIO CON pg_cron
--    Activa la extensión en Supabase: Database → Extensions → pg_cron. Luego, una sola vez:
--
--    select cron.schedule('corte-diario', '10 5 * * *', $$ select public.ejecutar_cortes(); $$);
--    -- 05:10 UTC = 00:10 en Lima
-- =====================================================================
