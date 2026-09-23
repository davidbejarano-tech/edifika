import { FormularioLogin } from "./FormularioLogin";

const AVISOS: Record<string, string> = {
  clave: "Tu contraseña se actualizó. Ingresa con la nueva.",
  salida: "Cerraste sesión.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return (
    <>
      <h1 className="mt-3 mb-1">Ingresa a tu edificio</h1>
      <p className="text-muted">Vecinos: código del edificio y número de departamento. Administración: tu correo.</p>
      {m === "enlace" && (
        <p className="err mt-4" role="alert">
          El enlace no es válido o ya venció. Pide uno nuevo desde “¿Olvidaste tu contraseña?”.
        </p>
      )}
      <FormularioLogin mensaje={m ? AVISOS[m] : undefined} />
    </>
  );
}
