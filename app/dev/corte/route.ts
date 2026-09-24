import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { obtenerContexto } from "@/lib/contexto";

// Solo en desarrollo (npm run dev): ejecuta el corte diario sin esperar a las 00:10 (ETAPAS, Etapa 3).
// ejecutar_cortes() no se puede llamar desde el navegador; aquí se usa la clave secreta del .env.local,
// que nunca llega al cliente. En producción esta ruta responde 404 y el corte lo hace pg_cron.
export async function POST() {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });

  const { actual } = await obtenerContexto();
  if (!actual?.nivel) return NextResponse.json({ error: "Solo la administración." }, { status: 403 });
  const secreta = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secreta) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local." }, { status: 500 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secreta, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("ejecutar_cortes");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    mensaje: data ? `Corte ejecutado en ${data} ${data === 1 ? "periodo" : "periodos"}.` : "No había cortes pendientes para hoy.",
  });
}
