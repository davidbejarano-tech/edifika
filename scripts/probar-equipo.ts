/**
 * Prueba del equipo de administración (RN-19 a RN-23) sobre un edificio temporal.
 *
 *   npm run probar:equipo
 *
 * Crea cuentas y un edificio temporales, ejecuta las reglas con las funciones reales y al final borra todo.
 * La service role se usa solo para preparar datos (cuentas, membresías de vecinos), simular el paso de
 * 15 días y limpiar; las acciones de negocio se hacen con la sesión de cada persona.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaEquipo2026!";
const sufijo = Date.now().toString(36);
const correo = (a: string) => `equipo-${a}-${sufijo}@demo.buildingbuddy.pe`;

let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];

async function cuenta(alias: string, nombre: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: correo(alias), password: CLAVE, email_confirm: true });
  if (error) throw new Error(error.message);
  cuentas.push(data.user.id);
  await admin.from("perfiles").insert({ id: data.user.id, nombre });
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  const { data: s } = await sb.auth.signInWithPassword({ email: correo(alias), password: CLAVE });
  return { id: data.user.id, sb, token: s.session!.access_token };
}

async function main() {
  const T = await cuenta("titular", "Tania Titular");
  const V1 = await cuenta("v1", "Vicente Uno");
  const V2 = await cuenta("v2", "Valeria Dos");
  const V3 = await cuenta("v3", "Víctor Tres");
  const E = await cuenta("externo", "Empresa Externa SAC");
  let ed = "";

  try {
    const { data, error } = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba equipo",
      p_direccion: "Temporal",
      p_codigo: `prueba-eq-${sufijo}`,
      p_total_departamentos: 4,
      p_mes_inicio: "2026-09-01",
      p_mi_nombre: "Tania Titular",
      p_filas: ["101", "102", "103", "104"].map((n) => ({ numero: n, propietario: `Prop ${n}` })),
    });
    if (error) throw new Error(error.message);
    ed = data;
    const { data: deps } = await T.sb.from("departamentos").select("id, numero").eq("edificio_id", ed);
    const dep = (n: string) => deps!.find((d) => d.numero === n)!.id;
    // Vecinos con cuenta (la titular vive en el 101)
    await admin.from("membresias").insert(
      [T, V1, V2, V3].map((p, i) => ({ edificio_id: ed, perfil_id: p.id, rol: "habitante" as const, departamento_id: dep(`10${i + 1}`) })),
    );
    const validacion = async (sb: SupabaseClient<Database>) => (await sb.rpc("estado_validacion", { p_edificio: ed }).single()).data!;
    const equipo = async (sb: SupabaseClient<Database>) => (await sb.rpc("equipo_admin", { p_edificio: ed })).data ?? [];

    console.log("\n· Validación de los pagos de la titular (RN-22)");
    const v0 = await validacion(T.sb);
    ok(v0.alerta && v0.titular_departamento === "101", "Titular vive en el 101 sin coadministrador ni validador → alerta");
    let r: { error: { message: string } | null } = await T.sb.rpc("designar_validador", { p_edificio: ed, p_perfil: T.id });
    ok(!!r.error, `La titular no puede designarse: "${r.error?.message}"`);
    r = await T.sb.rpc("designar_validador", { p_edificio: ed, p_perfil: V1.id });
    const v1 = await validacion(T.sb);
    ok(!r.error && !v1.alerta && v1.quien_valida === "validador", `Designa a ${v1.validador_nombre} (depto ${v1.validador_departamento}) → sin alerta`);

    console.log("\n· Coadministradores (RN-19, RN-20)");
    r = await T.sb.rpc("agregar_coadministrador", { p_edificio: ed, p_perfil: V2.id });
    const r2 = await T.sb.rpc("agregar_coadministrador", { p_edificio: ed, p_perfil: V3.id });
    ok(!r.error && !r2.error, "Agrega 2 coadministradores (vecinos del 103 y 104)");
    r = await T.sb.rpc("agregar_coadministrador", { p_edificio: ed, p_perfil: V1.id });
    ok(!!r.error, `Un tercero se rechaza: "${r.error?.message}"`);
    const inv = await fetch(`${url}/functions/v1/invitar-administrador`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: publica, Authorization: `Bearer ${T.token}` },
      body: JSON.stringify({ edificio_id: ed, email: "otro@ejemplo.pe", nombre: "Otro Externo", accion: "coadministrador" }),
    });
    const invBody = await inv.json();
    ok(inv.status === 400 && /2 coadministradores/.test(invBody.error), `Invitar un externo como tercero se rechaza antes de enviar el correo: "${invBody.error}"`);
    ok((await validacion(T.sb)).quien_valida === "coadministrador", "Con coadministrador, los pagos de la titular los valida un coadministrador");
    r = await V2.sb.rpc("agregar_coadministrador", { p_edificio: ed, p_perfil: V1.id });
    ok(!!r.error, `Un coadministrador no puede agregar otro: "${r.error?.message}"`);
    const tr = await V2.sb.rpc("transferir_titularidad", { p_edificio: ed, p_nuevo: V2.id, p_saliente: "lectura" });
    ok(!!tr.error, `Un coadministrador no puede transferir: "${tr.error?.message}"`);
    const inv2 = await fetch(`${url}/functions/v1/invitar-administrador`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: publica, Authorization: `Bearer ${V2.token}` },
      body: JSON.stringify({ edificio_id: ed, email: "otro@ejemplo.pe", nombre: "Otro Externo", accion: "titular" }),
    });
    ok(inv2.status === 403, `Un coadministrador no puede invitar externos (${inv2.status})`);
    r = await T.sb.rpc("quitar_coadministrador", { p_edificio: ed, p_perfil: V3.id });
    const eq1 = await equipo(T.sb);
    ok(!r.error && eq1.filter((m) => m.nivel === "operador").length === 1, "Quita al coadministrador del 104");

    console.log("\n· Transferencia voluntaria (RN-23)");
    r = await T.sb.rpc("transferir_titularidad", { p_edificio: ed, p_nuevo: V2.id, p_saliente: "operador" });
    const eq2 = await equipo(T.sb);
    ok(
      !r.error && eq2.find((m) => m.perfil_id === V2.id)?.nivel === "titular" && eq2.find((m) => m.perfil_id === T.id)?.nivel === "operador",
      "La titular entrega a la coadministradora del 103 y queda como coadministradora",
    );
    const { data: esT } = await T.sb.rpc("es_titular", { p_edificio: ed });
    ok(esT === false, "La saliente ya no puede hacer acciones de titular");

    r = await V2.sb.rpc("transferir_titularidad", { p_edificio: ed, p_nuevo: E.id, p_saliente: "lectura" });
    const eq3 = await equipo(E.sb);
    const saliente = eq3.find((m) => m.perfil_id === V2.id);
    ok(!r.error && eq3.find((m) => m.perfil_id === E.id)?.nivel === "titular", "La nueva titular transfiere a un externo");
    ok(saliente?.nivel === "lectura" && !!saliente.vigente_hasta, `La saliente queda en solo lectura hasta el ${saliente?.vigente_hasta}`);
    const { data: lee } = await V2.sb.rpc("es_lector_admin", { p_edificio: ed });
    const { data: opera } = await V2.sb.rpc("es_admin", { p_edificio: ed });
    const gasto = await V2.sb.from("gastos").insert({
      edificio_id: ed, periodo_id: (await V2.sb.from("periodos").select("id").eq("edificio_id", ed).single()).data!.id,
      tipo: "recurrente", categoria: "Prueba", descripcion: "No debería guardarse", monto: 10, fecha: "2026-09-01",
    });
    ok(lee === true && opera === false && !!gasto.error, "En lectura puede ver, pero no registrar datos (un gasto se rechaza)");

    console.log("\n· Pasados 15 días (fecha simulada)");
    await admin.from("membresias").update({ vigente_hasta: "2000-01-01" }).eq("edificio_id", ed).eq("perfil_id", V2.id).eq("rol", "admin");
    const { data: lee2 } = await V2.sb.rpc("es_lector_admin", { p_edificio: ed });
    const { data: mis } = await V2.sb.rpc("resumen_mis_edificios");
    const suyo = mis?.find((m) => m.edificio_id === ed);
    ok(lee2 === false && !suyo?.nivel && suyo?.departamento_numero === "103", "Pierde la administración y conserva su acceso de vecino del 103");
    ok(!(await equipo(E.sb)).some((m) => m.perfil_id === V2.id), "Ya no aparece en el equipo");

    console.log("\n· Transferencia forzada (solo plataforma)");
    const fd = new FormData();
    fd.append("codigo", `prueba-eq-${sufijo}`);
    fd.append("email", correo("v1"));
    fd.append("nombre", "Vicente Uno");
    fd.append("acta", new Blob(["%PDF-1.4 prueba"], { type: "application/pdf" }), "acta.pdf");
    const fz = await fetch(`${url}/functions/v1/transferencia-forzada`, {
      method: "POST",
      headers: { apikey: publica, Authorization: `Bearer ${E.token}` },
      body: fd,
    });
    ok(fz.status === 403, `Una titular que no es de la plataforma no puede usarla (${fz.status})`);

    // Con un miembro temporal de la plataforma
    await admin.from("plataforma_admins").insert({ perfil_id: V3.id });
    const fd2 = new FormData();
    for (const [k, v] of fd.entries()) fd2.append(k, v);
    const fz2 = await fetch(`${url}/functions/v1/transferencia-forzada`, {
      method: "POST",
      headers: { apikey: publica, Authorization: `Bearer ${V3.token}` },
      body: fd2,
    });
    const fzBody = await fz2.json();
    const eq4 = await equipo(E.sb);
    const auditoria = await admin.from("auditoria").select("datos").eq("edificio_id", ed).eq("accion", "transferencia_forzada").maybeSingle();
    const acta = (auditoria.data?.datos as { acta?: string } | null)?.acta ?? "";
    ok(fz2.ok && eq4.find((m) => m.perfil_id === E.id)?.nivel === "lectura", `Plataforma transfiere con acta: ${fzBody.mensaje ?? fzBody.error}`);
    ok(acta.startsWith(`actas/${ed}/`), "El acta queda archivada y registrada en la auditoría");
    if (acta) await admin.storage.from("actas").remove([acta.replace(/^actas\//, "")]);
  } finally {
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((d) => d.id);
      await admin.from("edificios").update({ validador_designado_id: null }).eq("id", ed);
      await admin.from("membresias").delete().eq("edificio_id", ed);
      await admin.from("ocupaciones").delete().in("departamento_id", ids);
      await admin.from("auditoria").delete().eq("edificio_id", ed);
      const { error } = await admin.from("edificios").delete().eq("id", ed);
      if (error) console.log(`✖ No se pudo borrar el edificio temporal: ${error.message}`);
      await admin.from("organizaciones").delete().eq("id", e!.organizacion_id);
    }
    for (const id of cuentas) {
      await admin.from("plataforma_admins").delete().eq("perfil_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
