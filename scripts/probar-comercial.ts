/**
 * Prueba del dashboard comercial y la depuración por inactividad (Etapa 6A, RN-17, RN-28, RN-29).
 *
 *   npm run probar:comercial              (sin enviar correos)
 *   PROBAR_CORREOS=1 npm run probar:comercial   (los avisos de inactividad llegan a CORREO_PRUEBAS)
 *
 * Dos edificios temporales: uno sin plan (se avisa y se elimina) y otro con plan pagado (nunca se elimina).
 * La depuración se ejecuta con la Edge Function publicada, como lo hará pg_cron.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";
import { VERSION_TERMINOS } from "../lib/legal";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaComercial2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];
type Cliente = SupabaseClient<Database>;

async function cuenta(alias: string) {
  const email = `comercial-${alias}-${sufijo}@demo.buildingbuddy.pe`;
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

async function edificio(sb: Cliente, nombre: string) {
  const r = await sb.rpc("registrar_edificio", {
    p_nombre: nombre,
    p_direccion: "Temporal",
    p_codigo: `prueba-com-${nombre.toLowerCase().replace(/\W+/g, "")}-${sufijo}`,
    p_total_departamentos: 1,
    p_mes_inicio: "2026-09-01",
    p_mi_nombre: "Prueba titular",
    p_filas: [{ numero: "101", propietario: "Prop 101", area: 80 }],
  });
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

// Retrocede la última actividad N días (como si nadie hubiera movido nada)
const inactivo = (ed: string, dias: number) =>
  admin.from("edificios").update({ ultima_actividad: new Date(Date.now() - dias * 86400000 - 3600000).toISOString() }).eq("id", ed);

async function depurar(solo: string[]) {
  const r = await fetch(`${url}/functions/v1/depurar-edificios-inactivos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET! },
    body: JSON.stringify({ solo, sin_correo: process.env.PROBAR_CORREOS !== "1" }),
  });
  return { status: r.status, cuerpo: (await r.json()) as { resultado?: { edificio: string; accion: string; ok: boolean; detalle?: string }[] } };
}

async function main() {
  const T = await cuenta("titular");
  const V = await cuenta("vecino");
  const P = await cuenta("pagado");
  let edA = "";
  let edB = "";
  const rutas: string[] = [];
  try {
    edA = await edificio(T.sb, "Sin plan");
    edB = await edificio(P.sb, "Con plan");
    const depA = (await T.sb.from("departamentos").select("id").eq("edificio_id", edA).single()).data!.id;
    await admin.from("membresias").insert({ edificio_id: edA, perfil_id: V.id, rol: "habitante", departamento_id: depA });

    console.log("\n· Módulos y pruebas de 14 días (RN-17)");
    const mods = (await T.sb.rpc("estado_modulos", { p_edificio: edA })).data ?? [];
    ok(mods.length === 3 && mods.every((m) => m.estado === "bloqueado" && !m.prueba_usada), "Los 3 módulos adicionales empiezan bloqueados");
    ok(!!(await V.sb.rpc("activar_prueba", { p_edificio: edA, p_modulo: "mantenimiento" })).error, "Un vecino no activa pruebas");
    ok(!(await T.sb.rpc("activar_prueba", { p_edificio: edA, p_modulo: "mantenimiento" })).error, "La titular activa la prueba de Mantenimiento");
    const prueba = (await T.sb.rpc("estado_modulos", { p_edificio: edA })).data!.find((m) => m.modulo === "mantenimiento")!;
    ok(prueba.estado === "prueba" && prueba.dias_prueba === 14, "Queda en prueba con 14 días");
    await admin.from("modulos_edificio").update({ prueba_hasta: new Date(Date.now() - 86400000).toISOString().slice(0, 10) }).eq("edificio_id", edA);
    const vencida = (await T.sb.rpc("estado_modulos", { p_edificio: edA })).data!.find((m) => m.modulo === "mantenimiento")!;
    ok(vencida.estado === "bloqueado" && vencida.prueba_usada, "Vencida la prueba, vuelve a bloquearse");
    ok(!!(await T.sb.rpc("activar_prueba", { p_edificio: edA, p_modulo: "mantenimiento" })).error, "La prueba no se repite");
    await admin.from("edificios").update({ plan: "pro", suscripcion_pagada: true }).eq("id", edB);
    const pro = (await P.sb.rpc("estado_modulos", { p_edificio: edB })).data ?? [];
    ok(
      pro.find((m) => m.modulo === "areas_comunes")?.estado === "activo" && pro.find((m) => m.modulo === "marketplace")?.estado === "bloqueado",
      "Con el plan Pro pagado: Áreas comunes activo, Marketplace bloqueado",
    );

    console.log("\n· Planes y solicitudes");
    const planes = (await T.sb.rpc("planes_vigentes")).data as unknown as { id: string; precio: number }[];
    ok(planes.map((p) => `${p.id}:${p.precio}`).join(",") === "basico:149,pro:249,premium:349", "Precios vigentes: Básico S/ 149, Pro S/ 249, Premium S/ 349");
    ok(!!(await V.sb.rpc("solicitar_plan", { p_edificio: edA, p_plan: "pro" })).error, "Un vecino no solicita planes");
    ok(!!(await T.sb.rpc("solicitar_plan", { p_edificio: edA, p_plan: "oro" })).error, "Un plan que no existe se rechaza");
    const sol = await T.sb.rpc("solicitar_plan", { p_edificio: edA, p_plan: "pro", p_nota: "Llamar por la tarde" });
    ok(!sol.error, "La titular solicita el plan Pro");
    ok(!!(await T.sb.rpc("solicitar_plan", { p_edificio: edA, p_plan: "pro" })).error, "No se duplica una solicitud pendiente");
    ok(((await V.sb.from("solicitudes_plan").select("id").eq("edificio_id", edA)).data ?? []).length === 0, "El vecino no ve las solicitudes");
    const ajeno = await V.sb.functions.invoke("avisar-solicitud-plan", { body: { solicitud_id: sol.data } });
    ok(!!ajeno.error, "Quien no administra el edificio no puede disparar el aviso");
    ok(((await T.sb.rpc("correo_contacto")).data ?? "").includes("@"), "Hay un correo de contacto configurado");

    console.log("\n· Consentimiento");
    ok(!(await T.sb.rpc("aceptar_terminos", { p_version: VERSION_TERMINOS })).error, "La titular acepta los términos vigentes");
    ok((await T.sb.from("perfiles").select("terminos_version").eq("id", T.id).single()).data?.terminos_version === VERSION_TERMINOS, "Queda registrada la versión aceptada");

    console.log("\n· Depuración por inactividad (RN-28, RN-29)");
    ok((await fetch(`${url}/functions/v1/depurar-edificios-inactivos`, { method: "POST", body: "{}" })).status === 401, "Sin el secreto, la depuración no hace nada");
    const ruta = `${edA}/${depA}/${crypto.randomUUID()}.jpg`;
    await V.sb.storage.from("comprobantes").upload(ruta, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
    rutas.push(ruta);

    await inactivo(edA, 61);
    await inactivo(edB, 95);
    const mio = (await T.sb.rpc("resumen_mis_edificios")).data!.find((e) => e.edificio_id === edA);
    ok(mio?.dias_para_eliminar === 29, `A los 61 días la app muestra el aviso: quedan ${mio?.dias_para_eliminar} días`);
    let d = await depurar([edA, edB]);
    ok(d.status === 200 && d.cuerpo.resultado?.length === 1 && d.cuerpo.resultado[0].accion === "primer_aviso", "Día 61: primer aviso al titular");
    ok((await admin.from("edificios").select("aviso_inactividad").eq("id", edA).single()).data?.aviso_inactividad === 1, "Queda marcado el primer aviso");
    d = await depurar([edA, edB]);
    ok(d.cuerpo.resultado?.length === 0, "El mismo aviso no se repite al día siguiente");
    await inactivo(edA, 84);
    d = await depurar([edA, edB]);
    ok(d.cuerpo.resultado?.[0]?.accion === "aviso_final", "Día 84: aviso final");

    await T.sb.from("gastos").insert({ edificio_id: edA, periodo_id: (await T.sb.from("periodos").select("id").eq("edificio_id", edA).single()).data!.id, tipo: "recurrente", categoria: "Limpieza", descripcion: "Movimiento", monto: 10, fecha: "2026-09-10" });
    const tras = (await admin.from("edificios").select("aviso_inactividad, ultima_actividad").eq("id", edA).single()).data!;
    ok(tras.aviso_inactividad === 0 && Date.now() - new Date(tras.ultima_actividad).getTime() < 60000, "Un movimiento reinicia el contador y cancela los avisos");

    await inactivo(edA, 91);
    d = await depurar([edA, edB]);
    ok(d.cuerpo.resultado?.[0]?.accion === "eliminar" && d.cuerpo.resultado[0].ok, `Día 91: el edificio se elimina (${d.cuerpo.resultado?.[0]?.detalle ?? d.cuerpo.resultado?.[0]?.detalle})`);
    ok(!(await admin.from("edificios").select("id").eq("id", edA).maybeSingle()).data, "Ya no existe el edificio");
    ok(!(await admin.storage.from("comprobantes").list(`${edA}/${depA}`)).data?.length, "Sus comprobantes se borraron de Storage");
    ok(!(await admin.auth.admin.getUserById(V.id)).data.user, "La cuenta del vecino, sin otro edificio, se eliminó");
    ok(!(await admin.auth.admin.getUserById(T.id)).data.user, "La cuenta de la titular, sin otro edificio, se eliminó");
    const rastro = (await admin.from("depuraciones").select("codigo, dias_inactivo").eq("edificio_id", edA).maybeSingle()).data;
    ok(!!rastro && rastro.dias_inactivo >= 90, "Queda solo el rastro técnico (código y días inactivo)");
    ok(!!(await admin.from("edificios").select("id").eq("id", edB).maybeSingle()).data, "El edificio con plan pagado sigue ahí aunque lleve 95 días");
    edA = "";
  } finally {
    if (rutas.length) await admin.storage.from("comprobantes").remove(rutas);
    for (const ed of [edA, edB].filter(Boolean)) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((x) => x.id);
      await admin.from("solicitudes_plan").delete().eq("edificio_id", ed);
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
    await admin.from("depuraciones").delete().like("codigo", `prueba-com-%-${sufijo}`);
    for (const id of cuentas) await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
