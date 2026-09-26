import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { fecha, soles } from "@/lib/format";
import { Garantias, Reservas, Zonas } from "./Areas";

const PESTANAS = [
  { t: "reservas", texto: "Reservas" },
  { t: "zonas", texto: "Zonas" },
  { t: "garantias", texto: "Garantías" },
];

// Áreas comunes · administración (RN-30 a RN-37): reservas, zonas y garantías
export default async function AreasPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "reservas" } = await searchParams;
  const { supabase, actual } = await obtenerContexto();
  if (!actual?.nivel) redirect("/edificios");
  const ed = actual.edificio_id;

  const [{ data: modulos }, { data: zonas }, { data: bloqueos }, { data: reservas }, { data: custodia }] = await Promise.all([
    supabase.rpc("estado_modulos", { p_edificio: ed }),
    supabase.from("zonas_comunes").select("*").eq("edificio_id", ed).order("created_at"),
    supabase.from("bloqueos_zona").select("id, zona_id, desde, hasta, motivo, zonas_comunes!inner(edificio_id)").eq("zonas_comunes.edificio_id", ed).gte("hasta", new Date().toISOString()).order("desde"),
    supabase.rpc("reservas_admin", { p_edificio: ed }),
    supabase.rpc("garantias_en_custodia", { p_edificio: ed }).maybeSingle(),
  ]);
  const modulo = (modulos ?? []).find((m) => m.modulo === "areas_comunes");
  const esTitular = actual.nivel === "titular";

  return (
    <>
      <div className="mb-4">
        <h1>Áreas comunes</h1>
        <p className="mt-1 text-muted">Configura las zonas y gestiona las reservas del edificio.</p>
      </div>

      {modulo?.estado === "prueba" && modulo.prueba_hasta && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line border-l-[5px] border-l-[#C77D12] bg-surface px-4 py-3 text-sm">
          <span className="flex-1">
            <b>Prueba gratis:</b> {modulo.dias_prueba} {modulo.dias_prueba === 1 ? "día" : "días"} restantes (hasta el {fecha(modulo.prueba_hasta)}).
            Después, las reservas nuevas requieren el plan Pro.
          </span>
          <Link href="/inicio" className="btn sm">
            Ver planes
          </Link>
        </div>
      )}
      {modulo?.estado === "bloqueado" && (
        <p className="mb-4 rounded-xl border border-warn bg-warn-bg px-4 py-3 text-sm text-warn">
          El módulo no está activo: los vecinos no pueden hacer reservas nuevas. Las reservas ya confirmadas se respetan y puedes seguir
          cerrándolas. {esTitular && <Link href="/inicio" className="font-bold underline">Actívalo desde Inicio</Link>}
        </p>
      )}

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Secciones de áreas comunes">
        {PESTANAS.map((p) => (
          <Link
            key={p.t}
            href={`/areas?t=${p.t}`}
            aria-current={t === p.t ? "page" : undefined}
            className={`border-b-[3px] px-3 py-2 font-semibold whitespace-nowrap ${
              t === p.t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {p.texto}
            {p.t === "reservas" && (reservas ?? []).some((r) => r.estado === "solicitada" && r.puede_gestionar) && (
              <span className="ml-1.5 rounded-full bg-bad px-1.5 text-xs font-bold text-white">
                {(reservas ?? []).filter((r) => r.estado === "solicitada" && r.puede_gestionar).length}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {t === "reservas" && <Reservas reservas={reservas ?? []} />}
      {t === "zonas" && (
        <Zonas
          zonas={zonas ?? []}
          bloqueos={(bloqueos ?? []).map((b) => ({ id: b.id, zona_id: b.zona_id, desde: b.desde, hasta: b.hasta, motivo: b.motivo }))}
          esTitular={esTitular}
          puedeBloquear={actual.nivel !== "lectura"}
        />
      )}
      {t === "garantias" && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            <Cifra titulo="En custodia" valor={soles(custodia?.en_custodia ?? 0)} />
            <Cifra titulo="Por devolver" valor={soles(custodia?.por_devolver ?? 0)} />
            <Cifra
              titulo="Retenido por daños (ingreso)"
              valor={soles((reservas ?? []).filter((r) => r.garantia_estado === "retenida").reduce((s, r) => s + Number(r.garantia_retenida), 0))}
            />
          </div>
          <p className="hint mb-4">
            La garantía es dinero de los vecinos: no se suma al saldo del edificio. Solo la parte retenida por daños pasa a ser ingreso, en
            el mes en que se retiene.
          </p>
          <Garantias reservas={reservas ?? []} />
        </>
      )}
    </>
  );
}

function Cifra({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="font-display text-lg font-bold tabular-nums">{valor}</p>
    </div>
  );
}
