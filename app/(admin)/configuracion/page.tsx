import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { TablaReparto } from "@/components/TablaReparto";
import { mes } from "@/lib/format";
import { FormCobranza, FormDatos, FormPago } from "./Formularios";

export default async function ConfiguracionPage() {
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  const puede = actual.nivel === "titular";

  const [{ data: e }, { data: conf }, { data: periodo }] = await Promise.all([
    supabase.from("edificios").select("*").eq("id", actual.edificio_id).single(),
    supabase.rpc("estado_configuracion", { p_edificio: actual.edificio_id }).single(),
    supabase.from("periodos").select("id, mes").eq("edificio_id", actual.edificio_id).eq("estado", "abierto").maybeSingle(),
  ]);
  if (!e || !conf) redirect("/inicio");

  // Vista previa del reparto con los datos del mes abierto. El cálculo lo hace la base (calcular_cuotas).
  const previa = periodo ? await supabase.rpc("calcular_cuotas", { p_periodo: periodo.id }) : null;
  const filas = previa?.data ?? [];
  const sumaM3 = filas.reduce((s, f) => s + Number(f.m3), 0);
  const areaComun = Number(e.area_comun_m2 ?? 0);
  const conAgua = e.agua_cuota === "consumo";

  return (
    <>
      <div className="mb-5">
        <h1>Configuración del edificio</h1>
        <p className="mt-1 text-muted">Estos datos definen las alícuotas, las cuotas y los recibos.</p>
      </div>

      {!puede && (
        <p className="hint mb-4">Puedes ver la configuración. Solo el administrador titular puede cambiarla.</p>
      )}

      <FormDatos e={e} puede={puede} />

      <section className="panel">
        <h3 className="mb-3">Departamentos</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Medidor
            texto={`${conf.departamentos} de ${conf.total_declarado} departamentos registrados`}
            valor={conf.departamentos}
            max={conf.total_declarado}
          />
          <Medidor texto={`${conf.con_area} de ${conf.departamentos} con área`} valor={conf.con_area} max={conf.departamentos} />
          {conAgua && (
            <Medidor texto={`${conf.con_medidor} de ${conf.departamentos} con medidor`} valor={conf.con_medidor} max={conf.departamentos} />
          )}
        </div>
        <p className="mt-3 text-sm text-muted">
          Áreas registradas: <b className="text-ink">{Number(conf.area_departamentos).toLocaleString("en-US")} m²</b>
          {areaComun > 0 && ` + ${areaComun.toLocaleString("en-US")} m² de áreas comunes`}. Edita áreas y medidores en{" "}
          <Link href="/departamentos" className="font-semibold text-brand">
            Departamentos y ocupantes
          </Link>
          .
        </p>
      </section>

      <FormCobranza e={e} puede={puede} />

      <section className="panel" id="vista-previa">
        <h3 className="mb-1">Vista previa del reparto</h3>
        {!periodo ? (
          <p className="text-muted">No hay un mes abierto.</p>
        ) : previa?.error ? (
          <p className="hint">{previa.error.message}.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              Con los datos de {mes(periodo.mes)}
              {conAgua && (sumaM3 > 0 ? `: ${sumaM3.toLocaleString("en-US")} m³ leídos` : ": aún sin lecturas de agua")}. Así se
              repartiría la cuota del mes siguiente.
            </p>
            <TablaReparto filas={filas} areaComun={areaComun} conAgua={conAgua} />
          </>
        )}
      </section>

      <FormPago e={e} puede={puede} />

      <section className="panel">
        <h3 className="mb-1">Equipo de administración</h3>
        <p className="text-sm text-muted">
          Coadministradores, vecino validador de los pagos del titular y transferencia de la titularidad.{" "}
          <Link href="/equipo" className="font-semibold text-brand">
            Ir a Equipo de administración
          </Link>
        </p>
      </section>

      {puede && (
        <section className="panel">
          <h3 className="mb-1">Datos del edificio</h3>
          <p className="mb-3 text-sm text-muted">
            Descarga una copia en Excel con departamentos y ocupantes, cargos, pagos y gastos. Los edificios sin plan pagado se
            eliminan tras 90 días sin movimiento (avisamos a los 60 y a los 83 días).{" "}
            <Link href="/terminos#depuracion" className="font-semibold text-brand">
              Ver los términos
            </Link>
          </p>
          <a href="/exportar" className="btn quiet">
            Exportar a Excel
          </a>
        </section>
      )}
    </>
  );
}

function Medidor({ texto, valor, max }: { texto: string; valor: number; max: number }) {
  const completo = max > 0 && valor >= max;
  return (
    <div>
      <p className="text-sm">
        <b>{texto}</b>
      </p>
      <div className="mt-1 h-2 overflow-hidden rounded border border-line bg-surface2" aria-hidden="true">
        <div className={`h-full ${completo ? "bg-ok" : "bg-brass"}`} style={{ width: `${max ? Math.min(100, (valor / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}
