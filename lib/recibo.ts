import { fecha, mes, soles } from "./format";

// Datos del recibo tal como los arma datos_recibo() en la base. Los montos ya vienen calculados.
export type CargoRecibo = {
  tipo: string;
  concepto: string;
  estado: string;
  vence: string;
  monto: number;
  comun: number | null;
  agua: number | null;
  m3: number | null;
  alicuota: number | null;
  base_mes: string | null;
  saldo_aplicado: number | null;
};

export type DatosRecibo = {
  numero: string;
  mes: string;
  emitido: string;
  edificio: {
    nombre: string;
    direccion: string;
    administrador: string | null;
    cuenta_bancaria: string | null;
    yape_plin: string | null;
    mora: number;
  };
  departamento: {
    id: string;
    numero: string;
    piso: number | null;
    area: number | null;
    alicuota: number | null;
    propietario: string | null;
    inquilino: string | null;
    responsable: string | null;
    correo: string | null;
    telefono: string | null;
  };
  cargos: CargoRecibo[];
  totales: {
    cargos: number;
    saldo_aplicado: number;
    pagado: number;
    en_revision: number;
    anterior: number;
    anteriores: number;
    total: number;
    vencido: boolean;
    vence: string | null;
    saldo_favor: number;
  };
  estado: "pagado" | "vencido" | "por_pagar";
  gastos: { mes: string; categorias: { categoria: string; monto: number }[]; total: number };
  recibo: { id: string; generado_en: string; enviado_en: string | null; canal: string | null; pdf_path: string | null } | null;
};

export const ESTADO_RECIBO = {
  pagado: { texto: "Pagado", color: "#2E7D4F" },
  vencido: { texto: "Vencido", color: "#B23A30" },
  por_pagar: { texto: "Por pagar", color: "#8F5C0E" },
} as const;

/** Mes del recibo en la URL y en los nombres de archivo: "2026-09". */
export const mesCorto = (iso: string) => iso.slice(0, 7);

export const rutaPdfRecibo = (d: DatosRecibo, edificioId: string) => `${edificioId}/${d.departamento.id}/${d.numero.slice(0, 6)}.pdf`;

export const nombreArchivoRecibo = (d: DatosRecibo) => `Recibo-${d.numero}.pdf`;

export const porcentaje = (x: number | null) => (x === null ? "—" : `${(Number(x) * 100).toFixed(2)} %`);

/** Resumen de texto para WhatsApp y Compartir. */
export function textoRecibo(d: DatosRecibo) {
  const lineas = [
    d.edificio.nombre,
    `Recibo de mantenimiento de ${mes(d.mes)}, depto ${d.departamento.numero}`,
    `Total a pagar: ${soles(Math.max(0, d.totales.total))}`,
  ];
  if (d.totales.total > 0 && d.totales.vence) lineas.push(`Vence: ${fecha(d.totales.vence)}`);
  const pago = [d.edificio.cuenta_bancaria, d.edificio.yape_plin && `Yape o Plin: ${d.edificio.yape_plin}`].filter(Boolean).join(". ");
  if (pago) lineas.push(`Paga a: ${pago}`);
  lineas.push("Sube tu constancia en EDIFIKA.");
  return lineas.join("\n");
}

/** Enlace de WhatsApp al teléfono del responsable (Perú: +51). */
export function enlaceWhatsapp(d: DatosRecibo) {
  const tel = (d.departamento.telefono ?? "").replace(/\D/g, "");
  const numero = tel.length === 9 ? `51${tel}` : tel;
  return `https://wa.me/${numero}?text=${encodeURIComponent(textoRecibo(d))}`;
}
