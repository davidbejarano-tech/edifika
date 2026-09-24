/**
 * Prueba de la experiencia del vecino (RN-10, RN-11, RN-12, RN-15) sobre un edificio temporal.
 *
 *   npm run probar:vecino
 *
 * Dos vecinos (101 y 102) y una titular externa. Cada vecino solo ve lo suyo, paga con comprobante,
 * ve el motivo de un rechazo, reenvía y paga por adelantado (saldo a favor que se aplica solo a las cuotas).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaVecino2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];
type Cliente = SupabaseClient<Database>;

async function cuenta(alias: string) {
  const email = `vecino-${alias}-${sufijo}@demo.buildingbuddy.pe`;
  const { data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true });
  cuentas.push(data.user!.id);
  await admin.from("perfiles").insert({ id: data.user!.id, nombre: `Prueba ${alias}` });
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password: CLAVE });
  return { id: data.user!.id, sb };
}

async function main() {
  const T = await cuenta("titular");
  const A = await cuenta("101");
  const B = await cuenta("102");
  let ed = "";
  const rutas: string[] = [];
  try {
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba vecino",
      p_direccion: "Temporal",
      p_codigo: `prueba-vec-${sufijo}`,
      p_total_departamentos: 2,
      p_mes_inicio: "2026-08-01",
      p_mi_nombre: "Prueba titular",
      p_filas: ["101", "102"].map((n) => ({ numero: n, propietario: `Prop ${n}`, area: 100 })),
    });
    if (r0.error) throw new Error(r0.error.message);
    ed = r0.data;
    const deps = (await T.sb.from("departamentos").select("id, numero").eq("edificio_id", ed)).data!;
    const dep = (n: string) => deps.find((d) => d.numero === n)!.id;
    await admin.from("membresias").insert([
      { edificio_id: ed, perfil_id: A.id, rol: "habitante", departamento_id: dep("101") },
      { edificio_id: ed, perfil_id: B.id, rol: "habitante", departamento_id: dep("102") },
    ]);
    await T.sb.from("edificios").update({ base_cuota: "fijo_igual", agua_cuota: "incluida", monto_fijo_mensual: 100, dia_corte: 27 }).eq("id", ed);
    const agosto = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).single()).data!.id;
    const cf = await T.sb.rpc("confirmar_gastos", { p_periodo: agosto });
    const ab = await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    if (cf.error || ab.error) throw new Error(`Preparación: ${cf.error?.message ?? ab.error?.message}`);

    const cuotaDe = async (sb: Cliente, n: string) =>
      (await sb.from("compromisos").select("id, estado, monto").eq("departamento_id", dep(n)).eq("tipo", "cuota").eq("mes", "2026-09-01").maybeSingle()).data;

    console.log("\n· Cada vecino ve solo lo suyo");
    ok(!!(await cuotaDe(A.sb, "101")), "El 101 ve su cuota de setiembre");
    ok(!(await cuotaDe(A.sb, "102")), "El 101 no ve la cuota del 102");
    const todas = (await A.sb.from("v_compromisos").select("departamento_id").eq("edificio_id", ed)).data ?? [];
    ok(todas.length > 0 && todas.every((c) => c.departamento_id === dep("101")), "Aunque consulte todo el edificio, solo recibe lo del 101");

    console.log("\n· Pagar y subir comprobante (RN-10)");
    const c101 = (await cuotaDe(A.sb, "101"))!;
    const ruta = `${ed}/${dep("101")}/${crypto.randomUUID()}.jpg`;
    const up = await A.sb.storage.from("comprobantes").upload(ruta, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), { contentType: "image/jpeg" });
    rutas.push(ruta);
    const p1 = await A.sb.from("pagos").insert({
      compromiso_id: c101.id, edificio_id: ed, departamento_id: dep("101"), monto: 1, metodo: "Yape", operacion: "OP-1",
      comprobante_path: ruta, registrado_por: A.id, estado: "en_revision",
    }).select("monto").single();
    ok(!up.error && !p1.error, "El 101 sube la foto y envía su pago");
    ok(Number(p1.data?.monto) === 100, "El monto del pago es siempre el de la cuota (envió 1, se registró 100)");
    ok((await cuotaDe(A.sb, "101"))!.estado === "en_revision", "Su cuota pasa a “En revisión”");
    const doble = await A.sb.from("pagos").insert({ compromiso_id: c101.id, edificio_id: ed, departamento_id: dep("101"), monto: 100, metodo: "Yape", registrado_por: A.id, estado: "en_revision" });
    ok(!!doble.error, "No puede enviar dos pagos para la misma cuota");
    const c102 = (await cuotaDe(B.sb, "102"))!;
    const ajeno = await A.sb.from("pagos").insert({ compromiso_id: c102.id, edificio_id: ed, departamento_id: dep("102"), monto: 100, metodo: "Yape", registrado_por: A.id, estado: "en_revision" });
    ok(!!ajeno.error, "No puede registrar pagos para otro departamento");
    const auto = await B.sb.from("pagos").insert({ compromiso_id: c102.id, edificio_id: ed, departamento_id: dep("102"), monto: 100, metodo: "Yape", registrado_por: B.id, estado: "validado" });
    ok(!!auto.error, "No puede darse por pagado a sí mismo");
    ok(((await B.sb.from("pagos").select("id").eq("edificio_id", ed)).data ?? []).length === 0, "El 102 no ve el pago del 101");

    console.log("\n· Rechazo y reenvío (RN-11)");
    const pago = (await T.sb.rpc("pagos_por_validar", { p_edificio: ed })).data![0];
    await T.sb.rpc("rechazar_pago", { p_pago: pago.pago_id, p_nota: "La foto no se lee" });
    const mio = (await A.sb.from("pagos").select("estado, nota_rechazo").eq("id", pago.pago_id).single()).data;
    ok(mio?.estado === "rechazado" && mio.nota_rechazo === "La foto no se lee", "El 101 ve el motivo del rechazo");
    const re = await A.sb.from("pagos").insert({ compromiso_id: c101.id, edificio_id: ed, departamento_id: dep("101"), monto: 100, metodo: "Yape", operacion: "OP-2", registrado_por: A.id, estado: "en_revision" });
    ok(!re.error, "Puede reenviar el pago");
    const nuevo = (await T.sb.rpc("pagos_por_validar", { p_edificio: ed })).data![0];
    await T.sb.rpc("validar_pago", { p_pago: nuevo.pago_id });
    ok((await cuotaDe(A.sb, "101"))!.estado === "pagado", "La titular valida y su cuota queda pagada");
    const cc = (await A.sb.rpc("cuenta_corriente", { p_departamento: dep("101") })).data ?? [];
    ok(Number(cc.at(-1)?.saldo) === 0, "Su cuenta corriente queda en S/ 0.00");

    console.log("\n· Pago adelantado y saldo a favor (RN-12)");
    const tit = await T.sb.rpc("solicitar_adelanto", { p_edificio: ed, p_meses: 1 });
    ok(!!tit.error, `La titular (externa) no puede adelantar: "${tit.error?.message}"`);
    ok(!!(await A.sb.rpc("solicitar_adelanto", { p_edificio: ed, p_meses: 7 })).error, "Máximo 6 meses");
    const ad1 = await A.sb.rpc("solicitar_adelanto", { p_edificio: ed, p_meses: 2 });
    const adel = async () =>
      (await A.sb.from("v_compromisos").select("id, monto, estado, por_cobrar, estado_visible").eq("departamento_id", dep("101")).eq("tipo", "adelanto").neq("estado", "anulado")).data ?? [];
    const a1 = await adel();
    ok(!ad1.error && a1.length === 1 && Number(a1[0].monto) === 200, "Con monto fijo: 2 meses × parte fija S/ 100 = S/ 200");
    ok(a1[0]?.por_cobrar === false, "El pago adelantado no es deuda");
    const otro = await A.sb.rpc("solicitar_adelanto", { p_edificio: ed, p_meses: 1 });
    ok(!!otro.error, `No puede pedir otro mientras tenga uno sin completar: "${otro.error?.message}"`);
    ok(!(await A.sb.rpc("cancelar_adelanto", { p_compromiso: a1[0].id! })).error && (await adel()).length === 0, "Puede cancelarlo antes de pagarlo");
    ok(!!(await B.sb.rpc("cancelar_adelanto", { p_compromiso: a1[0].id! })).error, "Un vecino no puede cancelar el adelanto de otro");

    await A.sb.rpc("solicitar_adelanto", { p_edificio: ed, p_meses: 3 });
    const a3 = (await adel())[0];
    await A.sb.from("pagos").insert({ compromiso_id: a3.id!, edificio_id: ed, departamento_id: dep("101"), monto: 300, metodo: "Yape", registrado_por: A.id, estado: "en_revision" });
    ok(Number((await A.sb.rpc("saldo_a_favor", { p_departamento: dep("101") })).data) === 0, "Mientras el pago está en revisión, aún no hay saldo a favor");
    const pa = (await T.sb.rpc("pagos_por_validar", { p_edificio: ed })).data!.find((p) => p.concepto.startsWith("Pago adelantado"))!;
    await T.sb.rpc("validar_pago", { p_pago: pa.pago_id });
    ok(Number((await A.sb.rpc("saldo_a_favor", { p_departamento: dep("101") })).data) === 300, "Al validarse, el 101 tiene S/ 300 de saldo a favor");
    ok(Number((await B.sb.rpc("saldo_a_favor", { p_departamento: dep("101") })).data) === 0, "El 102 no ve el saldo del 101");

    // Octubre: la parte fija sube a S/ 120 y el agua pasa a cobrarse por consumo (recibo S/ 50, sin lecturas → por área)
    const setiembre = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).eq("estado", "abierto").single()).data!.id;
    await T.sb.from("edificios").update({ monto_fijo_mensual: 120, agua_cuota: "consumo", dia_lectura: 25 }).eq("id", ed);
    await T.sb.from("recibos_agua").insert({ periodo_id: setiembre, monto: 50, consumo_m3: 10 });
    await T.sb.rpc("confirmar_gastos", { p_periodo: setiembre });
    const abre = await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    if (abre.error) throw new Error(`Abrir octubre: ${abre.error.message}`);
    const oct = async (n: string) =>
      (await T.sb.from("compromisos").select("monto, estado, detalle").eq("departamento_id", dep(n)).eq("tipo", "cuota").eq("mes", "2026-10-01").single()).data!;
    const o101 = await oct("101");
    const d101 = o101.detalle as { bruto: number; saldo_aplicado: number; saldo_restante: number; agua: number };
    ok(Number(d101.bruto) === 145 && Number(d101.saldo_aplicado) === 120 && Number(o101.monto) === 25 && o101.estado === "pendiente",
      "Octubre 101: cuota S/ 145 (fijo 120 + agua 25); el saldo cubre solo la parte fija y queda S/ 25 de agua por pagar");
    ok(Number(d101.saldo_restante) === 180 && Number((await A.sb.rpc("saldo_a_favor", { p_departamento: dep("101") })).data) === 180,
      "Le quedan S/ 180 de saldo a favor");
    const o102 = await oct("102");
    ok(Number(o102.monto) === 145 && o102.estado === "pendiente", "El 102 (sin saldo) paga su cuota completa de S/ 145");
    const cc2 = (await A.sb.rpc("cuenta_corriente", { p_departamento: dep("101") })).data ?? [];
    ok(Number(cc2.at(-1)?.saldo) === -155, `Cuenta corriente del 101: S/ 155 a favor (180 de saldo − 25 de agua por pagar)`);
    const itSet = (await T.sb.rpc("ingresos_por_tipo", { p_periodo: setiembre })).data ?? [];
    ok(Number(itSet.find((i) => i.tipo === "adelanto")?.monto) === 300, "El pago adelantado es ingreso del mes en que se validó");

    console.log("\n· Pago agrupado con un solo comprobante (RN-10)");
    await T.sb.rpc("emitir_extraordinario", { p_edificio: ed, p_concepto: "Pintura", p_monto: 40, p_reparto: "igual", p_vence: "2026-10-31" });
    const pendientesA = (await A.sb.from("compromisos").select("id, monto, concepto").eq("departamento_id", dep("101")).eq("estado", "pendiente").neq("tipo", "adelanto")).data!;
    const grupo = crypto.randomUUID();
    const insertarGrupo = () =>
      A.sb.from("pagos").insert(pendientesA.map((c) => ({
        compromiso_id: c.id, edificio_id: ed, departamento_id: dep("101"), monto: Number(c.monto), metodo: "Yape",
        operacion: "OP-GRUPO", comprobante_path: `${ed}/${dep("101")}/grupo.jpg`, registrado_por: A.id, estado: "en_revision" as const,
        grupo: grupoActual,
      })));
    let grupoActual = grupo;
    const g1 = await insertarGrupo();
    ok(!g1.error && pendientesA.length === 2, `El 101 paga sus ${pendientesA.length} compromisos (agua de octubre y pintura) con un solo comprobante`);
    const vistos = (await T.sb.rpc("pagos_por_validar", { p_edificio: ed })).data!.filter((p) => p.grupo === grupo);
    ok(vistos.length === 2, "La administración ve los 2 pagos como un grupo");
    ok(!(await T.sb.rpc("rechazar_grupo", { p_grupo: grupo, p_nota: "El total no coincide" })).error, "Rechaza el grupo completo");
    const tras = (await A.sb.from("compromisos").select("estado").in("id", pendientesA.map((c) => c.id))).data!;
    ok(tras.every((c) => c.estado === "pendiente"), "Los 2 compromisos vuelven a pendiente");
    grupoActual = crypto.randomUUID();
    await insertarGrupo();
    const v = await T.sb.rpc("validar_grupo", { p_grupo: grupoActual });
    const fin = (await A.sb.from("compromisos").select("estado").in("id", pendientesA.map((c) => c.id))).data!;
    ok(!v.error && v.data === 2 && fin.every((c) => c.estado === "pagado"), "Al reenviar, se validan los 2 de una vez");
    ok(!!(await T.sb.rpc("validar_grupo", { p_grupo: grupoActual })).error, "Un grupo ya procesado no se valida dos veces");

    console.log("\n· Ausencia prolongada (RN-40)");
    const hoy = new Date().toISOString().slice(0, 10);
    const en = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
    ok(!!(await B.sb.rpc("solicitar_ausencia", { p_edificio: ed, p_desde: hoy, p_hasta: en(200), p_motivo: "Viaje" })).error, "Máximo 6 meses");
    const s = await B.sb.rpc("solicitar_ausencia", { p_edificio: ed, p_desde: hoy, p_hasta: en(90), p_motivo: "Viaje de trabajo" });
    ok(!s.error, "El 102 solicita una ausencia de 3 meses");
    ok(!!(await B.sb.rpc("solicitar_ausencia", { p_edificio: ed, p_desde: hoy, p_hasta: en(30), p_motivo: "Otra" })).error, "No puede tener dos ausencias a la vez");
    const cuota102 = (await B.sb.from("compromisos").select("vence_en").eq("departamento_id", dep("102")).eq("tipo", "cuota").eq("mes", "2026-10-01").single()).data!;
    ok(!!(await A.sb.rpc("resolver_ausencia", { p_ausencia: s.data!, p_aprobar: true })).error, "Un vecino no puede aprobar ausencias");
    ok(!(await T.sb.rpc("resolver_ausencia", { p_ausencia: s.data!, p_aprobar: true })).error, "La titular la aprueba");
    const cuota102b = (await B.sb.from("compromisos").select("vence_en").eq("departamento_id", dep("102")).eq("tipo", "cuota").eq("mes", "2026-10-01").single()).data!;
    ok(cuota102b.vence_en === cuota102.vence_en, "Su cuota de octubre incluye parte fija sin cubrir: no se posterga");
    await T.sb.rpc("emitir_extraordinario", { p_edificio: ed, p_concepto: "Reparación de ascensor", p_monto: 30, p_reparto: "igual", p_vence: en(10) });
    const rep = (await T.sb.from("compromisos").select("vence_en, departamento_id").eq("edificio_id", ed).eq("concepto", "Reparación de ascensor")).data!;
    ok(rep.find((c) => c.departamento_id === dep("102"))!.vence_en === en(105), `El extraordinario del 102 vence 15 días después de su regreso (${en(105)})`);
    ok(rep.find((c) => c.departamento_id === dep("101"))!.vence_en === en(10), "Al 101 le vence en la fecha normal");

    console.log("\n· Con gastos reales: monto en soles");
    await T.sb.from("edificios").update({ base_cuota: "gastos" }).eq("id", ed);
    ok(!!(await A.sb.rpc("solicitar_adelanto", { p_edificio: ed, p_meses: 2 })).error, "Sin monto fijo no se adelantan meses");
    const g = await A.sb.rpc("solicitar_adelanto", { p_edificio: ed, p_monto: 250.5 });
    const ga = (await adel()).find((a) => a.estado === "pendiente");
    ok(!g.error && Number(ga?.monto) === 250.5, "Se adelanta el monto que el vecino elige (S/ 250.50)");
  } finally {
    if (rutas.length) await admin.storage.from("comprobantes").remove(rutas);
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
