// Textos y formatos del módulo Áreas comunes (RN-30 a RN-37). Los montos y reglas los aplica la base.
import { enLima, fecha } from "./format";

export const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const ESTADO_RESERVA: Record<string, { texto: string; clase: string }> = {
  solicitada: { texto: "Por aprobar", clase: "info" },
  pendiente_pago: { texto: "Pendiente de pago", clase: "warn" },
  confirmada: { texto: "Confirmada", clase: "activo" },
  usada: { texto: "Usada", clase: "tag" },
  cancelada: { texto: "Cancelada", clase: "tag" },
  rechazada: { texto: "Rechazada", clase: "bad" },
  expirada: { texto: "Expirada", clase: "bad" },
};

export const ESTADO_GARANTIA: Record<string, string> = {
  sin_garantia: "Sin garantía",
  por_cobrar: "Garantía por cobrar",
  en_custodia: "Garantía en custodia",
  por_devolver: "Garantía por devolver",
  devuelta: "Garantía devuelta",
  retenida: "Garantía retenida",
};

export const ACTIVAS = ["solicitada", "pendiente_pago", "confirmada"];

/** "Lun, Mar y Vie" o "Todos los días" */
export function diasTexto(dias: number[]) {
  if (dias.length === 7) return "Todos los días";
  const n = [...dias].sort().map((d) => DIAS[d]);
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} y ${n.at(-1)}` : (n[0] ?? "Ningún día");
}

/** "09:00:00" → "09:00" */
export const hm = (t: string) => t.slice(0, 5);

/** Duración del turno: "4 h", "1 h 30 min" o "45 min" */
export function duracion(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** "26 set 2026, 18:00 a 22:00" (hora de Lima) */
export function turnoTexto(inicio: string, fin: string) {
  const a = enLima(inicio);
  const b = enLima(fin);
  return `${fecha(a.dia)}, ${a.hora} a ${b.hora}`;
}

/** "2026-09-26" (fecha de hoy en Lima) más n días */
export function diaLimaMas(n: number) {
  const hoy = enLima(new Date().toISOString()).dia;
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inicio del día en Lima (Perú no cambia de hora): "2026-09-26" → ISO con -05:00 */
export const inicioDiaLima = (dia: string) => `${dia}T00:00:00-05:00`;
