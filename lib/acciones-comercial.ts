"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "./contexto";
import { VERSION_TERMINOS } from "./legal";

export type Resultado = { ok: boolean; mensaje: string };

// Prueba gratis de 14 días, una sola vez por módulo (RN-17). Solo el titular.
export async function activarPrueba(modulo: string): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return { ok: false, mensaje: "Elige un edificio" };
  const { data, error } = await supabase.rpc("activar_prueba", { p_edificio: actual.edificio_id, p_modulo: modulo });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: `Prueba activada hasta el ${data}.` };
}

// Registra la solicitud y avisa por correo al equipo de EDIFIKA (Edge Function avisar-solicitud-plan)
export async function solicitarPlan(plan: string, nota: string): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return { ok: false, mensaje: "Elige un edificio" };
  const { data: id, error } = await supabase.rpc("solicitar_plan", { p_edificio: actual.edificio_id, p_plan: plan, p_nota: nota });
  if (error) return { ok: false, mensaje: error.message };
  // Si el aviso falla, la solicitud ya quedó registrada y la plataforma la verá igual
  await supabase.functions.invoke("avisar-solicitud-plan", { body: { solicitud_id: id } }).catch(() => null);
  revalidatePath("/inicio");
  return { ok: true, mensaje: "Solicitud registrada. Te contactaremos en las próximas 24 horas hábiles." };
}

export async function aceptarTerminos(): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("aceptar_terminos", { p_version: VERSION_TERMINOS });
  return error ? { ok: false, mensaje: error.message } : { ok: true, mensaje: "" };
}
