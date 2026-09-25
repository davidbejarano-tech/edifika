import { crearClienteServidor } from "@/lib/supabase/server";
import { Solicitudes } from "./Solicitudes";

export default async function SolicitudesPage() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("plataforma_solicitudes");
  return (
    <>
      <h1 className="mb-1">Solicitudes de plan</h1>
      <p className="mb-4 text-muted">
        Lo que piden los titulares desde su Inicio. Contacta al titular, coordina el pago y luego activa el plan: el edificio queda
        protegido de la depuración.
      </p>
      <Solicitudes solicitudes={data ?? []} />
    </>
  );
}
