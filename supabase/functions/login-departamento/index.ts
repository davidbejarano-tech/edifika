// Login del habitante: código del edificio + número de departamento + contraseña (SPEC sección 8).
// Busca el correo de la cuenta activa del departamento con la service role, inicia sesión y
// devuelve los tokens. El correo nunca sale de esta función.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Claves del proyecto: las nuevas (sb_secret / sb_publishable) o, si no existen, las legacy.
function clave(nuevas: string, legacy: string): string {
  const json = Deno.env.get(nuevas);
  if (json) {
    try {
      const valor = JSON.parse(json).default;
      if (valor) return valor;
    } catch { /* formato inesperado: se usa la legacy */ }
  }
  return Deno.env.get(legacy)!;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const { codigo, numero, password } = await req.json().catch(() => ({}));
  const cod = String(codigo ?? "").trim().toLowerCase();
  const num = String(numero ?? "").trim();
  const pass = String(password ?? "");

  if (!/^[a-z0-9-]{3,30}$/.test(cod)) return responder({ error: "No existe un edificio con ese código." }, 400);
  if (!/^[0-9A-Za-z-]{1,8}$/.test(num))
    return responder({ error: "Escribe el número de departamento tal como figura en el edificio (Ej. 302)." }, 400);
  if (!pass) return responder({ error: "Escribe tu contraseña." }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, clave("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), sinSesion);

  const { data: edificio } = await admin.from("edificios").select("id").eq("codigo", cod).maybeSingle();
  if (!edificio) return responder({ error: "No existe un edificio con ese código." }, 404);

  const { data: depto } = await admin
    .from("departamentos")
    .select("id")
    .eq("edificio_id", edificio.id)
    .ilike("numero", num)
    .maybeSingle();
  if (!depto) return responder({ error: "No existe ese número de departamento en este edificio." }, 404);

  const { data: membresias } = await admin
    .from("membresias")
    .select("perfil_id, estado")
    .eq("departamento_id", depto.id)
    .eq("rol", "habitante");
  const activa = membresias?.find((m) => m.estado === "activo");
  if (!activa) {
    const error = membresias?.length
      ? "Este usuario está desactivado. Consulta con la administración."
      : "Este departamento aún no tiene una cuenta de acceso. Consulta con la administración.";
    return responder({ error }, 403);
  }

  const { data: usuario, error: errUsuario } = await admin.auth.admin.getUserById(activa.perfil_id);
  if (errUsuario || !usuario.user?.email) {
    return responder({ error: "No pudimos iniciar sesión. Consulta con la administración." }, 500);
  }

  const publico = createClient(url, clave("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), sinSesion);
  const { data, error } = await publico.auth.signInWithPassword({ email: usuario.user.email, password: pass });
  if (error || !data.session) {
    if (error?.code === "email_not_confirmed") {
      return responder({ error: "Tu cuenta aún no está activada. Abre el enlace de invitación que llegó a tu correo." }, 403);
    }
    if (error?.status === 429) {
      return responder({ error: "Demasiados intentos. Espera unos minutos e inténtalo otra vez." }, 429);
    }
    return responder({ error: "Contraseña incorrecta." }, 401);
  }

  return responder({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});
