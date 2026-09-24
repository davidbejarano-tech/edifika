import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import type { EdificioMio } from "@/lib/contexto";
import { mes, mesCorto, soles } from "@/lib/format";
import { periodosDe } from "@/lib/periodos";
import type { crearClienteServidor } from "@/lib/supabase/server";

type Props = { supabase: Awaited<ReturnType<typeof crearClienteServidor>>; actual: EdificioMio; p?: string };

// Reportes: cómo se usa el dinero del edificio (RN-15). Los totales vienen de la base
// (resumen_periodo, reporte_meses y cobranza_edificio); aquí solo se dibujan.
export async function Reportes({ supabase, actual, p }: Props) {
  const { periodos, actual: periodo } = await periodosDe(supabase, actual.edificio_id, p);
  if (!periodo) {
    return (
      <>
        <h1 className="mb-4">Reportes</h1>
        <p className="hint">Todavía no hay periodos.</p>
      </>
    );
  }

  const [{ data: r }, { data: gastos }, { data: meses }, { data: cobranza }] = await Promise.all([
    supabase.rpc("resumen_periodo", { p_periodo: periodo.id }).maybeSingle(),
    supabase.from("gastos").select("categoria, monto").eq("periodo_id", periodo.id),
    supabase.rpc("reporte_meses", { p_edificio: actual.edificio_id, p_meses: 6 }),
    supabase.rpc("cobranza_edificio", { p_edificio: actual.edificio_id }).maybeSingle(),
  ]);

  const categorias = Object.entries(
    (gastos ?? []).reduce<Record<string, number>>((acc, g) => ({ ...acc, [g.categoria]: (acc[g.categoria] ?? 0) + Number(g.monto) }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...categorias.map(([, m]) => m));
  const serie = (meses ?? []).map((m) => ({ ...m, ingresos: Number(m.ingresos), gastos: Number(m.gastos) }));
  const maxMes = Math.max(1, ...serie.flatMap((m) => [m.ingresos, m.gastos]));
  const acumulado = Number(r?.acumulado ?? 0);
  const nombreMes = mes(periodo.mes).split(" ")[0];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h1>Reportes</h1>
          <p className="mt-1 text-muted">Cómo se usa el dinero del edificio.</p>
        </div>
        <SelectorPeriodo periodos={periodos} actual={periodo.id} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        <Cifra titulo={`Ingresos de ${nombreMes}`} valor={soles(r?.ingresos ?? 0)} />
        <Cifra titulo={`Gastos de ${nombreMes}`} valor={soles(r?.gastos ?? 0)} />
        <Cifra titulo="Monto acumulado" valor={soles(acumulado)} clase={acumulado >= 0 ? "text-ok" : "text-bad"} />
        <Cifra
          titulo="Departamentos sin deuda vencida"
          valor={cobranza ? `${cobranza.sin_vencido} de ${cobranza.departamentos}` : "—"}
        />
      </div>

      <section className="panel">
        <h3 className="mb-3">Gastos por categoría, {mes(periodo.mes)}</h3>
        {categorias.length ? (
          <ul className="grid gap-2.5">
            {categorias.map(([c, m]) => (
              <li key={c} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate" title={c}>
                  {c}
                </span>
                <span className="h-3 overflow-hidden rounded-full bg-surface2" aria-hidden="true">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(m / maxCat) * 100}%` }} />
                </span>
                <span className="tabular-nums">{soles(m)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Sin gastos registrados.</p>
        )}
      </section>

      <section className="panel">
        <h3 className="mb-1">Ingresos y gastos por mes</h3>
        <p className="mb-3 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm bg-brand" /> Ingresos
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm bg-brass" /> Gastos
          </span>
        </p>
        <div className="flex h-48 items-end gap-2 border-b border-line sm:gap-4" role="img" aria-label="Gráfico de ingresos y gastos por mes">
          {serie.map((m) => (
            <div key={m.periodo_id} className="flex h-full flex-1 items-end justify-center gap-1">
              <span
                className="w-full max-w-7 rounded-t bg-brand"
                style={{ height: `${(m.ingresos / maxMes) * 100}%` }}
                title={`Ingresos de ${mes(m.mes)}: ${soles(m.ingresos)}`}
              />
              <span
                className="w-full max-w-7 rounded-t bg-brass"
                style={{ height: `${(m.gastos / maxMes) * 100}%` }}
                title={`Gastos de ${mes(m.mes)}: ${soles(m.gastos)}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2 sm:gap-4">
          {serie.map((m) => (
            <span key={m.periodo_id} className="flex-1 text-center text-xs text-muted capitalize">
              {mesCorto(m.mes)}
            </span>
          ))}
        </div>

        <div className="tbl mt-4">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th className="r">Ingresos</th>
                <th className="r">Gastos</th>
                <th className="r">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {[...serie].reverse().map((m) => (
                <tr key={m.periodo_id}>
                  <td className="capitalize">
                    {mes(m.mes)}
                    {!m.oficial && <span className="chip warn ml-2">Borrador</span>}
                  </td>
                  <td className="r">{soles(m.ingresos)}</td>
                  <td className="r">{soles(m.gastos)}</td>
                  <td className={`r ${Number(m.acumulado) < 0 ? "text-bad" : ""}`}>{soles(m.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {cobranza && Number(cobranza.por_cobrar) > 0 && (
        <p className="hint">
          Por cobrar en el edificio: <b>{soles(cobranza.por_cobrar)}</b>
          {Number(cobranza.vencido) > 0 && (
            <>
              , de los cuales <b>{soles(cobranza.vencido)}</b> están vencidos
            </>
          )}
          .
        </p>
      )}
    </>
  );
}

function Cifra({ titulo, valor, clase = "" }: { titulo: string; valor: string; clase?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`font-display text-lg font-bold tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
}
