import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

async function guardarClave(form: FormData) {
  "use server";
  const clave = String(form.get("clave") ?? "");
  const repite = String(form.get("repite") ?? "");
  if (clave.length < 8) redirect("/nueva-clave?e=corta");
  if (clave !== repite) redirect("/nueva-clave?e=distintas");

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) redirect(`/nueva-clave?e=${error.code === "same_password" ? "igual" : "error"}`);

  await supabase.auth.signOut();
  redirect("/login?m=clave");
}

const ERRORES: Record<string, string> = {
  corta: "La contraseña debe tener al menos 8 caracteres.",
  distintas: "Las contraseñas no coinciden.",
  igual: "La nueva contraseña debe ser distinta de la anterior.",
  error: "No pudimos guardar la contraseña. Pide un enlace nuevo e inténtalo otra vez.",
};

export default async function NuevaClavePage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <>
      <h1 className="mt-3 mb-1">Crea tu contraseña</h1>
      <p className="mb-4 text-muted">Usa al menos 8 caracteres.</p>
      <form action={guardarClave}>
        {e && ERRORES[e] && (
          <p className="err" role="alert">
            {ERRORES[e]}
          </p>
        )}
        <div className="field">
          <label htmlFor="nc-1">Nueva contraseña</label>
          <input id="nc-1" name="clave" type="password" minLength={8} autoComplete="new-password" required />
        </div>
        <div className="field">
          <label htmlFor="nc-2">Repite la contraseña</label>
          <input id="nc-2" name="repite" type="password" minLength={8} autoComplete="new-password" required />
        </div>
        <button className="btn w-full">Guardar contraseña</button>
      </form>
    </>
  );
}
