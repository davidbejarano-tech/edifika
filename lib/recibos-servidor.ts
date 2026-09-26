// Solo servidor: usa la clave de Resend (nunca en variables NEXT_PUBLIC_*).
import { mes, soles, fecha } from "./format";
import { logoParaPdf } from "./logo-edificio";
import { pdfRecibo } from "./pdf/ReciboPdf";
import { nombreArchivoRecibo, rutaPdfRecibo, type DatosRecibo } from "./recibo";
import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/** "2026-09" o "2026-09-01" → "2026-09-01" */
export const primerDia = (m: string) => `${m.slice(0, 7)}-01`;

/** Datos del recibo desde la base (valida el acceso: administración o el propio departamento). */
export async function cargarRecibo(supabase: Cliente, departamentoId: string, m: string) {
  const { data, error } = await supabase.rpc("datos_recibo", { p_departamento: departamentoId, p_mes: primerDia(m) });
  if (error) throw new Error(error.message);
  return data as unknown as DatosRecibo;
}

/** Genera el PDF, lo guarda en recibos/{edificio}/{departamento}/{AAAAMM}.pdf y registra el recibo. */
export async function generarRecibo(supabase: Cliente, edificioId: string, departamentoId: string, m: string) {
  const datos = await cargarRecibo(supabase, departamentoId, m);
  const pdf = await pdfRecibo(datos, await logoParaPdf(supabase, edificioId));
  const ruta = rutaPdfRecibo(datos, edificioId);
  const subida = await supabase.storage.from("recibos").upload(ruta, pdf, { contentType: "application/pdf", upsert: true });
  if (subida.error) throw new Error(`No se pudo guardar el PDF: ${subida.error.message}`);
  const { data: reciboId, error } = await supabase.rpc("registrar_recibo", {
    p_departamento: departamentoId,
    p_mes: primerDia(m),
    p_pdf_path: ruta,
  });
  if (error) throw new Error(error.message);
  return { datos, pdf, reciboId: reciboId as string };
}

/**
 * Envía el recibo por correo con Resend (el PDF va adjunto). La clave vive solo en el servidor.
 * CORREO_PRUEBAS (opcional, desarrollo): todos los recibos van a esa dirección, porque Resend
 * solo entrega a tu propio correo mientras no verifiques un dominio.
 */
export async function enviarPorCorreo(datos: DatosRecibo, pdf: Buffer) {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) throw new Error("Falta configurar el envío de correos (RESEND_API_KEY)");
  const destino = datos.departamento.correo;
  const pruebas = process.env.CORREO_PRUEBAS?.trim();
  if (!destino && !pruebas) {
    throw new Error(`El responsable del departamento ${datos.departamento.numero} no tiene correo registrado`);
  }
  const para = pruebas || destino!;
  const asunto = `Recibo de mantenimiento de ${mes(datos.mes)} · Depto ${datos.departamento.numero} · ${datos.edificio.nombre}`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM?.trim() || "EDIFIKA <onboarding@resend.dev>",
      to: [para],
      subject: pruebas ? `[Prueba para ${destino ?? "sin correo"}] ${asunto}` : asunto,
      html: correoHtml(datos),
      attachments: [{ filename: nombreArchivoRecibo(datos), content: pdf.toString("base64") }],
    }),
  });
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(`El correo no se pudo enviar: ${cuerpo.message ?? r.statusText}`);
  }
  return para;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function correoHtml(d: DatosRecibo) {
  const total = Math.max(0, d.totales.total);
  const pago = [d.edificio.cuenta_bancaria, d.edificio.yape_plin && `Yape o Plin: ${d.edificio.yape_plin}`].filter(Boolean).join(" · ");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#1B2328">
  <p style="font-size:20px;font-weight:800;letter-spacing:.04em;color:#0E2A47;margin:0 0 16px">EDIFIKA</p>
  <p>Hola${d.departamento.responsable ? ` ${esc(d.departamento.responsable.split(" ")[0])}` : ""}:</p>
  <p>Te enviamos el recibo de mantenimiento de <b>${mes(d.mes)}</b> del departamento <b>${esc(d.departamento.numero)}</b> de ${esc(d.edificio.nombre)}. Lo encuentras adjunto en PDF.</p>
  <div style="background:#E1EEFB;border-radius:10px;padding:14px 16px;margin:16px 0">
    <p style="margin:0;color:#5B6970">Total a pagar</p>
    <p style="margin:4px 0 0;font-size:26px;font-weight:800;color:#0E2A47">${soles(total)}</p>
    ${total > 0 && d.totales.vence ? `<p style="margin:4px 0 0;color:#5B6970">Vence el ${fecha(d.totales.vence)}</p>` : ""}
  </div>
  ${pago ? `<p>Paga a: ${esc(pago)}. Luego sube tu constancia en EDIFIKA.</p>` : ""}
  <p style="color:#5B6970;font-size:12px;margin-top:24px">Administración: ${esc(d.edificio.administrador ?? "")}. Este correo se envió desde EDIFIKA; no respondas a esta dirección.</p>
</div>`;
}
