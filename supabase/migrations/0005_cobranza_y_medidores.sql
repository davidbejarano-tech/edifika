-- =====================================================================
-- Building Buddy · 0005 Cobranza configurable y medidores de agua
-- SPEC 1.4: RN-02, RN-03, RN-04, RN-05, RN-26, RN-27 y RN-38
--   · Las áreas y el método de cálculo ya no se piden al registrar el edificio:
--     se completan en la configuración de la cobranza.
--   · Cuota mixta = monto fijo mensual × alícuota + agua del departamento.
--   · Medidores por departamento (número de serie) y lecturas mensuales:
--     m³ = lectura actual − lectura anterior. El agua común se reparte por área.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Áreas y método opcionales hasta configurar la cobranza
-- ---------------------------------------------------------------------
alter table edificios alter column area_total_m2 drop not null;
alter table edificios alter column tipo_calculo drop not null;
alter table edificios alter column tipo_calculo drop default;
alter table departamentos alter column area_m2 drop not null;

alter table edificios
  add column monto_fijo_mensual numeric(12,2) check (monto_fijo_mensual is null or monto_fijo_mensual > 0),
  add column dia_lectura        smallint check (dia_lectura between 1 and 28);

comment on column edificios.tipo_calculo is 'null = cobranza sin configurar (RN-03)';
comment on column recibos_agua.riego_m3 is 'Obsoleto desde 0005: el agua común se calcula como consumo_m3 − suma de lecturas (RN-38)';

-- ---------------------------------------------------------------------
-- 2. Medidores y lecturas (RN-38)
-- ---------------------------------------------------------------------
create table medidores (
  id               uuid primary key default gen_random_uuid(),
  edificio_id      uuid not null,
  departamento_id  uuid not null,
  numero_serie     text not null check (numero_serie ~ '^[0-9A-Za-z./-]{3,30}$'),
  lectura_inicial  numeric(12,3) not null default 0 check (lectura_inicial >= 0),
  instalado_en     date not null default hoy_lima(),
  retirado_en      date,
  activo           boolean generated always as (retirado_en is null) stored,
  created_at       timestamptz not null default now(),
  foreign key (departamento_id, edificio_id) references departamentos (id, edificio_id) on delete cascade,
  unique (edificio_id, numero_serie),
  check (retirado_en is null or retirado_en >= instalado_en)
);
create unique index medidor_activo_unico on medidores (departamento_id) where retirado_en is null;

create table lecturas_medidor (
  medidor_id      uuid not null references medidores on delete cascade,
  periodo_id      uuid not null references periodos on delete cascade,
  fecha           date not null,
  lectura         numeric(12,3) not null check (lectura >= 0),
  lectura_anterior numeric(12,3) not null check (lectura_anterior >= 0),
  m3              numeric(10,2) not null check (m3 >= 0),
  registrado_por  uuid references perfiles default auth.uid(),
  created_at      timestamptz not null default now(),
  primary key (medidor_id, periodo_id)
);

alter table medidores        enable row level security;
alter table lecturas_medidor enable row level security;

-- Lectura: equipo de administración y el vecino de ese departamento. Escritura solo por funciones.
create policy med_leer on medidores for select to authenticated
  using (es_lector_admin(edificio_id) or es_de_mi_depto(departamento_id));
create policy lmed_leer on lecturas_medidor for select to authenticated
  using (exists (select 1 from medidores m where m.id = medidor_id
                 and (es_lector_admin(m.edificio_id) or es_de_mi_depto(m.departamento_id))));

-- Las lecturas de un periodo confirmado quedan bloqueadas (RN-06)
create or replace function tg_bloquear_lectura_medidor() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_periodo uuid := case when tg_op = 'DELETE' then old.periodo_id else new.periodo_id end;
begin
  if exists (select 1 from periodos where id = v_periodo and gastos_confirmados_en is not null) then
    raise exception 'Los gastos de este mes ya están confirmados: no se pueden cambiar las lecturas';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function tg_bloquear_lectura_medidor() from public, anon, authenticated;
create trigger bloquear_lectura_medidor before insert or update or delete on lecturas_medidor
  for each row execute function tg_bloquear_lectura_medidor();

create trigger actividad after insert or update or delete on medidores for each row execute function tg_actividad();

