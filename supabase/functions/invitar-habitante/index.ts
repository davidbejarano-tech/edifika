// Invitar al ocupante de un departamento (SPEC sección 8 y 9, RN-21). Solo el titular.
//   { departamento_id, redirect_to, accion?: "invitar" | "restablecer" }
// "invitar": crea la cuenta en Auth (o reutiliza la existente), el perfil y la membresía de habitante,
//            liga la persona responsable y envía el correo de invitación para crear la contraseña.
// "restablecer": envía al ocupante con acceso activo un correo para crear una contraseña nueva.
// Los correos los envía Supabase Auth; con SMTP propio (Resend) configurado en Supabase salen por Resend.
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

  const { departamento_id, redirect_to, accion = "invitar" } = await req.json().catch(() => ({}));
  if (!departamento_id) return responder({ error: "Falta el departamento." }, 400);

  // El permiso se comprueba con la sesión de quien llama (RLS y es_titular)
  const usuario = createClient(url, clave("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    ...sinSesion,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const admin = createClient(url, clave("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), sinSesion);

  const { data: depto } = await admin.from("departamentos").select("id, numero, edificio_id").eq("id", departamento_id).maybeSingle();
  if (!depto) return responder({ error: "Departamento no encontrado." }, 404);
  const { data: esTitular } = await usuario.rpc("es_titular", { p_edificio: depto.edificio_id });
  if (esTitular !== true) return responder({ error: "Solo el administrador titular invita a los vecinos." }, 403);

  const destino = typeof redirect_to === "string" && /^https?:\/\//.test(redirect_to) ? redirect_to : undefined;

  // ----- Restablecer la contraseña del ocupante con acceso activo
  if (accion === "restablecer") {
    const { data: m } = await admin
      .from("membresias")
      .select("perfil_id")
      .eq("departamento_id", depto.id)
      .eq("rol", "habitante")
      .eq("estado", "activo")
      .maybeSingle();
    if (!m) return responder({ error: `El departamento ${depto.numero} no tiene un acceso activo.` }, 400);
    const { data: u } = await admin.auth.admin.getUserById(m.perfil_id);
    if (!u.user?.email) return responder({ error: "La cuenta no tiene correo." }, 400);
    const publico = createClient(url, clave("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), sinSesion);
    const { error } = await publico.auth.resetPasswordForEmail(u.user.email, { redirectTo: destino });
    if (error) return responder({ error: error.status === 429 ? "Se enviaron demasiados correos. Espera unos minutos." : error.message }, 400);
    await admin.from("auditoria").insert({
      edificio_id: depto.edificio_id, accion: "restablecer_clave", entidad: "departamentos", entidad_id: depto.id,
    });
    return responder({ ok: true, mensaje: `Enviamos un enlace para crear una contraseña nueva a ${ocultar(u.user.email)}.` });
  }

  // ----- Invitar: persona responsable = inquilino vigente o, si no hay, propietario
  const { data: activa } = await admin
    .from("membresias")
    .select("id")
    .eq("departamento_id", depto.id)
    .eq("rol", "habitante")
    .eq("estado", "activo")
    .maybeSingle();
  if (activa) {
    return responder({ error: `El departamento ${depto.numero} ya tiene un acceso activo. Si cambió el ocupante, registra primero el cambio.` }, 400);
  }
  const { data: ocupaciones } = await admin
    .from("ocupaciones")
    .select("tipo, personas(id, nombre, email)")
    .eq("departamento_id", depto.id)
    .is("hasta", null);
  type Ocup = { tipo: string; personas: { id: string; nombre: string; email: string | null } | null };
  const lista = (ocupaciones ?? []) as unknown as Ocup[];
  const responsable = (lista.find((o) => o.tipo === "inquilino") ?? lista.find((o) => o.tipo === "propietario"))?.personas;
  if (!responsable) return responder({ error: `El departamento ${depto.numero} no tiene ocupante registrado.` }, 400);
  const email = responsable.email?.trim().toLowerCase();
  if (!email) {
    return responder({ error: `Registra el correo de ${responsable.nombre} (botón Editar) para enviarle la invitación.` }, 400);
  }

  // Cuenta: nueva (se envía la invitación) o existente (por ejemplo, vive o administra en otro edificio)
  let perfilId: string;
  let invitado = true;
  const { data: inv, error: errInv } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: destino,
    data: { nombre: responsable.nombre },
  });
  if (inv?.user) {
    perfilId = inv.user.id;
  } else if (errInv && /already|registered|exists/i.test(errInv.message)) {
    const existente = await buscarPorCorreo(admin, email);
    if (!existente) return responder({ error: "No pudimos invitar a ese correo. Inténtalo otra vez." }, 500);
    perfilId = existente;
    invitado = false;
  } else {
    const limite = errInv?.status === 429;
    return responder({ error: limite ? "Se enviaron demasiados correos. Espera unos minutos." : `No pudimos enviar la invitación: ${errInv?.message}` }, 400);
  }

  await admin.from("perfiles").upsert({ id: perfilId, nombre: responsable.nombre }, { onConflict: "id", ignoreDuplicates: true });
  const { error: errMem } = await admin.from("membresias").insert({
    edificio_id: depto.edificio_id, perfil_id: perfilId, rol: "habitante", departamento_id: depto.id,
  });
  if (errMem) return responder({ error: `No pudimos dar el acceso: ${errMem.message}` }, 400);
  await admin.from("personas").update({ perfil_id: perfilId }).eq("id", responsable.id);
  await admin.from("auditoria").insert({
    edificio_id: depto.edificio_id, accion: "invitar_habitante", entidad: "departamentos", entidad_id: depto.id,
    datos: { persona: responsable.id, cuenta_nueva: invitado },
  });

  return responder({
    ok: true,
    mensaje: invitado
      ? `Invitación enviada a ${responsable.nombre} (${ocultar(email)}). Con el enlace crea su contraseña y entra con el código del edificio y el número ${depto.numero}.`
      : `${responsable.nombre} ya tenía una cuenta: se le dio acceso al departamento ${depto.numero} con su contraseña actual.`,
  });
});

// jose.perez@correo.pe → j•••••••z@correo.pe (no se muestra el correo completo)
function ocultar(email: string) {
  const [u, d] = email.split("@");
  return u.length <= 2 ? `${u[0]}•@${d}` : `${u[0]}${"•".repeat(Math.min(u.length - 2, 8))}${u.at(-1)}@${d}`;
}

async function buscarPorCorreo(admin: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (!data || data.users.length < 1000) return null;
  }
  return null;
}
