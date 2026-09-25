import { crearClienteServidor } from "@/lib/supabase/server";
import type { Plan } from "@/lib/modulos";
import { Edificios } from "./Edificios";

export default async function PlataformaEdificiosPage() {
  const supabase = await crearClienteServidor();
  const [{ data: edificios }, { data: planes }] = await Promise.all([supabase.rpc("plataforma_edificios"), supabase.rpc("planes_vigentes")]);
  return (
    <>
      <h1 className="mb-1">Edificios</h1>
      <p className="mb-4 text-muted">Todos los edificios registrados. Abre uno para dar soporte, asignar su plan o gestionar su eliminación.</p>
      <Edificios edificios={edificios ?? []} planes={((planes ?? []) as unknown as Plan[]).map((p) => ({ id: p.id, nombre: p.nombre }))} />
    </>
  );
}
