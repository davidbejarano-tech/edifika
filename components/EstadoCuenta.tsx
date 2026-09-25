import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import type { EdificioMio } from "@/lib/contexto";
import { cargarEstadoCuenta } from "@/lib/estado-cuenta";
import { mes, soles } from "@/lib/format";
import type { crearClienteServidor } from "@/lib/supabase/server";
import { BotonImprimir, Desglose } from "./ControlesEstadoCuenta";

type Props = {
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>;
  actual: EdificioMio;
  p?: string;
  d?: string; // desglose por departamento: "1" o "0"
  vecino?: boolean; // vista del vecino: el desglose aparece solo si el edificio lo publica (RN-15)
};

// Estado de cuenta del periodo (RN-14, RN-15, RN-24, RN-36), común a la administración y a los vecinos.
// Todos los montos vienen de la base; el PDF (lib/pdf/EstadoCuentaPdf.tsx) usa los mismos datos.
export async function EstadoCuenta({ supabase, actual, p, d, vecino = false }: Props) {
  const e = await cargarEstadoCuenta(supabase, actual, p, d, vecino);
  if (!e.periodo) {
    return (
      <>
        <h1 className="mb-4">Estado de cuenta</h1>
        <p className="hint">Todavía no hay periodos.</p>
      </>
    );
  }
  const urlPdf = `/pdf/estado-cuenta?p=${e.periodo.id}&d=${e.conDesglose ? 1 : 0}`;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3 print:hidden">
        <div className="min-w-[220px] flex-1">
          <h1>Estado de cuenta</h1>
          <p className="mt-1 text-muted">Ingresos, gastos y saldo del edificio en el mes.</p>
        </div>
        <SelectorPeriodo periodos={e.periodos} actual={e.periodo.id} />
        <a className="btn" href={`${urlPdf}&descargar=1`} download>
          Descargar PDF
        </a>
        <BotonImprimir />
      </div>

      <article className="panel relative mx-auto max-w-[820px] print:border-0 print:p-0">
        <span
          className={`absolute top-4 right-4 -rotate-6 rounded-md border-2 px-3 py-1 font-display text-sm font-extrabold tracking-widest uppercase ${
            e.oficial ? "border-ok text-ok" : "border-warn text-warn"
          }`}
        >
          {e.oficial ? "Oficial" : "Borrador"}
        </span>
        <header className="mb-4 border-b border-line pr-28 pb-3">
          <p className="text-sm text-muted">Estado de cuenta</p>
          <h2 className="text-2xl">{e.nombre}</h2>
          <p className="text-sm text-muted">{e.direccion}</p>
          <p className="mt-2 text-sm">
            Periodo: <b className="capitalize">{mes(e.periodo.mes)}</b> · Administrador titular: <b>{e.administrador ?? "—"}</b>
          </p>
          {!e.oficial && <p className="mt-1 text-xs text-muted">Borrador: los gastos del mes aún no están confirmados y pueden cambiar.</p>}
        </header>

        <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <Cifra titulo="Saldo anterior" valor={soles(e.saldoAnterior)} />
          <Cifra titulo="Ingresos del mes" valor={soles(e.ingresos)} clase="text-ok" />
          <Cifra titulo="Gastos del mes" valor={soles(e.gastos)} clase="text-bad" />
          <Cifra titulo="Monto acumulado" valor={soles(e.acumulado)} clase={e.acumulado >= 0 ? "" : "text-bad"} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h3 className="mb-2">Ingresos</h3>
            {e.filasIngresos.length ? (
              <Lista filas={e.filasIngresos} total={e.ingresos} />
            ) : (
              <p className="text-sm text-muted">Sin pagos validados en el mes.</p>
            )}
            <p className="mt-1 text-xs text-muted">Pagos validados con fecha de pago en el mes.</p>
          </section>
          <section>
            <h3 className="mb-2">Gastos</h3>
            {e.categorias.length ? <Lista filas={e.categorias} total={e.gastos} /> : <p className="text-sm text-muted">Sin gastos registrados.</p>}
          </section>
        </div>

        {e.custodia > 0 && (
          <p className="mt-4 rounded-lg bg-surface2 px-3 py-2 text-sm">
            <b>Garantías en custodia:</b> {soles(e.custodia)}. Es dinero de los vecinos por reservas de áreas comunes: no forma parte
            del saldo del edificio.
          </p>
        )}

        {e.puedeDesglose && (
          <Desglose activo={e.conDesglose}>
            <section className="mt-5">
              <h3 className="mb-2">Cuentas por cobrar por departamento</h3>
              {e.deudores.length ? (
                <Lista
                  filas={e.deudores.map((c) => [
                    `Depto ${c.numero}${Number(c.vencido) > 0 ? ` · vencido ${soles(c.vencido)}` : ""}`,
                    Number(c.pendiente),
                  ])}
                  total={e.deudores.reduce((s, c) => s + Number(c.pendiente), 0)}
                />
              ) : (
                <p className="text-sm text-muted">Todos los departamentos están al día.</p>
              )}
              <p className="mt-1 text-xs text-muted">
                Al {new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "long" }).format(new Date())}.
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
