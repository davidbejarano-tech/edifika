-- =====================================================================
-- Building Buddy · 0008 Cambio de ocupante: validar la fecha (RN-16)
-- Si la fecha del cambio era anterior al inicio del ocupante que sale, la restricción
-- de ocupaciones fallaba con un mensaje técnico en inglés. Ahora se valida antes y se
-- explica en español. El resto de la función es igual a la de 0001.
-- =====================================================================
create or replace function registrar_cambio_ocupante(p_departamento uuid, p_tipo tipo_ocupacion,
  p_nombre text, p_documento text, p_email text, p_telefono text, p_desde date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ed uuid := edificio_de_depto(p_departamento); v_persona uuid; v_inicio date; v_sale text;
begin
  if not es_titular(v_ed) then raise exception 'Solo el administrador titular registra cambios de ocupante'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Escribe el nombre del nuevo ocupante'; end if;
  if p_desde is null then raise exception 'Indica desde qué fecha ocupa el departamento'; end if;

  select o.desde, p.nombre into v_inicio, v_sale
  from ocupaciones o join personas p on p.id = o.persona_id
  where o.departamento_id = p_departamento and o.hasta is null
    and (o.tipo = p_tipo or p_tipo = 'propietario')
  order by o.desde desc limit 1;
  if v_inicio is not null and p_desde < v_inicio then
    raise exception 'La fecha del cambio (%) no puede ser anterior al inicio de % en el departamento (%)',
      to_char(p_desde, 'DD/MM/YYYY'), v_sale, to_char(v_inicio, 'DD/MM/YYYY');
  end if;

  update membresias set estado = 'inactivo', baja_en = p_desde
  where departamento_id = p_departamento and rol = 'habitante' and estado = 'activo';
  update ocupaciones set hasta = p_desde
  where departamento_id = p_departamento and hasta is null
    and (tipo = p_tipo or p_tipo = 'propietario');
  insert into personas (edificio_id, nombre, documento, email, telefono)
  values (v_ed, trim(p_nombre), nullif(p_documento, ''), nullif(lower(trim(p_email)), ''), nullif(p_telefono, ''))
  returning id into v_persona;
  insert into ocupaciones (departamento_id, persona_id, tipo, desde) values (p_departamento, v_persona, p_tipo, p_desde);
  -- Si el validador designado vivía ahí, pierde la designación
  update edificios set validador_designado_id = null
  where id = v_ed and validador_designado_id is not null
    and not exists (select 1 from membresias m where m.perfil_id = validador_designado_id
                    and m.edificio_id = v_ed and m.estado = 'activo');
  insert into auditoria (edificio_id, accion, entidad, entidad_id, datos)
  values (v_ed, 'cambio_ocupante', 'departamentos', p_departamento, jsonb_build_object('tipo', p_tipo, 'persona', v_persona));
  return v_persona;
end $$;
