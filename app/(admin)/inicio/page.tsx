import Link from "next/link";
import { redirect } from "next/navigation";
import { NOMBRE_NIVEL, obtenerContexto } from "@/lib/contexto";
import { fecha, mes, soles } from "@/lib/format";
import type { Plan } from "@/lib/modulos";
import { periodosDe } from "@/lib/periodos";
import { Modulos } from "./Modulos";

// Inicio: dashboard de módulos (SPEC · Inicio, RN-17), avance de la configuración y cifras del mes.
export default async function InicioPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const { nuevo } = await searchParams;
  const { supabase, user, actual } = await obtenerContexto();
  if (!user || !actual?.nivel) redirect("/edificios");
  const nivel = actual.nivel;
  const ed = actual.edificio_id;

  const [{ data: conf }, { data: estados }, { data: planes }, { data: edificio }, { data: perfil }, { actual: periodo }, { data: cobranza }, { count: mensajes }] =
    await Promise.all([
      supabase.rpc("estado_configuracion", { p_edificio: ed }).single(),
      supabase.rpc("estado_modulos", { p_edificio: ed }),
      supabase.rpc("planes_para_edificio", { p_edificio: ed }),
      supabase.from("edificios").select("plan, suscripcion_pagada").eq("id", ed).single(),
      supabase.from("perfiles").select("nombre").eq("id", user.id).maybeSingle(),
      periodosDe(supabase, ed),
      supabase.rpc("cobranza_edificio", { p_edificio: ed }).maybeSingle(),
      supabase.from("mensajes").select("id", { count: "exact", head: true }).eq("edificio_id", ed),
    ]);
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const en30 = new Date(Date.parse(`${hoy}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: proximas }, { data: porVencer }] = await Promise.all([
    supabase.rpc("reservas_proximas", { p_edificio: ed }),
    supabase.from("certificaciones").select("id, nombre, vence_en").eq("edificio_id", ed).lte("vence_en", en30).order("vence_en"),
  ]);
  const [{ data: r }, { data: enSoporte }, { data: intervenciones }] = await Promise.all([
    periodo ? supabase.rpc("resumen_periodo", { p_periodo: periodo.id }).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("es_soporte", { p_edificio: ed }),
    supabase.rpc("intervenciones_soporte", { p_edificio: ed }),
  ]);
  const pasos = conf ? pasosDeConfiguracion(conf) : [];
  const hechos = pasos.filter((p) => p.ok).length;
  const metricas: Record<string, string> = {
    gestion: `${actual.departamentos ?? 0} departamentos`,
    finanzas: `${soles(cobranza?.por_cobrar ?? 0)} por cobrar`,
    comunicacion: `${mensajes ?? 0} mensajes en el chat`,
    areas_comunes: `${proximas ?? 0} ${proximas === 1 ? "reserva próxima" : "reservas próximas"}`,
  };

  return (
    <>
      <div className="mb-4">
        <h1>Hola{perfil?.nombre ? `, ${perfil.nombre.split(" ")[0]}` : ""}</h1>
        <p className="mt-1 text-muted">
          {actual.nombre} · entraste como <b className="text-ink">{NOMBRE_NIVEL[nivel]}</b>.
        </p>
      </div>

      {nuevo && (
        <div className="aviso" role="status">
          <b>¡Edificio registrado!</b> Código de acceso para los vecinos: <b>{actual.codigo}</b>. Se cargaron{" "}
          {actual.departamentos} {actual.departamentos === 1 ? "departamento" : "departamentos"}.
        </div>
      )}
      {(intervenciones ?? []).length > 0 && (
        <section className="mb-4 rounded-xl border border-info bg-info-bg px-4 py-3 text-sm text-info" role="status">
          <b>El equipo de EDIFIKA hizo cambios en tu edificio para atender un reclamo:</b>
          <ul className="mt-1 list-disc pl-5">
            {(intervenciones ?? []).map((i) => (
              <li key={i.sesion_id}>
                {fecha(i.fecha.slice(0, 10))} · {i.persona} · {i.motivo} (reclamo: {i.referencia}) · {i.cambios}{" "}
                {i.cambios === 1 ? "cambio" : "cambios"}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">El detalle queda en la auditoría del edificio. Si no reconoces un cambio, escríbenos.</p>
        </section>
      )}
      {(porVencer ?? []).length > 0 && (
        <section className="mb-4 rounded-xl border border-warn bg-warn-bg px-4 py-3 text-sm text-warn" role="status">
          <b>Certificaciones por renovar:</b>{" "}
          {(porVencer ?? []).map((c, i) => (
            <span key={c.id}>
              {i > 0 && " · "}
              {c.nombre} ({c.vence_en! < hoy ? "venció" : "vence"} el {fecha(c.vence_en!)})
            </span>
          ))}
          .{" "}
          <Link href="/configuracion" className="font-bold underline">
            Ver certificaciones
          </Link>
        </section>
      )}
      {nivel === "lectura" && !enSoporte && (
        <p className="hint mb-4">
          Entregaste la titularidad. Durante 15 días puedes ver la información del edificio, pero no hacer cambios.
        </p>
      )}

      <Modulos
        estados={estados ?? []}
        metricas={metricas}
        planes={(planes ?? []) as unknown as Plan[]}
        planActual={edificio?.suscripcion_pagada ? edificio.plan : null}
        esTitular={nivel === "titular" && !enSoporte}
      />

      {pasos.length > 0 && hechos < pasos.length && (
        <section className="panel mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex-1">Termina de configurar tu edificio</h3>
            <span className="text-sm text-muted">
              {hechos} de {pasos.length} pasos
            </span>
          </div>
          <div className="my-2 h-2 overflow-hidden rounded bg-surface2" aria-hidden="true">
            <div className="h-full bg-ok" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
          </div>
          <ul className="mt-3 grid gap-2">
            {pasos.map((p) => (
              <li key={p.titulo} className="flex items-start gap-2">
                <span className={`chip ${p.ok ? "activo" : "warn"}`}>{p.ok ? "Listo" : "Pendiente"}</span>
                <span>
                  <b>{p.titulo}</b>
                  <span className="block text-sm text-muted">{p.detalle}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/configuracion" className="btn quiet mt-3">
            Ir a Configuración
          </Link>
        </section>
      )}

      {periodo && (
        <>
          <h2 className="mt-7 mb-3 capitalize">{mes(periodo.mes)}</h2>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
            <Cifra titulo="Ingresos del mes" valor={soles(r?.ingresos ?? 0)} />
            <Cifra titulo="Gastos del mes" valor={soles(r?.gastos ?? 0)} />
            <Cifra titulo="Monto acumulado" valor={soles(r?.acumulado ?? 0)} clase={Number(r?.acumulado ?? 0) < 0 ? "text-bad" : "text-ok"} />
            <Cifra titulo="Pagos por validar" valor={String(actual.pagos_por_validar ?? 0)} />
          </div>
        </>
      )}
    </>
  );
}

function Cifra({ titulo, valor, clase = "" }: { titulo: string; valor: string; clase?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`font-display text-lg font-bold tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
}

type EstadoConfiguracion = {
  departamentos: number;
  total_declarado: number;
  con_area: number;
  con_medidor: number;
  base_cuota: string | null;
  agua_cuota: string | null;
  monto_fijo: number | null;
  dia_lectura: number | null;
};

const BASES: Record<string, string> = {
  fijo_area: "monto fijo por área",
  fijo_igual: "monto fijo igual para todos",
  gastos: "gastos reales del mes por área",
};

// Onboarding (SPEC sección 7): lo que falta para poder calcular cuotas (RN-02, RN-03, RN-38).
function pasosDeConfiguracion(c: EstadoConfiguracion) {
  const conFijo = c.base_cuota === "fijo_area" || c.base_cuota === "fijo_igual";
  const porConsumo = c.agua_cuota === "consumo";
  const pideArea = c.base_cuota !== "fijo_igual";
  const configurada = !!c.base_cuota && !!c.agua_cuota;

  const pasos = [
    {
      titulo: "Departamentos",
      ok: c.departamentos > 0 && c.departamentos >= c.total_declarado,
      detalle: `${c.departamentos} de ${c.total_declarado} registrados.`,
    },
    {
      titulo: "Configurar la cobranza",
      ok: configurada && (!conFijo || c.monto_fijo !== null),
      detalle: !configurada
        ? "Elige la base de la cuota (monto fijo por área, igual para todos o gastos reales) y si el agua se cobra por consumo o va incluida."
        : conFijo && c.monto_fijo === null
          ? `Base: ${BASES[c.base_cuota!]}. Falta definir el monto fijo mensual.`
          : `Base: ${BASES[c.base_cuota!]} · agua ${porConsumo ? "por consumo" : "incluida"}.`,
    },
  ];
  if (pideArea) {
    pasos.push({
      titulo: "Áreas",
      ok: c.departamentos > 0 && c.con_area === c.departamentos,
      detalle: `${c.con_area} de ${c.departamentos} departamentos con área.`,
    });
  }
  if (porConsumo) {
    pasos.push({
      titulo: "Medidores de agua",
      ok: c.departamentos > 0 && c.con_medidor === c.departamentos && c.dia_lectura !== null,
      detalle: `${c.con_medidor} de ${c.departamentos} departamentos con medidor${c.dia_lectura ? ` · lectura el día ${c.dia_lectura}` : " · falta el día de lectura"}.`,
    });
  }
  return pasos;
}
