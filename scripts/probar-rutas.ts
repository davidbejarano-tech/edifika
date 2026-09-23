/**
 * Prueba de humo de la protección de rutas (Etapa 1). Requiere `npm run dev` en marcha.
 *   npm run probar:rutas
 * Inicia sesión con las cuentas demo (como lo hace la app), arma las cookies de @supabase/ssr
 * y verifica a dónde lleva cada ruta.
 */
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.PRUEBA_URL || "http://localhost:3000";
const CLAVE = process.env.DEMO_PASSWORD || "Demo2026!";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function cookiesDe(login: { email?: string; codigo?: string; numero?: string }) {
  const jar = new Map<string, string>();
  const sb = createServerClient(url, publica, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  if (login.email) {
    const { error } = await sb.auth.signInWithPassword({ email: login.email, password: CLAVE });
    if (error) throw new Error(`${login.email}: ${error.message}`);
  } else {
    const r = await fetch(`${url}/functions/v1/login-departamento`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: publica },
      body: JSON.stringify({ codigo: login.codigo, numero: login.numero, password: CLAVE }),
    });
    const s = await r.json();
    if (!r.ok) throw new Error(`${login.numero}: ${s.error}`);
    await sb.auth.setSession(s);
  }
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function destino(ruta: string, cookie = ""): Promise<string> {
  let actual = ruta;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(BASE + actual, { headers: { cookie }, redirect: "manual" });
    const set = r.headers.getSetCookie().find((c) => c.startsWith("bb_edificio="));
    if (set) cookie += `; ${set.split(";")[0]}`;
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) {
      actual = new URL(loc, BASE).pathname + new URL(loc, BASE).search;
      continue;
    }
    const html = await r.text();
    const deshabilitados = (html.match(/Solo el administrador titular\.</g) || []).length;
    return `${actual} (${r.status})${deshabilitados ? ` · ${deshabilitados} acciones deshabilitadas` : ""}`;
  }
  return actual + " (demasiadas redirecciones)";
}

let fallas = 0;
async function caso(nombre: string, ruta: string, cookie: string, espera: string) {
  const d = await destino(ruta, cookie);
  const ok = d.startsWith(espera);
  if (!ok) fallas++;
  console.log(`${ok ? "✔" : "✖"} ${nombre}: ${ruta} → ${d}`);
}

