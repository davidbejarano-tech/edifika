import type { crearClienteServidor } from "./supabase/server";

// Versión vigente de los términos y la política de privacidad. Si cambian en algo importante,
// sube la versión: cada cuenta vuelve a aceptarlos al entrar.
export const VERSION_TERMINOS = "2026-09";
export const FECHA_TERMINOS = "25 de setiembre de 2026";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * ¿La cuenta aceptó la versión vigente? Si al registrarse marcó la casilla (queda en los datos de
 * la cuenta) y su perfil aún no lo tiene, se registra aquí. Sin perfil todavía (recién registrado),
 * vale la casilla del registro.
 */
export async function terminosAceptados(supabase: Cliente, userId: string, metadata: Record<string, unknown> | undefined) {
  const { data: perfil } = await supabase.from("perfiles").select("terminos_version").eq("id", userId).maybeSingle();
  if (perfil?.terminos_version === VERSION_TERMINOS) return true;
  const enRegistro = metadata?.terminos_version === VERSION_TERMINOS;
  if (!perfil) return enRegistro;
  if (enRegistro) {
    const { error } = await supabase.rpc("aceptar_terminos", { p_version: VERSION_TERMINOS });
    return !error;
  }
  return false;
}
