"use server";

import { createClient } from "@supabase/supabase-js";
import { obtenerContexto } from "@/lib/contexto";

export type Resultado = { ok: boolean; mensaje: string | null };

// Cambio de contraseña: se verifica la actual con un cliente aparte (sin tocar la sesión) y luego se guarda la nueva
export async function cambiarClave(_: Resultado, f: FormData): Promise<Resultado> {
  const actual = String(f.get("actual") ?? "");
  const nueva = String(f.get("nueva") ?? "");
  const repite = String(f.get("repite") ?? "");
  if (nueva.length < 8) return { ok: false, mensaje: "La nueva contraseña debe tener al menos 8 caracteres." };
  if (nueva !== repite) return { ok: false, mensaje: "Las contraseñas nuevas no coinciden." };
  if (nueva === actual) return { ok: false, mensaje: "La nueva contraseña debe ser distinta de la actual." };

  const { supabase, user } = await obtenerContexto();
  if (!user?.email) return { ok: false, mensaje: "Tu sesión venció. Vuelve a ingresar." };

  const verificador = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: e1 } = await verificador.auth.signInWithPassword({ email: user.email, password: actual });
  if (e1) return { ok: false, mensaje: e1.status === 429 ? "Demasiados intentos. Espera unos minutos." : "La contraseña actual no es correcta." };
  await verificador.auth.signOut();

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) {
    return {
      ok: false,
      mensaje: error.code === "weak_password" ? "Esa contraseña es muy fácil de adivinar. Usa una más larga." : "No pudimos cambiar la contraseña. Inténtalo otra vez.",
    };
  }
  return { ok: true, mensaje: "Contraseña cambiada. Úsala la próxima vez que ingreses." };
}
