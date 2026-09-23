"use server";

import { revalidatePath } from "next/cache";
import { obtenerContexto } from "@/lib/contexto";
import type { Database } from "@/lib/supabase/types";

export type Resultado = { ok: boolean; mensaje: string | null };
type CambioEdificio = Database["public"]["Tables"]["edificios"]["Update"];

const numero = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim().replace(",", ".");
  return t === "" ? null : Number(t);
};
const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();

// Guarda en el edificio elegido. La RLS (edif_editar) solo deja actualizar al titular:
// si no se actualizó ninguna fila, no tenía permiso.
async function guardar(cambio: CambioEdificio, listo: string): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return { ok: false, mensaje: "Elige un edificio." };
  const { data, error } = await supabase.from("edificios").update(cambio).eq("id", actual.edificio_id).select("id");
  if (error) return { ok: false, mensaje: traducir(error.message) };
  if (!data?.length) return { ok: false, mensaje: "Solo el administrador titular puede cambiar la configuración." };
  revalidatePath("/", "layout");
  return { ok: true, mensaje: listo };
}

// Las restricciones de la tabla llegan en inglés: las convertimos en un mensaje claro.
function traducir(m: string) {
  if (/dia_corte/.test(m)) return "El día de corte debe estar entre 1 y 27.";
  if (/dia_lectura/.test(m)) return "El día de lectura debe estar entre 1 y 28.";
  if (/monto_fijo/.test(m)) return "El monto fijo debe ser mayor que cero.";
  if (/mora/.test(m)) return "La mora no puede ser negativa.";
  if (/total_departamentos/.test(m)) return "La cantidad de departamentos debe ser mayor que cero.";
  if (/area_comun/.test(m)) return "Las áreas comunes no pueden ser negativas.";
  return m;
}

export async function guardarDatos(_: Resultado, f: FormData): Promise<Resultado> {
  const nombre = texto(f.get("nombre"));
  const direccion = texto(f.get("direccion"));
  const total = numero(f.get("total"));
  if (!nombre || !direccion) return { ok: false, mensaje: "El nombre y la dirección son obligatorios." };
  if (!total || !Number.isInteger(total) || total < 1) return { ok: false, mensaje: "La cantidad de departamentos debe ser un número entero mayor que cero." };
  return guardar({ nombre, direccion, total_departamentos: total }, "Datos del edificio guardados.");
}

export async function guardarCobranza(_: Resultado, f: FormData): Promise<Resultado> {
  const base = texto(f.get("base")) || null;
  const agua = texto(f.get("agua")) || null;
  const monto = numero(f.get("monto"));
  const diaLectura = numero(f.get("dia_lectura"));
  const areaComun = numero(f.get("area_comun"));
  if (!base || !agua) return { ok: false, mensaje: "Elige la base de la cuota y cómo se cobra el agua." };
  if (base !== "gastos" && !(monto && monto > 0)) {
    return { ok: false, mensaje: base === "fijo_igual" ? "Escribe el monto que paga cada departamento." : "Escribe el monto fijo mensual del edificio." };
  }
  if (agua === "consumo" && !(diaLectura && Number.isInteger(diaLectura) && diaLectura >= 1 && diaLectura <= 28)) {
    return { ok: false, mensaje: "Elige el día del mes en que se leen los medidores (1 a 28)." };
  }
  return guardar(
    {
      base_cuota: base,
      agua_cuota: agua,
      monto_fijo_mensual: base === "gastos" ? null : monto,
      dia_lectura: agua === "consumo" ? diaLectura : null,
      area_comun_m2: areaComun,
    },
    "Configuración de la cobranza guardada. Revisa la vista previa del reparto.",
  );
}

export async function guardarPago(_: Resultado, f: FormData): Promise<Resultado> {
  const diaCorte = numero(f.get("dia_corte"));
  const mora = numero(f.get("mora")) ?? 0;
  const saldo = numero(f.get("saldo_inicial")) ?? 0;
  if (!diaCorte || !Number.isInteger(diaCorte) || diaCorte < 1 || diaCorte > 27) {
    return { ok: false, mensaje: "El día de corte debe estar entre 1 y 27." };
  }
  if (Number.isNaN(mora) || Number.isNaN(saldo)) return { ok: false, mensaje: "La mora y el saldo inicial deben ser números." };
  return guardar(
    {
      dia_corte: diaCorte,
      mora_monto: mora,
      saldo_inicial: saldo,
      cuenta_bancaria: texto(f.get("cuenta")) || null,
      yape_plin: texto(f.get("yape")) || null,
      publicar_desglose: f.get("desglose") === "on",
    },
    "Datos de cobro guardados.",
  );
}
