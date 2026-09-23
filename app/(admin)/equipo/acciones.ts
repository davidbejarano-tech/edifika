"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { obtenerContexto } from "@/lib/contexto";

export type Resultado = { ok: boolean; mensaje: string | null };

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const falla = (mensaje: string): Resultado => ({ ok: false, mensaje });
const listo = (mensaje: string): Resultado => {
  revalidatePath("/", "layout");
  return { ok: true, mensaje };
};

// Externos: Edge Function "invitar-administrador" (crea o invita la cuenta y aplica la regla en la base)
async function invitarExterno(cuerpo: Record<string, string>): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return falla("Tu sesión venció. Vuelve a ingresar.");
  const h = await headers();
  const origen = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invitar-administrador`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...cuerpo, edificio_id: actual.edificio_id, redirect_to: `${origen}/auth/callback?next=/nueva-clave` }),
      cache: "no-store",
    });
    const res = (await r.json().catch(() => ({}))) as { mensaje?: string; error?: string };
    if (!r.ok) return falla(res.error ?? "No pudimos completar la invitación.");
    return listo(res.mensaje ?? "Listo.");
  } catch {
    return falla("No pudimos conectar con el servidor. Inténtalo otra vez.");
  }
}

// RN-19: hasta 2 coadministradores, vecinos o externos
export async function agregarCoadministrador(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  if (texto(f.get("origen")) === "externo") {
    return invitarExterno({ accion: "coadministrador", email: texto(f.get("email")), nombre: texto(f.get("nombre")) });
  }
  const perfil = texto(f.get("perfil"));
  if (!perfil) return falla("Elige al vecino.");
  const { error } = await supabase.rpc("agregar_coadministrador", { p_edificio: actual.edificio_id, p_perfil: perfil });
  if (error) return falla(error.message);
  return listo("Coadministrador agregado. Entra con su departamento y cambia a “Administración” con el selector del encabezado.");
}

export async function quitarCoadministrador(perfil: string): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  const { error } = await supabase.rpc("quitar_coadministrador", { p_edificio: actual.edificio_id, p_perfil: perfil });
  if (error) return falla(error.message);
  return listo("Coadministrador quitado. Ya no puede entrar a la administración.");
}

// RN-22: vecino que valida los pagos del titular cuando no hay coadministrador
export async function designarValidador(perfil: string | null): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  // p_perfil null = quitar la designación (la función no tiene valor por defecto: hay que enviarlo)
  const { error } = await supabase.rpc("designar_validador", { p_edificio: actual.edificio_id, p_perfil: perfil as string });
  if (error) return falla(error.message);
  return listo(perfil ? "Vecino validador designado." : "Se quitó la designación del vecino validador.");
}

// RN-23: transferencia voluntaria, con confirmación escribiendo el código del edificio
export async function transferirTitularidad(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  if (texto(f.get("confirmacion")).toLowerCase() !== actual.codigo) {
    return falla(`Para confirmar, escribe el código del edificio: ${actual.codigo}`);
  }
  const saliente = texto(f.get("saliente")) === "operador" ? "operador" : "lectura";
  if (texto(f.get("origen")) === "externo") {
    return invitarExterno({ accion: "titular", saliente, email: texto(f.get("email")), nombre: texto(f.get("nombre")) });
  }
  const nuevo = texto(f.get("perfil"));
  if (!nuevo) return falla("Elige al nuevo titular.");
  const { error } = await supabase.rpc("transferir_titularidad", { p_edificio: actual.edificio_id, p_nuevo: nuevo, p_saliente: saliente });
  if (error) return falla(error.message);
  return listo(
    saliente === "operador"
      ? "Transferencia hecha. Ahora eres coadministrador de este edificio."
      : "Transferencia hecha. Tendrás acceso de solo lectura durante 15 días.",
  );
}
