-- =====================================================================
-- EDIFIKA · 0011 Nombre de la aplicación en los mensajes de la base
-- El producto pasó a llamarse EDIFIKA. Único mensaje visible con el nombre anterior.
-- =====================================================================
create or replace function transferencia_forzada(p_edificio uuid, p_nuevo uuid, p_acta_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_plataforma() then raise exception 'Solo el equipo de EDIFIKA puede hacer una transferencia forzada'; end if;
  if coalesce(trim(p_acta_path), '') = '' then raise exception 'Adjunta el acta de la junta de propietarios'; end if;
  perform _transferir_titularidad(p_edificio, p_nuevo, 'lectura', true, p_acta_path);
end $$;
