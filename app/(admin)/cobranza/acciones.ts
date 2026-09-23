"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "@/lib/contexto";

export type Resultado = { ok: boolean; mensaje: string | null };

const falla = (mensaje: string): Resultado => ({ ok: false, mensaje });
const listo = (mensaje: string): Resultado => {
  revalidatePath("/", "layout"); // el contador de pagos por validar está en el menú
  return { ok: true, mensaje };
};

// RN-11 y RN-22: la base decide quién puede validar (nadie valida lo propio)
export async function validarPago(pagoId: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("validar_pago", { p_pago: pagoId });
  return error ? falla(error.message) : listo("Pago validado: la cuota quedó pagada.");
}

export async function rechazarPago(pagoId: string, nota: string): Promise<Resultado> {
  if (!nota.trim()) return falla("Escribe el motivo del rechazo: el vecino lo verá.");
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("rechazar_pago", { p_pago: pagoId, p_nota: nota.trim() });
  return error ? falla(error.message) : listo("Pago rechazado. La cuota volvió a pendiente y el vecino verá el motivo.");
}

export async function pagoEfectivo(compromisoId: string): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("registrar_pago_efectivo", { p_compromiso: compromisoId });
  return error ? falla(error.message) : listo("Pago en efectivo registrado.");
}

// Solo el titular; nunca de su propio departamento (RN-22)
export async function anularCompromiso(compromisoId: string, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return falla("Escribe el motivo de la anulación.");
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("anular_compromiso", { p_compromiso: compromisoId, p_motivo: motivo.trim() });
  return error ? falla(error.message) : listo("Compromiso anulado.");
}

// RN-13: a todos o a un departamento; por área (se reparte el total) o igual para cada uno
export async function emitirExtraordinario(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  const concepto = String(f.get("concepto") ?? "").trim();
  const monto = Number(String(f.get("monto") ?? "").replace(",", "."));
  const reparto = f.get("reparto") === "alicuota" ? "alicuota" : "igual";
  const departamento = String(f.get("departamento") ?? "");
  const vence = String(f.get("vence") ?? "");
  if (!concepto) return falla("Escribe el concepto del compromiso.");
  if (!(monto > 0)) return falla("El monto debe ser mayor que cero.");
  if (!vence) return falla("Indica la fecha de vencimiento.");

  const { data, error } = await supabase.rpc("emitir_extraordinario", {
    p_edificio: actual.edificio_id,
    p_concepto: concepto,
    p_monto: monto,
    p_reparto: reparto,
    p_vence: vence,
    p_departamento: departamento || undefined,
  });
  if (error) return falla(error.message);
  return listo(`Se emitió “${concepto}” a ${data} ${data === 1 ? "departamento" : "departamentos"}.`);
}

// Enlace temporal (2 minutos) para ver un comprobante del bucket privado
export async function urlComprobante(ruta: string): Promise<{ url: string | null; error: string | null }> {
  const { supabase } = await obtenerContexto();
  const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(ruta, 120);
  return error ? { url: null, error: "No pudimos abrir el comprobante." } : { url: data.signedUrl, error: null };
}
