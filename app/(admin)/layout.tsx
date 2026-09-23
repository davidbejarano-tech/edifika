import { redirect } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { MenuAdmin } from "@/components/MenuAdmin";
import { obtenerContexto } from "@/lib/contexto";

// Solo el equipo de administración (titular, coadministrador o saliente en lectura).
// La base de datos protege de verdad con RLS; esto solo evita mostrar pantallas que no corresponden.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, edificios, actual } = await obtenerContexto();
  if (!user) redirect("/login");
  if (!actual) redirect("/edificios");
  if (!actual.nivel) redirect(actual.departamento_id ? "/cuentas" : "/edificios");

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr] md:grid-rows-[auto_1fr]">
      <div className="md:col-span-2">
        <Encabezado edificio={actual} vista="admin" variosEdificios={edificios.length > 1} />
      </div>
      <MenuAdmin porValidar={actual.pagos_por_validar ?? 0} />
      <main className="mx-auto w-full max-w-[1200px] min-w-0 px-4 pt-5 pb-12 md:px-8">{children}</main>
    </div>
  );
}
