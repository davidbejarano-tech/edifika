-- =====================================================================
-- EDIFIKA · 0016 Pago adelantado como saldo a favor (SPEC 1.7: RN-08 y RN-12)
--   · Pagar por adelantado carga un saldo a favor del departamento (al validarse el pago).
--   · Con monto fijo se adelantan N meses de la parte fija; con gastos reales, un monto en soles.
--   · Al abrir cada mes el saldo se aplica solo: con monto fijo hasta la parte fija (el agua se
--     cobra aparte); con gastos reales hasta la cuota completa.
--   · Los pagos adelantados no son deuda ni generan mora.
--   · La cuenta corriente registra cargos por su valor completo y abonos: saldo negativo = a favor.
-- Reemplaza el esquema anterior (una cuota por mes futuro + ajuste al abrir el mes).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Una sola cuota por mes; el pago adelantado ya no ocupa un mes
-- ---------------------------------------------------------------------
drop index cuota_unica;
create unique index cuota_unica on compromisos (departamento_id, mes) where tipo = 'cuota' and estado <> 'anulado';

-- ---------------------------------------------------------------------
-- 2. Movimientos del saldo a favor: + pago adelantado validado · − aplicación a una cuota
-- ---------------------------------------------------------------------
create table saldo_favor (
  id               bigint generated always as identity primary key,
  edificio_id      uuid not null references edificios on delete cascade,
  departamento_id  uuid not null references departamentos on delete cascade,
  fecha            date not null default hoy_lima(),
  monto            numeric(12,2) not null check (monto <> 0),
  concepto         text not null,
  compromiso_id    uuid references compromisos on delete set null,
  created_at       timestamptz not null default now()
);
create index saldo_favor_depto on saldo_favor (departamento_id);
alter table saldo_favor enable row level security;
create policy saldo_leer on saldo_favor for select to authenticated
  using (es_lector_admin(edificio_id) or es_de_mi_depto(departamento_id));
-- Sin políticas de escritura: solo lo mueven el disparador y abrir_periodo

create or replace function saldo_a_favor(p_departamento uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(monto), 0) from saldo_favor
  where departamento_id = p_departamento
    and (es_lector_admin(edificio_de_depto(p_departamento)) or es_de_mi_depto(p_departamento))
$$;

-- Al quedar pagado un pago adelantado (validado o en efectivo) nace el saldo a favor
create or replace function tg_saldo_adelanto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'adelanto' and new.estado = 'pagado' and old.estado is distinct from 'pagado' then
    insert into saldo_favor (edificio_id, departamento_id, monto, concepto, compromiso_id)
    values (new.edificio_id, new.departamento_id, new.monto, new.concepto, new.id);
  end if;
  return null;
end $$;
revoke execute on function tg_saldo_adelanto() from public, anon, authenticated;
create trigger saldo_adelanto after update of estado on compromisos
  for each row execute function tg_saldo_adelanto();

