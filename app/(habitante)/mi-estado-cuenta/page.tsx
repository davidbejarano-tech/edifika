import { redirect } from "next/navigation";
import { EstadoCuenta } from "@/components/EstadoCuenta";
import { obtenerContexto } from "@/lib/contexto";

// Estado de cuenta del edificio para el vecino (RN-15): totales, ingresos y gastos.
export default async function MiEstadoCuentaPage({ searchParams }: { searchParams: Promise<{ p?: string; d?: string }> }) {
  const { p, d } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.departamento_id) redirect("/edificios");
  return <EstadoCuenta supabase={supabase} actual={actual} p={p} d={d} vecino />;
}
