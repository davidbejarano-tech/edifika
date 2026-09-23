import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { Equipo } from "./Equipo";

export default async function EquipoPage() {
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  const esTitular = actual.nivel === "titular";

  const [{ data: equipo }, { data: validacion }, { data: vecinos }] = await Promise.all([
    supabase.rpc("equipo_admin", { p_edificio: actual.edificio_id }),
    supabase.rpc("estado_validacion", { p_edificio: actual.edificio_id }).maybeSingle(),
    esTitular ? supabase.rpc("vecinos_con_cuenta", { p_edificio: actual.edificio_id }) : Promise.resolve({ data: [] }),
  ]);

  return (
    <Equipo
      equipo={equipo ?? []}
      validacion={validacion ?? null}
      vecinos={vecinos ?? []}
      esTitular={esTitular}
      codigo={actual.codigo}
    />
  );
}
