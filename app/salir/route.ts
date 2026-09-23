import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EDIFICIO } from "@/lib/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  const respuesta = NextResponse.redirect(new URL("/login?m=salida", request.nextUrl.origin), 303);
  respuesta.cookies.delete(COOKIE_EDIFICIO);
  return respuesta;
}
