import type { Plan } from "@/lib/modulos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormCorreos, FormPlanes } from "./Formularios";

const TAMANOS = [10, 20, 40, 80];

// Planes, precios y correos de la plataforma (SPEC 12.11 d y e). Se guardan en plataforma_config.
export default async function PlanesPage() {
  const supabase = await crearClienteServidor();
  const { data: config } = await supabase.rpc("plataforma_config_leer");
  const c = (config ?? {}) as { planes?: Plan[]; correo_avisos?: string; correo_contacto?: string };
  const planes = c.planes ?? [];
  // Precio de cada plan según el tamaño del edificio, calculado en la base
  const ejemplos = await Promise.all(
    planes.map(async (p) => ({
      id: p.id,
      precios: await Promise.all(
        TAMANOS.map(async (n) => Number((await supabase.rpc("precio_plan", { p_plan: p as never, p_departamentos: n })).data ?? 0)),
      ),
    })),
  );

  return (
    <>
      <h1 className="mb-1">Planes y correos</h1>
      <p className="mb-5 text-muted">
        Precio mensual = el mayor entre el mínimo y (precio fijo + precio por departamento × departamentos). Usa solo el fijo, solo el
        precio por departamento o ambos. Los cambios se ven al instante en el Inicio de cada titular.
      </p>
      <FormPlanes planes={planes} tamanos={TAMANOS} ejemplos={ejemplos} />
      <FormCorreos avisos={c.correo_avisos ?? ""} contacto={c.correo_contacto ?? ""} />
    </>
  );
}
