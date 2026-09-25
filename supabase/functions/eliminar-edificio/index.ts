// Eliminación de un edificio a pedido de su titular (consola de plataforma, SPEC 12.11 c).
//   { edificio_id, confirmacion (el código del edificio), motivo }
// Solo el equipo de EDIFIKA (plataforma_admins). Borra sus archivos de Storage, llama a
// eliminar_edificio_a_pedido() y elimina de Auth las cuentas que quedan sin ningún edificio.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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

async function rutasBajo(admin: SupabaseClient, bucket: string, carpeta: string): Promise<string[]> {
  const rutas: string[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(carpeta, { limit: 1000, offset: desde });
    if (error || !data?.length) break;
    for (const f of data) {
      const ruta = `${carpeta}/${f.name}`;
      if (f.id === null) rutas.push(...(await rutasBajo(admin, bucket, ruta)));
      else rutas.push(ruta);
    }
    if (data.length < 1000) break;
  }
  return rutas;
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
  const motivo = String(b.motivo ?? "").trim();
  if (!edificio) return responder({ error: "Falta el edificio." }, 400);
  if (motivo.length < 5) return responder({ error: "Escribe el motivo de la eliminación." }, 400);

  const usuario = createClient(url, clave("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    ...sinSesion,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const admin = createClient(url, clave("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), sinSesion);

  const { data: esPlataforma } = await usuario.rpc("es_plataforma");
  if (esPlataforma !== true) return responder({ error: "Solo el equipo de EDIFIKA elimina edificios." }, 403);

  const { data: e } = await admin.from("edificios").select("codigo, nombre").eq("id", edificio).maybeSingle();
  if (!e) return responder({ error: "Edificio no encontrado." }, 404);
  if (String(b.confirmacion ?? "").trim().toLowerCase() !== e.codigo) {
    return responder({ error: "Para confirmar, escribe el código del edificio." }, 400);
  }

  for (const bucket of ["comprobantes", "recibos", "actas"]) {
    const rutas = await rutasBajo(admin, bucket, edificio);
    for (let i = 0; i < rutas.length; i += 100) await admin.storage.from(bucket).remove(rutas.slice(i, i + 100));
  }
  const { data: huerfanos, error } = await admin.rpc("eliminar_edificio_a_pedido", { p_edificio: edificio, p_motivo: motivo });
  if (error) return responder({ error: error.message }, 400);
  for (const id of (huerfanos as string[]) ?? []) await admin.auth.admin.deleteUser(id);

  return responder({ ok: true, mensaje: `${e.nombre} se eliminó con todos sus datos. ${((huerfanos as string[]) ?? []).length} cuentas sin otro edificio se eliminaron.` });
});
