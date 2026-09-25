import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CampoClave } from "@/components/CampoClave";
import { VERSION_TERMINOS } from "@/lib/legal";

// Crear cuenta de administrador (SPEC sección 7). El correo se verifica antes de registrar el edificio.
async function crearCuenta(form: FormData) {
  "use server";
  const nombre = String(form.get("nombre") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const clave = String(form.get("clave") ?? "");
  const volver = (e: string) => redirect(`/registro?e=${e}&nombre=${encodeURIComponent(nombre)}`);

  if (nombre.length < 3) volver("nombre");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) volver("correo");
  if (clave.length < 8) volver("corta");
  if (form.get("acepto") !== "si") volver("terminos");

  const h = await headers();
  const origen = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signUp({
    email,
    password: clave,
    options: { data: { nombre, terminos_version: VERSION_TERMINOS }, emailRedirectTo: `${origen}/auth/callback?next=/edificios/nuevo` },
  });
  if (error) volver(error.status === 429 ? "limite" : error.code === "weak_password" ? "debil" : "error");

  // Si el correo ya tenía cuenta, Supabase no lo revela: mostramos el mismo mensaje.
  redirect(`/registro?enviado=${encodeURIComponent(email)}`);
}

const ERRORES: Record<string, string> = {
  nombre: "Escribe tu nombre completo.",
  correo: "Escribe un correo válido.",
  corta: "La contraseña debe tener al menos 8 caracteres.",
  terminos: "Para crear la cuenta, acepta los términos y la política de privacidad.",
  debil: "Esa contraseña es muy fácil de adivinar. Usa una más larga o combina letras y números.",
  limite: "Se enviaron demasiados correos en poco tiempo. Espera unos minutos e inténtalo otra vez.",
  error: "No pudimos crear la cuenta. Inténtalo otra vez en unos minutos.",
};

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; nombre?: string; enviado?: string }>;
}) {
  const { e, nombre, enviado } = await searchParams;

  if (enviado) {
    return (
      <>
        <h1 className="mt-3 mb-1">Revisa tu correo</h1>
        <p className="aviso mt-4" role="status">
          Te enviamos un enlace a <b>{enviado}</b> para verificar tu cuenta.
        </p>
        <p className="text-muted">
          Ábrelo desde este mismo navegador y continuarás con el registro de tu edificio. Si no lo ves en unos minutos, revisa la
          carpeta de spam.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="font-semibold text-brand">
            Ya verifiqué mi correo: ingresar
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-3 mb-1">Registra tu edificio</h1>
      <p className="mb-4 text-muted">Primero crea tu cuenta de administrador. Quedarás como administrador titular.</p>
      <form action={crearCuenta}>
        {e && ERRORES[e] && (
          <p className="err" role="alert">
            {ERRORES[e]}
          </p>
        )}
        <div className="field">
          <label htmlFor="rg-n">Nombre completo</label>
          <input id="rg-n" name="nombre" defaultValue={nombre} autoComplete="name" required minLength={3} />
        </div>
        <div className="field">
          <label htmlFor="rg-e">Correo</label>
          <input id="rg-e" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="rg-p">Contraseña (mínimo 8 caracteres)</label>
          <CampoClave id="rg-p" name="clave" minLength={8} autoComplete="new-password" required />
        </div>
        <label className="mb-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="acepto" value="si" required className="mt-1" />
          <span>
            Acepto los{" "}
            <Link href="/terminos" target="_blank" className="font-semibold text-brand">
              términos y condiciones
            </Link>{" "}
            y la{" "}
            <Link href="/privacidad" target="_blank" className="font-semibold text-brand">
              política de privacidad
            </Link>
            , incluida la eliminación de edificios sin plan pagado tras 90 días sin movimiento.
          </span>
        </label>
        <p className="mb-4 text-sm text-muted">Te enviaremos un correo para verificar tu cuenta antes de continuar.</p>
        <button className="btn w-full">Crear cuenta</button>
      </form>
      <p className="mt-4 text-center text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-brand">
          Ingresar
        </Link>
      </p>
    </>
  );
}
