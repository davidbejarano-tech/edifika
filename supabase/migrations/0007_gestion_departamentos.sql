-- =====================================================================
-- Building Buddy · 0007 Gestión de departamentos (Etapa 2b)
-- RN-01, RN-02, RN-16, RN-21, RN-27 y RN-38
--   · Tabla de departamentos para la administración en un solo llamado.
--   · Activar o desactivar el acceso de un departamento (solo titular).
--   · Actualizar áreas y medidores de varios departamentos, todo o nada.
--   · Historial de ocupantes dados de baja.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla de departamentos (Departamentos y ocupantes)
-- ---------------------------------------------------------------------
create or replace function departamentos_admin(p_edificio uuid)
returns table (
  departamento_id uuid, numero text, piso smallint, area_m2 numeric, alicuota numeric,
  propietario_id uuid, propietario text, propietario_email text, propietario_telefono text,
  inquilino_id uuid, inquilino text, inquilino_email text, inquilino_telefono text,
  medidor_id uuid, medidor_serie text, medidor_lectura_inicial numeric, medidor_desde date,
  acceso text)   -- 'activo' | 'inactivo' | 'sin_cuenta'
language sql stable security definer set search_path = public as $$
  select d.id, d.numero, d.piso, d.area_m2,
         round(d.area_m2 / nullif(sum(d.area_m2) over (), 0), 6),
         pp.id, pp.nombre, pp.email, pp.telefono,
         pi.id, pi.nombre, pi.email, pi.telefono,
         m.id, m.numero_serie, m.lectura_inicial, m.instalado_en,
         case when exists (select 1 from membresias x where x.departamento_id = d.id and x.rol = 'habitante' and x.estado = 'activo') then 'activo'
              when exists (select 1 from membresias x where x.departamento_id = d.id and x.rol = 'habitante') then 'inactivo'
              else 'sin_cuenta' end
  from departamentos d
  left join ocupaciones op on op.departamento_id = d.id and op.tipo = 'propietario' and op.hasta is null
  left join personas pp on pp.id = op.persona_id
  left join ocupaciones oi on oi.departamento_id = d.id and oi.tipo = 'inquilino' and oi.hasta is null
  left join personas pi on pi.id = oi.persona_id
  left join medidores m on m.departamento_id = d.id and m.retirado_en is null
  where d.edificio_id = p_edificio and es_lector_admin(p_edificio)
  order by d.piso, d.numero
$$;

-- ---------------------------------------------------------------------
-- 2. Historial de ocupantes dados de baja (RN-16)
-- ---------------------------------------------------------------------
create or replace function historial_ocupantes(p_edificio uuid)
returns table (numero text, nombre text, tipo tipo_ocupacion, desde date, hasta date)
language sql stable security definer set search_path = public as $$
  select d.numero, p.nombre, o.tipo, o.desde, o.hasta
  from ocupaciones o
  join departamentos d on d.id = o.departamento_id
  join personas p on p.id = o.persona_id
  where d.edificio_id = p_edificio and o.hasta is not null and es_lector_admin(p_edificio)
  order by o.hasta desc, d.numero
$$;

-- ---------------------------------------------------------------------
-- 3. Activar o desactivar el acceso del departamento (RN-21: solo titular)
--    Activar reactiva la última cuenta que tuvo el departamento.
-- ---------------------------------------------------------------------
create or replace function cambiar_acceso(p_departamento uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_ed uuid := edificio_de_depto(p_departamento); v_mem uuid; v_num text;
begin
  if v_ed is null then raise exception 'Departamento no encontrado'; end if;
  if not es_titular(v_ed) then raise exception 'Solo el administrador titular activa o desactiva accesos'; end if;
  select numero into v_num from departamentos where id = p_departamento;

  if p_activo then
    if exists (select 1 from membresias where departamento_id = p_departamento and rol = 'habitante' and estado = 'activo') then
      return;
    end if;
    select id into v_mem from membresias
    where departamento_id = p_departamento and rol = 'habitante'
    order by coalesce(baja_en, created_at::date) desc, created_at desc limit 1;
    if v_mem is null then
      raise exception 'El departamento % no tiene una cuenta de acceso. Invita al ocupante', v_num;
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

-- ---------------------------------------------------------------------
-- 4. Actualizar áreas y medidores desde Excel (RN-02, RN-38). Todo o nada.
--    p_filas: [{"numero":"101","area":72.5,"medidor":"SED-001","lectura_inicial":0}]
--    Una celda vacía no cambia el dato. Un medidor distinto al activo lo reemplaza.
-- ---------------------------------------------------------------------
create or replace function actualizar_departamentos(p_edificio uuid, p_filas jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare f jsonb; k int := 0; v_dep uuid; v_num text; v_area numeric; v_med text; v_lect numeric; v_activo text;
begin
  if not es_titular(p_edificio) then raise exception 'Solo el administrador titular actualiza los departamentos'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'No hay filas para actualizar'; end if;
  if jsonb_array_length(p_filas) > 500 then raise exception 'Máximo 500 filas por actualización'; end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    k := k + 1;
    v_num := trim(f->>'numero');
    v_med := nullif(upper(trim(f->>'medidor')), '');
    begin
      v_area := nullif(f->>'area', '')::numeric;
      v_lect := coalesce(nullif(f->>'lectura_inicial', '')::numeric, 0);
    exception when others then
      raise exception 'Fila % (depto %): el área y la lectura inicial deben ser números', k, v_num;
    end;
    select id into v_dep from departamentos where edificio_id = p_edificio and numero = v_num;
    if v_dep is null then raise exception 'Fila %: no existe el departamento %', k, coalesce(v_num, '(vacío)'); end if;
    if v_area is not null and v_area <= 0 then raise exception 'Fila % (depto %): el área debe ser mayor que cero', k, v_num; end if;
    if v_lect < 0 then raise exception 'Fila % (depto %): la lectura inicial no puede ser negativa', k, v_num; end if;

    if v_area is not null then
      update departamentos set area_m2 = v_area where id = v_dep;
    end if;
    if v_med is not null then
      select upper(numero_serie) into v_activo from medidores where departamento_id = v_dep and retirado_en is null;
      if v_activo is distinct from v_med then
        begin
          perform registrar_medidor(v_dep, v_med, v_lect, hoy_lima());
        exception when others then
          raise exception 'Fila % (depto %): %', k, v_num, sqlerrm;
        end;
      end if;
    end if;
  end loop;

  insert into auditoria (edificio_id, accion, entidad, datos)
  values (p_edificio, 'actualizar_departamentos', 'departamentos', jsonb_build_object('cantidad', k));
  return k;
end $$;

revoke execute on function departamentos_admin(uuid) from public, anon;
revoke execute on function historial_ocupantes(uuid) from public, anon;
revoke execute on function cambiar_acceso(uuid, boolean) from public, anon;
revoke execute on function actualizar_departamentos(uuid, jsonb) from public, anon;
grant execute on function departamentos_admin(uuid) to authenticated;
grant execute on function historial_ocupantes(uuid) to authenticated;
grant execute on function cambiar_acceso(uuid, boolean) to authenticated;
grant execute on function actualizar_departamentos(uuid, jsonb) to authenticated;
