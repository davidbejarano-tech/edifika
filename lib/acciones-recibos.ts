"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "./contexto";
import type { DatosRecibo } from "./recibo";
import { cargarRecibo, enviarPorCorreo, generarRecibo } from "./recibos-servidor";

export type RespuestaRecibo = { ok: true; datos: DatosRecibo; mensaje?: string } | { ok: false; mensaje: string };

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : "No se pudo completar la acción");

// El departamento debe ser del edificio elegido (la base valida además el acceso)
async function contexto(departamentoId: string) {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) throw new Error("Elige un edificio");
  const { data } = await supabase.from("departamentos").select("edificio_id").eq("id", departamentoId).maybeSingle();
  if (data?.edificio_id !== actual.edificio_id) throw new Error("Sin acceso a este recibo");
  return { supabase, edificioId: actual.edificio_id };
}

/** Vista previa: administración o el propio vecino. */
export async function verRecibo(departamentoId: string, mes: string): Promise<RespuestaRecibo> {
  try {
    const { supabase } = await contexto(departamentoId);
    return { ok: true, datos: await cargarRecibo(supabase, departamentoId, mes) };
  } catch (e) {
    return { ok: false, mensaje: mensajeDe(e) };
  }
}

/** Genera el PDF y lo envía al correo del responsable (titular o coadministrador). */
export async function enviarRecibo(departamentoId: string, mes: string): Promise<RespuestaRecibo> {
  try {
    const { supabase, edificioId } = await contexto(departamentoId);
    const { datos, pdf, reciboId } = await generarRecibo(supabase, edificioId, departamentoId, mes);
    const para = await enviarPorCorreo(datos, pdf);
    const { error } = await supabase.rpc("marcar_recibo_enviado", { p_recibo: reciboId, p_canal: "correo" });
    if (error) throw new Error(error.message);
    revalidatePath("/recibos");
    return { ok: true, datos: await cargarRecibo(supabase, departamentoId, mes), mensaje: `Recibo enviado a ${para}.` };
  } catch (e) {
    revalidatePath("/recibos");
    return { ok: false, mensaje: mensajeDe(e) };
  }
}

/** Al abrir el enlace de WhatsApp: genera el recibo y registra el envío por ese canal. */
export async function registrarWhatsapp(departamentoId: string, mes: string): Promise<RespuestaRecibo> {
  try {
    const { supabase, edificioId } = await contexto(departamentoId);
    const { reciboId } = await generarRecibo(supabase, edificioId, departamentoId, mes);
    const { error } = await supabase.rpc("marcar_recibo_enviado", { p_recibo: reciboId, p_canal: "whatsapp" });
    if (error) throw new Error(error.message);
    revalidatePath("/recibos");
    return { ok: true, datos: await cargarRecibo(supabase, departamentoId, mes), mensaje: "Envío por WhatsApp registrado." };
  } catch (e) {
    return { ok: false, mensaje: mensajeDe(e) };
  }
}

export type ResultadoMasivo = { ok: boolean; mensaje: string; fallas: { numero: string; motivo: string }[] };

/** "Generar y enviar todos": cada departamento con correo recibe su PDF. */
export async function enviarTodos(mes: string): Promise<ResultadoMasivo> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) return { ok: false, mensaje: "Solo la administración envía recibos", fallas: [] };
  const { data: lista, error } = await supabase.rpc("recibos_del_mes", { p_edificio: actual.edificio_id, p_mes: `${mes.slice(0, 7)}-01` });
  if (error) return { ok: false, mensaje: error.message, fallas: [] };

  let enviados = 0;
  const fallas: ResultadoMasivo["fallas"] = [];
  for (const d of lista ?? []) {
    try {
      const { datos, pdf, reciboId } = await generarRecibo(supabase, actual.edificio_id, d.departamento_id, mes);
      await enviarPorCorreo(datos, pdf);
      const r = await supabase.rpc("marcar_recibo_enviado", { p_recibo: reciboId, p_canal: "correo" });
      if (r.error) throw new Error(r.error.message);
      enviados++;
      await new Promise((r) => setTimeout(r, 550)); // Resend admite 2 envíos por segundo
    } catch (e) {
      fallas.push({ numero: d.numero, motivo: mensajeDe(e) });
    }
  }
  revalidatePath("/recibos");
  const total = (lista ?? []).length;
  return {
    ok: fallas.length === 0,
    mensaje:
      fallas.length === 0
        ? `${enviados} recibos generados y enviados.`
        : `${enviados} de ${total} recibos enviados. ${fallas.length} no se pudieron enviar.`,
    fallas,
  };
}
