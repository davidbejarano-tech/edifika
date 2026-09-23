"use server";

import { headers } from "next/headers";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string | null };

// Envía el formulario (con el acta) a la Edge Function "transferencia-forzada", que valida al equipo de plataforma.
export async function transferenciaForzada(_: Resultado, f: FormData): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, mensaje: "Tu sesión venció. Vuelve a ingresar." };
  if (String(f.get("confirmacion") ?? "").trim().toLowerCase() !== String(f.get("codigo") ?? "").trim().toLowerCase()) {
    return { ok: false, mensaje: "Para confirmar, repite el código del edificio." };
  }
  const h = await headers();
  const origen = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const cuerpo = new FormData();
  for (const k of ["codigo", "email", "nombre", "acta"]) {
    const v = f.get(k);
    if (v !== null) cuerpo.append(k, v);
  }
  cuerpo.append("redirect_to", `${origen}/auth/callback?next=/nueva-clave`);
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/transferencia-forzada`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${session.access_token}` },
      body: cuerpo,
      cache: "no-store",
    });
    const res = (await r.json().catch(() => ({}))) as { mensaje?: string; error?: string };
    return r.ok ? { ok: true, mensaje: res.mensaje ?? "Transferencia hecha." } : { ok: false, mensaje: res.error ?? "No se pudo transferir." };
  } catch {
    return { ok: false, mensaje: "No pudimos conectar con el servidor. Inténtalo otra vez." };
  }
}
