/**
 * Prueba de los recibos (Etapa 5) sobre un edificio temporal.
 *
 *   npm run probar:recibos
 *
 * Titular externa y dos vecinos. Montos del recibo (saldo a favor aplicado, extraordinarios,
 * deuda anterior), registro y envío, y quién puede ver o generar cada recibo y su PDF.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";
import type { DatosRecibo } from "../lib/recibo";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaRecibo2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];
type Cliente = SupabaseClient<Database>;
const PDF = new Blob([new TextEncoder().encode("%PDF-1.4\n%prueba\n")], { type: "application/pdf" });

async function cuenta(alias: string) {
  const email = `recibo-${alias}-${sufijo}@demo.buildingbuddy.pe`;
  let { data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true });
  // Auth limita las altas seguidas: reintenta si se corren varias pruebas en fila
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

const recibo = async (sb: Cliente, dep: string, mes: string) => {
  const r = await sb.rpc("datos_recibo", { p_departamento: dep, p_mes: mes });
  return { datos: r.data as unknown as DatosRecibo | null, error: r.error };
};

async function main() {
  const T = await cuenta("titular");
  const A = await cuenta("101");
  const B = await cuenta("102");
  let ed = "";
  const rutas: string[] = [];
  try {
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba recibos",
      p_direccion: "Temporal",
      p_codigo: `prueba-rec-${sufijo}`,
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
    await T.sb.from("edificios").update({ base_cuota: "fijo_igual", agua_cuota: "incluida", monto_fijo_mensual: 100, dia_corte: 27, mora_monto: 20 }).eq("id", ed);
    const per = async () => (await T.sb.from("periodos").select("id, mes").eq("edificio_id", ed).eq("estado", "abierto").single()).data!;

    // Agosto: el 101 adelanta un mes y paga en efectivo; setiembre se abre con su saldo a favor
    const ad = await A.sb.rpc("solicitar_adelanto", { p_edificio: ed, p_meses: 1 });
    const pe = await T.sb.rpc("registrar_pago_efectivo", { p_compromiso: ad.data! });
    await T.sb.rpc("confirmar_gastos", { p_periodo: (await per()).id });
    const ab = await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    await T.sb.rpc("emitir_extraordinario", { p_edificio: ed, p_concepto: "Pintura", p_monto: 40, p_reparto: "igual", p_vence: "2026-10-10" });
    if (ad.error || pe.error || ab.error) throw new Error(`Preparación: ${ad.error?.message ?? pe.error?.message ?? ab.error?.message}`);

    console.log("\n· Montos del recibo de setiembre");
    const r101 = (await recibo(A.sb, dep("101"), "2026-09-01")).datos!;
    ok(r101.numero === "202609-101", "Número del recibo: 202609-101");
    ok(r101.totales.cargos === 140 && r101.totales.saldo_aplicado === 100, "101: cargos de S/ 140 con S/ 100 de saldo a favor aplicado");
    ok(r101.totales.total === 40 && r101.estado === "por_pagar", "101: total a pagar S/ 40 (solo la pintura)");
    ok(r101.totales.vence === "2026-10-10", "101: vence cuando vence lo que falta pagar (10 oct), no la cuota ya cubierta");
    ok(r101.cargos.length === 2 && r101.cargos[0].tipo === "cuota" && r101.cargos[0].estado === "pagado", "101: la cuota figura primero y pagada");
    const r102 = (await recibo(B.sb, dep("102"), "2026-09-01")).datos!;
    ok(r102.totales.total === 140 && r102.totales.anterior === 0, "102: total S/ 140 sin deuda anterior");
    ok(r102.edificio.mora === 20 && r102.edificio.administrador === "Prueba titular", "Muestra la mora y al titular");

    console.log("\n· Deuda de meses anteriores");
    await T.sb.rpc("confirmar_gastos", { p_periodo: (await per()).id });
    await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    const oct = (await recibo(B.sb, dep("102"), "2026-10-01")).datos!;
    ok(oct.totales.cargos === 100 && oct.totales.anterior === 140 && oct.totales.anteriores === 2, "102 en octubre: S/ 100 del mes + S/ 140 de setiembre (2 conceptos)");
    ok(oct.totales.total === 240, "102 en octubre: total S/ 240");
    const lista = (await T.sb.rpc("recibos_del_mes", { p_edificio: ed, p_mes: "2026-10-01" })).data ?? [];
    ok(lista.length === 2 && Number(lista.find((l) => l.numero === "102")?.total) === 240, "La administración ve los 2 recibos del mes con su total");
    ok(((await B.sb.rpc("recibos_del_mes", { p_edificio: ed, p_mes: "2026-10-01" })).data ?? []).length === 0, "Un vecino no ve la lista de recibos");

    console.log("\n· Quién ve cada recibo");
    ok(!!(await recibo(B.sb, dep("101"), "2026-09-01")).error, "El 102 no puede ver el recibo del 101");
    ok(!(await recibo(T.sb, dep("101"), "2026-09-01")).error, "La titular ve cualquier recibo");

    console.log("\n· Generar y enviar");
    const ruta = `${ed}/${dep("102")}/202610.pdf`;
    rutas.push(ruta);
    ok(!!(await B.sb.storage.from("recibos").upload(ruta, PDF, { contentType: "application/pdf" })).error, "Un vecino no puede subir recibos");
    ok(!(await T.sb.storage.from("recibos").upload(ruta, PDF, { contentType: "application/pdf", upsert: true })).error, "La titular guarda el PDF");
    ok(!(await T.sb.storage.from("recibos").upload(ruta, PDF, { contentType: "application/pdf", upsert: true })).error, "Y lo puede reemplazar al regenerarlo");
    ok(!!(await B.sb.rpc("registrar_recibo", { p_departamento: dep("102"), p_mes: "2026-10-01", p_pdf_path: ruta })).error, "Un vecino no registra recibos");
    ok(!!(await T.sb.rpc("registrar_recibo", { p_departamento: dep("102"), p_mes: "2026-10-01", p_pdf_path: `${ed}/${dep("101")}/x.pdf` })).error, "La ruta del PDF debe ser la del departamento");
    const reg = await T.sb.rpc("registrar_recibo", { p_departamento: dep("102"), p_mes: "2026-10-01", p_pdf_path: ruta });
    ok(!reg.error, "La titular registra el recibo del 102");
    const fila = (await B.sb.from("recibos").select("numero, total, titular_nombre, enviado_en").eq("id", reg.data!).single()).data;
    ok(fila?.numero === "202610-102" && Number(fila.total) === 240 && fila.titular_nombre === "Prueba titular", "El 102 ve su recibo: número, total y titular vigente");
    ok(((await A.sb.from("recibos").select("id").eq("edificio_id", ed)).data ?? []).length === 0, "El 101 no ve el recibo del 102");
    ok(!(await B.sb.storage.from("recibos").download(ruta)).error, "El 102 descarga su PDF");
    ok(!!(await A.sb.storage.from("recibos").download(ruta)).error, "El 101 no descarga el PDF del 102");
    ok(!!(await B.sb.rpc("marcar_recibo_enviado", { p_recibo: reg.data!, p_canal: "correo" })).error, "Un vecino no marca envíos");
    ok(!!(await T.sb.rpc("marcar_recibo_enviado", { p_recibo: reg.data!, p_canal: "fax" })).error, "Solo correo o WhatsApp");
    ok(!(await T.sb.rpc("marcar_recibo_enviado", { p_recibo: reg.data!, p_canal: "correo" })).error, "Se registra el envío por correo");
    const env = (await T.sb.rpc("recibos_del_mes", { p_edificio: ed, p_mes: "2026-10-01" })).data!.find((l) => l.numero === "102");
    ok(!!env?.enviado_en && env.canal === "correo", "La lista muestra el recibo como enviado por correo");
    await T.sb.rpc("registrar_recibo", { p_departamento: dep("102"), p_mes: "2026-10-01", p_pdf_path: ruta });
    const regen = (await T.sb.from("recibos").select("enviado_en").eq("id", reg.data!).single()).data;
    ok(regen?.enviado_en === null, "Al regenerarlo queda pendiente de envío otra vez");
  } finally {
    if (rutas.length) await admin.storage.from("recibos").remove(rutas);
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((d) => d.id);
      await admin.from("recibos").delete().eq("edificio_id", ed);
      await admin.from("saldo_favor").delete().eq("edificio_id", ed);
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
