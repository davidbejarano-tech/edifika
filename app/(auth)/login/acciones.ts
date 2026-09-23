"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { error: string | null; modo: "habitante" | "admin" };

export async function ingresar(_prev: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const modo = form.get("modo") === "admin" ? "admin" : "habitante";
  const password = String(form.get("password") ?? "");
  const supabase = await crearClienteServidor();

  if (modo === "admin") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!email || !password) return { modo, error: "Escribe tu correo y tu contraseña." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "email_not_confirmed")
        return { modo, error: "Tu correo aún no está verificado. Revisa el enlace que te enviamos." };
      return { modo, error: "Correo o contraseña incorrectos." };
    }
    redirect("/edificios?vista=admin");
  }

  const codigo = String(form.get("codigo") ?? "").trim().toLowerCase();
  const numero = String(form.get("numero") ?? "").trim();
  if (!codigo) return { modo, error: "Escribe el código del edificio." };
  if (!numero) return { modo, error: "Escribe el número de tu departamento." };
  if (!password) return { modo, error: "Escribe tu contraseña." };

  // La Edge Function busca la cuenta del departamento con la service role; el correo nunca llega al navegador.
  let respuesta: Response;
  try {
    respuesta = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-departamento`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      },
      body: JSON.stringify({ codigo, numero, password }),
      cache: "no-store",
    });
  } catch {
    return { modo, error: "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo otra vez." };
  }

  const cuerpo = (await respuesta.json().catch(() => ({}))) as {
    error?: string;
    access_token?: string;
    refresh_token?: string;
  };
  if (!respuesta.ok || !cuerpo.access_token || !cuerpo.refresh_token) {
    return { modo, error: cuerpo.error ?? "No pudimos iniciar sesión. Inténtalo otra vez en unos minutos." };
  }

  const { error } = await supabase.auth.setSession({
    access_token: cuerpo.access_token,
    refresh_token: cuerpo.refresh_token,
  });
  if (error) return { modo, error: "No pudimos iniciar sesión. Inténtalo otra vez." };

  redirect("/edificios?vista=habitante");
}
