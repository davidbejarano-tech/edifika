import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { fecha } from "@/lib/format";
import { Departamentos } from "./Departamentos";

export default async function DepartamentosPage() {
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");

  const [{ data: deps }, { data: historial }, { data: medidores }, { data: ed }] = await Promise.all([
    supabase.rpc("departamentos_admin", { p_edificio: actual.edificio_id }),
    supabase.rpc("historial_ocupantes", { p_edificio: actual.edificio_id }),
    supabase
      .from("medidores")
      .select("id, departamento_id, numero_serie, lectura_inicial, instalado_en, retirado_en")
      .eq("edificio_id", actual.edificio_id)
      .order("instalado_en", { ascending: false }),
    supabase.from("edificios").select("total_departamentos, base_cuota, agua_cuota").eq("id", actual.edificio_id).single(),
  ]);

  const filas = deps ?? [];
  return (
    <>
      <Departamentos
        filas={filas}
        medidores={medidores ?? []}
        totalDeclarado={ed?.total_departamentos ?? filas.length}
        conMedidores={ed?.agua_cuota === "consumo"}
        puede={actual.nivel === "titular"}
      />

      <section className="panel">
        <h3 className="mb-3">Historial de ocupantes dados de baja</h3>
        {historial?.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Depto</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => (
                  <tr key={i}>
                    <td>{h.numero}</td>
                    <td>{h.nombre}</td>
                    <td className="capitalize">{h.tipo}</td>
                    <td>{fecha(h.desde)}</td>
                    <td>{fecha(h.hasta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Sin registros.</p>
        )}
      </section>
    </>
  );
}
