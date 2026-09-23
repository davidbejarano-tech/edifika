"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "@/lib/contexto";
import { confirmarGastos as confirmar } from "../gastos/acciones";

export type Resultado = { ok: boolean; mensaje: string | null };

export async function confirmarGastos(periodoId: string): Promise<Resultado> {
  const r = await confirmar(periodoId);
  revalidatePath("/ciclo");
  return r;
}

// RN-07: abrir el mes siguiente (solo titular). abrir_periodo cierra el mes, emite una cuota por
// departamento con su desglose y registra los gastos recurrentes del nuevo mes.
export async function abrirMes(recurrentes: { categoria: string; descripcion: string; monto: number }[]): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return { ok: false, mensaje: "Elige un edificio." };
  const limpios = recurrentes.filter((r) => r.categoria.trim() && r.monto > 0);
  const { error } = await supabase.rpc("abrir_periodo", { p_edificio: actual.edificio_id, p_recurrentes: limpios });
  if (error) return { ok: false, mensaje: error.message };
  for (const r of ["/ciclo", "/gastos", "/calculo", "/lecturas", "/configuracion", "/inicio", "/edificios"]) revalidatePath(r);
  return { ok: true, mensaje: "Mes abierto: se emitieron las cuotas y se registraron los gastos recurrentes del nuevo mes." };
}
