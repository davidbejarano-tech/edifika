// Avisa por correo al equipo de EDIFIKA que un edificio solicitó un plan (Etapa 6).
//   { solicitud_id }
// Lo llama la app con la sesión del titular justo después de solicitar_plan. La dirección de
// destino sale de plataforma_config.correo_avisos (se podrá cambiar desde la consola de plataforma).
// Cada solicitud se avisa una sola vez (avisado_en).
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

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return responder({ error: "Inicia sesión." }, 401);
  const { solicitud_id } = await req.json().catch(() => ({}));
  if (typeof solicitud_id !== "string") return responder({ error: "Falta la solicitud." }, 400);

  const usuario = createClient(url, clave("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    ...sinSesion,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const admin = createClient(url, clave("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), sinSesion);

  // Quien llama debe poder ver la solicitud (RLS: equipo de administración del edificio)
  const { data: visible } = await usuario.from("solicitudes_plan").select("id").eq("id", solicitud_id).maybeSingle();
  if (!visible) return responder({ error: "Solicitud no encontrada." }, 404);

  const { data: s } = await admin
    .from("solicitudes_plan")
    .select("id, plan, nota, avisado_en, created_at, solicitado_por, edificios(nombre, codigo, direccion, total_departamentos)")
    .eq("id", solicitud_id)
    .single();
  if (!s) return responder({ error: "Solicitud no encontrada." }, 404);
  if (s.avisado_en) return responder({ ok: true, ya_avisada: true });

  const { data: cfg } = await admin.from("plataforma_config").select("valor").eq("clave", "correo_avisos").single();
  const destino = String(cfg?.valor ?? "");
  const { data: perfil } = await admin.from("perfiles").select("nombre, telefono").eq("id", s.solicitado_por).maybeSingle();
  const { data: cuenta } = s.solicitado_por ? await admin.auth.admin.getUserById(s.solicitado_por) : { data: null };
  const e = s.edificios as unknown as { nombre: string; codigo: string; direccion: string; total_departamentos: number };

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "EDIFIKA <onboarding@resend.dev>",
      to: [destino],
      subject: `Solicitud del plan ${s.plan} · ${e.nombre}`,
      html: `<div style="font-family:Arial,sans-serif;color:#1B2328">
        <p style="font-size:18px;font-weight:800;color:#0E2A47">Nueva solicitud de plan</p>
        <p><b>Plan:</b> ${esc(s.plan)}<br><b>Edificio:</b> ${esc(e.nombre)} (${esc(e.codigo)})<br>
        <b>Dirección:</b> ${esc(e.direccion)}<br><b>Departamentos:</b> ${e.total_departamentos}</p>
        <p><b>Titular:</b> ${esc(perfil?.nombre ?? "—")}<br><b>Correo:</b> ${esc(cuenta?.user?.email ?? "—")}<br>
        <b>Teléfono:</b> ${esc(perfil?.telefono ?? "—")}</p>
        ${s.nota ? `<p><b>Comentario:</b> ${esc(s.nota)}</p>` : ""}
      </div>`,
    }),
  });
  if (!r.ok) return responder({ error: "No se pudo enviar el aviso." }, 502);

  await admin.from("solicitudes_plan").update({ avisado_en: new Date().toISOString() }).eq("id", s.id);
  return responder({ ok: true });
});
