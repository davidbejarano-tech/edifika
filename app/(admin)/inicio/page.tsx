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

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const { nuevo } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  const nivel = actual.nivel;

  const { data: conf } = await supabase.rpc("estado_configuracion", { p_edificio: actual.edificio_id }).single();
  const pasos = conf ? pasosDeConfiguracion(conf) : [];
  const hechos = pasos.filter((p) => p.ok).length;

  return (
    <>
      <div className="mb-5">
        <h1>Inicio</h1>
        <p className="mt-1 text-muted">
          {actual.nombre} · entraste como <b className="text-ink">{NOMBRE_NIVEL[nivel]}</b>.
        </p>
      </div>

      {nuevo && (
        <div className="aviso" role="status">
          <b>¡Edificio registrado!</b> Código de acceso para los vecinos: <b>{actual.codigo}</b>. Se cargaron{" "}
          {actual.departamentos} {actual.departamentos === 1 ? "departamento" : "departamentos"}.
        </div>
      )}

      {pasos.length > 0 && hechos < pasos.length && (
        <section className="panel">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex-1">Termina de configurar tu edificio</h3>
            <span className="text-sm text-muted">
              {hechos} de {pasos.length} pasos
            </span>
          </div>
          <div className="my-2 h-2 overflow-hidden rounded bg-surface2" aria-hidden="true">
            <div className="h-full bg-ok" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
          </div>
          <ul className="mt-3 grid gap-2">
            {pasos.map((p) => (
              <li key={p.titulo} className="flex items-start gap-2">
                <span className={`chip ${p.ok ? "activo" : "warn"}`}>{p.ok ? "Listo" : "Pendiente"}</span>
                <span>
                  <b>{p.titulo}</b>
                  <span className="block text-sm text-muted">{p.detalle}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">La pantalla de Configuración llega en la siguiente entrega (Etapa 2b).</p>
        </section>
      )}

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

type EstadoConfiguracion = {
  departamentos: number;
  total_declarado: number;
  con_area: number;
  con_medidor: number;
  base_cuota: string | null;
  agua_cuota: string | null;
  monto_fijo: number | null;
  dia_lectura: number | null;
};

const BASES: Record<string, string> = {
  fijo_area: "monto fijo por área",
  fijo_igual: "monto fijo igual para todos",
  gastos: "gastos reales del mes por área",
};

// Onboarding (SPEC sección 7): lo que falta para poder calcular cuotas (RN-02, RN-03, RN-38).
function pasosDeConfiguracion(c: EstadoConfiguracion) {
  const conFijo = c.base_cuota === "fijo_area" || c.base_cuota === "fijo_igual";
  const porConsumo = c.agua_cuota === "consumo";
  const pideArea = c.base_cuota !== "fijo_igual";
  const configurada = !!c.base_cuota && !!c.agua_cuota;

  const pasos = [
    {
      titulo: "Departamentos",
      ok: c.departamentos > 0 && c.departamentos >= c.total_declarado,
      detalle: `${c.departamentos} de ${c.total_declarado} registrados.`,
    },
    {
      titulo: "Configurar la cobranza",
      ok: configurada && (!conFijo || c.monto_fijo !== null),
      detalle: !configurada
        ? "Elige la base de la cuota (monto fijo por área, igual para todos o gastos reales) y si el agua se cobra por consumo o va incluida."
        : conFijo && c.monto_fijo === null
          ? `Base: ${BASES[c.base_cuota!]}. Falta definir el monto fijo mensual.`
          : `Base: ${BASES[c.base_cuota!]} · agua ${porConsumo ? "por consumo" : "incluida"}.`,
    },
  ];
  if (pideArea) {
    pasos.push({
      titulo: "Áreas",
      ok: c.departamentos > 0 && c.con_area === c.departamentos,
      detalle: `${c.con_area} de ${c.departamentos} departamentos con área.`,
    });
  }
  if (porConsumo) {
    pasos.push({
      titulo: "Medidores de agua",
      ok: c.departamentos > 0 && c.con_medidor === c.departamentos && c.dia_lectura !== null,
      detalle: `${c.con_medidor} de ${c.departamentos} departamentos con medidor${c.dia_lectura ? ` · lectura el día ${c.dia_lectura}` : " · falta el día de lectura"}.`,
    });
  }
  return pasos;
}
