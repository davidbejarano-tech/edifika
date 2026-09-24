import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import type { EdificioMio } from "@/lib/contexto";
import type { crearClienteServidor } from "@/lib/supabase/server";
import { mes, soles } from "@/lib/format";
import { periodosDe } from "@/lib/periodos";
import { BotonImprimir, Desglose } from "./ControlesEstadoCuenta";

const INGRESO: Record<string, string> = {
  cuota: "Cuotas de mantenimiento",
  mora: "Moras",
  extraordinario: "Compromisos extraordinarios",
  adelanto: "Adelantos",
  ajuste: "Ajustes",
  reserva: "Reservas de áreas comunes",
  garantia_retenida: "Garantías retenidas por daños",
};

type Props = {
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>;
  actual: EdificioMio;
  p?: string;
  vecino?: boolean; // vista del vecino: el desglose aparece solo si el edificio lo publica (RN-15)
};

// Estado de cuenta del periodo (RN-14, RN-15, RN-24, RN-36), común a la administración y a los vecinos.
// Todos los montos vienen de la base.
export async function EstadoCuenta({ supabase, actual, p, vecino = false }: Props) {
  const { periodos, actual: periodo } = await periodosDe(supabase, actual.edificio_id, p);
  if (!periodo) {
    return (
      <>
        <h1 className="mb-4">Estado de cuenta</h1>
        <p className="hint">Todavía no hay periodos.</p>
      </>
    );
  }

  const [{ data: r }, { data: ingresos }, { data: gastos }, { data: cuentas }, { data: garantias }, { data: ed }] =
    await Promise.all([
      supabase.rpc("resumen_periodo", { p_periodo: periodo.id }).maybeSingle(),
      supabase.rpc("ingresos_por_tipo", { p_periodo: periodo.id }),
      supabase.from("gastos").select("tipo, categoria, descripcion, monto").eq("periodo_id", periodo.id).order("fecha"),
      supabase.rpc("cuentas_por_cobrar", { p_edificio: actual.edificio_id }),
      supabase.rpc("garantias_en_custodia", { p_edificio: actual.edificio_id }).maybeSingle(),
      supabase.from("edificios").select("direccion, publicar_desglose").eq("id", actual.edificio_id).single(),
    ]);

  const oficial = !!r?.oficial;
  const categorias = Object.entries(
    (gastos ?? []).reduce<Record<string, number>>(
      (acc, g) => ({
        ...acc,
        [g.categoria]: (acc[g.categoria] ?? 0) + Number(g.monto),
      }),
      {},
    ),
  );
  const deudores = (cuentas ?? []).filter((c) => Number(c.pendiente) > 0);
  const custodia = Number(garantias?.en_custodia ?? 0) + Number(garantias?.por_devolver ?? 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3 print:hidden">
        <div className="min-w-[220px] flex-1">
          <h1>Estado de cuenta</h1>
          <p className="mt-1 text-muted">Ingresos, gastos y saldo del edificio en el mes.</p>
        </div>
        <SelectorPeriodo periodos={periodos} actual={periodo.id} />
        <BotonImprimir />
      </div>

      <article className="panel relative mx-auto max-w-[820px] print:border-0 print:p-0">
        <span
          className={`absolute top-4 right-4 -rotate-6 rounded-md border-2 px-3 py-1 font-display text-sm font-extrabold tracking-widest uppercase ${
            oficial ? "border-ok text-ok" : "border-warn text-warn"
          }`}
        >
          {oficial ? "Oficial" : "Borrador"}
        </span>
        <header className="mb-4 border-b border-line pb-3 pr-28">
          <p className="text-sm text-muted">Estado de cuenta</p>
          <h2 className="text-2xl">{actual.nombre}</h2>
          <p className="text-sm text-muted">{ed?.direccion}</p>
          <p className="mt-2 text-sm">
            Periodo: <b className="capitalize">{mes(periodo.mes)}</b> · Administrador titular: <b>{r?.administrador ?? "—"}</b>
          </p>
          {!oficial && (
            <p className="mt-1 text-xs text-muted">Borrador: los gastos del mes aún no están confirmados y pueden cambiar.</p>
          )}
        </header>

        <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <Cifra titulo="Saldo anterior" valor={soles(r?.saldo_anterior ?? 0)} />
          <Cifra titulo="Ingresos del mes" valor={soles(r?.ingresos ?? 0)} clase="text-ok" />
          <Cifra titulo="Gastos del mes" valor={soles(r?.gastos ?? 0)} clase="text-bad" />
          <Cifra
            titulo="Monto acumulado"
            valor={soles(r?.acumulado ?? 0)}
            clase={Number(r?.acumulado ?? 0) >= 0 ? "" : "text-bad"}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h3 className="mb-2">Ingresos</h3>
            {ingresos?.length ? (
              <Lista
                filas={ingresos.map((i) => [`${INGRESO[i.tipo] ?? i.tipo} (${i.pagos})`, Number(i.monto)])}
                total={Number(r?.ingresos ?? 0)}
              />
            ) : (
              <p className="text-sm text-muted">Sin pagos validados en el mes.</p>
            )}
            <p className="mt-1 text-xs text-muted">Pagos validados con fecha de pago en el mes.</p>
          </section>
          <section>
            <h3 className="mb-2">Gastos</h3>
            {categorias.length ? (
              <Lista filas={categorias} total={Number(r?.gastos ?? 0)} />
            ) : (
              <p className="text-sm text-muted">Sin gastos registrados.</p>
            )}
          </section>
        </div>

        {custodia > 0 && (
          <p className="mt-4 rounded-lg bg-surface2 px-3 py-2 text-sm">
            <b>Garantías en custodia:</b> {soles(custodia)}. Es dinero de los vecinos por reservas de áreas comunes: no forma
            parte del saldo del edificio.
          </p>
        )}

        {(!vecino || ed?.publicar_desglose) && (
          <Desglose inicial={!!ed?.publicar_desglose}>
            <section className="mt-5">
              <h3 className="mb-2">Cuentas por cobrar por departamento</h3>
              {deudores.length ? (
                <Lista
                  filas={deudores.map((c) => [
                    `Depto ${c.numero}${Number(c.vencido) > 0 ? ` · vencido ${soles(c.vencido)}` : ""}`,
                    Number(c.pendiente),
                  ])}
                  total={deudores.reduce((s, c) => s + Number(c.pendiente), 0)}
                />
              ) : (
                <p className="text-sm text-muted">Todos los departamentos están al día.</p>
              )}
              <p className="mt-1 text-xs text-muted">
                Al{" "}
                {new Intl.DateTimeFormat("es-PE", {
                  timeZone: "America/Lima",
                  dateStyle: "long",
                }).format(new Date())}
                .
              </p>
            </section>
          </Desglose>
        )}
      </article>
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

function Lista({ filas, total }: { filas: [string, number][]; total: number }) {
  return (
    <div className="tbl">
      <table>
        <tbody>
          {filas.map(([t, m]) => (
            <tr key={t}>
              <td>{t}</td>
              <td className="r">{soles(m)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td>Total</td>
            <td className="r">{soles(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
