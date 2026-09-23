// Invitar a un administrador externo por correo (SPEC sección 9, RN-19 a RN-23). Solo el titular.
//   { edificio_id, email, nombre, accion: "coadministrador" | "titular", saliente?: "lectura" | "operador", redirect_to }
// Crea la cuenta si no existe (y envía la invitación para crear la contraseña) y luego llama,
// con la sesión del titular, a agregar_coadministrador o transferir_titularidad: las reglas
// (máximo 2 coadministradores, quién puede transferir) las aplica la base de datos.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function clave(nuevas: string, legacy: string): string {
  const json = Deno.env.get(nuevas);
  if (json) {
    try {
      const valor = JSON.parse(json).default;
      if (valor) return valor;
    } catch { /* se usa la legacy */ }
  }
  return Deno.env.get(legacy)!;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return responder({ error: "Inicia sesión." }, 401);

  const b = await req.json().catch(() => ({}));
  const edificio = String(b.edificio_id ?? "");
  const email = String(b.email ?? "").trim().toLowerCase();
  const nombre = String(b.nombre ?? "").trim();
  const accion = b.accion === "titular" ? "titular" : "coadministrador";
  const saliente = b.saliente === "operador" ? "operador" : "lectura";
  const destino = typeof b.redirect_to === "string" && /^https?:\/\//.test(b.redirect_to) ? b.redirect_to : undefined;

  if (!edificio) return responder({ error: "Falta el edificio." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ error: "Escribe un correo válido." }, 400);
  if (nombre.length < 3) return responder({ error: "Escribe el nombre completo." }, 400);

  const usuario = createClient(url, clave("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    ...sinSesion,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const admin = createClient(url, clave("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), sinSesion);

  const { data: esTitular } = await usuario.rpc("es_titular", { p_edificio: edificio });
  if (esTitular !== true) return responder({ error: "Solo el administrador titular gestiona el equipo de administración." }, 403);

  // Antes de invitar, comprobar el cupo para no enviar una invitación que no servirá
  if (accion === "coadministrador") {
    const { count } = await admin
      .from("membresias")
      .select("id", { count: "exact", head: true })
      .eq("edificio_id", edificio)
      .eq("rol", "admin")
      .eq("nivel", "operador")
      .eq("estado", "activo");
    if ((count ?? 0) >= 2) return responder({ error: "El edificio ya tiene 2 coadministradores, el máximo permitido." }, 400);
  }

  // Cuenta: existente o nueva (con invitación)
  let perfilId = await buscarPorCorreo(admin, email);
  let invitado = false;
  if (!perfilId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: destino, data: { nombre } });
    if (error || !data.user) {
      const limite = error?.status === 429;
      return responder({ error: limite ? "Se enviaron demasiados correos. Espera unos minutos." : `No pudimos enviar la invitación: ${error?.message}` }, 400);
    }
    perfilId = data.user.id;
    invitado = true;
  }
  await admin.from("perfiles").upsert({ id: perfilId, nombre }, { onConflict: "id", ignoreDuplicates: true });

  // La acción la ejecuta la base con la sesión del titular (reglas y auditoría)
  const { error } = accion === "titular"
    ? await usuario.rpc("transferir_titularidad", { p_edificio: edificio, p_nuevo: perfilId, p_saliente: saliente })
    : await usuario.rpc("agregar_coadministrador", { p_edificio: edificio, p_perfil: perfilId });
  if (error) return responder({ error: error.message }, 400);

  const acceso = invitado
    ? `Le enviamos una invitación a ${email} para crear su contraseña.`
    : `Ya tenía cuenta: entra con su correo ${email} y su contraseña actual.`;
  return responder({
    ok: true,
    mensaje: accion === "titular"
      ? `${nombre} es el nuevo administrador titular. ${acceso}`
      : `${nombre} es coadministrador. ${acceso}`,
  });
});

async function buscarPorCorreo(admin: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (!data || data.users.length < 1000) return null;
  }
  return null;
}
