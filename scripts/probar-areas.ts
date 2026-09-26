/**
 * Prueba del módulo Áreas comunes (Etapa 7, RN-30 a RN-37) sobre un edificio temporal.
 *
 *   npm run probar:areas
 *
 * Titular externa, vecino 101 y vecino 102 que además es coadministrador. Zonas, turnos, dos vecinos
 * reservando el mismo turno a la vez, pago y confirmación, deuda vencida, expiración, cierre con daños
 * y su efecto en el estado de cuenta, aprobación y el módulo vencido.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaAreas2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];

async function cuenta(alias: string) {
  const email = `areas-${alias}-${sufijo}@demo.buildingbuddy.pe`;
  let { data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true });
  for (let i = 0; !data.user && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    ({ data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true }));
  }
  cuentas.push(data.user!.id);
  await admin.from("perfiles").insert({ id: data.user!.id, nombre: `Prueba ${alias}` });
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password: CLAVE });
  return { id: data.user!.id, sb };
}

// Fecha de Lima dentro de n días (AAAA-MM-DD)
function dia(n: number) {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const turno = (d: string, hora: string) => `${d}T${hora}:00-05:00`;

async function main() {
  const T = await cuenta("titular");
  const A = await cuenta("101");
  const B = await cuenta("102");
  const C = await cuenta("103"); // vecino sin cargo en la administración
  let ed = "";
  try {
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba áreas",
      p_direccion: "Temporal",
      p_codigo: `prueba-areas-${sufijo}`,
      p_total_departamentos: 3,
      p_mes_inicio: dia(0).slice(0, 8) + "01",
      p_mi_nombre: "Prueba titular",
      p_filas: ["101", "102", "103"].map((n) => ({ numero: n, propietario: `Prop ${n}`, area: 100 })),
    });
    if (r0.error) throw new Error(r0.error.message);
    ed = r0.data;
    const deps = (await T.sb.from("departamentos").select("id, numero").eq("edificio_id", ed)).data!;
    const dep = (n: string) => deps.find((d) => d.numero === n)!.id;
    const m = await admin.from("membresias").insert([
      { edificio_id: ed, perfil_id: A.id, rol: "habitante", departamento_id: dep("101") },
      { edificio_id: ed, perfil_id: B.id, rol: "habitante", departamento_id: dep("102") },
      { edificio_id: ed, perfil_id: B.id, rol: "admin", nivel: "operador" },
      { edificio_id: ed, perfil_id: C.id, rol: "habitante", departamento_id: dep("103") },
    ]);
    if (m.error) throw new Error(`Membresías: ${m.error.message}`);

    console.log("\n· Zonas (RN-30)");
    const zonaBase = {
      edificio_id: ed, nombre: "Parrilla", reglamento: "Dejar limpio", tarifa: 50, garantia: 100,
      hora_apertura: "09:00", hora_cierre: "22:00", duracion_turno_min: 240, anticipacion_min_dias: 1, anticipacion_max_dias: 30, max_reservas_mes: 3,
    };
    ok(!!(await B.sb.from("zonas_comunes").insert(zonaBase).select("id").single()).error, "Un coadministrador no configura zonas");
    const parrilla = (await T.sb.from("zonas_comunes").insert(zonaBase).select("id").single()).data!.id;
    ok(!!parrilla, "La titular crea la parrilla: tarifa S/ 50 y garantía S/ 100");
    const d2 = dia(2);
    ok(!!(await A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(d2, "09:00"), p_acepto_reglamento: true })).error, "Sin el módulo activo no se puede reservar");
    await T.sb.rpc("activar_prueba", { p_edificio: ed, p_modulo: "areas_comunes" });
    const turnos = (await A.sb.rpc("disponibilidad", { p_zona: parrilla, p_fecha: d2 })).data ?? [];
    ok(turnos.length === 3 && turnos.every((t) => t.libre), "Con la prueba activa: 3 turnos libres de 4 horas (9, 13 y 17 h)");
    ok(!!(await A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(d2, "10:00"), p_acepto_reglamento: true })).error, "Solo se reservan los turnos definidos");
    ok(!!(await A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(d2, "09:00"), p_acepto_reglamento: false })).error, "Hay que aceptar el reglamento");
    ok(!!(await A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(dia(0), "17:00"), p_acepto_reglamento: true })).error, "Se respeta la anticipación mínima");

    console.log("\n· Dos vecinos, el mismo turno, al mismo tiempo (RN-31)");
    const [ra, rb] = await Promise.all([
      A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(d2, "13:00"), p_acepto_reglamento: true }),
      B.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(d2, "13:00"), p_acepto_reglamento: true }),
    ]);
    ok([ra, rb].filter((r) => !r.error).length === 1, "Solo uno se queda con el turno");
    const perdedor = ra.error ? ra : rb;
    ok(/acaba de ser reservado|Elige otro/.test(perdedor.error?.message ?? ""), `El otro recibe: "${perdedor.error?.message}"`);
    const libre13 = (await A.sb.rpc("disponibilidad", { p_zona: parrilla, p_fecha: d2 })).data!.find((t) => t.inicio.includes("T18:00:00"));
    ok(libre13?.libre === false && libre13.motivo === "Reservado", "El turno se ve ocupado, sin decir quién lo reservó");
    // Se libera para seguir con un flujo predecible
    const ganador = ra.error ? B : A;
    await ganador.sb.rpc("cancelar_reserva", { p_reserva: (ra.error ? rb : ra).data! });

    console.log("\n· Reservar, pagar y confirmar (RN-32)");
    const res = await A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(d2, "17:00"), p_acepto_reglamento: true });
    ok(!res.error, "El 101 reserva el turno de las 17 h");
    const r1 = (await A.sb.from("reservas").select("estado, compromiso_tarifa, compromiso_garantia, garantia_estado").eq("id", res.data!).single()).data!;
    ok(r1.estado === "pendiente_pago" && r1.garantia_estado === "por_cobrar", "Queda pendiente de pago");
    const cargos = (await A.sb.from("compromisos").select("id, tipo, monto").in("id", [r1.compromiso_tarifa!, r1.compromiso_garantia!])).data ?? [];
    ok(cargos.length === 2 && cargos.some((c) => c.tipo === "reserva" && Number(c.monto) === 50) && cargos.some((c) => c.tipo === "garantia" && Number(c.monto) === 100), "Se emiten sus cargos: tarifa S/ 50 y garantía S/ 100");
    ok(((await C.sb.from("reservas").select("id").eq("departamento_id", dep("101"))).data ?? []).length === 0, "Un vecino del 102 no ve las reservas del 101");
    const grupo = crypto.randomUUID();
    await A.sb.from("pagos").insert(cargos.map((c) => ({ compromiso_id: c.id, edificio_id: ed, departamento_id: dep("101"), monto: Number(c.monto), metodo: "Yape", registrado_por: A.id, estado: "en_revision" as const, grupo })));
    ok(!(await T.sb.rpc("validar_grupo", { p_grupo: grupo })).error, "La titular valida el pago de los dos cargos");
    const r2 = (await A.sb.from("reservas").select("estado, garantia_estado").eq("id", res.data!).single()).data!;
    ok(r2.estado === "confirmada" && r2.garantia_estado === "en_custodia", "La reserva se confirma sola y la garantía queda en custodia");
    const custodia = (await T.sb.rpc("garantias_en_custodia", { p_edificio: ed }).single()).data;
    ok(Number(custodia?.en_custodia) === 100, "S/ 100 en custodia");
    const periodo = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).single()).data!.id;
    const ing1 = (await T.sb.rpc("resumen_periodo", { p_periodo: periodo }).single()).data;
    ok(Number(ing1?.ingresos) === 50, "Ingresos del mes: S/ 50 (la garantía no es ingreso)");

    console.log("\n· Cierre con daños (RN-35, RN-36)");
    ok(!!(await T.sb.rpc("cerrar_reserva", { p_reserva: res.data!, p_retener: 40, p_nota: "Parrilla rota" })).error, "No se cierra antes de que termine");
    await admin.from("reservas").update({ inicio: new Date(Date.now() - 6 * 3600000).toISOString(), fin: new Date(Date.now() - 2 * 3600000).toISOString() }).eq("id", res.data!);
    ok(!!(await T.sb.rpc("cerrar_reserva", { p_reserva: res.data!, p_retener: 40 })).error, "Para retener hay que describir los daños");
    ok(!!(await T.sb.rpc("cerrar_reserva", { p_reserva: res.data!, p_retener: 150, p_nota: "x" })).error, "No se retiene más que la garantía");
    ok(!(await T.sb.rpc("cerrar_reserva", { p_reserva: res.data!, p_retener: 40, p_nota: "Rejilla de la parrilla doblada" })).error, "Se cierra reteniendo S/ 40 por daños");
    const ing2 = (await T.sb.rpc("resumen_periodo", { p_periodo: periodo }).single()).data;
    ok(Number(ing2?.ingresos) === 90, "Ingresos del mes: S/ 50 + S/ 40 = S/ 90");
    const tipos = (await T.sb.rpc("ingresos_por_tipo", { p_periodo: periodo })).data ?? [];
    ok(Number(tipos.find((t) => t.tipo === "garantia_retenida")?.monto) === 40 && !tipos.some((t) => t.tipo === "garantia"), "El estado de cuenta muestra la garantía retenida, no la garantía");
    ok(Number((await T.sb.rpc("garantias_en_custodia", { p_edificio: ed }).single()).data?.en_custodia) === 0, "Ya no queda garantía en custodia");

    console.log("\n· Deuda vencida (RN-31)");
    const deuda = (await admin.from("compromisos").insert({ edificio_id: ed, departamento_id: dep("102"), mes: dia(0).slice(0, 8) + "01", tipo: "extraordinario", concepto: "Deuda de prueba", monto: 10, vence_en: dia(-3) }).select("id").single()).data!;
    const conDeuda = await B.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(dia(3), "09:00"), p_acepto_reglamento: true });
    ok(/deuda vencida/.test(conDeuda.error?.message ?? ""), "Un vecino con deuda vencida no puede reservar");
    await admin.from("compromisos").delete().eq("id", deuda.id);

    console.log("\n· Expiración por falta de pago (RN-33)");
    const exp = await B.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(dia(3), "09:00"), p_acepto_reglamento: true });
    const enRev = await B.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(dia(3), "13:00"), p_acepto_reglamento: true });
    ok(!exp.error && !enRev.error, "El 102 separa dos turnos sin pagar");
    const cRev = (await B.sb.from("reservas").select("compromiso_tarifa").eq("id", enRev.data!).single()).data!;
    await B.sb.from("pagos").insert({ compromiso_id: cRev.compromiso_tarifa!, edificio_id: ed, departamento_id: dep("102"), monto: 50, metodo: "Yape", registrado_por: B.id, estado: "en_revision" });
    await admin.from("reservas").update({ vence_pago_en: new Date(Date.now() - 60000).toISOString() }).in("id", [exp.data!, enRev.data!]);
    const n = (await admin.rpc("expirar_reservas")).data;
    ok(n === 1, "Vencido el plazo, expira una reserva (la otra tiene un pago en revisión)");
    const tras = (await admin.from("reservas").select("id, estado, compromiso_tarifa, compromiso_garantia").in("id", [exp.data!, enRev.data!])).data!;
    const expirada = tras.find((r) => r.id === exp.data)!;
    ok(expirada.estado === "expirada" && tras.find((r) => r.id === enRev.data)!.estado === "pendiente_pago", "La que tiene pago en revisión espera la validación");
    const anulados = (await admin.from("compromisos").select("estado").in("id", [expirada.compromiso_tarifa!, expirada.compromiso_garantia!])).data!;
    ok(anulados.every((c) => c.estado === "anulado"), "Sus cargos se anulan");
    ok((await A.sb.rpc("disponibilidad", { p_zona: parrilla, p_fecha: dia(3) })).data!.find((t) => t.inicio.includes("T14:00:00"))?.libre === true, "Y el turno se libera");

    console.log("\n· Cancelación del vecino (RN-34)");
    const can = await A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(dia(4), "09:00"), p_acepto_reglamento: true });
    ok(!!(await C.sb.rpc("cancelar_reserva", { p_reserva: can.data! })).error, "Un vecino no cancela la reserva de otro departamento");
    ok(!(await A.sb.rpc("cancelar_reserva", { p_reserva: can.data! })).error, "El 101 cancela su reserva antes del inicio");
    const rc = (await A.sb.from("reservas").select("estado, compromiso_tarifa").eq("id", can.data!).single()).data!;
    ok(rc.estado === "cancelada" && (await A.sb.from("compromisos").select("estado").eq("id", rc.compromiso_tarifa!).single()).data?.estado === "anulado", "Queda cancelada y su cargo anulado");

    console.log("\n· Aprobación (RN-32, RN-35)");
    const sum = (await T.sb.from("zonas_comunes").insert({ ...zonaBase, nombre: "SUM", tarifa: 0, garantia: 0, requiere_aprobacion: true }).select("id").single()).data!.id;
    const sa = await A.sb.rpc("solicitar_reserva", { p_zona: sum, p_inicio: turno(d2, "09:00"), p_acepto_reglamento: true });
    const sb2 = await B.sb.rpc("solicitar_reserva", { p_zona: sum, p_inicio: turno(d2, "13:00"), p_acepto_reglamento: true });
    ok((await A.sb.from("reservas").select("estado").eq("id", sa.data!).single()).data?.estado === "solicitada", "En el SUM la reserva queda por aprobar");
    ok(!!(await B.sb.rpc("aprobar_reserva", { p_reserva: sb2.data! })).error, "El coadministrador no aprueba la reserva de su propio departamento");
    ok(!(await B.sb.rpc("aprobar_reserva", { p_reserva: sa.data! })).error, "Pero sí la del 101");
    ok((await A.sb.from("reservas").select("estado").eq("id", sa.data!).single()).data?.estado === "confirmada", "Sin costo, queda confirmada al aprobarse");
    ok(!!(await T.sb.rpc("rechazar_reserva", { p_reserva: sb2.data!, p_motivo: "" })).error, "Rechazar pide un motivo");
    ok(!(await T.sb.rpc("rechazar_reserva", { p_reserva: sb2.data!, p_motivo: "El SUM está en pintura" })).error, "La titular rechaza la del 102 con motivo");
    const lista = (await T.sb.rpc("reservas_admin", { p_edificio: ed })).data ?? [];
    ok(lista.length >= 6 && lista.every((r) => !!r.numero && !!r.zona), "La administración ve todas las reservas con departamento y zona");
    ok(((await A.sb.rpc("reservas_admin", { p_edificio: ed })).data ?? []).length === 0, "Un vecino no ve esa lista");

    console.log("\n· Módulo vencido (RN-37)");
    await admin.from("modulos_edificio").update({ prueba_hasta: dia(-1) }).eq("edificio_id", ed);
    ok(!!(await A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(dia(5), "09:00"), p_acepto_reglamento: true })).error, "Vencida la prueba, no se aceptan reservas nuevas");
    await admin.from("edificios").update({ plan: "pro", suscripcion_pagada: true }).eq("id", ed);
    ok(!(await A.sb.rpc("solicitar_reserva", { p_zona: parrilla, p_inicio: turno(dia(5), "09:00"), p_acepto_reglamento: true })).error, "Con el plan Pro pagado se vuelve a reservar");
  } finally {
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((d) => d.id);
      await admin.from("reservas").delete().eq("edificio_id", ed);
      await admin.from("pagos").delete().eq("edificio_id", ed);
      await admin.from("compromisos").delete().eq("edificio_id", ed);
      await admin.from("membresias").delete().eq("edificio_id", ed);
      await admin.from("ocupaciones").delete().in("departamento_id", ids);
      await admin.from("auditoria").delete().eq("edificio_id", ed);
      await admin.from("periodos").update({ gastos_confirmados_en: null }).eq("edificio_id", ed);
      const { error } = await admin.from("edificios").delete().eq("id", ed);
      if (error) console.log(`✖ No se pudo borrar el edificio temporal: ${error.message}`);
      await admin.from("organizaciones").delete().eq("id", e!.organizacion_id);
    }
    for (const id of cuentas) await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
