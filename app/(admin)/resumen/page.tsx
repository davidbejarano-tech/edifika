import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { fecha, mes, soles } from "@/lib/format";
import { periodosDe } from "@/lib/periodos";
import { Fachada } from "./Fachada";

export default async function ResumenPage() {
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");

  const [{ data: deptos }, { actual: periodo }, { data: ed }] = await Promise.all([
    supabase.rpc("estado_departamentos", { p_edificio: actual.edificio_id }),
    periodosDe(supabase, actual.edificio_id),
    supabase.from("edificios").select("dia_corte").eq("id", actual.edificio_id).single(),
  ]);
  const [{ data: resumen }, { data: corte }] = periodo
    ? await Promise.all([
        supabase.rpc("resumen_periodo", { p_periodo: periodo.id }).maybeSingle(),
        supabase.from("cortes").select("ejecutado_en, departamentos").eq("periodo_id", periodo.id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const lista = (deptos ?? []).map((d) => ({ ...d, deuda: Number(d.deuda), vencido: Number(d.vencido) }));
  const porCobrar = lista.reduce((s, d) => s + d.deuda, 0);
  const vencido = lista.reduce((s, d) => s + d.vencido, 0);
  const alDia = lista.filter((d) => d.estado === "aldia").length;
  const porValidar = actual.pagos_por_validar ?? 0;
  const diaCorte = ed?.dia_corte ?? 15;
  const acumulado = Number(resumen?.acumulado ?? 0);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,440px)_1fr]">
      <div>
        {lista.length ? (
          <Fachada nombre={actual.nombre} deptos={lista} />
        ) : (
          <p className="hint">Todavía no hay departamentos.</p>
        )}
        <p className="mt-2 text-sm text-muted">Toca un departamento para ver su cuenta corriente.</p>
      </div>

      <div>
        <h1 className="capitalize">{periodo ? mes(periodo.mes) : "Resumen"}</h1>
        <p className="mt-2 text-muted">
          {corte
            ? `Corte del día ${diaCorte} aplicado el ${fecha(corte.ejecutado_en)}: ${corte.departamentos.length} departamentos pasaron a deuda vencida.`
            : periodo
              ? `El corte automático se aplica después del ${diaCorte} de ${mes(periodo.mes)}.`
              : ""}{" "}
          {lista.length > 0 && `${alDia} de ${lista.length} departamentos están al día.`}
        </p>

        <div className="my-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <Cifra titulo="Ingresos del mes" valor={soles(resumen?.ingresos ?? 0)} />
          <Cifra titulo="Gastos del mes" valor={soles(resumen?.gastos ?? 0)} />
          <Cifra titulo="Monto acumulado" valor={soles(acumulado)} clase={acumulado >= 0 ? "text-ok" : "text-bad"} />
          <Cifra titulo="Por cobrar" valor={soles(porCobrar)} nota={vencido > 0 ? `${soles(vencido)} vencido` : undefined} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/cobranza" className="btn">
            Validar pagos{porValidar > 0 && ` (${porValidar})`}
          </Link>
          <Link href="/calculo" className="btn quiet">
            Cálculo mensual
          </Link>
          <Link href="/estado-cuenta" className="btn quiet">
            Estado de cuenta
          </Link>
        </div>
        {periodo && !periodo.gastos_confirmados_en && (
          <p className="hint mt-4">
            Los gastos de <span className="capitalize">{mes(periodo.mes)}</span> aún no están confirmados: el estado de cuenta
            figura como borrador.
          </p>
        )}
      </div>
    </div>
  );
}

function Cifra({ titulo, valor, nota, clase = "" }: { titulo: string; valor: string; nota?: string; clase?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`font-display text-lg font-bold tabular-nums ${clase}`}>{valor}</p>
      {nota && <p className="text-xs font-semibold text-bad">{nota}</p>}
    </div>
  );
}
