"use server";

import { obtenerContexto } from "@/lib/contexto";

export type Movimiento = { fecha: string; concepto: string; tipo: string; estado: string; cargo: number; abono: number; saldo: number };

// Cuenta corriente del departamento: cargos, pagos y saldo acumulado calculados en la base
export async function cuentaCorriente(departamentoId: string): Promise<{ movimientos: Movimiento[]; error: string | null }> {
  const { supabase } = await obtenerContexto();
  const { data, error } = await supabase.rpc("cuenta_corriente", { p_departamento: departamentoId });
  if (error) return { movimientos: [], error: error.message };
  return {
    movimientos: (data ?? []).map((m) => ({ ...m, cargo: Number(m.cargo), abono: Number(m.abono), saldo: Number(m.saldo) })),
    error: null,
  };
}
