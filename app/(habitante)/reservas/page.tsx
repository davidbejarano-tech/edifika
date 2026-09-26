import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { Reservar } from "./Reservar";

// Áreas comunes · vecino (RN-31 a RN-34): zonas, turnos del día, reservar y Mis reservas
export default async function ReservasPage() {
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.departamento_id) redirect("/edificios");
  const ed = actual.edificio_id;

  const [{ data: modulos }, { data: zonas }, { data: mias }] = await Promise.all([
    supabase.rpc("estado_modulos", { p_edificio: ed }),
    supabase
      .from("zonas_comunes")
      .select("id, nombre, descripcion, aforo, reglamento, dias_semana, hora_apertura, hora_cierre, duracion_turno_min, anticipacion_min_dias, anticipacion_max_dias, max_reservas_mes, requiere_aprobacion, tarifa, garantia, permite_morosos, plazo_pago_horas")
      .eq("edificio_id", ed)
      .eq("activa", true)
      .order("nombre"),
    supabase.rpc("mis_reservas", { p_edificio: ed }),
  ]);
  const habilitado = (modulos ?? []).find((m) => m.modulo === "areas_comunes")?.estado !== "bloqueado";

  return (
    <>
      <div className="mb-4">
        <h1>Áreas comunes</h1>
        <p className="mt-1 text-muted">Reserva la parrilla, el salón o el gimnasio del edificio.</p>
      </div>
      {!habilitado && (
        <p className="hint mb-4">Por ahora el edificio no acepta reservas nuevas. Tus reservas confirmadas se mantienen.</p>
      )}
      <Reservar
        zonas={(zonas ?? []).map((z) => ({ ...z, tarifa: Number(z.tarifa), garantia: Number(z.garantia) }))}
        mias={mias ?? []}
        habilitado={habilitado}
      />
    </>
  );
}
