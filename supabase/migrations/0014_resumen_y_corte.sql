-- =====================================================================
-- EDIFIKA · 0014 Resumen, cuenta corriente y corte diario (Etapa 3c)
-- RN-08, RN-09, RN-11, RN-14 y RN-15
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estado de cada departamento para la fachada del Resumen
--    vencido > en revisión > pendiente > al día
-- ---------------------------------------------------------------------
create or replace function estado_departamentos(p_edificio uuid)
returns table (departamento_id uuid, numero text, piso smallint, responsable text,
               deuda numeric, vencido numeric, en_revision int, estado text)
language sql stable security definer set search_path = public as $$
  select d.id, d.numero, d.piso,
         (select p.nombre from personas p where p.id = responsable_de(d.id)),
         coalesce(sum(c.monto) filter (where c.estado in ('pendiente','en_revision')
                  and not (c.tipo = 'adelanto' and c.vence_en >= hoy_lima())), 0),
         coalesce(sum(c.monto) filter (where c.estado = 'pendiente' and c.vence_en < hoy_lima()), 0),
         count(*) filter (where c.estado = 'en_revision')::int,
         case
           when count(*) filter (where c.estado = 'pendiente' and c.vence_en < hoy_lima()) > 0 then 'vencido'
           when count(*) filter (where c.estado = 'en_revision') > 0 then 'revision'
           when count(*) filter (where c.estado = 'pendiente'
                                 and not (c.tipo = 'adelanto' and c.vence_en >= hoy_lima())) > 0 then 'pendiente'
           else 'aldia' end
  from departamentos d
  left join compromisos c on c.departamento_id = d.id
  where d.edificio_id = p_edificio and es_lector_admin(p_edificio)
  group by d.id, d.numero, d.piso
  order by d.piso desc, d.numero
$$;

-- ---------------------------------------------------------------------
-- 2. Cuenta corriente de un departamento: cargos, pagos y saldo acumulado
--    La ve la administración y el propio departamento (Etapa 4).
-- ---------------------------------------------------------------------
create or replace function cuenta_corriente(p_departamento uuid)
returns table (fecha date, concepto text, tipo text, estado text, cargo numeric, abono numeric, saldo numeric)
language sql stable security definer set search_path = public as $$
  with mov as (
    select c.emitido_en as fecha, c.concepto, c.tipo::text as tipo,
           case when c.estado = 'anulado' then 'anulado'
                when c.estado = 'pendiente' and c.vence_en < hoy_lima() then 'vencido'
                else c.estado::text end as estado,
           case when c.estado = 'anulado' then 0 else c.monto end as cargo, 0::numeric as abono,
           c.created_at as orden, 1 as prioridad
    from compromisos c
    where c.departamento_id = p_departamento
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

revoke execute on function estado_departamentos(uuid) from public, anon;
revoke execute on function cuenta_corriente(uuid) from public, anon;
grant execute on function estado_departamentos(uuid) to authenticated;
grant execute on function cuenta_corriente(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Corte diario (RN-09): solo periodos recientes
--    Igual a 0001, pero sin recorrer meses antiguos que ya no tienen cuotas por vencer
--    (un edificio nuevo con mes de inicio pasado no genera cortes vacíos de años atrás).
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
revoke execute on function ejecutar_cortes() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Programación con pg_cron: todos los días a las 00:10 de Lima (05:10 UTC)
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'corte-diario') then
    perform cron.unschedule('corte-diario');
  end if;
  perform cron.schedule('corte-diario', '10 5 * * *', 'select public.ejecutar_cortes();');
end $$;
