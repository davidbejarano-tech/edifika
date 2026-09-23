import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas accesibles sin sesión (además de la bienvenida en "/")
const PUBLICAS = ["/login", "/registro", "/recuperar", "/auth/"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Refresca la sesión; no poner código entre createServerClient y getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = ruta === "/" || PUBLICAS.some((p) => ruta.startsWith(p));

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Con sesión, la bienvenida, el login y el registro llevan directo al edificio.
  if (user && (ruta === "/" || ruta === "/login" || ruta === "/registro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/edificios";
    url.search = "?vista=auto";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
