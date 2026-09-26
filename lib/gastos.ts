// Frecuencia de los gastos recurrentes, en meses (columna gastos.frecuencia_meses)
export const FRECUENCIAS = [
  { meses: 1, nombre: "Mensual" },
  { meses: 2, nombre: "Bimestral" },
  { meses: 3, nombre: "Trimestral" },
  { meses: 4, nombre: "Cuatrimestral" },
  { meses: 6, nombre: "Semestral" },
  { meses: 12, nombre: "Anual" },
] as const;

export const nombreFrecuencia = (meses: number) => FRECUENCIAS.find((f) => f.meses === meses)?.nombre ?? `Cada ${meses} meses`;

/** Meses entre dos fechas AAAA-MM-DD ("2026-09-01", "2026-11-01" → 2). */
export function mesesEntre(desde: string, hasta: string) {
  const [a1, m1] = desde.slice(0, 7).split("-").map(Number);
  const [a2, m2] = hasta.slice(0, 7).split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}
