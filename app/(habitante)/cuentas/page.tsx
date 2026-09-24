import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { MisCuentas } from "./MisCuentas";
import { ValidadorVecino } from "./ValidadorVecino";

export default async function CuentasPage() {
  const { supabase, user, actual } = await obtenerContexto();
  if (!user || !actual?.departamento_id) redirect("/edificios");
  const dep = actual.departamento_id;

  // Siempre se filtra por el propio departamento: un vecino que además administra ve todo el edificio por RLS
  const [{ data: compromisos }, { data: pagos }, { data: ed }, { data: cc }, { data: responsable }] = await Promise.all([
    supabase
      .from("v_compromisos")
      .select("id, tipo, concepto, mes, monto, vence_en, estado, estado_visible, por_cobrar, detalle")
      .eq("departamento_id", dep)
      .neq("estado", "anulado")
      .order("vence_en"),
    supabase
      .from("pagos")
      .select("id, compromiso_id, monto, metodo, operacion, fecha_pago, estado, nota_rechazo, comprobante_path, created_at, compromisos(concepto)")
      .eq("departamento_id", dep)
      .order("created_at", { ascending: false }),
    supabase
      .from("edificios")
      .select("cuenta_bancaria, yape_plin, validador_designado_id, base_cuota, agua_cuota")
      .eq("id", actual.edificio_id)
      .single(),
    supabase.rpc("cuenta_corriente", { p_departamento: dep }),
    supabase
      .from("ocupaciones")
      .select("tipo, personas(nombre)")
      .eq("departamento_id", dep)
      .is("hasta", null),
  ]);

  const listaPagos = (pagos ?? []).map((p) => ({
    ...p,
    monto: Number(p.monto),
    concepto: (p.compromisos as unknown as { concepto: string } | null)?.concepto ?? "",
  }));
  // Último rechazo de cada compromiso que volvió a pendiente (RN-11: el vecino ve el motivo)
  const rechazos = Object.fromEntries(
    listaPagos.filter((p) => p.estado === "rechazado").reverse().map((p) => [p.compromiso_id, p.nota_rechazo ?? ""]),
  );
  const ocup = (responsable ?? []) as unknown as { tipo: string; personas: { nombre: string } | null }[];
  const nombre = (ocup.find((o) => o.tipo === "inquilino") ?? ocup.find((o) => o.tipo === "propietario"))?.personas?.nombre ?? "";

  // RN-12: saldo a favor, parte fija (para adelantar meses) y últimos pagos de cuota (referencia con gastos reales)
  const [{ data: saldo }, { data: parteFija }, { data: ausencias }] = await Promise.all([
    supabase.rpc("saldo_a_favor", { p_departamento: dep }),
    supabase.rpc("parte_fija_actual", { p_edificio: actual.edificio_id }),
    supabase
      .from("ausencias")
      .select("id, desde, hasta, motivo, estado, nota")
      .eq("departamento_id", dep)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const ultimosPagos = listaPagos
    .filter((p) => p.estado === "validado" && /^Cuota/.test(p.concepto))
    .slice(0, 3)
    .map((p) => ({ fecha: p.fecha_pago, monto: p.monto, concepto: p.concepto }));

  const esValidador = ed?.validador_designado_id === user.id;
  const { data: porValidar } = esValidador ? await supabase.rpc("pagos_por_validar", { p_edificio: actual.edificio_id }) : { data: [] };

  return (
    <>
      <MisCuentas
        edificioId={actual.edificio_id}
        departamentoId={dep}
        numero={actual.departamento_numero ?? ""}
        nombre={nombre}
        compromisos={(compromisos ?? []).map((c) => {
          const d = (c.detalle ?? {}) as { bruto?: number; saldo_aplicado?: number };
          return {
            ...c,
            detalle: undefined,
            monto: Number(c.monto),
            rechazo: rechazos[c.id!] ?? null,
            bruto: d.bruto === undefined ? null : Number(d.bruto),
            saldoAplicado: Number(d.saldo_aplicado ?? 0),
          };
        })}
        pagos={listaPagos}
        movimientos={(cc ?? []).map((m) => ({ ...m, cargo: Number(m.cargo), abono: Number(m.abono), saldo: Number(m.saldo) }))}
        datosPago={{ cuenta: ed?.cuenta_bancaria ?? null, yape: ed?.yape_plin ?? null }}
        adelanto={{
          conMontoFijo: ed?.base_cuota === "fijo_area" || ed?.base_cuota === "fijo_igual",
          aguaPorConsumo: ed?.agua_cuota === "consumo",
          parteFija: parteFija === null || parteFija === undefined ? null : Number(parteFija),
          saldoFavor: Number(saldo ?? 0),
          ultimosPagos,
        }}
        ausencia={ausencias?.[0] ?? null}
      />
      {esValidador && <ValidadorVecino pagos={(porValidar ?? []).filter((p) => p.puede_validar)} />}
    </>
  );
}