async function main() {
  const titular = await cookiesDe({ email: "titular@demo.buildingbuddy.pe" });
  const coadmin = await cookiesDe({ email: "coadmin@demo.buildingbuddy.pe" });
  const v302 = await cookiesDe({ codigo: "los-ficus", numero: "302" });

  await caso("Sin sesión", "/inicio", "", "/login");
  await caso("Bienvenida sin sesión", "/", "", "/ (200)");
  await caso("Registro sin sesión", "/registro", "", "/registro (200)");
  await caso("Asistente sin sesión", "/edificios/nuevo", "", "/login");
  await caso("Bienvenida con sesión (titular)", "/", titular, "/inicio");
  await caso("Bienvenida con sesión (vecino)", "/", v302, "/cuentas");
  await caso("Mis edificios (titular)", "/edificios", titular, "/edificios (200)");
  await caso("Asistente (titular)", "/edificios/nuevo", titular, "/edificios/nuevo (200)");

  // Contenido: el asistente ya no pide área ni método; Inicio muestra el avance de la configuración.
  const html = async (ruta: string, cookie: string) =>
    (await fetch(BASE + ruta, { headers: { cookie: `${cookie}` } })).text();
  // Etapa 2b: Configuración y Departamentos
  await caso("Configuración (titular)", "/configuracion", titular, "/configuracion (200)");
  await caso("Departamentos (coadministrador)", "/departamentos", coadmin, "/departamentos (200)");
  await caso("Vecino 302 escribe /configuracion", "/configuracion", v302, "/cuentas");
  await caso("Vecino 302 escribe /departamentos", "/departamentos", v302, "/cuentas");
  const contiene = async (nombre: string, ruta: string, cookie: string, si: string[], no: string[] = []) => {
    const h = await html(ruta, cookie);
    const falta = si.filter((t) => !h.includes(t));
    const sobra = no.filter((t) => h.includes(t));
    const bien = !falta.length && !sobra.length;
    if (!bien) fallas++;
    console.log(`${bien ? "✔" : "✖"} ${nombre}${falta.length ? ` · falta: ${falta.join(", ")}` : ""}${sobra.length ? ` · sobra: ${sobra.join(", ")}` : ""}`);
  };
  await contiene("Titular: configuración editable con vista previa", "/configuracion", titular, ["Vista previa del reparto", "Guardar cobranza", "Cuota del mes"]);
  await contiene("Coadministrador: configuración solo lectura", "/configuracion", coadmin, ["Solo el administrador titular puede cambiarla"], ["Guardar cobranza"]);
  await contiene("Titular: departamentos con acciones", "/departamentos", titular, ["Cambio de ocupante", "Agregar departamento", "302"]);
  await contiene("Coadministrador: departamentos sin acciones", "/departamentos", coadmin, ["302"], ["Cambio de ocupante", "Agregar departamento"]);

  // Etapa 2c: Equipo de administración y plataforma
  await caso("Equipo (titular)", "/equipo", titular, "/equipo (200)");
  await caso("Vecino 302 escribe /equipo", "/equipo", v302, "/cuentas");
  await caso("Titular sin permiso de plataforma", "/plataforma", titular, "/edificios");
  await contiene("Titular: equipo con acciones", "/equipo", titular, ["Equipo actual", "Transferir la titularidad", "Coadministrador"]);
  await contiene("Coadministrador: equipo solo lectura", "/equipo", coadmin, ["Equipo actual", "Solo el administrador titular puede cambiarlo"], ["Transferir la titularidad", "Agregar coadministrador"]);

  // Etapa 3a: Gastos, Lecturas, Cálculo y Ciclo (Los Ficus: agosto abierto con gastos confirmados)
  for (const ruta of ["/gastos", "/lecturas", "/calculo", "/ciclo"]) {
    await caso(`${ruta} (coadministrador)`, ruta, coadmin, `${ruta} (200)`);
    await caso(`Vecino 302 escribe ${ruta}`, ruta, v302, "/cuentas");
  }
  await contiene("Titular: gastos confirmados en solo lectura", "/gastos", titular, ["Confirmado", "Recurrentes", "Extraordinarios"], ["Registrar gasto"]);
  await contiene("Titular: cálculo con cuotas del mes siguiente", "/calculo", titular, ["Cuotas de", "setiembre 2026", "Cuota del mes", "Recibo de agua"]);
  await contiene("Titular: ciclo con botón para abrir el mes", "/ciclo", titular, ["Abrir setiembre", "Confirmar los gastos del mes"], ["Solo el administrador titular abre el mes"]);
  await contiene("Coadministrador: ciclo sin abrir el mes", "/ciclo", coadmin, ["Solo el administrador titular abre el mes"]);

  const asistente = await html("/edificios/nuevo", titular);
  const sinArea = !/Área total de departamentos|Cálculo de cuota/.test(asistente) && asistente.includes("Departamentos");
  console.log(`${sinArea ? "✔" : "✖"} Asistente sin área ni método de cálculo`);
  if (!sinArea) fallas++;
  await caso("Titular entra", "/edificios?vista=admin", titular, "/inicio");
  await caso("Vecino 302 entra", "/edificios?vista=habitante", v302, "/cuentas");
  await caso("Vecino 302 escribe /inicio", "/inicio", v302, "/cuentas");
  await caso("Coadministrador entra", "/edificios?vista=admin", coadmin, "/inicio");
  await caso("Titular con sesión va a /login", "/login", titular, "/inicio");

  const d = await destino("/edificios?vista=admin", coadmin);
  console.log(d.includes("6 acciones deshabilitadas") ? "✔ Coadministrador: 6 acciones del titular deshabilitadas" : `✖ Coadministrador: ${d}`);
  if (!d.includes("6 acciones deshabilitadas")) fallas++;
  const t = await destino("/edificios?vista=admin", titular);
  console.log(!t.includes("deshabilitadas") ? "✔ Titular: ninguna acción deshabilitada" : `✖ Titular: ${t}`);
  if (t.includes("deshabilitadas")) fallas++;

  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
