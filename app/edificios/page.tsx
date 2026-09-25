import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/Logo";
import { NOMBRE_NIVEL, obtenerContexto, type EdificioMio } from "@/lib/contexto";
import { terminosAceptados } from "@/lib/legal";

const ir = (e: EdificioMio, v: "admin" | "habitante") => `/ir?e=${e.edificio_id}&v=${v}`;

// Mis edificios (SPEC sección 7, RN-25). Al llegar desde el login (?vista=...), si hay una sola
// opción entra directo; si no, muestra la lista con las cifras de cada edificio.
export default async function MisEdificiosPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  const { supabase, user, edificios } = await obtenerContexto();
  if (!user) redirect("/login");
  if (!(await terminosAceptados(supabase, user.id, user.user_metadata))) redirect("/aceptar-terminos");

  const administra = edificios.some((e) => e.nivel);
  const { data: esPlataforma } = await supabase.rpc("es_plataforma");
  // El equipo EDIFIKA sin edificios propios entra directo a la consola
  if (vista && esPlataforma === true && edificios.length === 0) redirect("/plataforma");
  if (vista && edificios.length === 1) {
    const e = edificios[0];
    if (vista === "admin" && e.nivel) redirect(ir(e, "admin"));
    if (vista === "habitante" && e.departamento_id) redirect(ir(e, "habitante"));
    if (!e.nivel || !e.departamento_id) redirect(ir(e, e.nivel ? "admin" : "habitante"));
  }
  // Cuenta recién verificada sin edificios: directo al asistente.
  if (vista && edificios.length === 0) redirect("/edificios/nuevo");

  return (
    <main className="mx-auto max-w-[760px] px-4 pt-6 pb-12 md:px-8">
      <div className="flex items-center gap-3">
        <Marca />
        <div className="flex-1" />
        <form action="/salir" method="post">
          <button className="btn quiet sm">Salir</button>
        </form>
      </div>

      {esPlataforma === true && (
        <Link href="/plataforma" className="panel mt-5 mb-0 flex items-center gap-3 hover:bg-surface2">
          <span className="chip info">Equipo EDIFIKA</span>
          <span className="flex-1 font-semibold">Consola de plataforma</span>
          <span className="text-brand">Abrir →</span>
        </Link>
      )}

      <div className="mt-6 mb-5 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1>Mis edificios</h1>
          <p className="mt-1 text-muted">
            {edificios.length === 0
              ? "Tu cuenta todavía no tiene edificios."
              : `Tienes acceso a ${edificios.length} ${edificios.length === 1 ? "edificio" : "edificios"}. Elige a dónde entrar.`}
          </p>
        </div>
        <Link href="/edificios/nuevo" className="btn">
          {administra ? "Registrar otro edificio" : "Registrar un edificio"}
        </Link>
      </div>

      {edificios.length === 0 && (
        <div className="panel">
          <p>Si administras un edificio, regístralo en unos minutos.</p>
          <p className="mt-1 text-sm text-muted">
            Si eras ocupante de un departamento, tu acceso pudo haberse desactivado. Consulta con la administración de tu
            edificio.
          </p>
        </div>
      )}

      {edificios.map((e) => (
        <article key={e.edificio_id} className="panel">
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex-1">
              <h3>{e.nombre}</h3>
              <p className="text-sm text-muted">Código {e.codigo}</p>
            </div>
            {e.nivel && <span className="chip activo">{NOMBRE_NIVEL[e.nivel]}</span>}
            {e.departamento_id && <span className="chip tag">Vecino · Depto {e.departamento_numero}</span>}
          </div>

          {e.nivel && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Dato titulo="Departamentos" valor={e.departamentos} />
              <Dato titulo="Con deuda vencida" valor={e.departamentos_morosos} alerta={!!e.departamentos_morosos} />
              <Dato titulo="Pagos por validar" valor={e.pagos_por_validar} alerta={!!e.pagos_por_validar} />
              <Dato titulo="Días sin movimiento" valor={e.dias_sin_movimiento} />
            </dl>
          )}

          {e.dias_para_eliminar !== null && (
            <p className="errlist mt-3" role="alert">
              {e.dias_para_eliminar === 0
                ? "Este edificio se eliminará hoy por inactividad."
                : `Este edificio se eliminará en ${e.dias_para_eliminar} ${e.dias_para_eliminar === 1 ? "día" : "días"} por inactividad.`}{" "}
              Cualquier movimiento (un gasto, un pago, un cambio en departamentos) reinicia el contador.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {e.nivel && (
              <Link className="btn" href={ir(e, "admin")}>
                Entrar a la administración
              </Link>
            )}
            {e.departamento_id && (
              <Link className="btn quiet" href={ir(e, "habitante")}>
                Mi departamento {e.departamento_numero}
              </Link>
            )}
          </div>
        </article>
      ))}
    </main>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: number | null; alerta?: boolean }) {
  return (
    <div className="rounded-lg bg-surface2 px-3 py-2">
      <dt className="text-xs text-muted">{titulo}</dt>
      <dd className={`text-lg font-bold tabular-nums ${alerta ? "text-bad" : ""}`}>{valor ?? "—"}</dd>
    </div>
  );
}
