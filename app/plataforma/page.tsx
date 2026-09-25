import Link from "next/link";
import { fecha } from "@/lib/format";
import { crearClienteServidor } from "@/lib/supabase/server";

// Resumen de la plataforma: cuántos edificios hay, cuántos pagan y qué requiere atención
export default async function PlataformaResumenPage() {
  const supabase = await crearClienteServidor();
  const [{ data: edificios }, { data: solicitudes }] = await Promise.all([
    supabase.rpc("plataforma_edificios"),
    supabase.rpc("plataforma_solicitudes"),
  ]);
  const lista = edificios ?? [];
  const pendientes = (solicitudes ?? []).filter((s) => s.estado === "pendiente");
  const enRiesgo = lista.filter((e) => !e.pagado && e.dias_sin_movimiento >= 60);
  const porPlan = (id: string) => lista.filter((e) => e.pagado && e.plan === id).length;

  return (
    <>
      <h1 className="mb-1">Resumen</h1>
      <p className="mb-5 text-muted">Estado de todos los edificios de EDIFIKA.</p>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        <Cifra titulo="Edificios" valor={lista.length} detalle={`${lista.reduce((s, e) => s + e.departamentos, 0)} departamentos`} />
        <Cifra titulo="Con plan pagado" valor={lista.filter((e) => e.pagado).length} detalle={`Básico ${porPlan("basico")} · Pro ${porPlan("pro")} · Premium ${porPlan("premium")}`} />
        <Cifra titulo="Solicitudes pendientes" valor={pendientes.length} alerta={pendientes.length > 0} href="/plataforma/solicitudes" />
        <Cifra titulo="En riesgo de depuración" valor={enRiesgo.length} detalle="60 días o más sin movimiento" alerta={enRiesgo.length > 0} href="/plataforma/depuracion" />
      </div>

      <section className="panel">
        <h3 className="mb-2">Edificios más recientes</h3>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Edificio</th>
                <th>Titular</th>
                <th className="r">Deptos</th>
                <th>Plan</th>
                <th>Registrado</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 8).map((e) => (
                <tr key={e.edificio_id}>
                  <td>
                    <b>{e.nombre}</b>
                    <span className="block text-xs text-muted">{e.codigo}</span>
                  </td>
                  <td>{e.titular ?? "—"}</td>
                  <td className="r">{e.departamentos}</td>
                  <td>{e.pagado ? <span className="chip activo">{e.plan}</span> : <span className="chip tag">Sin plan</span>}</td>
                  <td>{fecha(e.creado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link href="/plataforma/edificios" className="btn quiet mt-3">
          Ver todos los edificios
        </Link>
      </section>
    </>
  );
}

function Cifra({ titulo, valor, detalle, alerta, href }: { titulo: string; valor: number; detalle?: string; alerta?: boolean; href?: string }) {
  const c = (
    <>
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${alerta ? "text-bad" : ""}`}>{valor}</p>
      {detalle && <p className="text-xs text-muted">{detalle}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="bg-surface px-4 py-3 hover:bg-surface2">
      {c}
    </Link>
  ) : (
    <div className="bg-surface px-4 py-3">{c}</div>
  );
}
