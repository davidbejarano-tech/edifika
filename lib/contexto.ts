import { cookies } from "next/headers";
import { crearClienteServidor } from "./supabase/server";
import type { Database } from "./supabase/types";

export type NivelAdmin = Database["public"]["Enums"]["nivel_admin"];

/** Una fila de resumen_mis_edificios(): acceso de la cuenta y cifras de gestión (solo para admins). */
export type EdificioMio = Database["public"]["Functions"]["resumen_mis_edificios"]["Returns"][number];

export const COOKIE_EDIFICIO = "bb_edificio";

export const NOMBRE_NIVEL: Record<NivelAdmin, string> = {
  titular: "Administrador titular",
  operador: "Coadministrador",
  lectura: "Solo lectura",
};

/** Usuario, edificios de la cuenta (RN-25) y edificio elegido en la cookie. */
export async function obtenerContexto() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, edificios: [] as EdificioMio[], actual: null };

  const { data: edificios, error } = await supabase.rpc("resumen_mis_edificios");
  if (error) throw new Error(error.message);

  const elegido = (await cookies()).get(COOKIE_EDIFICIO)?.value;
  const actual =
    edificios.find((e) => e.edificio_id === elegido) ?? (edificios.length === 1 ? edificios[0] : null);

  return { supabase, user, edificios, actual };
}
