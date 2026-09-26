-- =====================================================================
-- 0025 · Frecuencia de los gastos recurrentes
-- Un gasto recurrente se repite cada 1, 2, 3, 4, 6 o 12 meses (mensual, bimestral, trimestral,
-- cuatrimestral, semestral o anual). Los extraordinarios no llevan frecuencia.
-- =====================================================================

-- Solo tiene sentido en los recurrentes. Los gastos existentes (y el agua) quedan como mensuales.
alter table gastos add column frecuencia_meses smallint not null default 1
  check (frecuencia_meses in (1, 2, 3, 4, 6, 12));

-- ---------------------------------------------------------------------
-- Abrir periodo: los recurrentes del nuevo mes guardan su frecuencia (resto igual a 0017)
-- ---------------------------------------------------------------------
create or replace function abrir_periodo(p_edificio uuid, p_recurrentes jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ed edificios; v_act periodos; v_nuevo uuid; v_mes date; v_vence date;
  r record; v_total numeric; i jsonb; v_emitidas int := 0;
  v_saldo numeric; v_usar numeric; v_neto numeric; v_cid uuid; v_regreso date; v_vence_dep date;
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
    select coalesce(sum(monto), 0) into v_saldo from saldo_favor where departamento_id = r.departamento_id;
    v_usar := greatest(0, least(v_saldo, case when v_ed.base_cuota = 'gastos' then r.total else r.comun end));
    v_neto := r.total - v_usar;

    -- RN-40: solo el agua pendiente se posterga hasta 15 días después del regreso
    v_vence_dep := v_vence;
    v_regreso := regreso_de_ausencia(r.departamento_id, v_vence);
    if v_regreso is not null and v_neto > 0 and v_neto <= r.agua + 0.005 then
      v_vence_dep := greatest(v_vence, v_regreso + 15);
    end if;

    insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, emitido_en, vence_en, estado, detalle)
    values (p_edificio, r.departamento_id, v_mes, 'cuota', 'Cuota de mantenimiento, ' || mes_es(v_mes),
            case when v_neto > 0 then v_neto else r.total end, v_mes, v_vence_dep,
            case when v_neto > 0 then 'pendiente'::estado_compromiso else 'pagado'::estado_compromiso end,
            jsonb_build_object('base_mes', v_act.mes, 'alicuota', r.alicuota, 'comun', r.comun, 'm3', r.m3,
                               'agua', r.agua, 'bruto', r.total, 'saldo_aplicado', v_usar,
                               'saldo_restante', v_saldo - v_usar, 'postergado_por_ausencia', v_vence_dep > v_vence))
    returning id into v_cid;
    if v_usar > 0 then
      insert into saldo_favor (edificio_id, departamento_id, fecha, monto, concepto, compromiso_id)
      values (p_edificio, r.departamento_id, v_mes, -v_usar, 'Aplicado a la cuota de ' || mes_es(v_mes), v_cid);
    end if;
    v_emitidas := v_emitidas + 1;
  end loop;

  for i in select * from jsonb_array_elements(coalesce(p_recurrentes, '[]'::jsonb)) loop
    if coalesce((i->>'monto')::numeric, 0) > 0 then
      insert into gastos (edificio_id, periodo_id, tipo, categoria, descripcion, monto, fecha, frecuencia_meses)
      values (p_edificio, v_nuevo, 'recurrente', i->>'categoria',
              coalesce(nullif(i->>'descripcion', ''), i->>'categoria'), (i->>'monto')::numeric, v_mes,
              coalesce((i->>'frecuencia_meses')::smallint, 1));
    end if;
  end loop;

  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'abrir_periodo', 'periodos', v_nuevo, jsonb_build_object('mes', v_mes, 'cuotas', v_emitidas));
  return v_nuevo;
end $$;
