import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export type Periodo = {
  id: string;
  mes: string; // AAAA-MM-01
  estado: "abierto" | "cerrado";
  gastos_confirmados_en: string | null;
  titular_nombre: string | null;
};

/** Periodos del edificio (del más reciente al más antiguo) y el elegido: ?p=<id> o, si no, el abierto. */
export async function periodosDe(supabase: Cliente, edificioId: string, elegido?: string) {
  const { data } = await supabase
    .from("periodos")
    .select("id, mes, estado, gastos_confirmados_en, titular_nombre")
    .eq("edificio_id", edificioId)
    .order("mes", { ascending: false });
  const periodos = (data ?? []) as Periodo[];
  const actual = periodos.find((p) => p.id === elegido) ?? periodos.find((p) => p.estado === "abierto") ?? periodos[0] ?? null;
  return { periodos, actual };
}

/** "2026-08-01" → "2026-09-01" */
export function mesSiguiente(iso: string) {
  const [a, m] = iso.slice(0, 7).split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}
