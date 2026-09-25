"use client";

import { useState, useTransition } from "react";
import { fecha } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import { asignarPlan, atenderSolicitud, type Resultado } from "../acciones";

type Solicitud = Database["public"]["Functions"]["plataforma_solicitudes"]["Returns"][number];
const ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "warn" },
  atendida: { texto: "Atendida", clase: "activo" },
  cancelada: { texto: "Cancelada", clase: "tag" },
};

export function Solicitudes({ solicitudes }: { solicitudes: Solicitud[] }) {
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [pendiente, iniciar] = useTransition();
  const hacer = (f: () => Promise<Resultado>) => iniciar(async () => setAviso(await f()));

  if (solicitudes.length === 0) return <p className="hint">Todavía no hay solicitudes.</p>;
  return (
    <>
      {aviso && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} role="status">
          {aviso.mensaje}
        </p>
      )}
      <div className="grid gap-3">
        {solicitudes.map((s) => {
          const e = ESTADO[s.estado] ?? ESTADO.cancelada;
          return (
            <article key={s.solicitud_id} className="panel mb-0 flex flex-wrap items-center gap-4">
              <div className="min-w-[240px] flex-1">
                <p className="text-sm text-muted">
                  {fecha(s.creada.slice(0, 10))} · {s.departamentos} departamentos
                </p>
                <p className="font-semibold">
                  {s.edificio} <span className="font-normal text-muted">({s.codigo})</span> · plan <b className="capitalize">{s.plan}</b>
                </p>
                <p className="text-sm">
                  {s.solicitante ?? "—"} · <a href={`mailto:${s.correo}`} className="text-brand">{s.correo}</a>
                </p>
                {s.nota && <p className="text-sm text-muted">“{s.nota}”</p>}
                {!s.avisado && <p className="text-xs text-warn">El aviso por correo no se pudo enviar.</p>}
              </div>
              <span className={`chip ${e.clase}`}>{e.texto}</span>
              {s.estado === "pendiente" ? (
                <div className="flex flex-wrap gap-2">
                  <button className="btn quiet sm" disabled={pendiente} onClick={() => hacer(() => atenderSolicitud(s.solicitud_id, "cancelada"))}>
                    Cancelar
                  </button>
                  <button
                    className="btn sm"
                    disabled={pendiente}
                    onClick={() => {
                      if (confirm(`¿Activar el plan ${s.plan} en ${s.edificio}? Hazlo cuando el pago esté confirmado.`))
                        hacer(() => asignarPlan(s.edificio_id, s.plan));
                    }}
                  >
                    Activar plan {s.plan}
                  </button>
                </div>
              ) : (
                <button className="btn quiet sm" disabled={pendiente} onClick={() => hacer(() => atenderSolicitud(s.solicitud_id, "pendiente"))}>
                  Reabrir
                </button>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
