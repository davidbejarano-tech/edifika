-- =====================================================================
-- Building Buddy · 0009 Acceso según el ocupante actual (RN-16, RN-21)
-- Tras un cambio de ocupante, la última cuenta del departamento es la de quien salió:
-- no debe poder reactivarse. Solo se reactiva si pertenece al ocupante responsable actual
-- (inquilino vigente o, si no hay, propietario). Si no, hay que invitarlo.
-- =====================================================================

-- Persona responsable del departamento: inquilino vigente o propietario
create or replace function responsable_de(p_departamento uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select o.persona_id from ocupaciones o
  where o.departamento_id = p_departamento and o.hasta is null
  order by (o.tipo = 'inquilino') desc, o.desde desc
  limit 1
$$;
revoke execute on function responsable_de(uuid) from public, anon, authenticated;

-- 'activo' | 'desactivado' (la cuenta del ocupante actual está desactivada) | 'sin_cuenta' (hay que invitar)
create or replace function estado_acceso(p_departamento uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from membresias m where m.departamento_id = p_departamento and m.rol = 'habitante' and m.estado = 'activo')
      then 'activo'
    when exists (select 1 from membresias m join personas p on p.perfil_id = m.perfil_id
                 where m.departamento_id = p_departamento and m.rol = 'habitante' and m.estado = 'inactivo'
                   and p.id = responsable_de(p_departamento))
      then 'desactivado'
    else 'sin_cuenta' end
$$;
revoke execute on function estado_acceso(uuid) from public, anon, authenticated;

drop function departamentos_admin(uuid);
create or replace function departamentos_admin(p_edificio uuid)
returns table (
  departamento_id uuid, numero text, piso smallint, area_m2 numeric, alicuota numeric,
  propietario_id uuid, propietario text, propietario_email text, propietario_telefono text,
  inquilino_id uuid, inquilino text, inquilino_email text, inquilino_telefono text,
  medidor_id uuid, medidor_serie text, medidor_lectura_inicial numeric, medidor_desde date,
  acceso text, responsable text, responsable_tiene_correo boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.numero, d.piso, d.area_m2,
         round(d.area_m2 / nullif(sum(d.area_m2) over (), 0), 6),
         pp.id, pp.nombre, pp.email, pp.telefono,
         pi.id, pi.nombre, pi.email, pi.telefono,
         m.id, m.numero_serie, m.lectura_inicial, m.instalado_en,
         estado_acceso(d.id),
         coalesce(pi.nombre, pp.nombre),
         coalesce(pi.email, pp.email) is not null
  from departamentos d
  left join ocupaciones op on op.departamento_id = d.id and op.tipo = 'propietario' and op.hasta is null
  left join personas pp on pp.id = op.persona_id
  left join ocupaciones oi on oi.departamento_id = d.id and oi.tipo = 'inquilino' and oi.hasta is null
  left join personas pi on pi.id = oi.persona_id
  left join medidores m on m.departamento_id = d.id and m.retirado_en is null
  where d.edificio_id = p_edificio and es_lector_admin(p_edificio)
  order by d.piso, d.numero
$$;
revoke execute on function departamentos_admin(uuid) from public, anon;
grant execute on function departamentos_admin(uuid) to authenticated;

-- Reactivar solo la cuenta del ocupante responsable actual
create or replace function cambiar_acceso(p_departamento uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_ed uuid := edificio_de_depto(p_departamento); v_mem uuid; v_num text;
begin
  if v_ed is null then raise exception 'Departamento no encontrado'; end if;
  if not es_titular(v_ed) then raise exception 'Solo el administrador titular activa o desactiva accesos'; end if;
  select numero into v_num from departamentos where id = p_departamento;

  if p_activo then
    if estado_acceso(p_departamento) = 'activo' then return; end if;
    select m.id into v_mem from membresias m join personas p on p.perfil_id = m.perfil_id
    where m.departamento_id = p_departamento and m.rol = 'habitante' and m.estado = 'inactivo'
      and p.id = responsable_de(p_departamento)
    order by m.created_at desc limit 1;
    if v_mem is null then
      raise exception 'El ocupante actual del departamento % no tiene cuenta. Envíale la invitación', v_num;
    end if;
    update membresias set estado = 'activo', baja_en = null where id = v_mem;
  else
    update membresias set estado = 'inactivo', baja_en = hoy_lima()
    where departamento_id = p_departamento and rol = 'habitante' and estado = 'activo';
  end if;

  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v_ed, case when p_activo then 'activar_acceso' else 'desactivar_acceso' end, 'departamentos', p_departamento,
          jsonb_build_object('numero', v_num));
end $$;
