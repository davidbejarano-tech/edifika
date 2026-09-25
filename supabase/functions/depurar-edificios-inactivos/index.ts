// Depuración diaria de edificios inactivos (RN-28, RN-29). La llama pg_cron una vez al día.
//   Cabecera x-cron-secret: CRON_SECRET (secreto de la función; sin él no hace nada).
//   Cuerpo opcional (pruebas): { solo: [edificio_id, ...] } la limita a esos edificios y
//   { sin_correo: true } registra los avisos sin enviar correos.
// Por cada edificio sin plan pagado:
//   · día 60: primer aviso al titular por correo, con el enlace para exportar sus datos;
//   · día 83: aviso final;
//   · día 90: borra sus archivos de Storage, llama a depurar_edificio() y elimina de Auth
//     las cuentas que quedaron sin ningún edificio.
// Cualquier movimiento reinicia el contador (tg_actividad); los avisos dentro de la app los
// muestra la propia app con estado_inactividad().
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

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

const BUCKETS = ["comprobantes", "recibos", "actas"];
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Todas las rutas bajo una carpeta (Storage lista un nivel a la vez)
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

async function avisar(para: string, nombre: string, edificio: string, dias: number, final: boolean) {
  const sitio = Deno.env.get("SITE_URL") ?? "";
  const pruebas = Deno.env.get("CORREO_PRUEBAS")?.trim();
  const quedan = 90 - dias;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "EDIFIKA <onboarding@resend.dev>",
      to: [pruebas || para],
      subject: `${pruebas ? `[Prueba para ${para}] ` : ""}${final ? "Último aviso: " : ""}${edificio} se eliminará en ${quedan} días por inactividad`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1B2328">
        <p style="font-size:20px;font-weight:800;letter-spacing:.04em;color:#0E2A47">EDIFIKA</p>
        <p>Hola${nombre ? ` ${esc(nombre.split(" ")[0])}` : ""}:</p>
        <p><b>${esc(edificio)}</b> lleva <b>${dias} días</b> sin movimiento en EDIFIKA. Como no tiene un plan pagado,
        se eliminará con todos sus datos en <b>${quedan} días</b>, según nuestros términos.</p>
        <p>Para conservarlo, basta con registrar cualquier movimiento (un gasto, un pago o un mensaje) o contratar un plan.
        Si prefieres guardar una copia, exporta sus datos a Excel:</p>
        <p><a href="${sitio}/exportar" style="display:inline-block;background:#1570C2;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Exportar los datos del edificio</a></p>
        <p style="color:#5B6970;font-size:12px">Recibes este correo porque eres el administrador titular del edificio.</p>
      </div>`,
    }),
  });
  if (!r.ok) throw new Error(`Resend: ${r.status}`);
}

Deno.serve(async (req) => {
  const secreto = Deno.env.get("CRON_SECRET");
  if (!secreto || req.headers.get("x-cron-secret") !== secreto) return responder({ error: "No autorizado" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, clave("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cuerpo = await req.json().catch(() => ({}));
  const solo: string[] | null = Array.isArray(cuerpo?.solo) ? cuerpo.solo : null;
  const sinCorreo = cuerpo?.sin_correo === true;

  const { data: lista, error } = await admin.rpc("edificios_por_depurar");
  if (error) return responder({ error: error.message }, 500);

  const resultado: { edificio: string; accion: string; ok: boolean; detalle?: string }[] = [];
  for (const e of lista ?? []) {
    if (!e.accion || (solo && !solo.includes(e.edificio_id))) continue;
    try {
      if (e.accion === "primer_aviso" || e.accion === "aviso_final") {
        const { data: u } = await admin.auth.admin.getUserById(e.titular);
        const { data: p } = await admin.from("perfiles").select("nombre").eq("id", e.titular).maybeSingle();
        if (u?.user?.email && !sinCorreo) await avisar(u.user.email, p?.nombre ?? "", e.nombre, e.dias, e.accion === "aviso_final");
        await admin.rpc("marcar_aviso_inactividad", { p_edificio: e.edificio_id, p_aviso: e.accion === "aviso_final" ? 2 : 1 });
      } else if (e.accion === "eliminar") {
        for (const b of BUCKETS) {
          const rutas = await rutasBajo(admin, b, e.edificio_id);
          for (let i = 0; i < rutas.length; i += 100) await admin.storage.from(b).remove(rutas.slice(i, i + 100));
        }
        const { data: huerfanos, error: err } = await admin.rpc("depurar_edificio", { p_edificio: e.edificio_id });
        if (err) throw new Error(err.message);
        for (const id of (huerfanos as string[]) ?? []) await admin.auth.admin.deleteUser(id);
        resultado.push({ edificio: e.codigo, accion: e.accion, ok: true, detalle: `${(huerfanos as string[])?.length ?? 0} cuentas eliminadas` });
        continue;
      }
      resultado.push({ edificio: e.codigo, accion: e.accion, ok: true });
    } catch (x) {
      resultado.push({ edificio: e.codigo, accion: e.accion, ok: false, detalle: (x as Error).message });
    }
  }
  return responder({ procesados: resultado.length, resultado });
});
