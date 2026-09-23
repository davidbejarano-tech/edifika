import { redirect } from "next/navigation";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { obtenerContexto } from "@/lib/contexto";
import { mes } from "@/lib/format";
import { periodosDe } from "@/lib/periodos";
import { Gastos } from "./Gastos";

export default async function GastosPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  const { periodos, actual: periodo } = await periodosDe(supabase, actual.edificio_id, p);

  const [{ data: gastos }, { data: categorias }] = periodo
    ? await Promise.all([
        supabase
          .from("gastos")
          .select("id, tipo, categoria, descripcion, monto, fecha, origen")
          .eq("periodo_id", periodo.id)
          .order("fecha"),
        supabase.from("gastos").select("categoria").eq("edificio_id", actual.edificio_id).eq("origen", "manual").limit(500),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h1>Gastos</h1>
          <p className="mt-1 text-muted">Pagos recurrentes y extraordinarios del edificio.</p>
        </div>
        {periodo && <SelectorPeriodo periodos={periodos} actual={periodo.id} />}
      </div>
      {!periodo ? (
        <p className="hint">Todavía no hay periodos.</p>
      ) : (
        <Gastos
          periodo={{ id: periodo.id, nombre: mes(periodo.mes), mes: periodo.mes, confirmado: !!periodo.gastos_confirmados_en }}
          gastos={(gastos ?? []).map((g) => ({ ...g, monto: Number(g.monto) }))}
          categorias={[...new Set((categorias ?? []).map((c) => c.categoria))].sort()}
          puedeRegistrar={actual.nivel === "titular" || actual.nivel === "operador"}
          esTitular={actual.nivel === "titular"}
        />
      )}
    </>
  );
}
