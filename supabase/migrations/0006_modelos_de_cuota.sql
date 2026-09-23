-- =====================================================================
-- Building Buddy · 0006 Modelos de cuota y reparto exacto
-- SPEC 1.5: RN-02, RN-03, RN-04 y RN-38
--   · Alícuota = área del depto ÷ suma de áreas de los deptos (sin "área total declarada").
--   · Áreas comunes solo informativas (área asignada).
--   · Cuota = base (monto fijo por área | monto fijo igual | gastos reales por área)
--            + agua (por consumo | incluida).
--   · Agua por consumo: todo el recibo × (m³ del depto ÷ suma de m³ de los deptos).
--   · Redondeo por mayor resto: cada parte suma exacto.
--   Referencia: planilla del Product Owner (scripts/probar-cuotas.ts).
-- =====================================================================

alter table edificios
  add column base_cuota    text check (base_cuota in ('fijo_area','fijo_igual','gastos')),
  add column agua_cuota    text check (agua_cuota in ('consumo','incluida')),
  add column area_comun_m2 numeric(10,2) check (area_comun_m2 is null or area_comun_m2 >= 0);

comment on column edificios.base_cuota is 'RN-03: fijo_area (monto_fijo_mensual = total del edificio), fijo_igual (monto_fijo_mensual = monto por departamento), gastos (gastos reales del mes). null = sin configurar';
comment on column edificios.agua_cuota is 'RN-03: consumo (medidores, RN-38) o incluida. null = sin configurar';
comment on column edificios.monto_fijo_mensual is 'fijo_area: monto del edificio que se reparte por alícuota · fijo_igual: monto por departamento';
comment on column edificios.area_comun_m2 is 'Informativo (RN-02): no cambia la alícuota';
comment on column edificios.tipo_calculo is 'Obsoleto desde 0006: usar base_cuota y agua_cuota';
comment on column edificios.area_total_m2 is 'Obsoleto desde 0006: la alícuota usa la suma de las áreas de los departamentos';

-- Los edificios existentes conservan su comportamiento
update edificios set base_cuota = 'gastos',    agua_cuota = 'incluida' where tipo_calculo = 'alicuota';
update edificios set base_cuota = 'fijo_area', agua_cuota = 'consumo'  where tipo_calculo = 'mixta_agua';

-- Alícuota sobre la suma de áreas (RN-02)
create or replace view v_departamentos with (security_invoker = true) as
select d.*, round(d.area_m2 / nullif(sum(d.area_m2) over (partition by d.edificio_id), 0), 6) as alicuota
from departamentos d;

-- ---------------------------------------------------------------------
-- 1. ¿Está lista la cobranza? Devuelve el edificio o explica qué falta.
-- ---------------------------------------------------------------------
create or replace function exigir_cobranza_configurada(p_edificio uuid) returns edificios
language plpgsql stable security definer set search_path = public as $$
declare v edificios;
begin
  select * into v from edificios where id = p_edificio;
  if v.base_cuota is null or v.agua_cuota is null then
    raise exception 'Configura la cobranza del edificio (base de la cuota y agua) antes de calcular cuotas';
  end if;
  if not exists (select 1 from departamentos where edificio_id = p_edificio) then
    raise exception 'Registra los departamentos antes de calcular cuotas';
  end if;
  if v.base_cuota in ('fijo_area','gastos')
     and exists (select 1 from departamentos where edificio_id = p_edificio and area_m2 is null) then
    raise exception 'Completa el área de cada departamento antes de calcular cuotas';
  end if;
  if v.base_cuota in ('fijo_area','fijo_igual') and v.monto_fijo_mensual is null then
    raise exception 'Define el monto fijo mensual en la configuración de la cobranza';
  end if;
  return v;
