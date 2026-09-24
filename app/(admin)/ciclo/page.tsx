import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { fecha, mes, soles } from "@/lib/format";
import { mesSiguiente, periodosDe } from "@/lib/periodos";
import { AbrirMes, BotonConfirmar } from "./AbrirMes";
import { CorteDesarrollo } from "./CorteDesarrollo";

type Paso = { titulo: string; detalle: React.ReactNode; hecho: boolean; opcional?: boolean; accion?: React.ReactNode };

export default async function CicloPage() {
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  const esTitular = actual.nivel === "titular";

  const { actual: periodo } = await periodosDe(supabase, actual.edificio_id);
  if (!periodo || periodo.estado !== "abierto") {
    return (
      <>
        <h1 className="mb-4">Ciclo mensual</h1>
        <p className="hint">No hay un mes abierto.</p>
      </>
    );
  }

  const [{ data: ed }, { data: gastos }, { data: recibo }, { data: lecturas }, { count: cuotas }, calculo, { data: corte }] =
    await Promise.all([
      supabase.from("edificios").select("agua_cuota, dia_corte, dia_lectura").eq("id", actual.edificio_id).single(),
      supabase.from("gastos").select("tipo, categoria, descripcion, monto, origen").eq("periodo_id", periodo.id),
      supabase.from("recibos_agua").select("monto").eq("periodo_id", periodo.id).maybeSingle(),
      supabase.rpc("lecturas_del_periodo", { p_periodo: periodo.id }),
      supabase
        .from("compromisos")
        .select("id", { count: "exact", head: true })
        .eq("edificio_id", actual.edificio_id)
        .eq("mes", periodo.mes)
        .in("tipo", ["cuota", "adelanto"]),
      supabase.rpc("calcular_cuotas", { p_periodo: periodo.id }),
      supabase.from("cortes").select("*").eq("periodo_id", periodo.id).maybeSingle(),
    ]);

  const lista = gastos ?? [];
  const recurrentes = lista.filter((g) => g.tipo === "recurrente" && g.origen === "manual");
  const extraordinarios = lista.filter((g) => g.tipo === "extraordinario");
  const suma = (xs: { monto: number }[]) => xs.reduce((s, g) => s + Number(g.monto), 0);
  const conAgua = ed?.agua_cuota === "consumo";
  const leidos = (lecturas ?? []).filter((l) => l.lectura !== null).length;
  const confirmado = !!periodo.gastos_confirmados_en;
  const nombre = mes(periodo.mes);
  const siguiente = mesSiguiente(periodo.mes);
  const nombreSiguiente = mes(siguiente);
  const diaCorte = ed?.dia_corte ?? 15;

  const pasos: Paso[] = [
    {
      titulo: "Cuotas del mes emitidas",
      detalle: cuotas
        ? `${cuotas} cuotas de ${nombre}, cada una registrada como cuenta por cobrar.`
        : "Aún no hay cuotas de este mes (se emiten al abrir el mes).",
      hecho: !!cuotas,
    },
    {
      titulo: "Gastos recurrentes",
      detalle: `${recurrentes.length} conceptos por ${soles(suma(recurrentes))}.`,
      hecho: recurrentes.length > 0,
      accion: <Link href="/gastos" className="btn quiet sm">Ver gastos</Link>,
    },
    {
      titulo: "Gastos extraordinarios",
      detalle: extraordinarios.length ? `${extraordinarios.length} registrados por ${soles(suma(extraordinarios))}.` : "Ninguno registrado.",
      hecho: extraordinarios.length > 0,
      opcional: true,
      accion: <Link href="/gastos" className="btn quiet sm">Agregar</Link>,
    },
    ...(conAgua
      ? [
          {
            titulo: "Lecturas de medidores",
            detalle: `${leidos} de ${(lecturas ?? []).length} medidores leídos${ed?.dia_lectura ? ` (día de lectura: ${ed.dia_lectura})` : ""}.`,
            hecho: (lecturas ?? []).length > 0 && leidos === (lecturas ?? []).length,
            accion: <Link href="/lecturas" className="btn quiet sm">Registrar</Link>,
          },
        ]
      : []),
    {
      titulo: "Recibo de agua",
      detalle: recibo ? `Registrado por ${soles(recibo.monto)}.` : "Sin registrar.",
      hecho: !!recibo,
      opcional: !conAgua,
      accion: <Link href="/calculo" className="btn quiet sm">Registrar</Link>,
    },
    {
      titulo: `Corte automático del día ${diaCorte}`,
      detalle: corte
        ? `Aplicado el ${fecha(corte.ejecutado_en)}: ${corte.departamentos.length} departamentos pasaron a deuda vencida.`
        : `Las cuotas no pagadas pasan a vencidas después del ${diaCorte} de ${nombre}. Se ejecuta solo cada día a las 00:10.`,
      hecho: !!corte,
    },
    {
      titulo: "Confirmar los gastos del mes",
      detalle: confirmado
        ? "Confirmados: los gastos, el agua y las lecturas quedan bloqueados y el estado de cuenta es oficial."
        : "Bloquea los gastos, el agua y las lecturas, y vuelve oficial el estado de cuenta.",
      hecho: confirmado,
      accion: !confirmado && esTitular ? <BotonConfirmar periodoId={periodo.id} nombre={nombre} /> : undefined,
    },
    {
      titulo: `Calcular las cuotas de ${nombreSiguiente}`,
      detalle: calculo.error ? calculo.error.message : `Total a cobrar: ${soles((calculo.data ?? []).reduce((s, f) => s + Number(f.total), 0))}.`,
      hecho: confirmado && !calculo.error,
      accion: <Link href="/calculo" className="btn quiet sm">Ver cálculo</Link>,
    },
  ];

  return (
    <>
      <div className="mb-5">
        <h1>Ciclo mensual</h1>
        <p className="mt-1 text-muted">
          Mes abierto: <span className="capitalize">{nombre}</span>. Cada paso alimenta el estado de cuenta oficial.
        </p>
      </div>

      <section className="panel">
        <h3 className="mb-3 capitalize">{nombre}</h3>
        <ol className="grid gap-2">
          {pasos.map((p, i) => (
            <li key={p.titulo} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  p.hecho ? "bg-ok text-white" : "border border-line bg-surface2 text-muted"
                }`}
                aria-hidden="true"
              >
                {p.hecho ? "✓" : i + 1}
              </span>
              <div className="min-w-[200px] flex-1">
                <b>{p.titulo}</b>
                {p.opcional && <span className="text-sm text-muted"> (opcional)</span>}
                <span className="sr-only">{p.hecho ? " · hecho" : " · pendiente"}</span>
                <p className="text-sm text-muted">{p.detalle}</p>
              </div>
              {p.accion}
            </li>
          ))}
        </ol>
      </section>

      <AbrirMes
        nombre={nombre}
        nombreSiguiente={nombreSiguiente}
        confirmado={confirmado}
        esTitular={esTitular}
        errorCalculo={calculo.error?.message ?? null}
        recurrentes={recurrentes.map((g) => ({ categoria: g.categoria, descripcion: g.descripcion, monto: Number(g.monto) }))}
        cuotas={(calculo.data ?? []).map((f) => ({ numero: f.numero, total: Number(f.total) }))}
      />

      {process.env.NODE_ENV === "development" && <CorteDesarrollo />}
    </>
  );
}
