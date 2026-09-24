/**
 * Prueba del corte diario, la fachada, la cuenta corriente y el estado de cuenta (RN-08, RN-09, RN-14).
 *
 *   npm run probar:corte
 *
 * Edificio temporal con corte el día 5 y mora de S/ 20; setiembre abierto y sus cuotas ya vencidas.
 * Nota: ejecutar_cortes() revisa todos los edificios; aplica a los demás lo mismo que haría pg_cron esa noche.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaCorte2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];

async function cuenta(alias: string) {
  const email = `corte-${alias}-${sufijo}@demo.buildingbuddy.pe`;
  const { data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true });
  cuentas.push(data.user!.id);
  await admin.from("perfiles").insert({ id: data.user!.id, nombre: `Prueba ${alias}` });
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password: CLAVE });
  return { id: data.user!.id, sb };
}

async function main() {
  const T = await cuenta("titular");
  const V2 = await cuenta("v102");
  const V3 = await cuenta("v103");
  let ed = "";
  try {
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba corte",
      p_direccion: "Temporal",
      p_codigo: `prueba-corte-${sufijo}`,
      p_total_departamentos: 3,
      p_mes_inicio: "2026-08-01",
      p_mi_nombre: "Prueba titular",
      p_filas: ["101", "102", "103"].map((n) => ({ numero: n, piso: 1, propietario: `Prop ${n}`, area: 100 })),
    });
    if (r0.error) throw new Error(r0.error.message);
    ed = r0.data;
    const deps = (await T.sb.from("departamentos").select("id, numero").eq("edificio_id", ed)).data!;
    const dep = (n: string) => deps.find((d) => d.numero === n)!.id;
    await admin.from("membresias").insert([
      { edificio_id: ed, perfil_id: V2.id, rol: "habitante", departamento_id: dep("102") },
      { edificio_id: ed, perfil_id: V3.id, rol: "habitante", departamento_id: dep("103") },
    ]);
    await T.sb.from("edificios").update({
      base_cuota: "fijo_igual", agua_cuota: "incluida", monto_fijo_mensual: 100, dia_corte: 5, mora_monto: 20,
    }).eq("id", ed);
    const agosto = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).single()).data!.id;
    await T.sb.rpc("confirmar_gastos", { p_periodo: agosto });
    await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [{ categoria: "Sueldos", descripcion: "Conserje", monto: 70 }] });
    const setiembre = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).eq("estado", "abierto").single()).data!.id;
    const cuota = async (n: string) => (await T.sb.from("compromisos").select("id, vence_en").eq("departamento_id", dep(n)).eq("tipo", "cuota").single()).data!;

    // 101 pagó (efectivo, validado por la titular); 102 envió su pago y está en revisión; 103 no pagó
    await T.sb.rpc("registrar_pago_efectivo", { p_compromiso: (await cuota("101")).id });
    await V2.sb.from("pagos").insert({
      compromiso_id: (await cuota("102")).id, edificio_id: ed, departamento_id: dep("102"), monto: 100,
      metodo: "Yape", registrado_por: V2.id, estado: "en_revision",
    });

    console.log("\n· Fachada antes del corte");
    const estados = async () => Object.fromEntries(((await T.sb.rpc("estado_departamentos", { p_edificio: ed })).data ?? []).map((d) => [d.numero, d]));
    const e1 = await estados();
    ok((await cuota("103")).vence_en === "2026-09-05", "Las cuotas de setiembre vencen el día de corte (5)");
    ok(e1["101"].estado === "aldia" && e1["102"].estado === "revision" && e1["103"].estado === "vencido",
      `101 al día, 102 en revisión, 103 vencido (${e1["101"].estado}, ${e1["102"].estado}, ${e1["103"].estado})`);

    console.log("\n· Corte diario (RN-09)");
    const c1 = await admin.rpc("ejecutar_cortes");
    ok(!c1.error && (c1.data ?? 0) >= 1, `El corte se ejecuta (${c1.data} periodos en todos los edificios)`);
    const corte = (await T.sb.from("cortes").select("departamentos").eq("periodo_id", setiembre).single()).data;
    ok(corte?.departamentos.length === 1 && corte.departamentos[0] === dep("103"), "Solo el 103 pasa a deuda vencida");
    const moras = (await T.sb.from("compromisos").select("departamento_id, monto, vence_en").eq("edificio_id", ed).eq("tipo", "mora")).data!;
    ok(moras.length === 1 && moras[0].departamento_id === dep("103") && Number(moras[0].monto) === 20, "Se emite una mora de S/ 20 al 103");
    ok(!moras.some((m) => m.departamento_id === dep("102")), "El pago en revisión del 102 no genera mora");
    const c2 = await admin.rpc("ejecutar_cortes");
    const moras2 = (await T.sb.from("compromisos").select("id").eq("edificio_id", ed).eq("tipo", "mora")).data!;
    ok(!c2.error && moras2.length === 1, "Ejecutarlo otra vez no duplica la mora (una vez por periodo)");
    const noPuede = await T.sb.rpc("ejecutar_cortes");
    ok(!!noPuede.error, "Nadie puede ejecutar el corte desde la app (solo pg_cron o la clave secreta)");

    console.log("\n· Cuenta corriente");
    const cc = async (sb: typeof T.sb, n: string) => (await sb.rpc("cuenta_corriente", { p_departamento: dep(n) })).data ?? [];
    const cc103 = await cc(T.sb, "103");
    ok(cc103.length === 2 && Number(cc103.at(-1)!.saldo) === 120, `103: cuota 100 + mora 20 → saldo S/ ${Number(cc103.at(-1)?.saldo).toFixed(2)}`);
    const cc101 = await cc(T.sb, "101");
    ok(cc101.length === 2 && Number(cc101[1].abono) === 100 && Number(cc101.at(-1)!.saldo) === 0, "101: cuota 100 y pago 100 → saldo S/ 0.00");
    ok((await cc(V3.sb, "103")).length === 2, "El vecino del 103 ve su propia cuenta corriente");
    ok((await cc(V3.sb, "101")).length === 0, "El vecino del 103 no ve la cuenta del 101");
    ok(((await V3.sb.rpc("estado_departamentos", { p_edificio: ed })).data ?? []).length === 0, "Un vecino no ve la fachada de la administración");

    console.log("\n· Estado de cuenta de setiembre (RN-14)");
    const rs = (await T.sb.rpc("resumen_periodo", { p_periodo: setiembre }).single()).data!;
    ok(Number(rs.saldo_anterior) === 0 && Number(rs.ingresos) === 100 && Number(rs.gastos) === 70 && Number(rs.acumulado) === 30,
      `Saldo anterior 0 + ingresos 100 − gastos 70 = acumulado S/ ${Number(rs.acumulado).toFixed(2)}`);
    ok(rs.oficial === false && rs.administrador === "Prueba titular", "Setiembre es borrador (sin confirmar) y figura la titular");
    const it = (await T.sb.rpc("ingresos_por_tipo", { p_periodo: setiembre })).data ?? [];
    ok(it.length === 1 && it[0].tipo === "cuota" && Number(it[0].monto) === 100, "Ingresos por tipo: cuotas S/ 100 (1 pago)");
  } finally {
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((d) => d.id);
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
    for (const id of cuentas) await admin.auth.admin.deleteUser(id);
  }
  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
