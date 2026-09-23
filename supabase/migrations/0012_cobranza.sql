-- =====================================================================
-- EDIFIKA · 0012 Cobranza (Etapa 3b, RN-08, RN-10, RN-11, RN-13, RN-22)
-- Consultas para la pantalla Cobranza. Las acciones ya existen en 0001/0005:
-- validar_pago, rechazar_pago, registrar_pago_efectivo, anular_compromiso,
-- emitir_extraordinario y cuentas_por_cobrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pagos en revisión, con permiso de validación por fila (RN-22)
--    Los ve el equipo de administración y el vecino validador (solo los del titular).
-- ---------------------------------------------------------------------
create or replace function pagos_por_validar(p_edificio uuid)
returns table (pago_id uuid, departamento_id uuid, numero text, concepto text, tipo tipo_compromiso,
               monto numeric, metodo text, operacion text, fecha_pago date, comprobante_path text,
               registrado_por text, enviado_en timestamptz, puede_validar boolean, motivo text)
language sql stable security definer set search_path = public as $$
  select p.id, p.departamento_id, d.numero, c.concepto, c.tipo, p.monto, p.metodo, p.operacion, p.fecha_pago,
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
  order by p.created_at
$$;

-- ---------------------------------------------------------------------
-- 2. Compromisos emitidos con su último pago (RN-08, RN-11)
-- ---------------------------------------------------------------------
create or replace function compromisos_admin(p_edificio uuid)
returns table (compromiso_id uuid, departamento_id uuid, numero text, tipo tipo_compromiso, concepto text,
               mes date, monto numeric, emitido_en date, vence_en date, estado estado_compromiso,
               estado_visible text, anulado_motivo text, pago_metodo text, pago_fecha date,
               validado_por text, ultimo_rechazo text, puede_validar boolean, soy_titular boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.departamento_id, d.numero, c.tipo, c.concepto, c.mes, c.monto, c.emitido_en, c.vence_en, c.estado,
         case when c.estado in ('pagado','en_revision','anulado') then c.estado::text
              when c.vence_en < hoy_lima() then 'vencido' else 'pendiente' end,
         c.anulado_motivo,
         pv.metodo, pv.fecha_pago, pv.validador,
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

revoke execute on function pagos_por_validar(uuid) from public, anon;
revoke execute on function compromisos_admin(uuid) from public, anon;
grant execute on function pagos_por_validar(uuid) to authenticated;
grant execute on function compromisos_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Comprobantes: imagen o PDF de máximo 5 MB (RN-10)
-- ---------------------------------------------------------------------
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
where id = 'comprobantes';
