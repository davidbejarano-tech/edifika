-- =====================================================================
-- EDIFIKA · 0015 Adelantos por edificio (RN-12, RN-25)
-- La versión de 0001 tomaba la primera membresía de habitante de la cuenta: con departamentos
-- en dos edificios podía adelantar en el equivocado. Ahora recibe el edificio elegido.
-- Estimado = última cuota o adelanto del departamento; al abrir ese mes, abrir_periodo
-- emite un ajuste si la cuota real es mayor.
-- =====================================================================
drop function solicitar_adelanto(int);

create or replace function solicitar_adelanto(p_edificio uuid, p_meses int) returns int
language plpgsql security definer set search_path = public as $$
declare v_dep uuid := mi_departamento_en(p_edificio); v_ed edificios; v_mes date; v_est numeric; v_n int := 0; k int;
begin
  if p_meses is null or p_meses not between 1 and 6 then raise exception 'Puedes adelantar entre 1 y 6 meses'; end if;
  if v_dep is null then raise exception 'Solo un vecino con acceso activo puede pagar por adelantado'; end if;
  select * into v_ed from edificios where id = p_edificio;
  select mes into v_mes from periodos where edificio_id = p_edificio and estado = 'abierto';
  if v_mes is null then raise exception 'El edificio no tiene un mes abierto'; end if;
  select monto into v_est from compromisos
  where departamento_id = v_dep and tipo in ('cuota','adelanto') and estado <> 'anulado'
  order by mes desc limit 1;
  if v_est is null then raise exception 'Aún no hay una cuota de referencia para estimar el adelanto'; end if;

  for k in 1..p_meses loop
    v_mes := (v_mes + interval '1 month')::date;
    if not exists (select 1 from compromisos where departamento_id = v_dep and mes = v_mes
                   and tipo in ('cuota','adelanto') and estado <> 'anulado') then
      insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, vence_en)
      values (p_edificio, v_dep, v_mes, 'adelanto', 'Cuota adelantada, ' || mes_es(v_mes),
              v_est, v_mes + (v_ed.dia_corte - 1));
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then raise exception 'Esos meses ya tienen su cuota o adelanto registrado'; end if;

  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'solicitar_adelanto', 'departamentos', v_dep, jsonb_build_object('meses', v_n, 'estimado', v_est));
  return v_n;
end $$;
revoke execute on function solicitar_adelanto(uuid, int) from public, anon;
grant execute on function solicitar_adelanto(uuid, int) to authenticated;
