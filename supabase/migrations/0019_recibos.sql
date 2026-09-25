-- =====================================================================
-- EDIFIKA · 0019 Recibos en PDF y envío (Etapa 5)
--   1. Totales del recibo de un departamento y mes (una sola fórmula)
--   2. Datos completos del recibo para la vista previa y el PDF
--   3. Lista de recibos del mes para la administración
--   4. Registrar el recibo generado (PDF en Storage) y su envío
--   5. Storage: la administración puede reemplazar el PDF al regenerarlo
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Totales. Cargos del mes (en bruto) − saldo a favor aplicado − pagos
--    + deuda de meses anteriores. Los adelantos y lo anulado no cuentan.
-- ---------------------------------------------------------------------
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
         coalesce((select vence_en from m where tipo = 'cuota'),
                  (select min(vence_en) from m where estado in ('pendiente','en_revision')),
                  (select min(vence_en) from a))
$$;
revoke execute on function _totales_recibo(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Datos del recibo (RN-24: figura solo el titular)
-- ---------------------------------------------------------------------
create or replace function datos_recibo(p_departamento uuid, p_mes date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ed edificios; v_dep record; t record; v_base date; v_rec recibos;
  v_resp personas; v_prop text; v_inq text; v_cargos jsonb; v_gastos jsonb; v_total_gastos numeric;
begin
  select * into v_ed from edificios where id = edificio_de_depto(p_departamento);
  if not found or not (es_lector_admin(v_ed.id) or es_de_mi_depto(p_departamento)) then
    raise exception 'Sin acceso a este recibo';
  end if;
  p_mes := date_trunc('month', p_mes)::date;
  select d.numero, d.piso, d.area_m2, d.alicuota into v_dep from v_departamentos d where d.id = p_departamento;
  select * into t from _totales_recibo(p_departamento, p_mes);
  select * into v_rec from recibos where departamento_id = p_departamento and mes = p_mes;
  select * into v_resp from personas where id = responsable_de(p_departamento);
  select p.nombre into v_prop from ocupaciones o join personas p on p.id = o.persona_id
    where o.departamento_id = p_departamento and o.hasta is null and o.tipo = 'propietario';
  select p.nombre into v_inq from ocupaciones o join personas p on p.id = o.persona_id
    where o.departamento_id = p_departamento and o.hasta is null and o.tipo = 'inquilino';

  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', c.tipo, 'concepto', c.concepto, 'estado', c.estado, 'vence', c.vence_en,
           'monto', coalesce((c.detalle->>'bruto')::numeric, c.monto),
           'comun', (c.detalle->>'comun')::numeric, 'agua', (c.detalle->>'agua')::numeric,
           'm3', (c.detalle->>'m3')::numeric, 'alicuota', (c.detalle->>'alicuota')::numeric,
           'base_mes', c.detalle->>'base_mes', 'saldo_aplicado', (c.detalle->>'saldo_aplicado')::numeric)
           order by (c.tipo = 'cuota') desc, c.created_at), '[]'::jsonb)
    into v_cargos
  from compromisos c
  where c.departamento_id = p_departamento and c.mes = p_mes and c.tipo <> 'adelanto' and c.estado <> 'anulado';

  select (c.detalle->>'base_mes')::date into v_base from compromisos c
  where c.departamento_id = p_departamento and c.mes = p_mes and c.tipo = 'cuota';
  v_base := coalesce(v_base, (p_mes - interval '1 month')::date);
  select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'monto', monto) order by monto desc), '[]'::jsonb),
         coalesce(sum(monto), 0)
    into v_gastos, v_total_gastos
  from (select g.categoria, sum(g.monto) as monto from gastos g join periodos pe on pe.id = g.periodo_id
        where pe.edificio_id = v_ed.id and pe.mes = v_base group by g.categoria) x;

  return jsonb_build_object(
    'numero', to_char(p_mes, 'YYYYMM') || '-' || v_dep.numero,
    'mes', p_mes,
    'emitido', hoy_lima(),
    'edificio', jsonb_build_object('nombre', v_ed.nombre, 'direccion', v_ed.direccion,
                  'administrador', coalesce(v_rec.titular_nombre, titular_nombre(v_ed.id)),
                  'cuenta_bancaria', v_ed.cuenta_bancaria, 'yape_plin', v_ed.yape_plin, 'mora', v_ed.mora_monto),
    'departamento', jsonb_build_object('id', p_departamento, 'numero', v_dep.numero, 'piso', v_dep.piso,
                  'area', v_dep.area_m2, 'alicuota', v_dep.alicuota, 'propietario', v_prop, 'inquilino', v_inq,
                  'responsable', v_resp.nombre, 'correo', v_resp.email, 'telefono', v_resp.telefono),
    'cargos', v_cargos,
    'totales', jsonb_build_object('cargos', t.cargos, 'saldo_aplicado', t.saldo_aplicado, 'pagado', t.pagado,
                  'en_revision', t.en_revision, 'anterior', t.anterior, 'anteriores', t.anteriores,
                  'total', t.total, 'vencido', t.vencido, 'vence', t.vence,
                  'saldo_favor', saldo_a_favor(p_departamento)),
    'estado', case when t.total <= 0 then 'pagado' when t.vencido then 'vencido' else 'por_pagar' end,
    'gastos', jsonb_build_object('mes', v_base, 'categorias', v_gastos, 'total', v_total_gastos),
    'recibo', case when v_rec.id is null then null else jsonb_build_object(
                  'id', v_rec.id, 'generado_en', v_rec.created_at, 'enviado_en', v_rec.enviado_en,
                  'canal', v_rec.canal, 'pdf_path', v_rec.pdf_path) end
  );
