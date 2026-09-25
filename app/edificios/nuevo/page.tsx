import { redirect } from "next/navigation";
import { Marca } from "@/components/Logo";
import { obtenerContexto } from "@/lib/contexto";
import { terminosAceptados } from "@/lib/legal";
import { Asistente } from "./Asistente";

export default async function NuevoEdificioPage() {
  const { supabase, user, edificios } = await obtenerContexto();
  if (!user) redirect("/login");
  if (!(await terminosAceptados(supabase, user.id, user.user_metadata))) redirect("/aceptar-terminos");

  // Organizaciones donde la cuenta es titular: puede agregar el edificio a una de ellas (RN-26).
  const orgIds = [...new Set(edificios.filter((e) => e.nivel === "titular").map((e) => e.organizacion_id))];
  const { data: orgs } = orgIds.length
    ? await supabase.from("organizaciones").select("id, nombre").in("id", orgIds).order("nombre")
    : { data: [] };

  const { data: perfil } = await supabase.from("perfiles").select("nombre").eq("id", user.id).maybeSingle();
  const miNombre = perfil?.nombre ?? String(user.user_metadata?.nombre ?? "");
  const mesActual = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(
    new Date(),
  );

  return (
    <main className="mx-auto max-w-[820px] px-4 pt-6 pb-12 md:px-8">
      <div className="mb-4">
        <Marca size={32} />
      </div>
      <Asistente
        miNombre={miNombre}
        mesActual={mesActual}
        organizaciones={orgs ?? []}
        primerEdificio={!edificios.some((e) => e.nivel)}
      />
    </main>
  );
}
