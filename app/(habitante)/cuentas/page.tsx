import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";

export default async function CuentasPage() {
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.departamento_id) redirect("/edificios");

  const { data: depto } = await supabase
    .from("departamentos")
    .select("numero, piso, area_m2")
    .eq("id", actual.departamento_id)
    .single();

  return (
    <>
      <div className="mb-5">
        <h1>Mis cuentas</h1>
        <p className="mt-1 text-muted">
          {actual.nombre} · Departamento {depto?.numero}
          {depto && ` · piso ${depto.piso} · ${Number(depto.area_m2).toLocaleString("en-US")} m²`}
        </p>
      </div>
      <p className="hint">Aquí verás lo que debes, tus pagos y tus comprobantes. Esta pantalla se completa en la Etapa 4.</p>
    </>
  );
}