-- 2.1 Registrar o cambiar el medidor de un departamento (solo titular: estructura del edificio)
create or replace function registrar_medidor(p_departamento uuid, p_numero_serie text,
  p_lectura_inicial numeric default 0, p_fecha date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ed uuid := edificio_de_depto(p_departamento); v_serie text := upper(trim(p_numero_serie));
        v_fecha date := coalesce(p_fecha, hoy_lima()); v_id uuid; v_num text;
begin
  if v_ed is null then raise exception 'Departamento no encontrado'; end if;
  if not es_titular(v_ed) then raise exception 'Solo el administrador titular registra medidores'; end if;
  if v_serie !~ '^[0-9A-Za-z./-]{3,30}$' then
    raise exception 'El número de serie debe tener de 3 a 30 caracteres: letras, números, puntos o guiones';
  end if;
  if coalesce(p_lectura_inicial, 0) < 0 then raise exception 'La lectura inicial no puede ser negativa'; end if;
  select d.numero into v_num from medidores m join departamentos d on d.id = m.departamento_id
  where m.edificio_id = v_ed and upper(m.numero_serie) = v_serie;
  if found then raise exception 'El medidor % ya está registrado en el departamento %', v_serie, v_num; end if;

  update medidores set retirado_en = greatest(v_fecha, instalado_en)
  where departamento_id = p_departamento and retirado_en is null;
  insert into medidores (edificio_id, departamento_id, numero_serie, lectura_inicial, instalado_en)
  values (v_ed, p_departamento, v_serie, coalesce(p_lectura_inicial, 0), v_fecha)
  returning id into v_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v_ed, 'registrar_medidor', 'medidores', v_id, jsonb_build_object('serie', v_serie, 'departamento', p_departamento));
  return v_id;
end $$;

-- 2.2 Lectura anterior de un medidor antes de un periodo
create or replace function lectura_anterior(p_medidor uuid, p_periodo uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select lm.lectura from lecturas_medidor lm join periodos p on p.id = lm.periodo_id
     where lm.medidor_id = p_medidor and p.mes < (select mes from periodos where id = p_periodo)
     order by p.mes desc limit 1),
    (select lectura_inicial from medidores where id = p_medidor))
$$;

-- 2.3 Registrar las lecturas del periodo (titular o coadministrador: dato operativo)
--     p_lecturas: [{"medidor_id": "...", "lectura": 1234.5}]
--     Recalcula lecturas_agua (m³ por departamento) que usa calcular_cuotas().
create or replace function registrar_lecturas(p_periodo uuid, p_fecha date, p_lecturas jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_ed uuid; f jsonb; v_med medidores; v_lect numeric; v_ant numeric; v_num text; k int := 0;
begin
  select edificio_id into v_ed from periodos where id = p_periodo;
  if v_ed is null then raise exception 'Periodo no encontrado'; end if;
  if not es_admin(v_ed) then raise exception 'Solo la administración registra lecturas'; end if;
  if jsonb_typeof(p_lecturas) <> 'array' or jsonb_array_length(p_lecturas) = 0 then raise exception 'No hay lecturas para registrar'; end if;

  for f in select * from jsonb_array_elements(p_lecturas) loop
    select * into v_med from medidores where id = (f->>'medidor_id')::uuid and edificio_id = v_ed;
    if not found then raise exception 'Medidor no encontrado en este edificio'; end if;
    select numero into v_num from departamentos where id = v_med.departamento_id;
    begin
      v_lect := (f->>'lectura')::numeric;
    exception when others then
      raise exception 'Medidor % (depto %): la lectura debe ser un número', v_med.numero_serie, v_num;
    end;
    if v_lect is null or v_lect < 0 then
      raise exception 'Medidor % (depto %): escribe una lectura válida', v_med.numero_serie, v_num;
    end if;
    v_ant := lectura_anterior(v_med.id, p_periodo);
    if v_lect < v_ant then
      raise exception 'Medidor % (depto %): la lectura % es menor que la anterior (%)', v_med.numero_serie, v_num, v_lect, v_ant;
    end if;

    insert into lecturas_medidor (medidor_id, periodo_id, fecha, lectura, lectura_anterior, m3)
    values (v_med.id, p_periodo, p_fecha, v_lect, v_ant, round(v_lect - v_ant, 2))
    on conflict (medidor_id, periodo_id) do update
      set fecha = excluded.fecha, lectura = excluded.lectura, lectura_anterior = excluded.lectura_anterior,
          m3 = excluded.m3, registrado_por = auth.uid(), created_at = now();

    -- m³ del departamento = suma de sus medidores leídos en el periodo (cubre un cambio de medidor)
    insert into lecturas_agua (periodo_id, departamento_id, m3)
    select p_periodo, v_med.departamento_id, sum(lm.m3)
    from lecturas_medidor lm join medidores m on m.id = lm.medidor_id
    where lm.periodo_id = p_periodo and m.departamento_id = v_med.departamento_id
    on conflict (periodo_id, departamento_id) do update set m3 = excluded.m3;
    k := k + 1;
  end loop;

  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v_ed, 'registrar_lecturas', 'periodos', p_periodo, jsonb_build_object('cantidad', k, 'fecha', p_fecha));
  return k;
