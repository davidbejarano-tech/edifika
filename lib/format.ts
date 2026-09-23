const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** "S/ 1,234.56". Acepta el numeric de PostgreSQL como texto. */
export function soles(monto: number | string | null | undefined): string {
  const n = typeof monto === "string" ? Number(monto) : (monto ?? 0);
  return "S/ " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "22 set 2026" a partir de "2026-09-22" (fecha de negocio, sin zona horaria). */
export function fecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`;
}

/** "setiembre 2026" a partir de "2026-09-01". */
export function mes(iso: string): string {
  const [a, m] = iso.slice(0, 7).split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}
