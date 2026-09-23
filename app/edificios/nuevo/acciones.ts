"use server";

import { cookies } from "next/headers";
import { COOKIE_EDIFICIO } from "@/lib/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type DatosEdificio = {
  miNombre: string;
  nombre: string;
  direccion: string;
  codigo: string;
  total: number;
  mes: string; // AAAA-MM
  organizacion: string | null; // null = organización nueva
};

export type ResultadoRegistro = { ok: true } | { ok: false; error: string; paso: 1 | 2 };

export async function codigoDisponible(codigo: string): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("codigo_disponible", { p_codigo: codigo });
  return data === true;
}

export async function registrarEdificio(d: DatosEdificio, filas: unknown[]): Promise<ResultadoRegistro> {
  const supabase = await crearClienteServidor();
  const { data: id, error } = await supabase.rpc("registrar_edificio", {
    p_nombre: d.nombre,
    p_direccion: d.direccion,
    p_codigo: d.codigo,
    p_total_departamentos: d.total,
    p_mes_inicio: `${d.mes}-01`,
    p_mi_nombre: d.miNombre,
    p_filas: filas as Database["public"]["Functions"]["registrar_edificio"]["Args"]["p_filas"],
    p_organizacion: d.organizacion ?? undefined,
  });

  if (error) {
    // Los mensajes de negocio vienen en español desde la base (regla 9 de CLAUDE.md).
    const m = error.message;
    const paso = /^Fila|importación|filas/i.test(m) ? 2 : 1;
    if (error.code === "22P02" || error.code === "22003") {
      return { ok: false, paso: 1, error: "Revisa que la cantidad de departamentos sea un número válido." };
    }
    return { ok: false, paso, error: m };
  }

  (await cookies()).set(COOKIE_EDIFICIO, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true };
}
