import Link from "next/link";
import { redirect } from "next/navigation";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { obtenerContexto } from "@/lib/contexto";
import { mes } from "@/lib/format";
import { periodosDe } from "@/lib/periodos";
import { HojaLecturas } from "./HojaLecturas";

export default async function LecturasPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");

  const [{ periodos, actual: periodo }, { data: ed }] = await Promise.all([
    periodosDe(supabase, actual.edificio_id, p),
    supabase.from("edificios").select("agua_cuota, dia_lectura").eq("id", actual.edificio_id).single(),
  ]);
  const { data: hoja } = periodo ? await supabase.rpc("lecturas_del_periodo", { p_periodo: periodo.id }) : { data: [] };

  const dia = ed?.dia_lectura ?? 1;
  const fechaLectura = periodo ? `${periodo.mes.slice(0, 7)}-${String(dia).padStart(2, "0")}` : "";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h1>Lecturas de agua</h1>
          <p className="mt-1 text-muted">
            Escribe la lectura de cada medidor. Los m³ del mes son la lectura actual menos la anterior.
            {ed?.dia_lectura && ` El día de lectura es el ${ed.dia_lectura} de cada mes.`}
          </p>
        </div>
        {periodo && <SelectorPeriodo periodos={periodos} actual={periodo.id} />}
      </div>

      {ed?.agua_cuota !== "consumo" && (
        <p className="hint mb-4">
          En este edificio el agua no se cobra por consumo, así que las lecturas no cambian las cuotas. Puedes cambiarlo en{" "}
          <Link href="/configuracion#cobranza" className="font-semibold text-brand">
            Configuración
          </Link>
          .
        </p>
      )}

      {!periodo ? (
        <p className="hint">Todavía no hay periodos.</p>
      ) : !hoja?.length ? (
        <p className="hint">
          No hay medidores registrados. Regístralos en{" "}
          <Link href="/departamentos" className="font-semibold text-brand">
            Departamentos y ocupantes
          </Link>
          .
        </p>
      ) : (
        <HojaLecturas
          periodo={{ id: periodo.id, nombre: mes(periodo.mes), confirmado: !!periodo.gastos_confirmados_en }}
          filas={hoja.map((h) => ({
            medidor_id: h.medidor_id,
            numero: h.numero,
            numero_serie: h.numero_serie,
            anterior: Number(h.lectura_anterior),
            lectura: h.lectura === null ? null : Number(h.lectura),
            m3: h.m3 === null ? null : Number(h.m3),
          }))}
          fechaInicial={hoja.find((h) => h.fecha)?.fecha ?? fechaLectura}
          puede={actual.nivel === "titular" || actual.nivel === "operador"}
        />
      )}
    </>
  );
}
