import { redirect } from "next/navigation";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { obtenerContexto } from "@/lib/contexto";
import { periodosDe } from "@/lib/periodos";
import { TablaRecibos } from "./TablaRecibos";

// Recibos del mes: total, estado y envío por departamento (SPEC · Cálculo y recibos)
export default async function RecibosPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  const { periodos, actual: periodo } = await periodosDe(supabase, actual.edificio_id, p);
  const { data: recibos } = periodo
    ? await supabase.rpc("recibos_del_mes", { p_edificio: actual.edificio_id, p_mes: periodo.mes })
    : { data: [] };
  const administra = actual.nivel === "titular" || actual.nivel === "operador";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h1>Recibos</h1>
          <p className="mt-1 text-muted">Recibo formal de cada departamento en PDF, para enviar por correo o WhatsApp.</p>
        </div>
        {periodo && <SelectorPeriodo periodos={periodos} actual={periodo.id} etiqueta="Recibos de" />}
      </div>
      {!periodo ? (
        <p className="hint">Los recibos aparecen cuando abras el primer mes con cuotas.</p>
      ) : (
        <TablaRecibos mesIso={periodo.mes} recibos={recibos ?? []} administra={administra} />
      )}
    </>
  );
}
