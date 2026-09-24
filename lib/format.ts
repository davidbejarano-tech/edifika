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

/** "set" a partir de "2026-09-01". */
export function mesCorto(iso: string): string {
  return MESES_CORTOS[Number(iso.slice(5, 7)) - 1];
}

const LIMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Fecha y hora de un timestamp en Lima: { dia: "2026-09-22", hora: "10:35" }. */
export function enLima(iso: string) {
  const p = Object.fromEntries(LIMA.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
