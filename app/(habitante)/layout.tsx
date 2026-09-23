import { redirect } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { obtenerContexto } from "@/lib/contexto";

// Solo quien tiene acceso activo a un departamento del edificio elegido.
export default async function HabitanteLayout({ children }: { children: React.ReactNode }) {
  const { user, edificios, actual } = await obtenerContexto();
  if (!user) redirect("/login");
  if (!actual) redirect("/edificios");
  if (!actual.departamento_id) redirect(actual.nivel ? "/inicio" : "/edificios");

  return (
    <>
      <Encabezado edificio={actual} vista="habitante" variosEdificios={edificios.length > 1} />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-12 md:px-8">{children}</main>
    </>
  );
}
