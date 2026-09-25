import type { EdificioMio } from "./contexto";
import { periodosDe } from "./periodos";
import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export const INGRESO: Record<string, string> = {
  cuota: "Cuotas de mantenimiento",
  mora: "Moras",
  extraordinario: "Compromisos extraordinarios",
  adelanto: "Adelantos",
  ajuste: "Ajustes",
  reserva: "Reservas de áreas comunes",
  garantia_retenida: "Garantías retenidas por daños",
};

/**
 * Datos del estado de cuenta de un periodo (RN-14, RN-15, RN-24, RN-36), para la pantalla y el PDF.
 * desglose: "1" o "0" desde la URL; si no viene, se muestra según lo que el edificio publica.
 * Los vecinos solo reciben el desglose si el edificio lo publica (cuentas_por_cobrar lo controla en la base).
 */
export async function cargarEstadoCuenta(supabase: Cliente, actual: EdificioMio, p?: string, desglose?: string, vecino = false) {
  const { periodos, actual: periodo } = await periodosDe(supabase, actual.edificio_id, p);
  if (!periodo) return { periodos, periodo: null } as const;

  const [{ data: r }, { data: ingresos }, { data: gastos }, { data: cuentas }, { data: garantias }, { data: ed }] = await Promise.all([
    supabase.rpc("resumen_periodo", { p_periodo: periodo.id }).maybeSingle(),
    supabase.rpc("ingresos_por_tipo", { p_periodo: periodo.id }),
    supabase.from("gastos").select("tipo, categoria, descripcion, monto").eq("periodo_id", periodo.id).order("fecha"),
    supabase.rpc("cuentas_por_cobrar", { p_edificio: actual.edificio_id }),
    supabase.rpc("garantias_en_custodia", { p_edificio: actual.edificio_id }).maybeSingle(),
    supabase.from("edificios").select("direccion, publicar_desglose").eq("id", actual.edificio_id).single(),
  ]);

  const publicado = !!ed?.publicar_desglose;
  const puedeDesglose = !vecino || publicado;
  const conDesglose = puedeDesglose && (desglose === undefined ? publicado : desglose === "1");

  return {
    periodos,
    periodo,
    nombre: actual.nombre,
    direccion: ed?.direccion ?? "",
    oficial: !!r?.oficial,
    administrador: r?.administrador ?? null,
    saldoAnterior: Number(r?.saldo_anterior ?? 0),
    ingresos: Number(r?.ingresos ?? 0),
    gastos: Number(r?.gastos ?? 0),
    acumulado: Number(r?.acumulado ?? 0),
    filasIngresos: (ingresos ?? []).map((i) => [`${INGRESO[i.tipo] ?? i.tipo} (${i.pagos})`, Number(i.monto)] as [string, number]),
    categorias: Object.entries(
      (gastos ?? []).reduce<Record<string, number>>((acc, g) => ({ ...acc, [g.categoria]: (acc[g.categoria] ?? 0) + Number(g.monto) }), {}),
    ),
    deudores: (cuentas ?? []).filter((c) => Number(c.pendiente) > 0),
    custodia: Number(garantias?.en_custodia ?? 0) + Number(garantias?.por_devolver ?? 0),
    puedeDesglose,
    conDesglose,
  } as const;
}

export type EstadoCuentaDatos = Extract<Awaited<ReturnType<typeof cargarEstadoCuenta>>, { oficial: boolean }>;
