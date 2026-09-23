/**
 * Pagos de prueba en los-ficus para probar la Cobranza antes de la Etapa 4.
 * Entra como los vecinos del 302 y del 101 (igual que lo hará la app), sube un comprobante en PDF
 * y envía a revisión el pago de su cuota pendiente más antigua. Si ya tienen un pago en revisión, no hace nada.
 *
 *   npm run demo:pagos
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const CLAVE = process.env.DEMO_PASSWORD || "Demo2026!";

// PDF mínimo de una página con el texto del comprobante (sin dependencias)
function comprobantePdf(lineas: string[]): Uint8Array {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const texto = lineas.map((l, i) => `BT /F1 ${i === 0 ? 16 : 12} Tf 50 ${780 - i * 26} Td (${esc(l)}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array([...pdf].map((c) => c.charCodeAt(0) & 0xff));
}

async function vecino(numero: string, metodo: string, operacion: string) {
  const r = await fetch(`${url}/functions/v1/login-departamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publica },
    body: JSON.stringify({ codigo: "los-ficus", numero, password: CLAVE }),
  });
  const sesion = await r.json();
  if (!r.ok) throw new Error(`Depto ${numero}: ${sesion.error}`);
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  await sb.auth.setSession(sesion);
  const uid = (await sb.auth.getUser()).data.user!.id;

  const { data: ed } = await sb.from("edificios").select("id").eq("codigo", "los-ficus").single();
  // Solo las cuotas de su departamento (un vecino que además administra ve las de todo el edificio)
  const { data: dep } = await sb.rpc("mi_departamento_en", { p_edificio: ed!.id });
  const { data: comps } = await sb
    .from("compromisos")
    .select("id, concepto, monto, estado, departamento_id")
    .eq("departamento_id", dep!)
    .in("estado", ["pendiente", "en_revision"])
    .order("vence_en");
  if (comps?.some((c) => c.estado === "en_revision")) return console.log(`• Depto ${numero}: ya tiene un pago en revisión.`);
  const c = comps?.[0];
  if (!c) return console.log(`• Depto ${numero}: no tiene cuotas pendientes.`);

  const monto = Number(c.monto).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const ruta = `${ed!.id}/${c.departamento_id}/${crypto.randomUUID()}.pdf`;
  const pdf = comprobantePdf([
    `Comprobante de pago · ${metodo}`,
    "COMPROBANTE DE PRUEBA (EDIFIKA)",
    `Edificio Los Ficus · Departamento ${numero}`,
    `Concepto: ${c.concepto}`,
    `Monto: S/ ${monto}`,
    `N. de operacion: ${operacion}`,
    `Fecha: ${new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima" }).format(new Date())}`,
  ]);
  const { error: e1 } = await sb.storage.from("comprobantes").upload(ruta, pdf, { contentType: "application/pdf" });
  if (e1) throw new Error(`Depto ${numero}: no se pudo subir el comprobante (${e1.message})`);

  const { error: e2 } = await sb.from("pagos").insert({
    compromiso_id: c.id,
    edificio_id: ed!.id,
    departamento_id: c.departamento_id,
    monto: Number(c.monto),
    metodo,
    operacion,
    comprobante_path: ruta,
    registrado_por: uid,
    estado: "en_revision",
  });
  if (e2) throw new Error(`Depto ${numero}: no se pudo registrar el pago (${e2.message})`);
  console.log(`• Depto ${numero}: pago de S/ ${monto} (${metodo}, operación ${operacion}) enviado a revisión.`);
}

async function main() {
  await vecino("302", "Yape", "20260923-0302");
  await vecino("101", "Transferencia BCP", "20260923-0101");
  console.log("\nListo. Revisa Cobranza → Por validar como titular o coadministrador.");
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
