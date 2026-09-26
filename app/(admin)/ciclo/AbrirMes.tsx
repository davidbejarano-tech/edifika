"use client";

import { useState, useTransition } from "react";
import { soles } from "@/lib/format";
import { FRECUENCIAS } from "@/lib/gastos";
import { abrirMes, confirmarGastos, type Resultado } from "./acciones";

type Recurrente = { categoria: string; descripcion: string; monto: number; frecuencia_meses: number };

export function BotonConfirmar({ periodoId, nombre }: { periodoId: string; nombre: string }) {
  const [r, setR] = useState<Resultado | null>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        className="btn sm"
        disabled={enviando}
        onClick={() => {
          if (!confirm(`¿Confirmar los gastos de ${nombre}? Ya no se podrán cambiar los gastos, el agua ni las lecturas del mes.`)) return;
          iniciar(async () => setR(await confirmarGastos(periodoId)));
        }}
      >
        {enviando ? "Confirmando…" : "Confirmar"}
      </button>
      {r && !r.ok && <span className="text-xs text-bad">{r.mensaje}</span>}
    </span>
  );
}

type Props = {
  nombre: string;
  nombreSiguiente: string;
  confirmado: boolean;
  esTitular: boolean;
  errorCalculo: string | null;
  recurrentes: Recurrente[];
  noTocan: { concepto: string; frecuencia: string; proximo: string }[];
  cuotas: { numero: string; total: number }[];
};

const SUGERIDOS = ["Energía eléctrica", "Internet y cámaras", "Sueldos", "Mantenimiento de ascensor"];

export function AbrirMes({ nombre, nombreSiguiente, confirmado, esTitular, errorCalculo, recurrentes, noTocan, cuotas }: Props) {
  const inicial: (Recurrente & { clave: number })[] = (
    recurrentes.length ? recurrentes : SUGERIDOS.map((c) => ({ categoria: c, descripcion: c, monto: 0, frecuencia_meses: 1 }))
  ).map((r, i) => ({ ...r, clave: i }));
  const [filas, setFilas] = useState(inicial);
  const [aviso, setAviso] = useState<Resultado>({ ok: false, mensaje: null });
  const [enviando, iniciar] = useTransition();
  const mesCorto = nombreSiguiente.split(" ")[0];
  const puedeAbrir = esTitular && confirmado && !errorCalculo;
  const totalCuotas = cuotas.reduce((s, c) => s + c.total, 0);

  const cambiar = (clave: number, campo: keyof Recurrente, valor: string) =>
    setFilas((xs) => xs.map((x) => (x.clave === clave ? { ...x, [campo]: campo === "monto" || campo === "frecuencia_meses" ? Number(valor) : valor } : x)));

  function abrir() {
    if (!confirm(`¿Abrir ${nombreSiguiente}? Se cerrará ${nombre} y se emitirán ${cuotas.length} cuotas por ${soles(totalCuotas)}.`)) return;
    iniciar(async () =>
      setAviso(
        await abrirMes(filas.map(({ categoria, descripcion, monto, frecuencia_meses }) => ({ categoria, descripcion: descripcion || categoria, monto, frecuencia_meses }))),
      ),
    );
  }

  return (
    <section className="panel">
      <h3 className="mb-1">Abrir {nombreSiguiente}</h3>
      <p className="mb-3 text-sm text-muted">
        Cierra {nombre}, emite a cada departamento la cuota calculada con los datos de {nombre} y registra los gastos
        recurrentes de {nombreSiguiente}. El recibo de agua y las lecturas del nuevo mes se registran cuando lleguen.
      </p>

      {aviso.mensaje && (
        <p className={aviso.ok ? "aviso" : "err"} role={aviso.ok ? "status" : "alert"}>
          {aviso.mensaje}
        </p>
      )}
      {!esTitular && <p className="hint mb-3">Solo el administrador titular abre el mes.</p>}
      {esTitular && !confirmado && <p className="hint mb-3">Primero confirma los gastos de {nombre}.</p>}
      {esTitular && confirmado && errorCalculo && <p className="hint mb-3">{errorCalculo}.</p>}

      <p className="mb-2 text-sm font-semibold text-muted">Gastos recurrentes de {nombreSiguiente}</p>
      <div className="grid gap-2">
        {filas.map((f) => (
          <div key={f.clave} className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2 sm:grid-cols-[1fr_9rem_8rem_auto]">
            <div className="field mb-0">
              <label htmlFor={`rc-c-${f.clave}`} className="sr-only">
                Concepto
              </label>
              <input
                id={`rc-c-${f.clave}`}
                value={f.categoria}
                onChange={(e) => cambiar(f.clave, "categoria", e.target.value)}
                placeholder="Concepto"
                disabled={!puedeAbrir}
              />
            </div>
            <div className="field order-last col-span-2 mb-0 sm:order-none sm:col-span-1">
              <label htmlFor={`rc-f-${f.clave}`} className="sr-only">
                Frecuencia de {f.categoria}
              </label>
              <select
                id={`rc-f-${f.clave}`}
                value={f.frecuencia_meses}
                onChange={(e) => cambiar(f.clave, "frecuencia_meses", e.target.value)}
                disabled={!puedeAbrir}
              >
                {FRECUENCIAS.map((fr) => (
                  <option key={fr.meses} value={fr.meses}>
                    {fr.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field mb-0">
              <label htmlFor={`rc-m-${f.clave}`} className="sr-only">
                Monto de {f.categoria}
              </label>
              <input
                id={`rc-m-${f.clave}`}
                type="number"
                min={0}
                step="0.01"
                value={f.monto || ""}
                onChange={(e) => cambiar(f.clave, "monto", e.target.value)}
                placeholder="S/"
                className="text-right"
                disabled={!puedeAbrir}
              />
            </div>
            <button
              type="button"
              className="btn quiet sm mb-1"
              onClick={() => setFilas((xs) => xs.filter((x) => x.clave !== f.clave))}
              disabled={!puedeAbrir}
              aria-label={`Quitar ${f.categoria}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn ghost sm mt-2"
        onClick={() => setFilas((xs) => [...xs, { categoria: "", descripcion: "", monto: 0, frecuencia_meses: 1, clave: Date.now() }])}
        disabled={!puedeAbrir}
      >
        + Agregar concepto
      </button>
      <p className="mt-1 text-xs text-muted">Los conceptos sin monto no se registran.</p>
      {noTocan.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          No tocan en {mesCorto}:{" "}
          {noTocan.map((n, i) => (
            <span key={n.concepto}>
              {i > 0 && "; "}
              {n.concepto} ({n.frecuencia}, próximo en {n.proximo})
            </span>
          ))}
          .
        </p>
      )}

      {cuotas.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm">
            Ver las {cuotas.length} cuotas que se emitirán ({soles(totalCuotas)})
          </summary>
          <div className="tbl mt-2">
            <table>
              <thead>
                <tr>
                  <th>Depto</th>
                  <th className="r">Cuota de {mesCorto}</th>
                </tr>
              </thead>
              <tbody>
                {cuotas.map((c) => (
                  <tr key={c.numero}>
                    <td>{c.numero}</td>
                    <td className="r">{soles(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="mt-4 flex justify-end">
        <button className="btn" onClick={abrir} disabled={!puedeAbrir || enviando}>
          {enviando ? "Abriendo…" : `Abrir ${mesCorto} y emitir cuotas`}
        </button>
      </div>
    </section>
  );
}
