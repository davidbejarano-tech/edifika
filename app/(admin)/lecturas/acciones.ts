"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "@/lib/contexto";

export type Resultado = { ok: boolean; mensaje: string | null };

// RN-38: registrar_lecturas calcula los m³ (lectura actual − anterior) y rechaza lecturas menores.
// Lo pueden hacer el titular y los coadministradores (dato operativo).
export async function guardarLecturas(
  periodoId: string,
  fecha: string,
  lecturas: { medidor_id: string; lectura: number }[],
): Promise<Resultado> {
  if (!lecturas.length) return { ok: false, mensaje: "Escribe al menos una lectura." };
  if (!fecha) return { ok: false, mensaje: "Indica la fecha de la lectura." };
  const { supabase } = await obtenerContexto();
  const { data, error } = await supabase.rpc("registrar_lecturas", { p_periodo: periodoId, p_fecha: fecha, p_lecturas: lecturas });
  if (error) {
    const m = /confirmad/i.test(error.message)
      ? "Los gastos de este mes ya están confirmados: no se pueden cambiar las lecturas."
      : error.message;
    return { ok: false, mensaje: m };
  }
  for (const r of ["/lecturas", "/calculo", "/ciclo", "/configuracion"]) revalidatePath(r);
  return { ok: true, mensaje: `${data} ${data === 1 ? "lectura guardada" : "lecturas guardadas"}.` };
}
