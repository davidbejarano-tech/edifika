"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "@/lib/contexto";

export type Resultado = { ok: boolean; mensaje: string | null };

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const falla = (mensaje: string): Resultado => ({ ok: false, mensaje });
const listo = (mensaje: string): Resultado => {
  for (const r of ["/gastos", "/calculo", "/ciclo", "/configuracion", "/inicio"]) revalidatePath(r);
  return { ok: true, mensaje };
};

// Los gastos los registran el titular y los coadministradores (RLS gas_insert: es_admin).
// Un periodo con gastos confirmados queda bloqueado (trigger bloquear_gastos).
function traducir(m: string) {
  if (/confirmad/i.test(m)) return "Los gastos de este mes ya están confirmados: no se pueden cambiar.";
  if (/row-level security/i.test(m)) return "Solo la administración (titular o coadministrador) registra gastos.";
  if (/monto/i.test(m)) return "El monto debe ser mayor que cero.";
  return m;
}

export async function registrarGasto(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  const monto = Number(texto(f.get("monto")).replace(",", "."));
  const categoria = texto(f.get("categoria"));
  const descripcion = texto(f.get("descripcion"));
  const fecha = texto(f.get("fecha"));
  if (!categoria || !descripcion) return falla("Escribe la categoría y el detalle del gasto.");
  if (!(monto > 0)) return falla("El monto debe ser mayor que cero.");
  if (!fecha) return falla("Indica la fecha del gasto.");

  const { error } = await supabase.from("gastos").insert({
    edificio_id: actual.edificio_id,
    periodo_id: texto(f.get("periodo_id")),
    tipo: texto(f.get("tipo")) === "recurrente" ? "recurrente" : "extraordinario",
    categoria,
    descripcion,
    monto,
    fecha,
  });
  if (error) return falla(traducir(error.message));
  return listo(`Gasto registrado: ${descripcion}.`);
}

export async function eliminarGasto(id: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { data, error } = await supabase.from("gastos").delete().eq("id", id).select("id");
  if (error) return falla(traducir(error.message));
  if (!data?.length) return falla("No se pudo eliminar: solo la administración elimina gastos manuales sin confirmar.");
  return listo("Gasto eliminado.");
}

// RN-06: solo el titular confirma; los gastos, el agua y las lecturas quedan bloqueados
export async function confirmarGastos(periodoId: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("confirmar_gastos", { p_periodo: periodoId });
  if (error) return falla(error.message);
  return listo("Gastos confirmados. El estado de cuenta del mes ya es oficial.");
}
