import { redirect } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { obtenerContexto } from "@/lib/contexto";

// Solo el equipo de administración (titular, coadministrador o saliente en lectura).
// La base de datos protege de verdad con RLS; esto solo evita mostrar pantallas que no corresponden.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, edificios, actual } = await obtenerContexto();
  if (!user) redirect("/login");
  if (!actual) redirect("/elegir");
  if (!actual.nivel) redirect(actual.departamento_id ? "/cuentas" : "/elegir");

  return (
    <>
      <Encabezado edificio={actual} vista="admin" variosEdificios={edificios.length > 1} />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-12 md:px-8">{children}</main>
    </>
  );
}