end $$;
revoke execute on function exigir_cobranza_configurada(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Cálculo de cuotas (misma firma): comun = parte fija · agua = parte variable
-- ---------------------------------------------------------------------
create or replace function calcular_cuotas(p_periodo uuid)
returns table (departamento_id uuid, numero text, area_m2 numeric, alicuota numeric,
               comun numeric, m3 numeric, agua numeric, total numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ed edificios; v_ed_id uuid; v_n int; v_base numeric := 0; v_recibo numeric := 0; v_sum_l numeric := 0;
begin
  select p.edificio_id into v_ed_id from periodos p where p.id = p_periodo;
  if v_ed_id is null then raise exception 'Periodo no encontrado'; end if;
  if not es_miembro(v_ed_id) then raise exception 'Sin acceso a este edificio'; end if;
  v_ed := exigir_cobranza_configurada(v_ed_id);
  select count(*) into v_n from departamentos x where x.edificio_id = v_ed_id;

  if v_ed.agua_cuota = 'consumo' then
    select coalesce(max(ra.monto), 0) into v_recibo from recibos_agua ra where ra.periodo_id = p_periodo;
    select coalesce(sum(l.m3), 0) into v_sum_l from lecturas_agua l where l.periodo_id = p_periodo;
    if v_recibo > 0 and v_sum_l = 0
       and exists (select 1 from departamentos x where x.edificio_id = v_ed_id and x.area_m2 is null) then
      raise exception 'Registra las lecturas de los medidores o completa las áreas para repartir el agua';
    end if;
  end if;

  v_base := case v_ed.base_cuota
    when 'fijo_area'  then v_ed.monto_fijo_mensual
    when 'fijo_igual' then v_ed.monto_fijo_mensual * v_n
    else (select coalesce(sum(g.monto), 0) from gastos g where g.periodo_id = p_periodo
            and (v_ed.agua_cuota = 'incluida' or g.origen <> 'agua'))
  end;

  return query
  with base as (
    select d.id, d.numero, d.area_m2, coalesce(l.m3, 0)::numeric as m3,
           case when v_ed.base_cuota = 'fijo_igual' then 1::numeric else d.area_m2 end as peso_fijo,
           case when v_recibo = 0 then 0::numeric
                when v_sum_l > 0 then coalesce(l.m3, 0)::numeric
                else d.area_m2 end as peso_agua
    from departamentos d
    left join lecturas_agua l on l.departamento_id = d.id and l.periodo_id = p_periodo
    where d.edificio_id = v_ed_id
  ),
  crudo as (
    select b.*,
           round(b.area_m2 / nullif(sum(b.area_m2) over (), 0), 6) as alic,
           coalesce(v_base   * b.peso_fijo / nullif(sum(b.peso_fijo) over (), 0), 0) as c_raw,
           coalesce(v_recibo * b.peso_agua / nullif(sum(b.peso_agua) over (), 0), 0) as a_raw
    from base b
  ),
  piso as (
    select c.*, floor(c.c_raw * 100) / 100 as c_piso, floor(c.a_raw * 100) / 100 as a_piso from crudo c
  ),
  resto as (
    select p.*,
           round((v_base   - sum(p.c_piso) over ()) * 100)::int as sobra_c,
           round((v_recibo - sum(p.a_piso) over ()) * 100)::int as sobra_a,
           row_number() over (order by p.c_raw - p.c_piso desc, p.numero) as orden_c,
           row_number() over (order by p.a_raw - p.a_piso desc, p.numero) as orden_a
    from piso p
  ),
  final as (
    select r.*,
           r.c_piso + case when r.orden_c <= r.sobra_c then 0.01 else 0 end as c,
           r.a_piso + case when r.orden_a <= r.sobra_a then 0.01 else 0 end as a
    from resto r
  )
  select f.id, f.numero, f.area_m2, f.alic, f.c, f.m3, f.a, f.c + f.a
  from final f
  order by f.numero;
end $$;

-- ---------------------------------------------------------------------
-- 3. Abrir periodo: solo la base "gastos" exige gastos para emitir cuotas
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
  if v_ed.base_cuota = 'gastos' and v_total <= 0 then
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
-- 4. Lecturas: el mensaje de lectura menor muestra los números sin ceros de sobra
-- ---------------------------------------------------------------------
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
      raise exception 'Medidor % (depto %): la lectura % es menor que la anterior (%)', v_med.numero_serie, v_num, trim_scale(v_lect), trim_scale(v_ant);
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


-- ---------------------------------------------------------------------
-- 5. Estado de la configuración (Inicio y Configuración)
-- ---------------------------------------------------------------------
drop function estado_configuracion(uuid);
create or replace function estado_configuracion(p_edificio uuid)
returns table (departamentos int, total_declarado int, con_area int, con_medidor int,
               area_departamentos numeric, area_comun numeric, base_cuota text, agua_cuota text,
               monto_fijo numeric, dia_lectura smallint, cobranza_lista boolean)
language sql stable security definer set search_path = public as $$
  select x.deps, e.total_departamentos, x.con_area, x.con_medidor, x.area, e.area_comun_m2,
         e.base_cuota, e.agua_cuota, e.monto_fijo_mensual, e.dia_lectura,
         e.base_cuota is not null and e.agua_cuota is not null and x.deps > 0
           and (e.base_cuota = 'fijo_igual' or x.con_area = x.deps)
           and (e.base_cuota = 'gastos' or e.monto_fijo_mensual is not null)
           and (e.agua_cuota = 'incluida' or e.dia_lectura is not null)
  from edificios e
  cross join lateral (
    select (select count(*)::int from departamentos d where d.edificio_id = e.id) as deps,
           (select count(*)::int from departamentos d where d.edificio_id = e.id and d.area_m2 is not null) as con_area,
           (select count(*)::int from medidores m where m.edificio_id = e.id and m.retirado_en is null) as con_medidor,
           (select coalesce(sum(d.area_m2), 0) from departamentos d where d.edificio_id = e.id) as area
  ) x
  where e.id = p_edificio and es_lector_admin(e.id)
$$;
revoke execute on function estado_configuracion(uuid) from public, anon;
grant execute on function estado_configuracion(uuid) to authenticated;
