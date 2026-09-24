"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { fecha, soles } from "@/lib/format";
import { cuentaCorriente, type Movimiento } from "./acciones";

type Depto = { departamento_id: string; numero: string; piso: number; responsable: string | null; deuda: number; vencido: number; estado: string };

const ETIQUETA: Record<string, string> = { aldia: "Al día", pendiente: "Pendiente", revision: "Pago en revisión", vencido: "Vencido" };
const LEYENDA = [
  { e: "aldia", c: "var(--ok-bg)" },
  { e: "pendiente", c: "var(--warn-bg)" },
  { e: "revision", c: "var(--info-bg)" },
  { e: "vencido", c: "var(--bad-bg)" },
];
const ESTADO_MOV: Record<string, string> = {
  pendiente: "Pendiente",
  vencido: "Vencido",
  en_revision: "En revisión",
  pagado: "Pagado",
  anulado: "Anulado",
  validado: "",
};

// "Rosa Huamán Quispe" → "Rosa H."
const corto = (n: string | null) => {
  if (!n) return "";
  const [a, b] = n.split(" ");
  return b ? `${a} ${b[0]}.` : a;
};

export function Fachada({ nombre, deptos }: { nombre: string; deptos: Depto[] }) {
  const [elegido, setElegido] = useState<Depto | null>(null);
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, iniciar] = useTransition();

  const pisos = [...new Set(deptos.map((d) => d.piso))].sort((a, b) => b - a);
  const columnas = Math.max(1, ...pisos.map((p) => deptos.filter((d) => d.piso === p).length));

  function abrir(d: Depto) {
    setElegido(d);
    setMovs(null);
    setError(null);
    iniciar(async () => {
      const r = await cuentaCorriente(d.departamento_id);
      setMovs(r.movimientos);
      setError(r.error);
    });
  }

  return (
    <>
      <div className="facade" role="group" aria-label={`Fachada de ${nombre}`}>
        <div className="roof">
          <span className="truncate">{nombre}</span>
          <span className="shrink-0">{deptos.length} dptos.</span>
        </div>
        {pisos.map((p) => (
          <div key={p} className="floor" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
            {deptos
              .filter((d) => d.piso === p)
              .map((d) => (
                <button
                  key={d.departamento_id}
                  className={`win s-${d.estado}`}
                  onClick={() => abrir(d)}
                  aria-label={`Departamento ${d.numero}, ${ETIQUETA[d.estado]}${d.deuda > 0 ? `, debe ${soles(d.deuda)}` : ""}`}
                >
                  <b>{d.numero}</b>
                  <span>{corto(d.responsable)}</span>
                  <em>{d.deuda > 0 ? soles(d.deuda) : "Al día"}</em>
                </button>
              ))}
          </div>
        ))}
        <div className="ground">
          <div className="door" />
        </div>
      </div>
      <div className="base" />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {LEYENDA.map((l) => (
          <span key={l.e} className="flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-sm border border-[var(--frame)]" style={{ background: l.c }} />
            {ETIQUETA[l.e]}
          </span>
        ))}
      </div>

      <Modal abierto={!!elegido} titulo={`Departamento ${elegido?.numero ?? ""}`} onCerrar={() => setElegido(null)}>
        {elegido && (
          <>
            <p className="mb-3 text-muted">
              {elegido.responsable ?? "Sin ocupante registrado"} ·{" "}
              <span className={`chip ${elegido.estado === "aldia" ? "activo" : elegido.estado === "vencido" ? "bad" : elegido.estado === "revision" ? "info" : "warn"}`}>
                {ETIQUETA[elegido.estado]}
              </span>
            </p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-surface2 px-3 py-2">
                <p className="text-xs text-muted">Debe</p>
                <p className="font-display text-lg font-bold tabular-nums">{soles(elegido.deuda)}</p>
              </div>
              <div className="rounded-lg bg-surface2 px-3 py-2">
                <p className="text-xs text-muted">Vencido</p>
                <p className={`font-display text-lg font-bold tabular-nums ${elegido.vencido > 0 ? "text-bad" : ""}`}>{soles(elegido.vencido)}</p>
              </div>
            </div>
            <h3 className="mb-2">Cuenta corriente</h3>
            {cargando || !movs ? (
              <p className="text-muted">Cargando…</p>
            ) : error ? (
              <p className="err">{error}</p>
            ) : movs.length === 0 ? (
              <p className="text-sm text-muted">Sin movimientos todavía.</p>
            ) : (
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th className="r">Cargo</th>
                      <th className="r">Abono</th>
                      <th className="r">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map((m, i) => (
                      <tr key={i} className={m.estado === "anulado" ? "text-muted line-through" : ""}>
                        <td className="whitespace-nowrap">{fecha(m.fecha)}</td>
                        <td>
                          {m.concepto}
                          {ESTADO_MOV[m.estado] && <span className="block text-xs text-muted no-underline">{ESTADO_MOV[m.estado]}</span>}
                        </td>
                        <td className="r">{m.cargo ? soles(m.cargo) : ""}</td>
                        <td className="r text-ok">{m.abono ? soles(m.abono) : ""}</td>
                        <td className="r font-semibold">{soles(m.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-right text-sm">
              <Link href={`/cobranza?t=emitidos&d=${elegido.numero}`} className="font-semibold text-brand">
                Ver sus compromisos en Cobranza
              </Link>
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
