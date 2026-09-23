import { redirect } from "next/navigation";
import { Marca } from "@/components/Logo";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormTransferenciaForzada } from "./FormTransferenciaForzada";

// Herramientas internas del equipo de EDIFIKA (plataforma_admins). No aparece en ningún menú.
export default async function PlataformaPage() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: esPlataforma } = await supabase.rpc("es_plataforma");
  if (esPlataforma !== true) redirect("/edificios");

  return (
    <main className="mx-auto max-w-[720px] px-4 pt-6 pb-12">
      <Marca />
      <h1 className="mt-6 mb-1">Plataforma</h1>
      <p className="mb-5 text-muted">Herramientas del equipo de EDIFIKA.</p>
      <section className="panel">
        <h3 className="mb-1">Transferencia forzada de la titularidad</h3>
        <p className="mb-3 text-sm text-muted">
          Solo con el acta de la junta de propietarios que designa al nuevo administrador. El titular actual queda con acceso de
          solo lectura por 15 días. El acta se archiva en un almacenamiento privado.
        </p>
        <FormTransferenciaForzada />
      </section>
    </main>
  );
}
