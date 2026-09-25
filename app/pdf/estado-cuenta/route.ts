import { NextResponse, type NextRequest } from "next/server";
import { obtenerContexto } from "@/lib/contexto";
import { cargarEstadoCuenta } from "@/lib/estado-cuenta";
import { pdfEstadoCuenta } from "@/lib/pdf/EstadoCuentaPdf";

// PDF del estado de cuenta: /pdf/estado-cuenta?p=<periodo>&d=1[&descargar=1]
// Lo ven todos los miembros del edificio; el desglose, según RN-15 (lo controla la base).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return new NextResponse("Elige un edificio", { status: 401 });
  const e = await cargarEstadoCuenta(supabase, actual, q.get("p") ?? undefined, q.get("d") ?? undefined, !actual.nivel);
  if (!e.periodo) return new NextResponse("Todavía no hay periodos", { status: 404 });
  const pdf = await pdfEstadoCuenta(e);
  const nombre = `Estado-de-cuenta-${e.periodo.mes.slice(0, 7)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${q.has("descargar") ? "attachment" : "inline"}; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
