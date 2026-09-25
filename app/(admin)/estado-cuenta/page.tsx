import { redirect } from "next/navigation";
import { EstadoCuenta } from "@/components/EstadoCuenta";
import { obtenerContexto } from "@/lib/contexto";

export default async function EstadoCuentaPage({ searchParams }: { searchParams: Promise<{ p?: string; d?: string }> }) {
  const { p, d } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  return <EstadoCuenta supabase={supabase} actual={actual} p={p} d={d} />;
}
