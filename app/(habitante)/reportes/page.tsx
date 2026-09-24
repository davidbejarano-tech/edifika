import { redirect } from "next/navigation";
import { Reportes } from "@/components/Reportes";
import { obtenerContexto } from "@/lib/contexto";

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.departamento_id) redirect("/edificios");
  return <Reportes supabase={supabase} actual={actual} p={p} />;
}