-- ---------------------------------------------------------------------
-- 3. Parte fija actual del departamento del vecino (para ofrecer el adelanto)
-- ---------------------------------------------------------------------
create or replace function parte_fija_actual(p_edificio uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v edificios; v_dep uuid := mi_departamento_en(p_edificio); v_area numeric; v_suma numeric;
begin
  if v_dep is null then return null; end if;
  select * into v from edificios where id = p_edificio;
  if v.base_cuota = 'fijo_igual' then return v.monto_fijo_mensual; end if;
  if v.base_cuota = 'fijo_area' then
    select area_m2 into v_area from departamentos where id = v_dep;
    select sum(area_m2) into v_suma from departamentos where edificio_id = p_edificio;
    if v_area is null or coalesce(v_suma, 0) = 0 then return null; end if;
    return round(v.monto_fijo_mensual * v_area / v_suma, 2);
  end if;
  return null;   -- gastos reales o sin configurar: no hay parte fija
end $$;

-- ---------------------------------------------------------------------
-- 4. Solicitar y cancelar un pago adelantado (RN-12)
-- ---------------------------------------------------------------------
drop function solicitar_adelanto(uuid, int);

create or replace function solicitar_adelanto(p_edificio uuid, p_meses int default null, p_monto numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_dep uuid := mi_departamento_en(p_edificio); v edificios; v_mes date; v_fija numeric; v_monto numeric;
        v_concepto text; v_id uuid;
begin
  if v_dep is null then raise exception 'Solo un vecino con acceso activo puede pagar por adelantado'; end if;
  select * into v from edificios where id = p_edificio;
  if v.base_cuota is null then raise exception 'La administración aún no configura la cobranza del edificio'; end if;
  select mes into v_mes from periodos where edificio_id = p_edificio and estado = 'abierto';
  if v_mes is null then raise exception 'El edificio no tiene un mes abierto'; end if;
  if exists (select 1 from compromisos where departamento_id = v_dep and tipo = 'adelanto' and estado in ('pendiente','en_revision')) then
    raise exception 'Ya tienes un pago adelantado sin completar: págalo o cancélalo antes de pedir otro';
  end if;

  if v.base_cuota = 'gastos' then
    if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto en soles que quieres adelantar'; end if;
    if p_monto > 100000 then raise exception 'El monto es demasiado alto'; end if;
    v_monto := round(p_monto, 2);
    v_concepto := 'Pago adelantado a cuenta';
  else
    if p_meses is null or p_meses not between 1 and 6 then raise exception 'Puedes adelantar entre 1 y 6 meses'; end if;
    v_fija := parte_fija_actual(p_edificio);
    if v_fija is null or v_fija <= 0 then raise exception 'Aún no se puede calcular tu parte fija. Consulta con la administración'; end if;
    v_monto := v_fija * p_meses;
    v_concepto := 'Pago adelantado: ' || p_meses || case when p_meses = 1 then ' mes' else ' meses' end || ' de cuota fija';
  end if;

  insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, vence_en, detalle)
  values (p_edificio, v_dep, v_mes, 'adelanto', v_concepto, v_monto, hoy_lima() + 15,
          jsonb_build_object('meses', p_meses, 'parte_fija', v_fija))
  returning id into v_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'solicitar_adelanto', 'compromisos', v_id, jsonb_build_object('monto', v_monto, 'meses', p_meses));
  return v_id;
end $$;

