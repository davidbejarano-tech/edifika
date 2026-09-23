"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "@/lib/contexto";

export type Resultado = { ok: boolean; mensaje: string | null };

const falla = (mensaje: string): Resultado => ({ ok: false, mensaje });
const listo = (mensaje: string): Resultado => {
  for (const r of ["/calculo", "/gastos", "/ciclo", "/configuracion"]) revalidatePath(r);
  return { ok: true, mensaje };
};
const traducir = (m: string) =>
  /confirmad/i.test(m)
    ? "Los gastos de este mes ya están confirmados: el recibo de agua no se puede cambiar."
    : /row-level security/i.test(m)
      ? "Solo la administración (titular o coadministrador) registra el recibo de agua."
      : m;

// RN-05: el recibo crea o actualiza el gasto "Agua" del periodo (trigger sync_agua)
export async function guardarRecibo(_: Resultado, f: FormData): Promise<Resultado> {
  const periodo = String(f.get("periodo_id") ?? "");
  const monto = Number(String(f.get("monto") ?? "").replace(",", "."));
  const consumo = Number(String(f.get("consumo") ?? "").replace(",", "."));
  if (!(monto > 0)) return falla("El monto del recibo debe ser mayor que cero.");
  if (!(consumo > 0)) return falla("El consumo del medidor general (m³) debe ser mayor que cero.");
  const { supabase } = await obtenerContexto();
  const { data, error } = await supabase
    .from("recibos_agua")
    .upsert({ periodo_id: periodo, monto, consumo_m3: consumo, riego_m3: 0 }, { onConflict: "periodo_id" })
    .select("periodo_id");
  if (error) return falla(traducir(error.message));
  if (!data?.length) return falla("Solo la administración registra el recibo de agua.");
  return listo("Recibo de agua guardado. Se registró como gasto “Agua” del mes.");
}

export async function eliminarRecibo(periodo: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { data, error } = await supabase.from("recibos_agua").delete().eq("periodo_id", periodo).select("periodo_id");
  if (error) return falla(traducir(error.message));
  if (!data?.length) return falla("No se pudo eliminar el recibo.");
  return listo("Recibo de agua eliminado, junto con su gasto “Agua”.");
}
