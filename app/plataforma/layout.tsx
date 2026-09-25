import { redirect } from "next/navigation";
import { Marca } from "@/components/Logo";
import { obtenerContexto } from "@/lib/contexto";
import { terminosAceptados } from "@/lib/legal";
import { MenuPlataforma } from "./MenuPlataforma";

// Consola de plataforma: solo el equipo de EDIFIKA (plataforma_admins). La base valida cada acción.
export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await obtenerContexto();
  if (!user) redirect("/login");
  if (!(await terminosAceptados(supabase, user.id, user.user_metadata))) redirect("/aceptar-terminos");
  const { data: esPlataforma } = await supabase.rpc("es_plataforma");
  if (esPlataforma !== true) redirect("/edificios");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5 md:px-5">
        <Marca href="/plataforma" />
        <span className="chip info">Consola de plataforma</span>
        <div className="flex-1" />
        <form action="/salir" method="post">
          <button className="btn quiet sm">Salir</button>
        </form>
      </header>
      <MenuPlataforma />
      <main className="mx-auto w-full max-w-[1200px] min-w-0 px-4 pt-5 pb-12 md:px-8">{children}</main>
    </div>
  );
}