end $$;

-- 2.4 Hoja de lecturas del periodo: medidores activos con su lectura anterior y la registrada
create or replace function lecturas_del_periodo(p_periodo uuid)
returns table (medidor_id uuid, departamento_id uuid, numero text, numero_serie text,
               lectura_anterior numeric, lectura numeric, m3 numeric, fecha date)
language sql stable security definer set search_path = public as $$
  select m.id, d.id, d.numero, m.numero_serie,
         coalesce(lm.lectura_anterior, lectura_anterior(m.id, p_periodo)), lm.lectura, lm.m3, lm.fecha
  from periodos p
  join medidores m on m.edificio_id = p.edificio_id
  join departamentos d on d.id = m.departamento_id
  left join lecturas_medidor lm on lm.medidor_id = m.id and lm.periodo_id = p.id
  where p.id = p_periodo and es_lector_admin(p.edificio_id)
    and (m.retirado_en is null or lm.medidor_id is not null)
  order by d.numero, m.instalado_en
$$;

-- ---------------------------------------------------------------------
-- 3. Cálculo de cuotas (RN-02, RN-03, RN-38). Misma firma que en 0001.
--    comun = parte por área (gastos del mes o monto fijo) · agua = agua propia + agua común por área
-- ---------------------------------------------------------------------
create or replace function exigir_cobranza_configurada(p_edificio uuid) returns edificios
language plpgsql stable security definer set search_path = public as $$
declare v edificios;
begin
  select * into v from edificios where id = p_edificio;
  if v.tipo_calculo is null then
    raise exception 'Configura la cobranza del edificio (método de cálculo) antes de calcular cuotas';
  end if;
  if v.area_total_m2 is null or exists (select 1 from departamentos where edificio_id = p_edificio and area_m2 is null) then
    raise exception 'Completa el área total del edificio y el área de cada departamento antes de calcular cuotas';
  end if;
  if not exists (select 1 from departamentos where edificio_id = p_edificio) then
    raise exception 'Registra los departamentos antes de calcular cuotas';
  end if;
  if v.tipo_calculo = 'mixta_agua' and v.monto_fijo_mensual is null then
    raise exception 'Define el monto fijo mensual en la configuración de la cobranza';
  end if;
  return v;
end $$;

