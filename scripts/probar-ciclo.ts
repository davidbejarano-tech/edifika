/**
 * Prueba del ciclo mensual (RN-04 a RN-07, RN-38) sobre un edificio temporal.
 *
 *   npm run probar:ciclo
 *
 * Titular y coadministrador temporales registran gastos, medidores, lecturas y recibo de agua, confirman
 * y abren el mes siguiente con las funciones reales. La service role solo prepara cuentas y limpia al final.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaCiclo2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const S = (n: number) => n.toFixed(2);
const cuentas: string[] = [];

async function cuenta(alias: string) {
  const email = `ciclo-${alias}-${sufijo}@demo.buildingbuddy.pe`;
  const { data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true });
  cuentas.push(data.user!.id);
  await admin.from("perfiles").insert({ id: data.user!.id, nombre: `Prueba ${alias}` });
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password: CLAVE });
  return { id: data.user!.id, sb };
}

async function main() {
  const T = await cuenta("titular");
  const C = await cuenta("coadmin");
  let ed = "";
  try {
    // Edificio de 3 departamentos: monto fijo S/ 3,000 por área + agua por consumo
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba ciclo",
      p_direccion: "Temporal",
      p_codigo: `prueba-ciclo-${sufijo}`,
      p_total_departamentos: 3,
      p_mes_inicio: "2026-08-01",
      p_mi_nombre: "Prueba titular",
      p_filas: [
        { numero: "101", propietario: "A", area: 80, medidor: "M-101" },
        { numero: "102", propietario: "B", area: 100, medidor: "M-102" },
        { numero: "103", propietario: "C", area: 120, medidor: "M-103" },
      ],
    });
    if (r0.error) throw new Error(r0.error.message);
    ed = r0.data;
    await T.sb.from("edificios").update({ base_cuota: "fijo_area", agua_cuota: "consumo", monto_fijo_mensual: 3000, dia_lectura: 25 }).eq("id", ed);
    await T.sb.rpc("agregar_coadministrador", { p_edificio: ed, p_perfil: C.id });
    const agosto = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).single()).data!.id;

    console.log("\n· Agosto: el coadministrador registra los datos del mes");
    const g = await C.sb.from("gastos").insert([
      { edificio_id: ed, periodo_id: agosto, tipo: "recurrente", categoria: "Sueldos", descripcion: "Conserje", monto: 1500, fecha: "2026-08-05" },
      { edificio_id: ed, periodo_id: agosto, tipo: "recurrente", categoria: "Energía eléctrica", descripcion: "Luz", monto: 400, fecha: "2026-08-05" },
      { edificio_id: ed, periodo_id: agosto, tipo: "extraordinario", categoria: "Reparaciones", descripcion: "Bomba", monto: 800, fecha: "2026-08-12" },
    ]);
    ok(!g.error, "Registra 2 gastos recurrentes y 1 extraordinario");
    const hoja = (await C.sb.rpc("lecturas_del_periodo", { p_periodo: agosto })).data!;
    const med = (n: string) => hoja.find((h) => h.numero === n)!.medidor_id;
    const l = await C.sb.rpc("registrar_lecturas", {
      p_periodo: agosto,
      p_fecha: "2026-08-25",
      p_lecturas: [{ medidor_id: med("101"), lectura: 10 }, { medidor_id: med("102"), lectura: 20 }, { medidor_id: med("103"), lectura: 30 }],
    });
    ok(!l.error && l.data === 3, "Registra las lecturas de los 3 medidores");
    const ra = await C.sb.from("recibos_agua").insert({ periodo_id: agosto, monto: 600, consumo_m3: 70 });
    const gastoAgua = await C.sb.from("gastos").select("monto").eq("periodo_id", agosto).eq("origen", "agua").maybeSingle();
    ok(!ra.error && Number(gastoAgua.data?.monto) === 600, "El recibo de agua (S/ 600) crea el gasto “Agua” del mes (RN-05)");

    console.log("\n· Permisos del ciclo");
    const cc = await C.sb.rpc("confirmar_gastos", { p_periodo: agosto });
    ok(!!cc.error, `El coadministrador no confirma: "${cc.error?.message}"`);
    const ca = await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    ok(!!ca.error && /Confirma los gastos/.test(ca.error.message), `Sin confirmar no se abre el mes: "${ca.error?.message}"`);

    console.log("\n· Confirmar gastos (RN-06)");
    const cf = await T.sb.rpc("confirmar_gastos", { p_periodo: agosto });
    ok(!cf.error, "La titular confirma los gastos de agosto");
    const bloqueo = await C.sb.from("gastos").insert({
      edificio_id: ed, periodo_id: agosto, tipo: "extraordinario", categoria: "X", descripcion: "Tarde", monto: 1, fecha: "2026-08-30",
    });
    ok(!!bloqueo.error, "Ya no se pueden agregar gastos a agosto");
    const bloqueoL = await C.sb.rpc("registrar_lecturas", { p_periodo: agosto, p_fecha: "2026-08-26", p_lecturas: [{ medidor_id: med("101"), lectura: 11 }] });
    ok(!!bloqueoL.error, "Ni cambiar las lecturas");

    console.log("\n· Abrir setiembre (RN-07)");
    const prev = (await T.sb.rpc("calcular_cuotas", { p_periodo: agosto })).data!;
    const co = await C.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    ok(!!co.error, `El coadministrador no abre el mes: "${co.error?.message}"`);
    const ab = await T.sb.rpc("abrir_periodo", {
      p_edificio: ed,
      p_recurrentes: [
        { categoria: "Sueldos", descripcion: "Conserje", monto: 1500 },
        { categoria: "Energía eléctrica", descripcion: "Luz", monto: 420 },
      ],
    });
    ok(!ab.error, "La titular abre setiembre");
    const { data: pers } = await T.sb.from("periodos").select("id, mes, estado").eq("edificio_id", ed).order("mes");
    ok(pers?.length === 2 && pers[0].estado === "cerrado" && pers[1].estado === "abierto" && pers[1].mes === "2026-09-01", "Agosto queda cerrado y setiembre abierto");
    const setiembre = pers![1].id;

    const { data: cuotas } = await T.sb.from("compromisos").select("monto, vence_en, detalle, departamentos(numero)").eq("edificio_id", ed).eq("tipo", "cuota");
    const total = cuotas!.reduce((s, c) => s + Number(c.monto), 0);
    ok(cuotas!.length === 3 && S(total) === "3600.00", `Se emiten 3 cuotas por S/ ${S(total)} (fijo 3,000 + agua 600)`);
    const c101 = cuotas!.find((c) => (c.departamentos as unknown as { numero: string }).numero === "101")!;
    const esperado = prev.find((p) => p.numero === "101")!;
    // 101: fijo 3000 × 80/300 = 800; agua 600 × 10/60 = 100
    ok(Number(c101.monto) === 900 && Number(esperado.total) === 900, `Depto 101: S/ ${S(Number(c101.monto))} (fijo 800 + agua 100 por 10 de 60 m³)`);
    ok(c101.vence_en === "2026-09-15", `Vence el día de corte: ${c101.vence_en}`);
    const det = c101.detalle as { base_mes?: string; comun?: number; agua?: number };
    ok(det?.base_mes === "2026-08-01" && Number(det.comun) === 800 && Number(det.agua) === 100, "La cuota guarda su desglose (mes base, parte fija y agua)");

    const { data: recs } = await T.sb.from("gastos").select("categoria, monto").eq("periodo_id", setiembre).eq("tipo", "recurrente");
    ok(recs?.length === 2 && recs.some((r) => r.categoria === "Energía eléctrica" && Number(r.monto) === 420), "Los gastos recurrentes de setiembre se registran con los montos indicados");

    const hoja2 = (await T.sb.rpc("lecturas_del_periodo", { p_periodo: setiembre })).data!;
    ok(Number(hoja2.find((h) => h.numero === "103")!.lectura_anterior) === 30, "En setiembre, la lectura anterior del 103 es la de agosto (30)");

    const otra = await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    ok(!!otra.error, `Setiembre no se puede cerrar sin confirmar sus gastos: "${otra.error?.message}"`);
  } finally {
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((d) => d.id);
      await admin.from("pagos").delete().eq("edificio_id", ed);
      await admin.from("compromisos").delete().eq("edificio_id", ed);
      await admin.from("membresias").delete().eq("edificio_id", ed);
      await admin.from("ocupaciones").delete().in("departamento_id", ids);
      await admin.from("auditoria").delete().eq("edificio_id", ed);
      // Los periodos confirmados bloquean el borrado en cascada de gastos y lecturas: se desbloquean antes
      await admin.from("periodos").update({ gastos_confirmados_en: null }).eq("edificio_id", ed);
      const { error } = await admin.from("edificios").delete().eq("id", ed);
      if (error) console.log(`✖ No se pudo borrar el edificio temporal: ${error.message}`);
      await admin.from("organizaciones").delete().eq("id", e!.organizacion_id);
    }
    for (const id of cuentas) await admin.auth.admin.deleteUser(id);
  }
  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
