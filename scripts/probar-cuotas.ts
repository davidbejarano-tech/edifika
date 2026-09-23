/**
 * Prueba de referencia del cálculo de cuotas (RN-02, RN-03, RN-38) con la planilla del Product Owner:
 * 17 departamentos, áreas comunes 230 m², monto fijo S/ 5,600, recibo S/ 2,303 (1,792 m³ del medidor general).
 *
 *   npm run probar:cuotas
 *
 * Crea una cuenta y un edificio temporales, registra medidores y lecturas con las funciones reales,
 * compara calcular_cuotas() con la planilla y prueba los otros modelos de cuota. Al final borra todo.
 * Usa la service role solo para crear y borrar la cuenta temporal (script local, nunca en el navegador).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Planilla del Product Owner: [depto, área m², m³, cuota fija, cuota de agua]
const PLANILLA: [string, number, number, number, number][] = [
  ["1001", 150, 87, 281.97, 126.65], ["1002", 203, 65, 381.6, 94.62], ["1003", 185, 93, 347.77, 135.38],
  ["1004", 115, 68, 216.18, 98.99], ["1005", 127, 59, 238.74, 85.89], ["1006", 114, 66, 214.3, 96.08],
  ["1007", 212, 46, 398.52, 66.96], ["1008", 196, 106, 368.45, 154.31], ["1009", 152, 110, 285.73, 160.13],
  ["1010", 213, 98, 400.4, 142.66], ["1011", 198, 53, 372.21, 77.15], ["1012", 219, 62, 411.68, 90.26],
  ["1013", 135, 136, 253.78, 197.98], ["1014", 213, 170, 400.4, 247.48], ["1015", 168, 118, 315.81, 171.78],
  ["1016", 223, 164, 419.2, 238.74], ["1017", 156, 81, 293.25, 117.92],
];
const MONTO_FIJO = 5600;
const RECIBO = 2303;
const CONSUMO_GENERAL = 1792;

const EMAIL = "prueba-cuotas@demo.buildingbuddy.pe";
const CLAVE = "PruebaCuotas2026!";
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const S = (n: number) => n.toFixed(2);
const suma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

async function main() {
  const { data: creado, error: e0 } = await admin.auth.admin.createUser({ email: EMAIL, password: CLAVE, email_confirm: true });
  if (e0) throw new Error(`No se pudo crear la cuenta temporal: ${e0.message}`);
  const uid = creado.user!.id;
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });

  try {
    await sb.auth.signInWithPassword({ email: EMAIL, password: CLAVE });

    // Edificio con departamentos, áreas y medidores (lectura inicial 0)
    const { data: ed, error: e1 } = await sb.rpc("registrar_edificio", {
      p_nombre: "Prueba de cuotas",
      p_direccion: "Planilla de referencia",
      p_codigo: `prueba-cuotas-${Date.now().toString(36)}`,
      p_total_departamentos: PLANILLA.length,
      p_mes_inicio: "2026-08-01",
      p_mi_nombre: "Prueba",
      p_filas: PLANILLA.map(([n, area]) => ({ numero: n, piso: 10, propietario: `Propietario ${n}`, area, medidor: `MED-${n}` })),
    });
    if (e1) throw new Error(e1.message);
    await sb.from("edificios").update({
      base_cuota: "fijo_area", agua_cuota: "consumo", monto_fijo_mensual: MONTO_FIJO, area_comun_m2: 230, dia_lectura: 25,
    }).eq("id", ed!);

    const { data: periodo } = await sb.from("periodos").select("id").eq("edificio_id", ed!).single();
    const { data: hoja } = await sb.rpc("lecturas_del_periodo", { p_periodo: periodo!.id });
    const { error: e2 } = await sb.rpc("registrar_lecturas", {
      p_periodo: periodo!.id,
      p_fecha: "2026-08-25",
      p_lecturas: PLANILLA.map(([n, , m3]) => ({ medidor_id: hoja!.find((h) => h.numero === n)!.medidor_id, lectura: m3 })),
    });
    if (e2) throw new Error(e2.message);
    await sb.from("recibos_agua").insert({ periodo_id: periodo!.id, monto: RECIBO, consumo_m3: CONSUMO_GENERAL });

    const calcular = async () => {
      const { data, error } = await sb.rpc("calcular_cuotas", { p_periodo: periodo!.id });
      if (error) throw new Error(error.message);
      return data.map((r) => ({ numero: r.numero, fijo: Number(r.comun), agua: Number(r.agua), total: Number(r.total), m3: Number(r.m3) }));
    };
    const config = (c: Database["public"]["Tables"]["edificios"]["Update"]) => sb.from("edificios").update(c).eq("id", ed!);

    // 1. Planilla: monto fijo por área + agua por consumo
    console.log("\n· Planilla del Product Owner (monto fijo por área + agua por consumo)");
    const r = await calcular();
    let maxDif = 0;
    for (const [n, , m3, fijo, agua] of PLANILLA) {
      const x = r.find((y) => y.numero === n)!;
      maxDif = Math.max(maxDif, Math.abs(x.fijo - fijo), Math.abs(x.agua - agua));
      if (x.m3 !== m3) ok(false, `${n}: m³ ${x.m3} en lugar de ${m3}`);
    }
    ok(maxDif <= 0.011, `Las 17 cuotas coinciden con la planilla (mayor diferencia S/ ${S(maxDif)}, por el redondeo)`);
    ok(suma(r.map((x) => x.fijo)) === MONTO_FIJO, `La cuota fija suma exacto S/ ${S(suma(r.map((x) => x.fijo)))} (planilla: 5,599.99)`);
    ok(suma(r.map((x) => x.agua)) === RECIBO, `El agua suma exacto S/ ${S(suma(r.map((x) => x.agua)))} (planilla: 2,302.98)`);
    const d1001 = r.find((x) => x.numero === "1001")!;
    ok(Math.abs(d1001.total - 408.62) <= 0.011, `Depto 1001: cuota del mes S/ ${S(d1001.total)} (planilla: 408.62)`);

    // 2. Monto fijo por área, agua incluida: lo mismo todos los meses
    console.log("\n· Monto fijo por área, agua incluida");
    await config({ agua_cuota: "incluida" });
    const r2 = await calcular();
    ok(r2.every((x) => x.agua === 0) && suma(r2.map((x) => x.total)) === MONTO_FIJO, "Sin cuota de agua; el total es exactamente el monto fijo");

    // 3. Monto fijo igual para todos (S/ 300 por depto) + agua por consumo
    console.log("\n· Monto fijo igual para todos (S/ 300) + agua por consumo");
    await config({ base_cuota: "fijo_igual", agua_cuota: "consumo", monto_fijo_mensual: 300 });
    const r3 = await calcular();
    ok(r3.every((x) => x.fijo === 300), "Cada departamento paga S/ 300.00 de cuota fija");
    ok(suma(r3.map((x) => x.agua)) === RECIBO, "El agua sigue sumando exacto el recibo");

    // 4. Gastos reales por área: con agua por consumo no se cobra el agua dos veces
    console.log("\n· Gastos reales por área");
    await sb.from("gastos").insert({
      edificio_id: ed!, periodo_id: periodo!.id, tipo: "recurrente", categoria: "Sueldos",
      descripcion: "Conserje", monto: 4000, fecha: "2026-08-05",
    });
    await config({ base_cuota: "gastos", agua_cuota: "consumo" });
    const r4 = await calcular();
    ok(suma(r4.map((x) => x.fijo)) === 4000 && suma(r4.map((x) => x.agua)) === RECIBO,
      `Con agua por consumo: base S/ ${S(suma(r4.map((x) => x.fijo)))} (sin el recibo) + agua S/ ${S(suma(r4.map((x) => x.agua)))}`);
    await config({ agua_cuota: "incluida" });
    const r5 = await calcular();
    ok(suma(r5.map((x) => x.fijo)) === 4000 + RECIBO && r5.every((x) => x.agua === 0),
      `Con agua incluida: los gastos con el recibo (S/ ${S(suma(r5.map((x) => x.fijo)))}) se reparten por área`);

    // 5. Sin configurar
    await config({ base_cuota: null });
    const { error: e3 } = await sb.rpc("calcular_cuotas", { p_periodo: periodo!.id });
    ok(!!e3 && e3.message.startsWith("Configura la cobranza"), `Sin configurar: "${e3?.message}"`);
  } finally {
    // Limpieza: el titular no puede borrar edificios, se hace con la service role
    const { data: eds } = await admin.from("membresias").select("edificio_id").eq("perfil_id", uid);
    for (const { edificio_id } of eds ?? []) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", edificio_id).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", edificio_id)).data!.map((d) => d.id);
      await admin.from("membresias").delete().eq("edificio_id", edificio_id);
      await admin.from("ocupaciones").delete().in("departamento_id", ids);
      await admin.from("auditoria").delete().eq("edificio_id", edificio_id);
      const { error } = await admin.from("edificios").delete().eq("id", edificio_id);
      if (error) console.log(`✖ No se pudo borrar el edificio temporal: ${error.message}`);
      await admin.from("organizaciones").delete().eq("id", e!.organizacion_id);
    }
    await admin.auth.admin.deleteUser(uid);
  }

  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
