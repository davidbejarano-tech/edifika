"use server";

import { revalidatePath } from "next/cache";
import { inicioDiaLima } from "@/lib/areas";
import { obtenerContexto } from "@/lib/contexto";
import type { Database } from "@/lib/supabase/types";

export type Resultado = { ok: boolean; mensaje: string };
type Zona = Database["public"]["Tables"]["zonas_comunes"]["Insert"];

const listo = (mensaje: string): Resultado => {
  revalidatePath("/areas");
  revalidatePath("/inicio");
  return { ok: true, mensaje };
};
const falla = (mensaje: string): Resultado => ({ ok: false, mensaje });

// Zonas (RN-30): solo el titular (RLS zona_titular)
export async function guardarZona(id: string | null, datos: Omit<Zona, "edificio_id" | "id">): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio");
  if (!datos.nombre?.trim()) return falla("Escribe el nombre de la zona");
  if (!datos.dias_semana?.length) return falla("Elige al menos un día de atención");
  const fila = { ...datos, nombre: datos.nombre.trim(), edificio_id: actual.edificio_id };
  const { error } = id
    ? await supabase.from("zonas_comunes").update(fila).eq("id", id).select("id").single()
    : await supabase.from("zonas_comunes").insert(fila).select("id").single();
  if (error) {
    if (/hora_cierre|check/i.test(error.message)) return falla("Revisa los horarios y la anticipación: el cierre debe ser después de la apertura y la anticipación máxima mayor que la mínima");
    if (error.code === "PGRST116" || /row-level/i.test(error.message)) return falla("Solo el administrador titular configura las zonas");
    return falla(error.message);
  }
  return listo(id ? "Zona actualizada." : "Zona creada. Los vecinos ya pueden reservarla.");
}

// Bloqueo de fechas completas (mantenimiento o eventos): titular o coadministrador
export async function bloquearFechas(zonaId: string, desde: string, hasta: string, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return falla("Escribe el motivo del bloqueo");
  if (!desde || !hasta || hasta < desde) return falla("Revisa las fechas del bloqueo");
  const { supabase } = await obtenerContexto();
  const fin = new Date(`${hasta}T12:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  const { error } = await supabase
    .from("bloqueos_zona")
    .insert({ zona_id: zonaId, desde: inicioDiaLima(desde), hasta: inicioDiaLima(fin.toISOString().slice(0, 10)), motivo: motivo.trim() })
    .select("id")
    .single();
  return error ? falla("No se pudo bloquear: solo la administración bloquea fechas") : listo("Fechas bloqueadas.");
}

export async function quitarBloqueo(id: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error, count } = await supabase.from("bloqueos_zona").delete({ count: "exact" }).eq("id", id);
  return error || !count ? falla("No se pudo quitar el bloqueo") : listo("Bloqueo quitado.");
}

// Reservas (RN-32 a RN-35): la base valida quién gestiona (nadie gestiona las de su departamento)
export async function aprobarReserva(id: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("aprobar_reserva", { p_reserva: id });
  return error ? falla(error.message) : listo("Reserva aprobada.");
}

export async function rechazarReserva(id: string, motivo: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("rechazar_reserva", { p_reserva: id, p_motivo: motivo });
  return error ? falla(error.message) : listo("Reserva rechazada. El vecino verá el motivo.");
}

export async function cancelarReservaAdmin(id: string, motivo: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("cancelar_reserva", { p_reserva: id, p_motivo: motivo });
  return error ? falla(error.message) : listo("Reserva cancelada. Los cargos sin pagar se anularon.");
}

export async function cerrarReserva(id: string, retener: number, nota: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("cerrar_reserva", { p_reserva: id, p_retener: retener, p_nota: nota });
  return error ? falla(error.message) : listo(retener > 0 ? "Reserva cerrada con garantía retenida." : "Reserva cerrada.");
}

export async function devolverGarantia(id: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("devolver_garantia", { p_reserva: id });
  return error ? falla(error.message) : listo("Devolución de la garantía registrada.");
}
