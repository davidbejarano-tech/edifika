import { redirect } from "next/navigation";
import { PaginaChat } from "@/components/PaginaChat";
import { obtenerContexto } from "@/lib/contexto";

export default async function ChatVecinoPage() {
  const { supabase, user, actual } = await obtenerContexto();
  if (!user || !actual?.departamento_id) redirect("/edificios");
  return <PaginaChat supabase={supabase} actual={actual} yo={user.id} comoAdmin={false} />;
}
