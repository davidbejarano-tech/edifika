-- =====================================================================
-- Building Buddy · Datos de prueba (Edificio Los Ficus)
-- Ejecutar después de la migración. Crea el edificio, 12 departamentos,
-- ocupantes, el periodo de agosto 2026 con gastos confirmados y agua,
-- y setiembre abierto. Las cuentas de acceso se crean aparte con la
-- Edge Function "invitar-habitante" (o desde Authentication en Supabase).
-- El administrador titular se asigna con la Edge Function "invitar-administrador"
-- o, en local, con scripts/crear-usuarios-demo.ts.
-- =====================================================================
do $$
declare
  v_org uuid; v_ed uuid; v_ago uuid; v_set uuid; d record; v_per uuid; i int := 0;
  nombres text[][] := array[
    ['101','Rosa Huamán Quispe',''],['102','Luis Alberto Paredes',''],['103','Mariela Chávez Torres','Jorge Salinas Vega'],
    ['201','Ricardo Benavides Luna','Ana Lucía Ferrer'],['202','Patricia Gonzales Rivera',''],['203','Fernando Del Solar',''],
    ['301','Gabriela Montoya Ríos',''],['302','Héctor Ramírez Lozano',''],['303','Sofía Castañeda Prado','Diego Valdivia Ramos'],
    ['401','Carlos Mendoza Aguirre',''],['402','Elena Vargas Pinto',''],['403','Miguel Ángel Ortiz','Valeria Núñez Soto']];
begin
  insert into organizaciones (nombre) values ('Administraciones Demo SAC') returning id into v_org;
  insert into edificios (organizacion_id, codigo, nombre, direccion, total_departamentos,
                         area_total_m2, tipo_calculo, dia_corte, mora_monto, saldo_inicial, cuenta_bancaria, yape_plin,
                         monto_fijo_mensual, dia_lectura, base_cuota, agua_cuota, area_comun_m2)
  values (v_org, 'los-ficus', 'Edificio Los Ficus', 'Calle Los Ficus 245, San Isidro, Lima',
          12, 1108, 'mixta_agua', 15, 20, 6500, 'BCP Soles 191-2345678-0-12', '987 654 321',
          4900, 25, 'fijo_area', 'consumo', 180)
  returning id into v_ed;

  for f in 1..4 loop
    for u in 1..3 loop
      insert into departamentos (edificio_id, numero, piso, area_m2)
      values (v_ed, f || '0' || u, f, (array[72,95,110])[u]);
    end loop;
  end loop;

  for k in 1..array_length(nombres, 1) loop
    select id into d from departamentos where edificio_id = v_ed and numero = nombres[k][1];
    insert into personas (edificio_id, nombre) values (v_ed, nombres[k][2]) returning id into v_per;
    insert into ocupaciones (departamento_id, persona_id, tipo, desde) values (d.id, v_per, 'propietario', '2019-03-01');
    if nombres[k][3] <> '' then
      insert into personas (edificio_id, nombre) values (v_ed, nombres[k][3]) returning id into v_per;
      insert into ocupaciones (departamento_id, persona_id, tipo, desde) values (d.id, v_per, 'inquilino', '2025-04-01');
    end if;
  end loop;

  -- Agosto: gastos + agua + lecturas (luego se confirma y se cierra al abrir setiembre)
  insert into periodos (edificio_id, mes) values (v_ed, '2026-08-01') returning id into v_ago;
  insert into gastos (edificio_id, periodo_id, tipo, categoria, descripcion, monto, fecha) values
    (v_ed, v_ago, 'recurrente', 'Energía eléctrica', 'Luz de áreas comunes y bomba', 634.10, '2026-08-05'),
    (v_ed, v_ago, 'recurrente', 'Internet y cámaras', 'Plan de internet y monitoreo', 179.90, '2026-08-05'),
    (v_ed, v_ago, 'recurrente', 'Sueldos', 'Conserje y personal de limpieza', 2400, '2026-08-05'),
    (v_ed, v_ago, 'recurrente', 'Mantenimiento de ascensor', 'Contrato mensual', 450, '2026-08-05'),
    (v_ed, v_ago, 'extraordinario', 'Reparaciones', 'Cambio de bomba de agua', 1250, '2026-08-12');
  for d in select id, area_m2 from departamentos where edificio_id = v_ed order by numero loop
    insert into lecturas_agua (periodo_id, departamento_id, m3) values (v_ago, d.id, round(d.area_m2 / 5) + (i % 4));
    i := i + 1;
  end loop;
  insert into recibos_agua (periodo_id, monto, consumo_m3, riego_m3)
  select v_ago, 1510, sum(m3) + 34 + 5, 34 from lecturas_agua where periodo_id = v_ago;
  update periodos set gastos_confirmados_en = now() where id = v_ago;

  raise notice 'Edificio creado: % (código los-ficus). Periodo abierto: agosto 2026.', v_ed;
  raise notice 'Para emitir las cuotas de setiembre, el administrador titular ejecuta abrir_periodo(%, ...).', v_ed;
end $$;
