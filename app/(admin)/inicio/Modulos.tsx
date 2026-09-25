"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { activarPrueba, solicitarPlan } from "@/lib/acciones-comercial";
import { fecha } from "@/lib/format";
import { ICONO_CANDADO, MODULOS, precioPlan, type Modulo, type Plan } from "@/lib/modulos";

export type EstadoModulo = { modulo: string; estado: string; prueba_hasta: string | null; dias_prueba: number | null; prueba_usada: boolean };

type Props = {
  estados: EstadoModulo[];
  metricas: Record<string, string>;
  planes: Plan[];
  planActual: string | null; // null: sin plan pagado
  esTitular: boolean;
};

// Tarjetas de módulos (prototipo VIEWS.inicio): activos a color, bloqueados en gris con su ficha.
export function Modulos({ estados, metricas, planes, planActual, esTitular }: Props) {
  const [ficha, setFicha] = useState<Modulo | null>(null);
  const [verPlanes, setVerPlanes] = useState(false);
  const [solicitar, setSolicitar] = useState<Plan | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const estadoDe = (m: Modulo) => (m.base ? { estado: "activo" } : (estados.find((e) => e.modulo === m.id) ?? { estado: "bloqueado" })) as EstadoModulo;

  function probar(m: Modulo) {
    if (!confirm(`¿Activar la prueba gratis de ${m.titulo} por 14 días? Solo se puede probar una vez.`)) return;
    iniciar(async () => {
      const r = await activarPrueba(m.id);
      setAviso(r);
      if (r.ok) {
        setFicha(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="flex-1 text-muted">
          {planActual ? `Plan ${planes.find((p) => p.id === planActual)?.nombre ?? planActual}` : "Sin plan contratado"} ·{" "}
          {MODULOS.filter((m) => estadoDe(m).estado !== "bloqueado").length} de {MODULOS.length} módulos activos
        </p>
        <button className="btn quiet" onClick={() => setVerPlanes(true)}>
          Ver planes
        </button>
      </div>
      {aviso && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} role="status">
          {aviso.mensaje}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODULOS.map((m) => {
          const e = estadoDe(m);
          const bloqueado = e.estado === "bloqueado";
          const abrir = !bloqueado && m.href;
          const contenido = (
            <>
              {e.estado === "prueba" && <span className="chip info absolute top-4 right-4">Prueba: {e.dias_prueba} días</span>}
              {bloqueado && <span className="chip tag absolute top-4 right-4">{m.disponible ? "Prueba gratis" : "Próximamente"}</span>}
              <span
                className="mb-1 grid size-11 place-items-center rounded-xl text-white"
                style={{ background: bloqueado ? "var(--muted)" : m.color }}
                aria-hidden="true"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={bloqueado ? ICONO_CANDADO : m.icono} />
                </svg>
              </span>
              <h3 className="text-lg">{m.titulo}</h3>
              <p className="text-sm text-muted">{m.descripcion}</p>
              <p className="text-sm font-bold tabular-nums">
                {bloqueado ? `Incluido en el plan ${planes.find((p) => p.id === m.plan)?.nombre ?? ""}` : (metricas[m.id] ?? "")}
              </p>
              <span className="mt-auto font-bold" style={{ color: bloqueado ? "var(--muted)" : m.color }}>
                {bloqueado ? (m.disponible ? "Probar 14 días gratis" : "Ver detalles") : m.href ? "Abrir módulo" : "Disponible pronto"}
              </span>
            </>
          );
          const clase = `relative flex min-h-[210px] flex-col gap-2 rounded-2xl border border-line border-t-[6px] p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
            bloqueado ? "bg-surface2" : "bg-surface"
          }`;
          const borde = { borderTopColor: bloqueado ? "var(--line)" : m.color };
          return abrir ? (
            <Link key={m.id} href={m.href!} className={clase} style={borde}>
              {contenido}
            </Link>
          ) : (
            <button key={m.id} type="button" className={clase} style={borde} onClick={() => setFicha(m)} aria-label={`${m.titulo}${bloqueado ? ", bloqueado" : ""}`}>
              {contenido}
            </button>
          );
        })}
      </div>

      {/* Ficha del módulo */}
      <Modal abierto={!!ficha} titulo={ficha?.titulo ?? ""} onCerrar={() => setFicha(null)}>
        {ficha &&
          (() => {
            const plan = planes.find((p) => p.id === ficha.plan);
            const e = estadoDe(ficha);
            return (
              <>
                <p>{ficha.valor}</p>
                {plan && (
                  <div className="mt-3 rounded-xl bg-surface2 p-4">
                    <p className="font-bold">
                      Plan {plan.nombre}: {precioPlan(plan)}
                    </p>
                    <p className="text-sm text-muted">{plan.incluye}</p>
                  </div>
                )}
                {e.estado === "prueba" && e.prueba_hasta && (
                  <p className="hint mt-3">
                    Estás probando este módulo hasta el {fecha(e.prueba_hasta)}. Al terminar la prueba se bloquea si no tienes el plan.
                  </p>
                )}
                {!ficha.disponible && (
                  <p className="hint mt-3">Este módulo se está construyendo. Puedes solicitar el plan y te avisaremos cuando esté listo para probarlo.</p>
                )}
                {e.prueba_usada && e.estado === "bloqueado" && <p className="hint mt-3">Ya usaste la prueba gratis de este módulo.</p>}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button className="btn quiet" onClick={() => setVerPlanes(true)}>
                    Comparar planes
                  </button>
                  {esTitular && plan && (
                    <button className={`btn ${ficha.disponible && !e.prueba_usada ? "quiet" : ""}`} onClick={() => setSolicitar(plan)}>
                      Solicitar plan {plan.nombre}
                    </button>
                  )}
                  {esTitular && ficha.disponible && e.estado === "bloqueado" && !e.prueba_usada && (
                    <button className="btn" onClick={() => probar(ficha)} disabled={pendiente}>
                      Probar gratis 14 días
                    </button>
                  )}
                </div>
                {!esTitular && <p className="mt-3 text-sm text-muted">Las pruebas y los planes los gestiona el administrador titular.</p>}
              </>
            );
          })()}
      </Modal>

      {/* Planes */}
      <Modal abierto={verPlanes} titulo="Planes de EDIFIKA" onCerrar={() => setVerPlanes(false)} amplio>
        <div className="grid gap-3 sm:grid-cols-3">
          {planes.map((p) => (
            <article key={p.id} className={`flex flex-col rounded-xl border p-4 ${p.id === planActual ? "border-brand bg-brand-soft" : "border-line"}`}>
              <h3 className="text-lg">
                {p.nombre}
                {p.id === planActual && <span className="chip activo ml-2">Tu plan</span>}
              </h3>
              <p className="font-display text-2xl font-extrabold">{precioPlan(p)}</p>
              <p className="mt-1 mb-3 flex-1 text-sm text-muted">{p.incluye}</p>
              {esTitular && p.id !== planActual && (
                <button className="btn sm" onClick={() => setSolicitar(p)}>
                  Solicitar plan {p.nombre}
                </button>
              )}
            </article>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">Precios mensuales por edificio. El plan se activa cuando nuestro equipo confirma el pago.</p>
      </Modal>

      <Modal abierto={!!solicitar} titulo={`Solicitar el plan ${solicitar?.nombre ?? ""}`} onCerrar={() => setSolicitar(null)}>
        {solicitar && (
          <FormSolicitud
            plan={solicitar}
            onListo={(r) => {
              setAviso(r);
              if (r.ok) {
                setSolicitar(null);
                setFicha(null);
                setVerPlanes(false);
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

function FormSolicitud({ plan, onListo }: { plan: Plan; onListo: (r: { ok: boolean; mensaje: string }) => void }) {
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await solicitarPlan(plan.id, nota);
          if (r.ok) onListo(r);
          else setError(r.mensaje);
        });
      }}
    >
      <p className="mb-3">
        Plan <b>{plan.nombre}</b>: {precioPlan(plan)}. Nuestro equipo te contactará para coordinar el pago y activarlo.
      </p>
      <label className="mb-1 block text-sm font-semibold" htmlFor="nota-plan">
        Comentario (opcional)
      </label>
      <textarea
        id="nota-plan"
        className="mb-3 w-full rounded-lg border border-line bg-surface2 px-3 py-2"
        rows={3}
        maxLength={500}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Ej. Prefiero que me llamen por la tarde"
      />
      {error && <p className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="flex justify-end">
        <button className="btn" disabled={pendiente}>
          {pendiente ? "Enviando…" : `Solicitar plan ${plan.nombre}`}
        </button>
      </div>
    </form>
  );
}
