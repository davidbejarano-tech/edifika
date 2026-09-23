import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

async function enviarEnlace(form: FormData) {
  "use server";
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const h = await headers();
    const origen = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    const supabase = await crearClienteServidor();
    // No revelamos si el correo existe: siempre mostramos el mismo mensaje.
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origen}/auth/callback?next=/nueva-clave` });
  }
  redirect("/recuperar?enviado=1");
}

export default async function RecuperarPage({ searchParams }: { searchParams: Promise<{ enviado?: string }> }) {
  const { enviado } = await searchParams;
  return (
    <>
      <h1 className="mt-3 mb-1">Recupera tu contraseña</h1>
      <p className="mb-4 text-muted">
        Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.
      </p>
      {enviado ? (
        <p className="aviso" role="status">
          Si el correo está registrado, en unos minutos recibirás el enlace. Revisa también la carpeta de spam.
        </p>
      ) : (
        <form action={enviarEnlace}>
          <div className="field">
            <label htmlFor="rc-e">Correo</label>
            <input id="rc-e" name="email" type="email" autoComplete="email" required />
          </div>
          <button className="btn w-full">Enviar enlace</button>
        </form>
      )}
      <p className="hint mt-4">
        ¿Eres vecino y no sabes qué correo tiene tu cuenta? Pide a la administración que restablezca tu contraseña.
      </p>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="font-semibold text-brand">
          Volver a ingresar
        </Link>
      </p>
    </>
  );
}
