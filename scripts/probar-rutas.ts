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
  await caso("Titular entra", "/elegir?vista=admin", titular, "/inicio");
  await caso("Vecino 302 entra", "/elegir?vista=habitante", v302, "/cuentas");
  await caso("Vecino 302 escribe /inicio", "/inicio", v302, "/cuentas");
  await caso("Coadministrador entra", "/elegir?vista=admin", coadmin, "/inicio");
  await caso("Titular con sesión va a /login", "/login", titular, "/inicio");

  const d = await destino("/elegir?vista=admin", coadmin);
  console.log(d.includes("6 acciones deshabilitadas") ? "✔ Coadministrador: 6 acciones del titular deshabilitadas" : `✖ Coadministrador: ${d}`);
  if (!d.includes("6 acciones deshabilitadas")) fallas++;
  const t = await destino("/elegir?vista=admin", titular);
  console.log(!t.includes("deshabilitadas") ? "✔ Titular: ninguna acción deshabilitada" : `✖ Titular: ${t}`);
  if (t.includes("deshabilitadas")) fallas++;

  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
