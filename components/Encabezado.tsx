import Link from "next/link";
import { Marca } from "./Logo";
import { NOMBRE_NIVEL, type EdificioMio } from "@/lib/contexto";

type Props = {
  edificio: EdificioMio;
  vista: "admin" | "habitante";
  variosEdificios: boolean;
};

export function Encabezado({ edificio, vista, variosEdificios }: Props) {
  const ambos = !!edificio.nivel && !!edificio.departamento_id;
  const base = `/ir?e=${edificio.edificio_id}`;
  return (
    <header className="sticky top-0 z-20 print:hidden flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5 md:px-5">
      <Marca />
      <div className="text-sm text-muted md:border-l md:border-line md:pl-4">
        <b className="font-semibold text-ink">{edificio.nombre}</b>
        {" · "}
        {vista === "admin" && edificio.nivel
          ? NOMBRE_NIVEL[edificio.nivel]
          : `Depto ${edificio.departamento_numero ?? ""}`}
      </div>
      <div className="flex-1" />

      {/* Vecino administrador: selector "Mi departamento / Administración" */}
      {ambos && (
        <nav aria-label="Cambiar de vista" className="flex rounded-lg border border-line bg-surface2 p-0.5 text-sm">
          <Link
            href={`${base}&v=habitante`}
            aria-current={vista === "habitante" ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 font-semibold ${vista === "habitante" ? "bg-surface text-ink" : "text-muted"}`}
          >
            Mi departamento
          </Link>
          <Link
            href={`${base}&v=admin`}
            aria-current={vista === "admin" ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 font-semibold ${vista === "admin" ? "bg-surface text-ink" : "text-muted"}`}
          >
            Administración
          </Link>
        </nav>
      )}

      {(variosEdificios || vista === "admin") && (
        <Link href="/edificios" className="btn quiet sm">
          Mis edificios
        </Link>
      )}
      <form action="/salir" method="post">
        <button className="btn quiet sm">Salir</button>
      </form>
    </header>
  );
}
