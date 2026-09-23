/**
 * Prueba de la cobranza (RN-08, RN-10, RN-11, RN-13, RN-22) sobre un edificio temporal.
 *
 *   npm run probar:cobranza
 *
 * La titular vive en el 101, el coadministrador en el 102 y un vecino en el 103. Cada uno paga su cuota
 * (con comprobante en Storage) y se prueba quién puede validar, rechazar, cobrar en efectivo y anular.
 * La service role solo prepara cuentas y membresías de vecinos y limpia al final.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaCobranza2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];
type Cliente = SupabaseClient<Database>;

async function cuenta(alias: string, nombre: string) {
  const email = `cobranza-${alias}-${sufijo}@demo.buildingbuddy.pe`;
  const { data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true });
  cuentas.push(data.user!.id);
  await admin.from("perfiles").insert({ id: data.user!.id, nombre });
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password: CLAVE });
  return { id: data.user!.id, sb };
}

async function main() {
  const T = await cuenta("titular", "Tania Titular");
  const C = await cuenta("coadmin", "Carlos Coadmin");
  const V = await cuenta("vecino", "Vera Vecina");
  let ed = "";
  const rutas: string[] = [];
  try {
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba cobranza",
      p_direccion: "Temporal",
      p_codigo: `prueba-cob-${sufijo}`,
      p_total_departamentos: 3,
      p_mes_inicio: "2026-08-01",
      p_mi_nombre: "Tania Titular",
      p_filas: ["101", "102", "103"].map((n, i) => ({ numero: n, propietario: `Prop ${n}`, area: [80, 100, 120][i] })),
    });
    if (r0.error) throw new Error(r0.error.message);
    ed = r0.data;
    const deps = (await T.sb.from("departamentos").select("id, numero").eq("edificio_id", ed)).data!;
    const dep = (n: string) => deps.find((d) => d.numero === n)!.id;
    await admin.from("membresias").insert(
      [T, C, V].map((p, i) => ({ edificio_id: ed, perfil_id: p.id, rol: "habitante" as const, departamento_id: dep(`10${i + 1}`) })),
    );
    await T.sb.rpc("agregar_coadministrador", { p_edificio: ed, p_perfil: C.id });
    await T.sb.from("edificios").update({ base_cuota: "fijo_igual", agua_cuota: "incluida", monto_fijo_mensual: 100 }).eq("id", ed);
    const agosto = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).single()).data!.id;
    await T.sb.rpc("confirmar_gastos", { p_periodo: agosto });
    const ab = await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    if (ab.error) throw new Error(ab.error.message);

    const cuotaDe = async (sb: Cliente, n: string) =>
      (await sb.from("compromisos").select("id, estado").eq("departamento_id", dep(n)).eq("tipo", "cuota").single()).data!;
    // Cada vecino paga su cuota con comprobante (flujo de la Etapa 4)
    async function pagar(p: { id: string; sb: Cliente }, n: string) {
      const c = await cuotaDe(p.sb, n);
      const ruta = `${ed}/${dep(n)}/${crypto.randomUUID()}.pdf`;
      const up = await p.sb.storage.from("comprobantes").upload(ruta, new Blob(["%PDF-1.4 prueba"], { type: "application/pdf" }));
      if (up.error) throw new Error(`Subir comprobante ${n}: ${up.error.message}`);
      rutas.push(ruta);
      const r = await p.sb.from("pagos").insert({
        compromiso_id: c.id, edificio_id: ed, departamento_id: dep(n), monto: 100, metodo: "Yape",
        operacion: `OP-${n}`, comprobante_path: ruta, registrado_por: p.id, estado: "en_revision",
      });
      if (r.error) throw new Error(`Pago ${n}: ${r.error.message}`);
      return ruta;
    }

    console.log("\n· Envío de pagos (RN-10)");
    const ruta103 = await pagar(V, "103");
    await pagar(T, "101");
    await pagar(C, "102");
    ok((await cuotaDe(T.sb, "103")).estado === "en_revision", "Al enviar el pago, la cuota pasa a “En revisión”");
    const exe = await V.sb.storage.from("comprobantes").upload(`${ed}/${dep("103")}/x.exe`, new Blob(["MZ"], { type: "application/x-msdownload" }));
    ok(!!exe.error, "Un archivo que no es imagen ni PDF se rechaza");
    const otro = await V.sb.storage.from("comprobantes").upload(`${ed}/${dep("102")}/intruso.pdf`, new Blob(["%PDF"], { type: "application/pdf" }));
    ok(!!otro.error, "Un vecino no puede subir comprobantes a la carpeta de otro departamento");

    console.log("\n· Quién puede validar (RN-22)");
    const pv = async (sb: Cliente) => (await sb.rpc("pagos_por_validar", { p_edificio: ed })).data ?? [];
    const vistaT = await pv(T.sb);
    const vistaC = await pv(C.sb);
    const puede = (lista: typeof vistaT, n: string) => lista.find((p) => p.numero === n)?.puede_validar;
    ok(vistaT.length === 3 && puede(vistaT, "103") === true && puede(vistaT, "102") === true && puede(vistaT, "101") === false,
      "La titular ve 3 pagos: valida el 102 y el 103, no el suyo (101)");
    ok(/propio departamento/.test(vistaT.find((p) => p.numero === "101")!.motivo ?? ""), `Motivo: "${vistaT.find((p) => p.numero === "101")!.motivo}"`);
    ok(puede(vistaC, "101") === true && puede(vistaC, "102") === false, "El coadministrador valida el pago de la titular y no el suyo");
    ok((await pv(V.sb)).length === 0, "Un vecino no ve los pagos por validar");
    const id = (lista: typeof vistaT, n: string) => lista.find((p) => p.numero === n)!.pago_id;
    const propio = await T.sb.rpc("validar_pago", { p_pago: id(vistaT, "101") });
    ok(!!propio.error, `La titular no valida su propio pago: "${propio.error?.message}"`);
    const vecino = await V.sb.rpc("validar_pago", { p_pago: id(vistaT, "103") });
    ok(!!vecino.error, "Un vecino no puede validar llamando directo a la base");

    console.log("\n· Validar y rechazar (RN-11)");
    ok(!(await C.sb.rpc("validar_pago", { p_pago: id(vistaT, "101") })).error, "El coadministrador valida el pago de la titular");
    ok((await cuotaDe(T.sb, "101")).estado === "pagado", "La cuota del 101 queda “Pagado”");
    const sinMotivo = await T.sb.rpc("rechazar_pago", { p_pago: id(vistaT, "103"), p_nota: " " });
    ok(!!sinMotivo.error, `Rechazar exige motivo: "${sinMotivo.error?.message}"`);
    ok(!(await T.sb.rpc("rechazar_pago", { p_pago: id(vistaT, "103"), p_nota: "El monto no coincide" })).error, "La titular rechaza el pago del 103 con motivo");
    const emit = (await T.sb.rpc("compromisos_admin", { p_edificio: ed })).data!;
    const c103 = emit.find((c) => c.numero === "103" && c.tipo === "cuota")!;
    ok(c103.estado === "pendiente" && c103.ultimo_rechazo === "El monto no coincide", "La cuota vuelve a pendiente y guarda el motivo del rechazo");
    const miPago = (await V.sb.from("pagos").select("estado, nota_rechazo").eq("compromiso_id", c103.compromiso_id).single()).data;
    ok(miPago?.nota_rechazo === "El monto no coincide", "La vecina ve el motivo en su pago");
    ok(!(await T.sb.rpc("validar_pago", { p_pago: id(vistaT, "102") })).error, "La titular valida el pago del coadministrador");

    console.log("\n· Comprobantes (bucket privado)");
    const verT = await T.sb.storage.from("comprobantes").createSignedUrl(ruta103, 60);
    const verC = await C.sb.storage.from("comprobantes").createSignedUrl(ruta103, 60);
    ok(!!verT.data?.signedUrl && !!verC.data?.signedUrl, "La administración abre el comprobante con un enlace temporal");
    const ajeno = await V.sb.storage.from("comprobantes").createSignedUrl(rutas[2], 60);
    ok(!ajeno.data?.signedUrl, "Un vecino no puede abrir el comprobante de otro departamento");

    console.log("\n· Efectivo, extraordinario y anulación (RN-11, RN-13)");
    const ef = await C.sb.rpc("registrar_pago_efectivo", { p_compromiso: c103.compromiso_id });
    const tras = (await T.sb.rpc("compromisos_admin", { p_edificio: ed })).data!.find((c) => c.compromiso_id === c103.compromiso_id)!;
    ok(!ef.error && tras.estado === "pagado" && tras.pago_metodo === "Efectivo" && tras.validado_por === "Carlos Coadmin",
      "El coadministrador registra el pago en efectivo del 103 (queda quién lo validó)");
    const exC = await C.sb.rpc("emitir_extraordinario", { p_edificio: ed, p_concepto: "Pintura", p_monto: 300, p_reparto: "alicuota", p_vence: "2026-09-30" });
    ok(!!exC.error, "El coadministrador no emite extraordinarios");
    const ex = await T.sb.rpc("emitir_extraordinario", { p_edificio: ed, p_concepto: "Pintura", p_monto: 300, p_reparto: "alicuota", p_vence: "2026-09-30" });
    const pint = (await T.sb.rpc("compromisos_admin", { p_edificio: ed })).data!.filter((c) => c.concepto === "Pintura");
    ok(!ex.error && ex.data === 3 && pint.reduce((s, c) => s + Number(c.monto), 0) === 300 && Number(pint.find((c) => c.numero === "101")!.monto) === 80,
      "Pintura S/ 300 por área: 101 paga S/ 80 (80 de 300 m²) y el total es S/ 300");
    // Total que no se divide exacto: 100 / 3 áreas desiguales → la suma debe ser exactamente S/ 100.00
    await T.sb.rpc("emitir_extraordinario", { p_edificio: ed, p_concepto: "Redondeo", p_monto: 100, p_reparto: "alicuota", p_vence: "2026-09-30" });
    const red = (await T.sb.rpc("compromisos_admin", { p_edificio: ed })).data!.filter((c) => c.concepto === "Redondeo");
    const sumaRed = Math.round(red.reduce((s, c) => s + Number(c.monto), 0) * 100) / 100;
    ok(sumaRed === 100, `S/ 100 por área (26.67 + 33.33 + 40.00) suma exacto S/ ${sumaRed.toFixed(2)}`);
    // Se retiran para no alterar las cuentas siguientes (la titular no puede anular el de su propio 101)
    await admin.from("compromisos").delete().in("id", red.map((c) => c.compromiso_id));
    const unoSolo = await T.sb.rpc("emitir_extraordinario", {
      p_edificio: ed, p_concepto: "Llave extraviada", p_monto: 25, p_reparto: "igual", p_vence: "2026-09-30", p_departamento: dep("103"),
    });
    ok(!unoSolo.error && unoSolo.data === 1, "Un extraordinario a un solo departamento");
    const p101 = pint.find((c) => c.numero === "101")!.compromiso_id;
    const p102 = pint.find((c) => c.numero === "102")!.compromiso_id;
    ok(!!(await C.sb.rpc("anular_compromiso", { p_compromiso: p102, p_motivo: "x" })).error, "El coadministrador no anula");
    const anPropio = await T.sb.rpc("anular_compromiso", { p_compromiso: p101, p_motivo: "Error" });
    ok(!!anPropio.error, `La titular no anula lo de su propio departamento: "${anPropio.error?.message}"`);
    ok(!(await T.sb.rpc("anular_compromiso", { p_compromiso: p102, p_motivo: "Emitido por error" })).error, "La titular anula la pintura del 102 con motivo");

    console.log("\n· Cuentas por cobrar (RN-08)");
    const cxc = (await T.sb.rpc("cuentas_por_cobrar", { p_edificio: ed })).data!;
    const deuda = (n: string) => Number(cxc.find((c) => c.numero === n)!.pendiente);
    ok(deuda("101") === 80 && deuda("102") === 0 && deuda("103") === 145, "101 debe S/ 80, 102 está al día (pintura anulada), 103 debe S/ 145 (pintura 120 + llave 25)");

    console.log("\n· Vecino validador cuando no hay coadministrador (RN-22)");
    await T.sb.rpc("quitar_coadministrador", { p_edificio: ed, p_perfil: C.id });
    await T.sb.rpc("designar_validador", { p_edificio: ed, p_perfil: V.id });
    const cPint = (await T.sb.from("compromisos").select("id").eq("departamento_id", dep("101")).eq("concepto", "Pintura").single()).data!;
    await T.sb.from("pagos").insert({ compromiso_id: cPint.id, edificio_id: ed, departamento_id: dep("101"), monto: 80, metodo: "Yape", registrado_por: T.id, estado: "en_revision" });
    const vistaV = await pv(V.sb);
    ok(vistaV.length === 1 && vistaV[0].numero === "101" && vistaV[0].puede_validar, "La vecina validadora ve solo el pago de la titular y puede validarlo");
    ok(!(await V.sb.rpc("validar_pago", { p_pago: vistaV[0].pago_id })).error, "La vecina validadora valida el pago de la titular");
  } finally {
    if (rutas.length) await admin.storage.from("comprobantes").remove(rutas);
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((d) => d.id);
      await admin.from("edificios").update({ validador_designado_id: null }).eq("id", ed);
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
