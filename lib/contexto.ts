import { cookies } from "next/headers";
import { crearClienteServidor } from "./supabase/server";
import type { Database } from "./supabase/types";

export type NivelAdmin = Database["public"]["Enums"]["nivel_admin"];

export type EdificioMio = {
  edificio_id: string;
  nombre: string;
  codigo: string;
  nivel: NivelAdmin | null;
  departamento_id: string | null;
  departamento_numero: string | null;
};

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

  const { data, error } = await supabase.rpc("mis_edificios");
  if (error) throw new Error(error.message);

  const deptoIds = data.map((e) => e.departamento_id).filter((id): id is string => !!id);
  const numeros = new Map<string, string>();
  if (deptoIds.length) {
    const { data: deps } = await supabase.from("departamentos").select("id, numero").in("id", deptoIds);
    deps?.forEach((d) => numeros.set(d.id, d.numero));
  }

  const edificios: EdificioMio[] = data.map((e) => ({
    ...e,
    departamento_numero: e.departamento_id ? (numeros.get(e.departamento_id) ?? null) : null,
  }));

  const elegido = (await cookies()).get(COOKIE_EDIFICIO)?.value;
  const actual =
    edificios.find((e) => e.edificio_id === elegido) ?? (edificios.length === 1 ? edificios[0] : null);

  return { supabase, user, edificios, actual };
}
