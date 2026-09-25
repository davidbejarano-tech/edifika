import { fecha } from "@/lib/format";
import type { Plan } from "@/lib/modulos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Edificios } from "../edificios/Edificios";

// Depuración manual (SPEC 12.11 c): edificios sin plan que se acercan a los 90 días y lo ya eliminado
export default async function DepuracionPage() {
  const supabase = await crearClienteServidor();
  const [{ data: edificios }, { data: planes }, { data: historial }] = await Promise.all([
    supabase.rpc("plataforma_edificios"),
    supabase.rpc("planes_vigentes"),
    supabase.rpc("plataforma_depuraciones"),
  ]);
  const cerca = (edificios ?? []).filter((e) => !e.pagado && e.dias_sin_movimiento >= 45).sort((a, b) => b.dias_sin_movimiento - a.dias_sin_movimiento);
  return (
    <>
      <h1 className="mb-1">Depuración</h1>
      <p className="mb-4 text-muted">
        Edificios sin plan pagado con 45 días o más sin movimiento. Se avisa al titular a los 60 y 83 días y se eliminan a los 90. Puedes
        posponer la eliminación o eliminar un edificio a pedido de su titular.
      </p>
      {cerca.length === 0 ? (
        <p className="hint mb-6">Ningún edificio está cerca de la eliminación.</p>
      ) : (
        <div className="mb-6">
          <Edificios edificios={cerca} planes={((planes ?? []) as unknown as Plan[]).map((p) => ({ id: p.id, nombre: p.nombre }))} />
        </div>
      )}
      <section className="panel">
        <h3 className="mb-2">Eliminados</h3>
        <p className="mb-2 text-sm text-muted">Rastro técnico sin datos personales (RN-29).</p>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Eliminado</th>
                <th className="r">Días sin movimiento</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {(historial ?? []).map((d) => (
                <tr key={`${d.codigo}-${d.depurado_en}`}>
                  <td>{d.codigo}</td>
                  <td>{fecha(d.depurado_en.slice(0, 10))}</td>
                  <td className="r">{d.dias_inactivo}</td>
                  <td>{d.motivo ?? "Inactividad de 90 días"}</td>
                </tr>
              ))}
              {(historial ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">
                    Todavía no se eliminó ningún edificio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
