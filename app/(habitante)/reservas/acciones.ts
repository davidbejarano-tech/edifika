"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "@/lib/contexto";

export type Turno = { inicio: string; fin: string; libre: boolean; motivo: string | null };
export type Resultado = { ok: boolean; mensaje: string };

// Turnos de un día (RN-31): libres u ocupados, sin revelar quién reservó
export async function verTurnos(zonaId: string, dia: string): Promise<{ turnos: Turno[]; error?: string }> {
  const { supabase } = await obtenerContexto();
  const { data, error } = await supabase.rpc("disponibilidad", { p_zona: zonaId, p_fecha: dia });
  if (error) return { turnos: [], error: error.message };
  return { turnos: (data ?? []).map((t) => ({ inicio: t.inicio, fin: t.fin, libre: t.libre, motivo: t.motivo })) };
}

// La base valida horario, anticipación, límite mensual, deuda vencida, bloqueos y que el turno siga libre
export async function reservar(zonaId: string, inicio: string, aceptoReglamento: boolean): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { data: id, error } = await supabase.rpc("solicitar_reserva", { p_zona: zonaId, p_inicio: inicio, p_acepto_reglamento: aceptoReglamento });
  if (error) return { ok: false, mensaje: error.message };
  const { data: r } = await supabase.from("reservas").select("estado").eq("id", id).single();
  revalidatePath("/reservas");
  revalidatePath("/cuentas");
  return {
    ok: true,
    mensaje:
      r?.estado === "confirmada"
        ? "¡Listo! Tu reserva está confirmada."
        : r?.estado === "solicitada"
          ? "Solicitud enviada. La administración debe aprobarla; te avisaremos aquí."
          : "Turno separado. Paga los cargos en Mis cuentas dentro del plazo para confirmar tu reserva.",
  };
}

export async function cancelarMiReserva(id: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("cancelar_reserva", { p_reserva: id });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/reservas");
  revalidatePath("/cuentas");
  return { ok: true, mensaje: "Reserva cancelada. Los cargos que no pagaste se anularon." };
}
