// Transferencia forzada de la titularidad (RN-23). Solo el equipo de EDIFIKA (plataforma_admins).
// multipart/form-data: codigo (del edificio), email y nombre del nuevo titular, acta (PDF o imagen, máx. 10 MB)
// Guarda el acta en actas/{edificio}/{uuid}.{ext}, crea o invita la cuenta del nuevo titular y llama a
// transferencia_forzada con la sesión de quien la ejecuta. El saliente queda en lectura por 15 días.
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

const TIPOS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return responder({ error: "Inicia sesión." }, 401);

  const usuario = createClient(url, clave("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    ...sinSesion,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const admin = createClient(url, clave("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), sinSesion);

  const { data: esPlataforma } = await usuario.rpc("es_plataforma");
  if (esPlataforma !== true) return responder({ error: "Solo el equipo de EDIFIKA puede hacer una transferencia forzada." }, 403);

  const form = await req.formData().catch(() => null);
  if (!form) return responder({ error: "Envía el formulario completo." }, 400);
  const codigo = String(form.get("codigo") ?? "").trim().toLowerCase();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const nombre = String(form.get("nombre") ?? "").trim();
  const redirect = String(form.get("redirect_to") ?? "");
  const acta = form.get("acta");

  const { data: ed } = await admin.from("edificios").select("id, nombre").eq("codigo", codigo).maybeSingle();
  if (!ed) return responder({ error: "No existe un edificio con ese código." }, 404);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ error: "Escribe el correo del nuevo titular." }, 400);
  if (nombre.length < 3) return responder({ error: "Escribe el nombre completo del nuevo titular." }, 400);
  if (!(acta instanceof File) || acta.size === 0) return responder({ error: "Adjunta el acta de la junta de propietarios." }, 400);
  const ext = TIPOS[acta.type];
  if (!ext) return responder({ error: "El acta debe ser PDF, JPG o PNG." }, 400);
  if (acta.size > 10 * 1024 * 1024) return responder({ error: "El acta pesa más de 10 MB." }, 400);

  // 1. Archivar el acta (bucket privado; solo service role)
  const ruta = `${ed.id}/${crypto.randomUUID()}.${ext}`;
  const { error: errSubir } = await admin.storage.from("actas").upload(ruta, acta, { contentType: acta.type });
  if (errSubir) return responder({ error: `No pudimos guardar el acta: ${errSubir.message}` }, 500);

  // 2. Cuenta del nuevo titular
  let perfilId: string | null = null;
  for (let page = 1; page <= 20 && !perfilId; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    perfilId = data?.users.find((x) => x.email?.toLowerCase() === email)?.id ?? null;
    if (!data || data.users.length < 1000) break;
  }
  let invitado = false;
  if (!perfilId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: /^https?:\/\//.test(redirect) ? redirect : undefined,
      data: { nombre },
    });
    if (error || !data.user) {
      await admin.storage.from("actas").remove([ruta]);
      return responder({ error: `No pudimos invitar al nuevo titular: ${error?.message}` }, 400);
    }
    perfilId = data.user.id;
    invitado = true;
  }
  await admin.from("perfiles").upsert({ id: perfilId, nombre }, { onConflict: "id", ignoreDuplicates: true });

  // 3. Transferencia (la base registra la auditoría con la ruta del acta)
  const { error } = await usuario.rpc("transferencia_forzada", { p_edificio: ed.id, p_nuevo: perfilId, p_acta_path: `actas/${ruta}` });
  if (error) {
    await admin.storage.from("actas").remove([ruta]);
    return responder({ error: error.message }, 400);
  }
  return responder({
    ok: true,
    mensaje: `${nombre} es el nuevo titular de ${ed.nombre}. El anterior queda con acceso de solo lectura por 15 días.` +
      (invitado ? ` Se envió la invitación a ${email}.` : ""),
  });
});
