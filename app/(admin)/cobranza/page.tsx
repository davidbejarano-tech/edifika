import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { periodosDe } from "@/lib/periodos";
import { CuentasPorCobrar, Emitidos, NuevoExtraordinario, PorValidar } from "./Cobranza";

const PESTANAS = [
  { t: "validar", texto: "Por validar" },
  { t: "cobrar", texto: "Cuentas por cobrar" },
  { t: "emitidos", texto: "Compromisos emitidos" },
];

export default async function CobranzaPage({ searchParams }: { searchParams: Promise<{ t?: string; d?: string }> }) {
  const { t = "validar", d } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  const esTitular = actual.nivel === "titular";

  const [{ data: pagos }, { data: cuentas }, { data: compromisos }, { actual: periodo }] = await Promise.all([
    supabase.rpc("pagos_por_validar", { p_edificio: actual.edificio_id }),
    supabase.rpc("cuentas_por_cobrar", { p_edificio: actual.edificio_id }),
    supabase.rpc("compromisos_admin", { p_edificio: actual.edificio_id }),
    periodosDe(supabase, actual.edificio_id),
  ]);
  const listaPagos = pagos ?? [];
  const puedo = listaPagos.filter((p) => p.puede_validar).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h1>Cobranza</h1>
          <p className="mt-1 text-muted">Pagos por validar, lo que debe cada departamento y los compromisos emitidos.</p>
        </div>
        {esTitular && periodo?.estado === "abierto" && (
          <NuevoExtraordinario
            departamentos={(cuentas ?? []).map((c) => ({ id: c.departamento_id, numero: c.numero }))}
            mesAbierto={periodo.mes}
          />
        )}
      </div>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Secciones de cobranza">
        {PESTANAS.map((p) => (
          <Link
            key={p.t}
            href={`/cobranza?t=${p.t}`}
            aria-current={t === p.t ? "page" : undefined}
            className={`border-b-[3px] px-3 py-2 font-semibold whitespace-nowrap ${
              t === p.t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {p.texto}
            {p.t === "validar" && puedo > 0 && (
              <span className="ml-1.5 rounded-full bg-bad px-1.5 text-xs font-bold text-white">{puedo}</span>
            )}
          </Link>
        ))}
      </nav>

      {t === "validar" && <PorValidar pagos={listaPagos} />}
      {t === "cobrar" && <CuentasPorCobrar cuentas={cuentas ?? []} />}
      {t === "emitidos" && <Emitidos compromisos={compromisos ?? []} esTitular={esTitular} filtroDepto={d ?? ""} />}
    </>
  );
}