end $$;
revoke execute on function datos_recibo(uuid, date) from public, anon;
grant execute on function datos_recibo(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Recibos del mes para la administración
-- ---------------------------------------------------------------------
create or replace function recibos_del_mes(p_edificio uuid, p_mes date)
returns table (departamento_id uuid, numero text, responsable text, correo text, telefono text,
               total numeric, estado text, recibo_id uuid, generado_en timestamptz, enviado_en timestamptz, canal text)
language sql stable security definer set search_path = public as $$
  select d.id, d.numero, pr.nombre, pr.email, pr.telefono, t.total,
         case when t.total <= 0 then 'pagado' when t.vencido then 'vencido' else 'por_pagar' end,
         r.id, r.created_at, r.enviado_en, r.canal
  from departamentos d
  cross join lateral _totales_recibo(d.id, date_trunc('month', p_mes)::date) t
  left join personas pr on pr.id = responsable_de(d.id)
  left join recibos r on r.departamento_id = d.id and r.mes = date_trunc('month', p_mes)::date
  where d.edificio_id = p_edificio and es_lector_admin(p_edificio)
  order by d.piso, d.numero
$$;
revoke execute on function recibos_del_mes(uuid, date) from public, anon;
grant execute on function recibos_del_mes(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Registrar el recibo generado y su envío (titular o coadministrador)
--    Al regenerar se actualizan total, PDF y titular vigente (RN-24); el envío se reinicia.
-- ---------------------------------------------------------------------
create or replace function registrar_recibo(p_departamento uuid, p_mes date, p_pdf_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ed uuid := edificio_de_depto(p_departamento); v_total numeric; v_num text; v_id uuid;
begin
  if v_ed is null or not es_admin(v_ed) then raise exception 'Solo la administración genera recibos'; end if;
  p_mes := date_trunc('month', p_mes)::date;
  if p_pdf_path is null or split_part(p_pdf_path, '/', 1) <> v_ed::text or split_part(p_pdf_path, '/', 2) <> p_departamento::text then
    raise exception 'Ruta del PDF inválida';
  end if;
  select total into v_total from _totales_recibo(p_departamento, p_mes);
  select to_char(p_mes, 'YYYYMM') || '-' || numero into v_num from departamentos where id = p_departamento;
  insert into recibos (edificio_id, departamento_id, mes, numero, total, pdf_path)
  values (v_ed, p_departamento, p_mes, v_num, greatest(v_total, 0), p_pdf_path)
  on conflict (departamento_id, mes) do update
    set total = excluded.total, pdf_path = excluded.pdf_path, numero = excluded.numero,
        titular_nombre = titular_nombre(v_ed), created_at = now(), enviado_en = null, canal = null
  returning id into v_id;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v_ed, 'generar_recibo', 'recibos', v_id, jsonb_build_object('numero', v_num, 'total', v_total));
  return v_id;
end $$;
revoke execute on function registrar_recibo(uuid, date, text) from public, anon;
grant execute on function registrar_recibo(uuid, date, text) to authenticated;

create or replace function marcar_recibo_enviado(p_recibo uuid, p_canal text) returns void
language plpgsql security definer set search_path = public as $$
declare v recibos;
begin
  select * into v from recibos where id = p_recibo;
  if not found or not es_admin(v.edificio_id) then raise exception 'Solo la administración envía recibos'; end if;
  if p_canal not in ('correo','whatsapp') then raise exception 'Canal de envío inválido'; end if;
  update recibos set enviado_en = now(), canal = p_canal where id = p_recibo;
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v.edificio_id, 'enviar_recibo', 'recibos', p_recibo, jsonb_build_object('canal', p_canal));
end $$;
revoke execute on function marcar_recibo_enviado(uuid, text) from public, anon;
grant execute on function marcar_recibo_enviado(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Storage: reemplazar el PDF al regenerar (upsert necesita update)
-- ---------------------------------------------------------------------
create policy recibos_actualizar on storage.objects for update to authenticated
  using (bucket_id = 'recibos' and es_admin(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'recibos' and es_admin(((storage.foldername(name))[1])::uuid));

update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['application/pdf']
where id = 'recibos';