create or replace function cancelar_adelanto(p_compromiso uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c compromisos;
begin
  select * into c from compromisos where id = p_compromiso for update;
  if not found or c.tipo <> 'adelanto' then raise exception 'Pago adelantado no encontrado'; end if;
  if not es_de_mi_depto(c.departamento_id) then raise exception 'Solo puedes cancelar tus propios pagos adelantados'; end if;
  if c.estado <> 'pendiente' then raise exception 'Solo se cancela un pago adelantado que aún no enviaste'; end if;
  update compromisos set estado = 'anulado', anulado_motivo = 'Cancelado por el vecino' where id = p_compromiso;
end $$;

revoke execute on function saldo_a_favor(uuid) from public, anon;
revoke execute on function parte_fija_actual(uuid) from public, anon;
revoke execute on function solicitar_adelanto(uuid, int, numeric) from public, anon;
revoke execute on function cancelar_adelanto(uuid) from public, anon;
grant execute on function saldo_a_favor(uuid) to authenticated;
grant execute on function parte_fija_actual(uuid) to authenticated;
grant execute on function solicitar_adelanto(uuid, int, numeric) to authenticated;
grant execute on function cancelar_adelanto(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Abrir periodo: aplica el saldo a favor a cada cuota (en lugar del ajuste por adelanto)
-- ---------------------------------------------------------------------
create or replace function abrir_periodo(p_edificio uuid, p_recurrentes jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ed edificios; v_act periodos; v_nuevo uuid; v_mes date; v_vence date;
  r record; v_total numeric; i jsonb; v_emitidas int := 0;
  v_saldo numeric; v_usar numeric; v_neto numeric; v_cid uuid;
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
    continue when r.total <= 0;
    -- RN-12: con monto fijo el saldo cubre solo la parte fija (el agua se paga aparte); con gastos, toda la cuota
    select coalesce(sum(monto), 0) into v_saldo from saldo_favor where departamento_id = r.departamento_id;
    v_usar := greatest(0, least(v_saldo, case when v_ed.base_cuota = 'gastos' then r.total else r.comun end));
    v_neto := r.total - v_usar;

    insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, emitido_en, vence_en, estado, detalle)
    values (p_edificio, r.departamento_id, v_mes, 'cuota', 'Cuota de mantenimiento, ' || mes_es(v_mes),
            case when v_neto > 0 then v_neto else r.total end, v_mes, v_vence,
            case when v_neto > 0 then 'pendiente'::estado_compromiso else 'pagado'::estado_compromiso end,
            jsonb_build_object('base_mes', v_act.mes, 'alicuota', r.alicuota, 'comun', r.comun, 'm3', r.m3,
                               'agua', r.agua, 'bruto', r.total, 'saldo_aplicado', v_usar,
                               'saldo_restante', v_saldo - v_usar))
    returning id into v_cid;
    if v_usar > 0 then
      insert into saldo_favor (edificio_id, departamento_id, fecha, monto, concepto, compromiso_id)
      values (p_edificio, r.departamento_id, v_mes, -v_usar, 'Aplicado a la cuota de ' || mes_es(v_mes), v_cid);
    end if;
    v_emitidas := v_emitidas + 1;
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
-- 6. Los pagos adelantados nunca son deuda ni generan mora (RN-08)
-- ---------------------------------------------------------------------
create or replace view v_compromisos with (security_invoker = true) as
select c.*,
  case when c.estado in ('pagado','en_revision','anulado') then c.estado::text
       when c.vence_en < hoy_lima() and c.tipo <> 'adelanto' then 'vencido'
       else 'pendiente' end as estado_visible,
  (c.estado in ('pendiente','en_revision') and c.tipo <> 'adelanto') as por_cobrar
from compromisos c;

drop function cuentas_por_cobrar(uuid);
create or replace function cuentas_por_cobrar(p_edificio uuid)
returns table (departamento_id uuid, numero text, pendiente numeric, vencido numeric, saldo_favor numeric)
language sql stable security definer set search_path = public as $$
  select d.id, d.numero,
         coalesce((select sum(c.monto) from compromisos c where c.departamento_id = d.id
                   and c.estado in ('pendiente','en_revision') and c.tipo <> 'adelanto'), 0),
         coalesce((select sum(c.monto) from compromisos c where c.departamento_id = d.id
                   and c.estado = 'pendiente' and c.tipo <> 'adelanto' and c.vence_en < hoy_lima()), 0),
         coalesce((select sum(s.monto) from saldo_favor s where s.departamento_id = d.id), 0)
  from departamentos d
  join edificios e on e.id = d.edificio_id
  where d.edificio_id = p_edificio
    and (es_lector_admin(p_edificio) or (es_miembro(p_edificio) and e.publicar_desglose))
  order by d.numero
$$;
revoke execute on function cuentas_por_cobrar(uuid) from public, anon;
grant execute on function cuentas_por_cobrar(uuid) to authenticated;

create or replace function estado_departamentos(p_edificio uuid)
returns table (departamento_id uuid, numero text, piso smallint, responsable text,
               deuda numeric, vencido numeric, en_revision int, estado text)
language sql stable security definer set search_path = public as $$
  select d.id, d.numero, d.piso,
         (select p.nombre from personas p where p.id = responsable_de(d.id)),
         coalesce(sum(c.monto) filter (where c.estado in ('pendiente','en_revision')), 0),
         coalesce(sum(c.monto) filter (where c.estado = 'pendiente' and c.vence_en < hoy_lima()), 0),
         count(*) filter (where c.estado = 'en_revision')::int,
         case
           when count(*) filter (where c.estado = 'pendiente' and c.vence_en < hoy_lima()) > 0 then 'vencido'
           when count(*) filter (where c.estado = 'en_revision') > 0 then 'revision'
           when count(*) filter (where c.estado = 'pendiente') > 0 then 'pendiente'
           else 'aldia' end
  from departamentos d
  left join compromisos c on c.departamento_id = d.id and c.tipo <> 'adelanto'
  where d.edificio_id = p_edificio and es_lector_admin(p_edificio)
  group by d.id, d.numero, d.piso
  order by d.piso desc, d.numero
$$;

create or replace function compromisos_admin(p_edificio uuid)
returns table (compromiso_id uuid, departamento_id uuid, numero text, tipo tipo_compromiso, concepto text,
               mes date, monto numeric, emitido_en date, vence_en date, estado estado_compromiso,
               estado_visible text, anulado_motivo text, pago_metodo text, pago_fecha date,
               validado_por text, ultimo_rechazo text, puede_validar boolean, soy_titular boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.departamento_id, d.numero, c.tipo, c.concepto, c.mes, c.monto, c.emitido_en, c.vence_en, c.estado,
         case when c.estado in ('pagado','en_revision','anulado') then c.estado::text
              when c.vence_en < hoy_lima() and c.tipo <> 'adelanto' then 'vencido' else 'pendiente' end,
         c.anulado_motivo,
         coalesce(pv.metodo, case when c.estado = 'pagado' and (c.detalle->>'saldo_aplicado')::numeric > 0 then 'Saldo a favor' end),
         pv.fecha_pago, pv.validador,
         (select r.nota_rechazo from pagos r where r.compromiso_id = c.id and r.estado = 'rechazado'
            order by r.validado_en desc nulls last limit 1),
         puede_validar_pago(c.edificio_id, c.departamento_id),
         es_titular(c.edificio_id)
  from compromisos c
  join departamentos d on d.id = c.departamento_id
  left join lateral (
    select p.metodo, p.fecha_pago, pr.nombre as validador
    from pagos p left join perfiles pr on pr.id = p.validado_por
    where p.compromiso_id = c.id and p.estado = 'validado'
    order by p.validado_en desc nulls last limit 1
  ) pv on true
  where c.edificio_id = p_edificio and es_lector_admin(p_edificio)
  order by c.mes desc, d.piso, d.numero, c.emitido_en
$$;

-- ---------------------------------------------------------------------
-- 7. Cuenta corriente: cargos por su valor completo (sin los pagos adelantados) y abonos.
--    Saldo negativo = saldo a favor del vecino.
-- ---------------------------------------------------------------------
create or replace function cuenta_corriente(p_departamento uuid)
returns table (fecha date, concepto text, tipo text, estado text, cargo numeric, abono numeric, saldo numeric)
language sql stable security definer set search_path = public as $$
  with mov as (
    select c.emitido_en as fecha,
           c.concepto || case when coalesce((c.detalle->>'saldo_aplicado')::numeric, 0) > 0
                              then ' · saldo a favor aplicado: S/ ' || to_char((c.detalle->>'saldo_aplicado')::numeric, 'FM999G990D00')
                              else '' end as concepto,
           c.tipo::text as tipo,
           case when c.estado = 'anulado' then 'anulado'
                when c.estado = 'pendiente' and c.vence_en < hoy_lima() then 'vencido'
                else c.estado::text end as estado,
           case when c.estado = 'anulado' then 0 else coalesce((c.detalle->>'bruto')::numeric, c.monto) end as cargo,
           0::numeric as abono, c.created_at as orden, 1 as prioridad
    from compromisos c
    where c.departamento_id = p_departamento and c.tipo <> 'adelanto'
    union all
    select p.fecha_pago, 'Pago · ' || c.concepto, 'pago', 'validado', 0, p.monto, coalesce(p.validado_en, p.created_at), 2
    from pagos p join compromisos c on c.id = p.compromiso_id
    where p.departamento_id = p_departamento and p.estado = 'validado'
  )
  select m.fecha, m.concepto, m.tipo, m.estado, m.cargo, m.abono,
         sum(m.cargo - m.abono) over (order by m.fecha, m.prioridad, m.orden rows unbounded preceding)
  from mov m
  where es_lector_admin(edificio_de_depto(p_departamento)) or es_de_mi_depto(p_departamento)
  order by m.fecha, m.prioridad, m.orden
$$;

-- ---------------------------------------------------------------------
-- 8. Corte diario: solo las cuotas generan mora
-- ---------------------------------------------------------------------
create or replace function ejecutar_cortes() returns int
language plpgsql security definer set search_path = public as $$
declare p record; v_deps uuid[]; v_n int := 0;
begin
  for p in
    select pe.id, pe.edificio_id, pe.mes, e.mora_monto
    from periodos pe join edificios e on e.id = pe.edificio_id
    where not exists (select 1 from cortes c where c.periodo_id = pe.id)
      and hoy_lima() > pe.mes + (e.dia_corte - 1)
      and pe.mes >= (date_trunc('month', hoy_lima()) - interval '2 months')::date
  loop
    with m as (
      update compromisos set moroso = true
      where edificio_id = p.edificio_id and mes = p.mes and tipo = 'cuota'
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
revoke execute on function ejecutar_cortes() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Datos existentes: los pagos adelantados ya pagados pasan a saldo a favor
-- ---------------------------------------------------------------------
insert into saldo_favor (edificio_id, departamento_id, monto, concepto, compromiso_id)
select c.edificio_id, c.departamento_id, c.monto, c.concepto, c.id
from compromisos c
where c.tipo = 'adelanto' and c.estado = 'pagado'
  and not exists (select 1 from saldo_favor s where s.compromiso_id = c.id);
