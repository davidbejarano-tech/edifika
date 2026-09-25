import { NextResponse, type NextRequest } from "next/server";
import { obtenerContexto } from "@/lib/contexto";
import { pdfRecibo } from "@/lib/pdf/ReciboPdf";
import { nombreArchivoRecibo } from "@/lib/recibo";
import { cargarRecibo } from "@/lib/recibos-servidor";

// PDF del recibo al momento: /pdf/recibo?d=<departamento>&m=2026-09[&descargar=1]
// Lo abre la administración o el vecino del propio departamento (lo valida datos_recibo).
export async function GET(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("d") ?? "";
  const m = req.nextUrl.searchParams.get("m") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(d) || !/^\d{4}-\d{2}/.test(m)) return new NextResponse("Recibo no encontrado", { status: 404 });
  const { supabase, user } = await obtenerContexto();
  if (!user) return new NextResponse("Inicia sesión", { status: 401 });
  try {
    const datos = await cargarRecibo(supabase, d, m);
    const pdf = await pdfRecibo(datos);
    const modo = req.nextUrl.searchParams.has("descargar") ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${modo}; filename="${nombreArchivoRecibo(datos)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "No se pudo generar el recibo", { status: 403 });
  }
}
