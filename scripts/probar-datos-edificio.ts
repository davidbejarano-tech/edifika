/**
 * Prueba de los datos del edificio (ajustes de setiembre 2026) sobre un edificio temporal.
 *
 *   npm run probar:datos
 *
 * Ubigeos, dirección por partes, foto y logo en Storage, logo en los PDF, certificaciones,
 * importación masiva de departamentos y lectura de Google Sheets.
 */
import { createClient } from "@supabase/supabase-js";
import { leerGoogleSheets } from "../lib/acciones-plantillas";
import { createServerClient } from "@supabase/ssr";
import { PLANTILLA_SHEETS_ID } from "../lib/plantillas";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaDatos2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];

async function cuenta(alias: string) {
  const email = `datos-${alias}-${sufijo}@demo.buildingbuddy.pe`;
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

// PNG de 1×1 píxel
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

// Sesión en cookies, como la del navegador, para pedir el PDF al servidor local
async function cookiesDe(email: string) {
  const jar = new Map<string, string>();
  const sb = createServerClient(url, publica, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  await sb.auth.signInWithPassword({ email, password: CLAVE });
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}
const BASE = process.env.PRUEBA_URL || "http://localhost:3000";

async function main() {
  const T = await cuenta("titular");
  const O = await cuenta("coadmin");
  const V = await cuenta("101");
  let ed = "";
  const rutas: string[] = [];
  try {
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba datos",
      p_direccion: "Dirección antigua 123",
      p_codigo: `prueba-datos-${sufijo}`,
      p_total_departamentos: 3,
      p_mes_inicio: "2026-09-01",
      p_mi_nombre: "Prueba titular",
      p_filas: [{ numero: "101", propietario: "Prop 101", area: 100 }],
    });
    if (r0.error) throw new Error(r0.error.message);
    ed = r0.data;
    const dep101 = (await T.sb.from("departamentos").select("id").eq("edificio_id", ed).single()).data!.id;
    await admin.from("membresias").insert([
      { edificio_id: ed, perfil_id: O.id, rol: "admin", nivel: "operador" },
      { edificio_id: ed, perfil_id: V.id, rol: "habitante", departamento_id: dep101 },
    ]);

    console.log("\n· Ubigeos y dirección por partes");
    const { count } = await V.sb.from("ubigeos").select("codigo", { count: "exact", head: true });
    ok(count === 1893, `Están los ${count} distritos del Perú`);
    const si = (await V.sb.from("ubigeos").select("*").eq("codigo", "150131").single()).data;
    ok(si?.distrito === "San Isidro" && si.provincia === "Lima" && si.departamento === "Lima", "150131 = San Isidro, Lima, Lima");
    ok((await T.sb.from("edificios").select("direccion").eq("id", ed).single()).data?.direccion === "Dirección antigua 123", "Un edificio sin partes conserva su dirección");
    const upd = await T.sb
      .from("edificios")
      .update({ calle: "Calle Los Ficus", numero_calle: "245", urbanizacion: "Urb. Corpac", referencia: "Frente al parque", ubigeo: "150131", anio_construccion: 2015, constructora: "Constructora Andes" })
      .eq("id", ed)
      .select("direccion, pais")
      .single();
    ok(upd.data?.direccion === "Calle Los Ficus 245, Urb. Corpac, San Isidro, Lima", `La dirección se arma sola: "${upd.data?.direccion}"`);
    ok(upd.data?.pais === "PE", "País por defecto: Perú");
    ok(!!(await T.sb.from("edificios").update({ ubigeo: "999999" }).eq("id", ed)).error, "Un ubigeo que no existe se rechaza");
    ok(!!(await T.sb.from("edificios").update({ anio_construccion: 1500 }).eq("id", ed)).error, "Un año de construcción imposible se rechaza");
    ok(!(await O.sb.from("edificios").update({ calle: "Otra" }).eq("id", ed).select("id")).data?.length, "El coadministrador no cambia los datos del edificio");

    console.log("\n· Foto y logo");
    const logo = `${ed}/logo-${sufijo}.png`;
    rutas.push(logo);
    ok(!!(await V.sb.storage.from("edificios").upload(`${ed}/logo-vecino.png`, PNG, { contentType: "image/png" })).error, "Un vecino no sube imágenes del edificio");
    ok(!!(await O.sb.storage.from("edificios").upload(`${ed}/logo-coadmin.png`, PNG, { contentType: "image/png" })).error, "Ni el coadministrador");
    ok(!(await T.sb.storage.from("edificios").upload(logo, PNG, { contentType: "image/png" })).error, "La titular sube el logo");
    await T.sb.from("edificios").update({ logo_path: logo }).eq("id", ed);
    ok(!(await V.sb.storage.from("edificios").download(logo)).error, "El vecino puede leer el logo (sale en sus recibos)");
    const galleta = await cookiesDe(`datos-101-${sufijo}@demo.buildingbuddy.pe`);
    const pdf = Buffer.from(await (await fetch(`${BASE}/pdf/recibo?d=${dep101}&m=2026-09`, { headers: { cookie: galleta } })).arrayBuffer());
    ok(pdf.subarray(0, 4).toString() === "%PDF" && pdf.toString("latin1").includes("/Subtype /Image"), "El recibo en PDF del vecino lleva el logo del edificio");

    console.log("\n· Certificaciones");
    const cert = { edificio_id: ed, nombre: "Certificado ITSE", entidad: "Municipalidad de San Isidro", emitida_en: "2025-10-01", vence_en: "2026-10-10" };
    ok(!!(await O.sb.from("certificaciones").insert(cert).select("id").single()).error, "El coadministrador no registra certificaciones");
    ok(!(await T.sb.from("certificaciones").insert(cert).select("id").single()).error, "La titular registra el certificado ITSE");
    ok(!!(await T.sb.from("certificaciones").insert({ ...cert, vence_en: "2025-01-01" }).select("id").single()).error, "No vence antes de emitirse");
    ok(((await O.sb.from("certificaciones").select("id").eq("edificio_id", ed)).data ?? []).length === 1, "El coadministrador la ve");
    ok(((await V.sb.from("certificaciones").select("id").eq("edificio_id", ed)).data ?? []).length === 0, "Un vecino no");

    console.log("\n· Importación masiva de departamentos (RN-27)");
    const filas = [
      { numero: "102", piso: 1, propietario: "Marco Villanueva", inquilino: "Lucía Ortega", email: "lucia@correo.pe", telefono: "987111333" },
      { numero: "201", piso: 2, propietario: "Teresa Aguilar", inquilino: null, email: null, telefono: null },
    ];
    ok(!!(await O.sb.rpc("importar_departamentos", { p_edificio: ed, p_filas: filas as never })).error, "El coadministrador no importa departamentos");
    ok(!!(await T.sb.rpc("importar_departamentos", { p_edificio: ed, p_filas: [...filas, { numero: "101", propietario: "Repetido" }] as never })).error, "Si un departamento ya existe, no se importa ninguno");
    ok(((await T.sb.from("departamentos").select("id").eq("edificio_id", ed)).data ?? []).length === 1, "Todo o nada: sigue habiendo 1 departamento");
    const imp = await T.sb.rpc("importar_departamentos", { p_edificio: ed, p_filas: filas as never });
    ok(!imp.error && imp.data === 2, "La titular importa 2 departamentos con sus ocupantes");

    console.log("\n· Google Sheets");
    ok("error" in (await leerGoogleSheets("https://evil.example.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz")), "Solo se aceptan enlaces de Google Sheets");
    ok("error" in (await leerGoogleSheets("no es un enlace")), "Un texto que no es enlace se rechaza");
    const plantilla = await leerGoogleSheets(`https://docs.google.com/spreadsheets/d/${PLANTILLA_SHEETS_ID}/edit#gid=0`);
    if ("texto" in plantilla) ok(plantilla.texto.startsWith("Número\tPiso\tPropietario"), "La plantilla de EDIFIKA en Google Sheets se lee por su enlace");
    else console.log(`· La plantilla aún no está compartida con enlace: "${plantilla.error}"`);
  } finally {
    if (rutas.length) await admin.storage.from("edificios").remove(rutas);
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((d) => d.id);
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
