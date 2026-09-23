import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EDIFICIO, obtenerContexto } from "@/lib/contexto";

// Guarda el edificio elegido (RN-25) y lleva a la vista pedida: /ir?e=<edificio>&v=admin|habitante
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const { user, edificios } = await obtenerContexto();
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  const ed = edificios.find((e) => e.edificio_id === searchParams.get("e"));
  if (!ed) return NextResponse.redirect(new URL("/elegir", origin));

  const quiereAdmin = searchParams.get("v") === "admin";
  const destino = (quiereAdmin && ed.nivel) || !ed.departamento_id ? "/inicio" : "/cuentas";

  const respuesta = NextResponse.redirect(new URL(destino, origin));
  respuesta.cookies.set(COOKIE_EDIFICIO, ed.edificio_id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return respuesta;
}
