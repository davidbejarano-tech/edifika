-- =====================================================================
-- EDIFIKA · 0013 Extraordinario por área con redondeo exacto (RN-13 y regla de redondeo de RN-03)
-- Antes cada departamento se redondeaba por separado y la suma podía diferir del total en céntimos.
-- Ahora se reparte al céntimo y los céntimos sobrantes van, uno por uno, a los de mayor fracción.
-- Resto igual a 0005.
-- =====================================================================
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
         r.piso + case when r.orden <= r.sobra then 0.01 else 0 end, p_vence
  from resto r;
  get diagnostics v_n = row_count;

  insert into auditoria (edificio_id, accion, entidad, datos)
  values (p_edificio, 'emitir_extraordinario', 'compromisos', jsonb_build_object('concepto', p_concepto, 'monto', p_monto, 'cantidad', v_n));
  return v_n;
end $$;
