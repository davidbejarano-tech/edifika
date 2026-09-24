-- =====================================================================
-- EDIFIKA · 0017 Pago agrupado (RN-10, RN-11) y ausencia prolongada (RN-40)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pago agrupado: varios compromisos con un solo comprobante
--    Cada compromiso tiene su pago; todos comparten "grupo", comprobante y operación.
--    Se validan o rechazan completos.
-- ---------------------------------------------------------------------
alter table pagos add column grupo uuid;
create index pagos_grupo on pagos (grupo) where grupo is not null;

create or replace function validar_grupo(p_grupo uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in select id from pagos where grupo = p_grupo and estado = 'en_revision' order by created_at loop
    perform validar_pago(v_id);   -- cada uno vuelve a comprobar el permiso (RN-22); si uno falla, no se valida ninguno
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Este grupo de pagos ya fue procesado'; end if;
  return v_n;
end $$;

create or replace function rechazar_grupo(p_grupo uuid, p_nota text) returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  if coalesce(trim(p_nota), '') = '' then raise exception 'Indica el motivo del rechazo'; end if;
  for v_id in select id from pagos where grupo = p_grupo and estado = 'en_revision' order by created_at loop
    perform rechazar_pago(v_id, p_nota);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Este grupo de pagos ya fue procesado'; end if;
  return v_n;
end $$;

revoke execute on function validar_grupo(uuid) from public, anon;
revoke execute on function rechazar_grupo(uuid, text) from public, anon;
grant execute on function validar_grupo(uuid) to authenticated;
grant execute on function rechazar_grupo(uuid, text) to authenticated;

drop function pagos_por_validar(uuid);
create or replace function pagos_por_validar(p_edificio uuid)
returns table (pago_id uuid, grupo uuid, departamento_id uuid, numero text, concepto text, tipo tipo_compromiso,
               monto numeric, metodo text, operacion text, fecha_pago date, comprobante_path text,
               registrado_por text, enviado_en timestamptz, puede_validar boolean, motivo text)
language sql stable security definer set search_path = public as $$
  select p.id, p.grupo, p.departamento_id, d.numero, c.concepto, c.tipo, p.monto, p.metodo, p.operacion, p.fecha_pago,
         p.comprobante_path, pr.nombre, p.created_at,
         puede_validar_pago(p.edificio_id, p.departamento_id),
         case
           when puede_validar_pago(p.edificio_id, p.departamento_id) then null
           when p.departamento_id = mi_departamento_en(p.edificio_id) then 'Es un pago de tu propio departamento: lo valida otra persona del equipo.'
           when p.departamento_id = depto_del_titular(p.edificio_id) then 'Es un pago del departamento del titular: lo valida un coadministrador o, si no hay, el vecino validador.'
           when nivel_admin_de(p.edificio_id) = 'lectura' then 'Tienes acceso de solo lectura.'
           else 'No tienes permiso para validar este pago.'
         end
  from pagos p
  join compromisos c on c.id = p.compromiso_id
  join departamentos d on d.id = p.departamento_id
  left join perfiles pr on pr.id = p.registrado_por
  where p.edificio_id = p_edificio and p.estado = 'en_revision'
    and (es_lector_admin(p_edificio)
         or (es_validador_designado(p_edificio) and p.departamento_id = depto_del_titular(p_edificio)))
  order by p.created_at, p.grupo, c.vence_en
$$;
revoke execute on function pagos_por_validar(uuid) from public, anon;
grant execute on function pagos_por_validar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Ausencia prolongada (RN-40)
-- ---------------------------------------------------------------------
create table ausencias (
  id               uuid primary key default gen_random_uuid(),
  edificio_id      uuid not null references edificios on delete cascade,
  departamento_id  uuid not null references departamentos on delete cascade,
  desde            date not null,
  hasta            date not null,
  motivo           text not null,
  estado           text not null default 'solicitada' check (estado in ('solicitada','aprobada','rechazada','cancelada')),
  nota             text,
  solicitada_por   uuid references perfiles default auth.uid(),
  resuelta_por     uuid references perfiles,
  resuelta_en      timestamptz,
  created_at       timestamptz not null default now(),
  check (hasta > desde),
  check (hasta <= desde + interval '6 months')
);
create index ausencias_depto on ausencias (departamento_id, estado);
alter table ausencias enable row level security;
create policy aus_leer on ausencias for select to authenticated
  using (es_lector_admin(edificio_id) or es_de_mi_depto(departamento_id));
-- Sin escritura directa: solo por funciones

-- Fecha de regreso de la ausencia aprobada que cubre una fecha (null si no hay)
create or replace function regreso_de_ausencia(p_departamento uuid, p_fecha date) returns date
language sql stable security definer set search_path = public as $$
  select max(hasta) from ausencias
  where departamento_id = p_departamento and estado = 'aprobada' and p_fecha between desde and hasta
$$;
revoke execute on function regreso_de_ausencia(uuid, date) from public, anon, authenticated;

-- Quién aprueba: el titular; si el departamento es el del titular, un coadministrador
create or replace function puede_aprobar_ausencia(p_edificio uuid, p_departamento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_departamento = mi_departamento_en(p_edificio) then false
    when p_departamento = depto_del_titular(p_edificio) then coalesce(nivel_admin_de(p_edificio) = 'operador', false)
    else es_titular(p_edificio)
  end
$$;

create or replace function solicitar_ausencia(p_edificio uuid, p_desde date, p_hasta date, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_dep uuid := mi_departamento_en(p_edificio); v_id uuid;
begin
  if v_dep is null then raise exception 'Solo un vecino con acceso activo puede avisar una ausencia'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Cuéntale a la administración el motivo de tu ausencia'; end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then raise exception 'La fecha de regreso debe ser posterior a la de salida'; end if;
  if p_hasta > p_desde + interval '6 months' then raise exception 'La ausencia puede durar como máximo 6 meses'; end if;
  if p_hasta < hoy_lima() then raise exception 'La fecha de regreso ya pasó'; end if;
  if exists (select 1 from ausencias where departamento_id = v_dep and estado in ('solicitada','aprobada') and hasta >= hoy_lima()) then
    raise exception 'Ya tienes una ausencia pendiente o vigente';
  end if;
  insert into ausencias (edificio_id, departamento_id, desde, hasta, motivo)
  values (p_edificio, v_dep, p_desde, p_hasta, trim(p_motivo)) returning id into v_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (p_edificio, 'solicitar_ausencia', 'ausencias', v_id, jsonb_build_object('desde', p_desde, 'hasta', p_hasta));
  return v_id;
end $$;

create or replace function cancelar_ausencia(p_ausencia uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a ausencias;
begin
  select * into a from ausencias where id = p_ausencia for update;
  if not found or not es_de_mi_depto(a.departamento_id) then raise exception 'Ausencia no encontrada'; end if;
  if a.estado <> 'solicitada' then raise exception 'Solo se cancela una ausencia que aún no se resolvió'; end if;
  update ausencias set estado = 'cancelada' where id = p_ausencia;
end $$;

-- Aprobar posterga el agua y los extraordinarios pendientes de esos meses hasta 15 días después del regreso
create or replace function resolver_ausencia(p_ausencia uuid, p_aprobar boolean, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a ausencias; v_limite date;
begin
  select * into a from ausencias where id = p_ausencia for update;
  if not found then raise exception 'Ausencia no encontrada'; end if;
  if not puede_aprobar_ausencia(a.edificio_id, a.departamento_id) then
    if a.departamento_id = mi_departamento_en(a.edificio_id) then
      raise exception 'No puedes resolver la ausencia de tu propio departamento';
    end if;
    raise exception 'Solo el administrador titular aprueba las ausencias (las del departamento del titular, un coadministrador)';
  end if;
  if a.estado <> 'solicitada' then raise exception 'Esta ausencia ya fue resuelta'; end if;
  if not p_aprobar and coalesce(trim(p_nota), '') = '' then raise exception 'Indica el motivo del rechazo'; end if;

  update ausencias set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         nota = nullif(trim(p_nota), ''), resuelta_por = auth.uid(), resuelta_en = now()
  where id = p_ausencia;

  if p_aprobar then
    v_limite := a.hasta + 15;
    -- Extraordinarios pendientes que vencen durante la ausencia
    update compromisos set vence_en = greatest(vence_en, v_limite)
    where departamento_id = a.departamento_id and estado = 'pendiente' and tipo = 'extraordinario'
      and vence_en between a.desde and a.hasta;
    -- Cuotas de esos meses a las que solo les falta el agua (la parte fija ya la cubrió el saldo a favor)
    update compromisos set vence_en = greatest(vence_en, v_limite)
    where departamento_id = a.departamento_id and estado = 'pendiente' and tipo = 'cuota'
      and vence_en between a.desde and a.hasta
      and monto <= coalesce((detalle->>'agua')::numeric, 0) + 0.005;
  end if;

  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (a.edificio_id, case when p_aprobar then 'aprobar_ausencia' else 'rechazar_ausencia' end, 'ausencias', p_ausencia,
          jsonb_build_object('nota', p_nota));
end $$;

create or replace function ausencias_admin(p_edificio uuid)
returns table (ausencia_id uuid, departamento_id uuid, numero text, solicitante text, desde date, hasta date,
               motivo text, estado text, nota text, resuelta_por text, puede_resolver boolean, creada date)
language sql stable security definer set search_path = public as $$
  select a.id, a.departamento_id, d.numero, ps.nombre, a.desde, a.hasta, a.motivo, a.estado, a.nota, pr.nombre,
         puede_aprobar_ausencia(a.edificio_id, a.departamento_id), a.created_at::date
  from ausencias a
  join departamentos d on d.id = a.departamento_id
  left join perfiles ps on ps.id = a.solicitada_por
  left join perfiles pr on pr.id = a.resuelta_por
  where a.edificio_id = p_edificio and es_lector_admin(p_edificio)
  order by (a.estado = 'solicitada') desc, a.desde desc
$$;

revoke execute on function puede_aprobar_ausencia(uuid, uuid) from public, anon;
revoke execute on function solicitar_ausencia(uuid, date, date, text) from public, anon;
revoke execute on function cancelar_ausencia(uuid) from public, anon;
revoke execute on function resolver_ausencia(uuid, boolean, text) from public, anon;
revoke execute on function ausencias_admin(uuid) from public, anon;
grant execute on function puede_aprobar_ausencia(uuid, uuid) to authenticated;
grant execute on function solicitar_ausencia(uuid, date, date, text) to authenticated;
grant execute on function cancelar_ausencia(uuid) to authenticated;
grant execute on function resolver_ausencia(uuid, boolean, text) to authenticated;
grant execute on function ausencias_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Abrir periodo: con ausencia aprobada, una cuota a la que solo le falta el agua vence al regreso
--    (resto igual a 0016)
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
-- 4. Extraordinarios: a un departamento con ausencia aprobada le vence al regreso (resto igual a 0013)
-- ---------------------------------------------------------------------
create or replace function emitir_extraordinario(p_edificio uuid, p_concepto text, p_monto numeric,
  p_reparto text, p_vence date, p_departamento uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_mes date; v_n int;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular emite compromisos'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if coalesce(trim(p_concepto), '') = '' then raise exception 'Escribe el concepto del compromiso'; end if;
  if p_vence is null then raise exception 'Indica la fecha de vencimiento'; end if;
  if p_reparto = 'alicuota' and exists (select 1 from departamentos where edificio_id = p_edificio
                                         and (p_departamento is null or id = p_departamento) and area_m2 is null) then
    raise exception 'Para repartir por área, completa el área de todos los departamentos';
  end if;
  select mes into v_mes from periodos where edificio_id = p_edificio and estado = 'abierto';
  if v_mes is null then raise exception 'No hay un mes abierto'; end if;

  insert into compromisos (edificio_id, departamento_id, mes, tipo, concepto, monto, vence_en)
  with base as (
    select d.id, d.numero,
           case when p_reparto = 'alicuota' then p_monto * d.area_m2 / sum(d.area_m2) over () else p_monto end as crudo
    from departamentos d
    where d.edificio_id = p_edificio and (p_departamento is null or d.id = p_departamento)
  ),
  piso as (select b.*, floor(b.crudo * 100) / 100 as piso from base b),
  resto as (
    select p.*,
           case when p_reparto = 'alicuota' then round((p_monto - sum(p.piso) over ()) * 100)::int else 0 end as sobra,
           row_number() over (order by p.crudo - p.piso desc, p.numero) as orden
    from piso p
  )
  select p_edificio, r.id, v_mes, 'extraordinario', trim(p_concepto),
         r.piso + case when r.orden <= r.sobra then 0.01 else 0 end,
         greatest(p_vence, coalesce(regreso_de_ausencia(r.id, p_vence) + 15, p_vence))
  from resto r;
  get diagnostics v_n = row_count;

  insert into auditoria (edificio_id, accion, entidad, datos)
  values (p_edificio, 'emitir_extraordinario', 'compromisos', jsonb_build_object('concepto', p_concepto, 'monto', p_monto, 'cantidad', v_n));
  return v_n;
end $$;
