// Catálogo de módulos del dashboard (SPEC · Inicio, RN-17). Los precios y lo que incluye
// cada plan vienen de la base (planes_vigentes), para poder cambiarlos sin publicar código.
export type IdModulo = "gestion" | "finanzas" | "comunicacion" | "areas_comunes" | "mantenimiento" | "marketplace";

export type Modulo = {
  id: IdModulo;
  titulo: string;
  descripcion: string;
  color: string;
  href: string | null; // null: aún no disponible en la app
  base: boolean; // incluido siempre
  plan?: "pro" | "premium"; // plan que lo incluye
  valor?: string; // qué gana el edificio (ficha del módulo)
  disponible: boolean; // false: se puede solicitar el plan, pero aún no probar
  icono: string; // trazos SVG 24×24
};

export const MODULOS: Modulo[] = [
  {
    id: "gestion",
    titulo: "Gestión del edificio",
    descripcion: "Datos del edificio, departamentos, ocupantes y equipo de administración.",
    color: "#1570C2",
    href: "/configuracion",
    base: true,
    disponible: true,
    icono: "M5 21V4h10v17M15 9h4v12M8 8h2M8 12h2M8 16h2M3 21h18",
  },
  {
    id: "finanzas",
    titulo: "Finanzas y cuotas",
    descripcion: "Cálculo de cuotas, cobranza, gastos, recibos y estado de cuenta.",
    color: "#1E8A5A",
    href: "/resumen",
    base: true,
    disponible: true,
    icono: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  },
  {
    id: "comunicacion",
    titulo: "Comunicación",
    descripcion: "Chat del edificio en tiempo real para vecinos y administración.",
    color: "#6B4FD0",
    href: "/chat",
    base: true,
    disponible: true,
    icono: "M4 5h16v11H9l-5 4z",
  },
  {
    id: "areas_comunes",
    titulo: "Áreas comunes",
    descripcion: "Reservas de parrilla, SUM y gimnasio con calendario compartido.",
    color: "#C77D12",
    href: null,
    base: false,
    plan: "pro",
    disponible: false,
    valor:
      "Los vecinos reservan la parrilla o el SUM desde su celular, sin choques de horario ni cuadernos en portería. El cobro de la reserva se suma a su cuenta del mes.",
    icono: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 3v4M16 3v4",
  },
  {
    id: "mantenimiento",
    titulo: "Mantenimiento",
    descripcion: "Tickets de incidencias y plan preventivo de equipos.",
    color: "#C2453A",
    href: null,
    base: false,
    plan: "pro",
    disponible: false,
    valor:
      "Cada incidencia queda registrada con responsable, prioridad y fotos. Los vecinos ven el avance y tú programas el mantenimiento preventivo de ascensor, bombas y pozo a tierra.",
    icono: "M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.7-7.7a4 4 0 0 1-2-2z",
  },
  {
    id: "marketplace",
    titulo: "Marketplace de servicios",
    descripcion: "Gasfiteros, electricistas y limpieza verificados cerca de tu edificio.",
    color: "#0B7F8F",
    href: null,
    base: false,
    plan: "premium",
    disponible: false,
    valor: "Tus vecinos contratan gasfiteros, electricistas y limpieza verificados, con precios claros.",
    icono: "M4 10v10h16V10M3 10l2-6h14l2 6zM9 20v-5h6v5",
  },
];

export const ICONO_CANDADO = "M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 11V8a4 4 0 0 1 8 0v3";

export type Plan = {
  id: "basico" | "pro" | "premium";
  nombre: string;
  precio: number; // fijo al mes
  precio_departamento?: number | null; // por departamento al mes
  minimo?: number | null;
  total?: number; // precio para un edificio concreto (planes_para_edificio)
  departamentos?: number;
  moneda: string;
  max_departamentos: number | null;
  incluye: string;
  modulos: string[];
};

const dinero = (p: Plan, n: number) =>
  `${p.moneda === "PEN" ? "S/" : p.moneda} ${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "S/ 149 al mes" o, con precio por departamento, "S/ 180 al mes (S/ 1.50 × 120 departamentos)". El total lo calcula la base. */
export const precioPlan = (p: Plan) => {
  const total = p.total ?? p.precio;
  if (!p.precio_departamento) return `${dinero(p, total)} al mes`;
  const detalle = `${p.precio ? `${dinero(p, p.precio)} + ` : ""}${dinero(p, p.precio_departamento)} × ${p.departamentos ?? 0} departamentos`;
  return `${dinero(p, total)} al mes (${detalle}${p.minimo && total === p.minimo ? "; mínimo" : ""})`;
};