create or replace function calcular_cuotas(p_periodo uuid)
returns table (departamento_id uuid, numero text, area_m2 numeric, alicuota numeric,
               comun numeric, m3 numeric, agua numeric, total numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ed edificios; v_ed_id uuid; v_agua recibos_agua; v_base numeric; v_mixta boolean;
  v_sum_l numeric := 0; v_comun_agua numeric := 0; v_div numeric := 0; v_por_area boolean := false;
begin
  select p.edificio_id into v_ed_id from periodos p where p.id = p_periodo;
  if v_ed_id is null then raise exception 'Periodo no encontrado'; end if;
  if not es_miembro(v_ed_id) then raise exception 'Sin acceso a este edificio'; end if;
  v_ed := exigir_cobranza_configurada(v_ed_id);
  v_mixta := v_ed.tipo_calculo = 'mixta_agua';

  if v_mixta then
    v_base := v_ed.monto_fijo_mensual;
    select * into v_agua from recibos_agua ra where ra.periodo_id = p_periodo;
    if v_agua.periodo_id is not null and v_agua.monto > 0 then
      select coalesce(sum(l.m3), 0) into v_sum_l from lecturas_agua l where l.periodo_id = p_periodo;
      if v_sum_l = 0 then
        v_por_area := true;                                   -- sin lecturas: todo el recibo por área
        v_comun_agua := v_agua.monto;
      elsif v_agua.consumo_m3 > v_sum_l then
        v_div := v_agua.consumo_m3;                           -- cada depto paga su % del consumo general
        v_comun_agua := v_agua.monto * (v_agua.consumo_m3 - v_sum_l) / v_agua.consumo_m3;
      else
        v_div := v_sum_l;                                     -- sin agua común: % sobre la suma de deptos
      end if;
    end if;
  else
    select coalesce(sum(g.monto), 0) into v_base from gastos g where g.periodo_id = p_periodo;
  end if;

  return query
  select x.id, x.numero, x.area_m2, x.alic, x.comun, x.m3, x.agua, x.comun + x.agua
  from (
    select d.id, d.numero, d.area_m2,
           round(d.area_m2 / v_ed.area_total_m2, 6) as alic,
           round(v_base * d.area_m2 / v_ed.area_total_m2, 2) as comun,
           coalesce(l.m3, 0)::numeric as m3,
           round(case when v_div > 0 and not v_por_area then v_agua.monto * coalesce(l.m3, 0) / v_div else 0 end
                 + v_comun_agua * d.area_m2 / v_ed.area_total_m2, 2) as agua
    from departamentos d
    left join lecturas_agua l on l.departamento_id = d.id and l.periodo_id = p_periodo
    where d.edificio_id = v_ed.id
  ) x
  order by x.numero;
end $$;

-- ---------------------------------------------------------------------
-- 4. Abrir periodo: en el método mixto no hace falta tener gastos para emitir cuotas.
--    Idéntica a 0001 salvo la validación de gastos y la de configuración.
-- ---------------------------------------------------------------------
create or replace function abrir_periodo(p_edificio uuid, p_recurrentes jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ed edificios; v_act periodos; v_nuevo uuid; v_mes date; v_vence date;
  r record; v_ad compromisos; v_total numeric; i jsonb; v_emitidas int := 0;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular puede abrir un periodo'; end if;
  v_ed := exigir_cobranza_configurada(p_edificio);
  select * into v_act from periodos where edificio_id = p_edificio and estado = 'abierto' for update;
  if not found then raise exception 'No hay un periodo abierto'; end if;
  if v_act.gastos_confirmados_en is null then
    raise exception 'Confirma los gastos de % antes de abrir el siguiente mes', mes_es(v_act.mes);
  end if;
  select coalesce(sum(monto), 0) into v_total from gastos where periodo_id = v_act.id;
  if v_ed.tipo_calculo = 'alicuota' and v_total <= 0 then
    raise exception 'No hay gastos en % para calcular las cuotas', mes_es(v_act.mes);
  end if;

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

-- ---------------------------------------------------------------------
-- 5. Extraordinario por área: exige áreas completas
-- ---------------------------------------------------------------------
create or replace function emitir_extraordinario(p_edificio uuid, p_concepto text, p_monto numeric,
  p_reparto text, p_vence date, p_departamento uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_mes date; v_area numeric; v_n int;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular emite compromisos'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_reparto = 'alicuota' and exists (select 1 from departamentos where edificio_id = p_edificio
                                         and (p_departamento is null or id = p_departamento) and area_m2 is null) then
    raise exception 'Para repartir por área, completa el área de todos los departamentos';
  end if;
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

-- ---------------------------------------------------------------------
-- 6. Importación (RN-27): área y medidor opcionales
--    p_filas: [{"numero","piso","area","propietario","inquilino","email","telefono","medidor"}]
-- ---------------------------------------------------------------------
create or replace function importar_departamentos(p_edificio uuid, p_filas jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare f jsonb; k int := 0; v_dep uuid; v_per uuid; v_num text; v_area numeric; v_piso int;
        v_prop text; v_inq text; v_email text; v_tel text; v_med text; v_otro text;
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
    v_med  := nullif(upper(trim(f->>'medidor')), '');
    begin
      v_area := nullif(f->>'area', '')::numeric;
      v_piso := coalesce(nullif(f->>'piso', '')::int, nullif(regexp_replace(v_num, '\D.*$', ''), '')::int / 100);
    exception when others then
      raise exception 'Fila %: el área y el piso deben ser números', k;
    end;
    if coalesce(v_num, '') !~ '^[0-9A-Za-z-]{1,8}$' then raise exception 'Fila %: número de departamento no válido', k; end if;
    if v_area is not null and v_area <= 0 then raise exception 'Fila % (depto %): el área debe ser mayor que cero', k, v_num; end if;
    if v_prop is null then raise exception 'Fila % (depto %): falta el propietario', k, v_num; end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Fila % (depto %): correo no válido', k, v_num; end if;
    if v_med is not null and v_med !~ '^[0-9A-Za-z./-]{3,30}$' then
      raise exception 'Fila % (depto %): número de medidor no válido', k, v_num;
    end if;
    if exists (select 1 from departamentos where edificio_id = p_edificio and numero = v_num) then
      raise exception 'Fila %: el departamento % ya existe', k, v_num;
    end if;
    if v_med is not null then
      select d.numero into v_otro from medidores m join departamentos d on d.id = m.departamento_id
      where m.edificio_id = p_edificio and upper(m.numero_serie) = v_med;
      if found then raise exception 'Fila % (depto %): el medidor % ya está en el departamento %', k, v_num, v_med, v_otro; end if;
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
    if v_med is not null then
      insert into medidores (edificio_id, departamento_id, numero_serie) values (p_edificio, v_dep, v_med);
    end if;
  end loop;

  insert into auditoria (edificio_id, accion, entidad, datos)
  values (p_edificio, 'importar_departamentos', 'departamentos', jsonb_build_object('cantidad', k));
  return k;
end $$;

-- ---------------------------------------------------------------------
-- 7. Registro del edificio sin áreas ni método (RN-26). Reemplaza la versión de 0004.
-- ---------------------------------------------------------------------
drop function registrar_edificio(text, text, text, int, numeric, tipo_calculo, date, text, jsonb, uuid, text);

create or replace function registrar_edificio(
  p_nombre text, p_direccion text, p_codigo text, p_total_departamentos int,
  p_mes_inicio date, p_mi_nombre text,
  p_filas jsonb default '[]'::jsonb,
  p_organizacion uuid default null, p_organizacion_nombre text default null) returns uuid
language plpgsql set search_path = public as $$
declare v_ed uuid;
begin
  if coalesce(trim(p_mi_nombre), '') = '' then raise exception 'Escribe tu nombre'; end if;
  if coalesce(p_total_departamentos, 0) < 1 then raise exception 'La cantidad de departamentos debe ser mayor que cero'; end if;
  v_ed := crear_edificio(p_nombre, p_direccion, p_codigo, p_total_departamentos, null,
                         null, p_mes_inicio, p_mi_nombre, p_organizacion, p_organizacion_nombre);
  if jsonb_typeof(p_filas) = 'array' and jsonb_array_length(p_filas) > 0 then
    perform importar_departamentos(v_ed, p_filas);
  end if;
  return v_ed;
end $$;
revoke execute on function registrar_edificio(text, text, text, int, date, text, jsonb, uuid, text) from public, anon;
grant execute on function registrar_edificio(text, text, text, int, date, text, jsonb, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Mis edificios: indica si falta configurar la cobranza
-- ---------------------------------------------------------------------
create or replace function estado_configuracion(p_edificio uuid)
returns table (departamentos int, total_declarado int, con_area int, con_medidor int,
               area_total numeric, area_asignada numeric, tipo_calculo tipo_calculo,
               monto_fijo numeric, dia_lectura smallint, cobranza_lista boolean)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from departamentos d where d.edificio_id = e.id),
         e.total_departamentos,
         (select count(*)::int from departamentos d where d.edificio_id = e.id and d.area_m2 is not null),
         (select count(*)::int from medidores m where m.edificio_id = e.id and m.retirado_en is null),
         e.area_total_m2,
         (select coalesce(sum(d.area_m2), 0) from departamentos d where d.edificio_id = e.id),
         e.tipo_calculo, e.monto_fijo_mensual, e.dia_lectura,
         e.tipo_calculo is not null and e.area_total_m2 is not null
           and exists (select 1 from departamentos d where d.edificio_id = e.id)
           and not exists (select 1 from departamentos d where d.edificio_id = e.id and d.area_m2 is null)
           and (e.tipo_calculo = 'alicuota' or e.monto_fijo_mensual is not null)
  from edificios e
  where e.id = p_edificio and es_lector_admin(e.id)
$$;
revoke execute on function estado_configuracion(uuid) from public, anon;
grant execute on function estado_configuracion(uuid) to authenticated;

-- Funciones internas: no se llaman desde el cliente
revoke execute on function exigir_cobranza_configurada(uuid) from public, anon, authenticated;
revoke execute on function lectura_anterior(uuid, uuid) from public, anon, authenticated;
revoke execute on function registrar_medidor(uuid, text, numeric, date) from public, anon;
revoke execute on function registrar_lecturas(uuid, date, jsonb) from public, anon;
revoke execute on function lecturas_del_periodo(uuid) from public, anon;
grant execute on function registrar_medidor(uuid, text, numeric, date) to authenticated;
grant execute on function registrar_lecturas(uuid, date, jsonb) to authenticated;
grant execute on function lecturas_del_periodo(uuid) to authenticated;
