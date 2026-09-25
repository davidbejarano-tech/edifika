import { redirect } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { MenuHabitante } from "@/components/MenuHabitante";
import { obtenerContexto } from "@/lib/contexto";
import { terminosAceptados } from "@/lib/legal";

// Solo quien tiene acceso activo a un departamento del edificio elegido.
export default async function HabitanteLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, edificios, actual } = await obtenerContexto();
  if (!user) redirect("/login");
  if (!(await terminosAceptados(supabase, user.id, user.user_metadata))) redirect("/aceptar-terminos");
  if (!actual) redirect("/edificios");
  if (!actual.departamento_id) redirect(actual.nivel ? "/inicio" : "/edificios");

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr] md:grid-rows-[auto_1fr] print:block">
      <div className="md:col-span-2">
        <Encabezado edificio={actual} vista="habitante" variosEdificios={edificios.length > 1} />
      </div>
      <MenuHabitante />
      <main className="mx-auto w-full max-w-[1000px] min-w-0 px-4 pt-5 pb-12 md:px-8">{children}</main>
    </div>
  );
}
