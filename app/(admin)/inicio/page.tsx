import { redirect } from "next/navigation";
import { NOMBRE_NIVEL, obtenerContexto, type NivelAdmin } from "@/lib/contexto";

type Accion = { texto: string; quien: "titular" | "equipo" };

// Matriz de permisos (SPEC sección 2). Las pantallas llegan en las etapas siguientes.
const ACCIONES: Accion[] = [
  { texto: "Registrar gastos, agua y lecturas", quien: "equipo" },
  { texto: "Validar pagos y registrar efectivo", quien: "equipo" },
  { texto: "Generar y enviar recibos", quien: "equipo" },
  { texto: "Confirmar gastos y abrir el mes", quien: "titular" },
  { texto: "Emitir extraordinarios y anular compromisos", quien: "titular" },
  { texto: "Configuración del edificio y departamentos", quien: "titular" },
  { texto: "Crear o modificar usuarios y ocupantes", quien: "titular" },
  { texto: "Equipo de administración y transferencia", quien: "titular" },
  { texto: "Activar pruebas de módulos y solicitar planes", quien: "titular" },
];

const puede = (nivel: NivelAdmin, a: Accion) =>
  nivel === "titular" || (nivel === "operador" && a.quien === "equipo");

export default async function InicioPage() {
  const { actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/elegir");
  const nivel = actual.nivel;

  return (
    <>
      <div className="mb-5">
        <h1>Inicio</h1>
        <p className="mt-1 text-muted">
          {actual.nombre} · entraste como <b className="text-ink">{NOMBRE_NIVEL[nivel]}</b>.
        </p>
      </div>

      {nivel === "lectura" && (
        <p className="hint mb-4">
          Entregaste la titularidad. Durante 15 días puedes ver la información del edificio, pero no hacer cambios.
        </p>
      )}

      <section className="panel">
        <h3 className="mb-3">Lo que puedes hacer</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ACCIONES.map((a) => {
            const si = puede(nivel, a);
            return (
              <li key={a.texto}>
                <button
                  type="button"
                  className={`btn w-full justify-start whitespace-normal text-left ${si ? "ghost" : "quiet"}`}
                  disabled={!si}
                  title={si ? "Disponible en las próximas etapas" : "Solo el administrador titular puede hacerlo"}
                >
                  {a.texto}
                </button>
                {!si && (
                  <p className="mt-1 text-xs text-muted">
                    {nivel === "lectura" ? "Solo lectura." : "Solo el administrador titular."}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="hint">Las pantallas de gestión se construyen en las siguientes etapas.</p>
    </>
  );
}
