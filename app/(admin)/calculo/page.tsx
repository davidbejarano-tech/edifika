import Link from "next/link";
import { redirect } from "next/navigation";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { TablaReparto } from "@/components/TablaReparto";
import { obtenerContexto } from "@/lib/contexto";
import { mes, soles } from "@/lib/format";
import { mesSiguiente, periodosDe } from "@/lib/periodos";
import { ReciboAgua } from "./ReciboAgua";

const BASES: Record<string, string> = {
  fijo_area: "Monto fijo por área",
  fijo_igual: "Monto fijo igual para todos",
  gastos: "Gastos reales del mes por área",
};

export default async function CalculoPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");

  const [{ periodos, actual: periodo }, { data: ed }] = await Promise.all([
    periodosDe(supabase, actual.edificio_id, p),
    supabase
      .from("edificios")
      .select("base_cuota, agua_cuota, monto_fijo_mensual, area_comun_m2")
      .eq("id", actual.edificio_id)
      .single(),
  ]);
  if (!periodo || !ed) {
    return (
      <>
        <h1 className="mb-4">Cálculo mensual</h1>
        <p className="hint">Todavía no hay periodos.</p>
      </>
    );
  }

  const [{ data: recibo }, calculo, { data: gastos }] = await Promise.all([
    supabase.from("recibos_agua").select("monto, consumo_m3").eq("periodo_id", periodo.id).maybeSingle(),
    supabase.rpc("calcular_cuotas", { p_periodo: periodo.id }),
    supabase.from("gastos").select("monto, origen").eq("periodo_id", periodo.id),
  ]);

  const filas = calculo.data ?? [];
  const conAgua = ed.agua_cuota === "consumo";
  const sumaM3 = filas.reduce((s, f) => s + Number(f.m3), 0);
  const totalGastos = (gastos ?? []).reduce((s, g) => s + Number(g.monto), 0);
  const confirmado = !!periodo.gastos_confirmados_en;
  const siguiente = mes(mesSiguiente(periodo.mes));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h1>Cálculo mensual</h1>
          <p className="mt-1 text-muted">
            Con los datos de <span className="capitalize">{mes(periodo.mes)}</span> se calculan las cuotas de {siguiente}.
          </p>
        </div>
        <SelectorPeriodo periodos={periodos} actual={periodo.id} etiqueta="Datos de" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Gastos del mes" valor={soles(totalGastos)} />
        <Cifra
          titulo="Base de la cuota"
          valor={ed.base_cuota ? BASES[ed.base_cuota] : "Sin configurar"}
          detalle={
            ed.base_cuota === "fijo_area"
              ? `${soles(ed.monto_fijo_mensual)} al mes`
              : ed.base_cuota === "fijo_igual"
                ? `${soles(ed.monto_fijo_mensual)} por departamento`
                : undefined
          }
        />
        <Cifra
          titulo="Agua"
          valor={ed.agua_cuota === "consumo" ? "Por consumo" : ed.agua_cuota === "incluida" ? "Incluida en la cuota" : "Sin configurar"}
          detalle={conAgua ? `${sumaM3.toLocaleString("en-US")} m³ leídos` : undefined}
        />
      </div>

      <ReciboAgua
        periodo={{ id: periodo.id, nombre: mes(periodo.mes), confirmado }}
        recibo={recibo ? { monto: Number(recibo.monto), consumo: Number(recibo.consumo_m3) } : null}
        sumaLecturas={sumaM3}
        conAgua={conAgua}
        puede={actual.nivel === "titular" || actual.nivel === "operador"}
      />

      <section className="panel">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex-1">Cuotas de {siguiente}</h3>
          <span className={`chip ${confirmado ? "activo" : "warn"}`}>{confirmado ? "Gastos confirmados" : "Gastos sin confirmar"}</span>
        </div>
        {calculo.error ? (
          <p className="hint">
            {calculo.error.message}.{" "}
            <Link href="/configuracion#cobranza" className="font-semibold text-brand">
              Ir a Configuración
            </Link>
          </p>
        ) : (
          <>
            <TablaReparto filas={filas} areaComun={Number(ed.area_comun_m2 ?? 0)} conAgua={conAgua} />
            {periodo.estado === "abierto" && (
              <p className="mt-3 text-sm text-muted">
                Las cuotas se emiten al abrir {siguiente} en{" "}
                <Link href="/ciclo" className="font-semibold text-brand">
                  Ciclo mensual
                </Link>
                .
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="font-display text-lg font-bold">{valor}</p>
      {detalle && <p className="text-sm text-muted">{detalle}</p>}
    </div>
  );
}
