import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/Logo";
import { NOMBRE_NIVEL, obtenerContexto, type EdificioMio } from "@/lib/contexto";

const ir = (e: EdificioMio, v: "admin" | "habitante") => `/ir?e=${e.edificio_id}&v=${v}`;

// Selector de edificio y de vista (RN-25). Si hay una sola opción, entra directo.
export default async function ElegirPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  const { user, edificios } = await obtenerContexto();
  if (!user) redirect("/login");

  if (edificios.length === 1) {
    const e = edificios[0];
    if (vista === "admin" && e.nivel) redirect(ir(e, "admin"));
    if (vista === "habitante" && e.departamento_id) redirect(ir(e, "habitante"));
    if (!e.nivel || !e.departamento_id) redirect(ir(e, e.nivel ? "admin" : "habitante"));
  }

  return (
    <main className="mx-auto max-w-[640px] p-6">
      <Marca />
      <h1 className="mt-6 mb-1">{edificios.length > 1 ? "Elige un edificio" : "¿A dónde quieres entrar?"}</h1>
      <p className="mb-5 text-muted">
        {edificios.length > 1
          ? "Tu cuenta tiene acceso a varios edificios."
          : "Tienes acceso como vecino y como parte de la administración."}
      </p>

      {edificios.length === 0 && (
        <div className="panel">
          <p>Tu cuenta no tiene acceso a ningún edificio activo.</p>
          <p className="mt-1 text-sm text-muted">
            Si eras ocupante, tu acceso pudo haberse desactivado. Consulta con la administración de tu edificio.
          </p>
        </div>
      )}

      {edificios.map((e) => (
        <div key={e.edificio_id} className="panel">
          <h3>{e.nombre}</h3>
          <p className="mb-3 text-sm text-muted">Código {e.codigo}</p>
          <div className="flex flex-wrap gap-2">
            {e.nivel && (
              <Link className="btn" href={ir(e, "admin")}>
                Administración · {NOMBRE_NIVEL[e.nivel]}
              </Link>
            )}
            {e.departamento_id && (
              <Link className="btn quiet" href={ir(e, "habitante")}>
                Mi departamento {e.departamento_numero}
              </Link>
            )}
          </div>
        </div>
      ))}

      <form action="/salir" method="post" className="mt-6">
        <button className="btn quiet">Cerrar sesión</button>
      </form>
    </main>
  );
}
