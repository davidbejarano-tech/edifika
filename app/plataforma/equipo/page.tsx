import { crearClienteServidor } from "@/lib/supabase/server";
import { Equipo } from "./Equipo";

export default async function EquipoPlataformaPage() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("plataforma_equipo");
  return (
    <>
      <h1 className="mb-1">Equipo EDIFIKA</h1>
      <p className="mb-4 text-muted">Personas con acceso a esta consola. Pueden dar soporte a cualquier edificio, así que agrega solo a quien trabaja en EDIFIKA.</p>
      <Equipo miembros={data ?? []} />
    </>
  );
}
