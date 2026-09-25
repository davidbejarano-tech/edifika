-- =====================================================================
-- EDIFIKA · 0020 Vencimiento del recibo
-- El recibo muestra el vencimiento más próximo de lo que falta pagar
-- (antes tomaba el de la cuota aunque ya estuviera pagada).
-- =====================================================================
create or replace function _totales_recibo(p_departamento uuid, p_mes date)
returns table (cargos numeric, saldo_aplicado numeric, pagado numeric, en_revision numeric,
               anterior numeric, anteriores int, total numeric, vencido boolean, vence date)
language sql stable security definer set search_path = public as $$
  with c as (
    select c.*, coalesce((c.detalle->>'bruto')::numeric, c.monto) as bruto,
           coalesce((c.detalle->>'saldo_aplicado')::numeric, 0) as aplicado
    from compromisos c
    where c.departamento_id = p_departamento and c.tipo <> 'adelanto' and c.estado <> 'anulado'
  ),
  m as (select * from c where mes = p_mes),
  a as (select * from c where mes < p_mes and estado in ('pendiente','en_revision'))
  select coalesce((select sum(bruto) from m), 0),
         coalesce((select sum(aplicado) from m), 0),
         coalesce((select sum(bruto - aplicado) from m where estado = 'pagado'), 0),
         coalesce((select sum(monto) from m where estado = 'en_revision'), 0),
         coalesce((select sum(monto) from a), 0),
         (select count(*) from a)::int,
         coalesce((select sum(monto) from m where estado in ('pendiente','en_revision')), 0)
           + coalesce((select sum(monto) from a), 0),
         exists (select 1 from c where estado = 'pendiente' and vence_en < hoy_lima() and mes <= p_mes),
         coalesce((select min(vence_en) from (select vence_en from m where estado in ('pendiente','en_revision')
                                              union all select vence_en from a) x),
                  (select vence_en from m where tipo = 'cuota'))
$$;
revoke execute on function _totales_recibo(uuid, date) from public, anon, authenticated;
