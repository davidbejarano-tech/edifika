"use client";

import { useState, useTransition } from "react";
import { guardarLecturas, type Resultado } from "./acciones";

type Fila = { medidor_id: string; numero: string; numero_serie: string; anterior: number; lectura: number | null; m3: number | null };
type Props = {
  periodo: { id: string; nombre: string; confirmado: boolean };
  filas: Fila[];
  fechaInicial: string;
  puede: boolean;
};

const n = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 3 });

export function HojaLecturas({ periodo, filas, fechaInicial, puede }: Props) {
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(filas.map((f) => [f.medidor_id, f.lectura === null ? "" : String(f.lectura)])),
  );
  const [fecha, setFecha] = useState(fechaInicial);
  const [aviso, setAviso] = useState<Resultado>({ ok: false, mensaje: null });
  const [enviando, iniciar] = useTransition();
  const editable = puede && !periodo.confirmado;

  // m³ en vivo mientras se escribe (solo para mostrar; la base los recalcula al guardar)
  const consumo = (f: Fila) => {
    const t = (valores[f.medidor_id] ?? "").replace(",", ".");
    if (t === "") return null;
    const v = Number(t);
    return Number.isFinite(v) ? v - f.anterior : NaN;
  };
  const filasConDato = filas.filter((f) => consumo(f) !== null);
  const errores = filasConDato.filter((f) => !(consumo(f)! >= 0));
  const total = filasConDato.reduce((s, f) => s + Math.max(0, consumo(f) ?? 0), 0);

  function guardar() {
    setAviso({ ok: false, mensaje: null });
    iniciar(async () =>
      setAviso(
        await guardarLecturas(
          periodo.id,
          fecha,
          filasConDato.map((f) => ({ medidor_id: f.medidor_id, lectura: Number(valores[f.medidor_id].replace(",", ".")) })),
        ),
      ),
    );
  }

  return (
    <section className="panel">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h3 className="flex-1 capitalize">{periodo.nombre}</h3>
        {periodo.confirmado && <span className="chip activo">Gastos confirmados: lecturas bloqueadas</span>}
        {editable && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Fecha de lectura
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-ink"
            />
          </label>
        )}
      </div>

      {aviso.mensaje && (
        <p className={aviso.ok ? "aviso" : "err"} role={aviso.ok ? "status" : "alert"}>
          {aviso.mensaje}
        </p>
      )}

      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Depto</th>
              <th>Medidor</th>
              <th className="r">Lectura anterior</th>
              <th className="r">Lectura actual</th>
              <th className="r">m³ del mes</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const c = consumo(f);
              const mal = c !== null && !(c >= 0);
              return (
                <tr key={f.medidor_id} className={mal ? "mal" : ""}>
                  <td>{f.numero}</td>
                  <td className="font-mono text-sm">{f.numero_serie}</td>
                  <td className="r">{n(f.anterior)}</td>
                  <td className="r">
                    {editable ? (
                      <input
                        className="w-28 rounded-md border border-line bg-surface px-2 py-1 text-right tabular-nums"
                        type="number"
                        min={f.anterior}
                        step="any"
                        inputMode="decimal"
                        value={valores[f.medidor_id] ?? ""}
                        onChange={(e) => setValores((x) => ({ ...x, [f.medidor_id]: e.target.value }))}
                        aria-label={`Lectura actual del medidor ${f.numero_serie}, departamento ${f.numero}`}
                      />
                    ) : f.lectura === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      n(f.lectura)
                    )}
                  </td>
                  <td className="r font-semibold">
                    {mal ? <span className="text-bad">Menor que la anterior</span> : c === null ? "—" : n(c)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={4}>
                {filasConDato.length} de {filas.length} medidores leídos
              </td>
              <td className="r">{n(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {errores.length > 0 && (
            <p className="text-sm text-bad">
              {errores.length} {errores.length === 1 ? "lectura es menor" : "lecturas son menores"} que la anterior.
            </p>
          )}
          <button className="btn" onClick={guardar} disabled={enviando || !filasConDato.length || errores.length > 0}>
            {enviando ? "Guardando…" : "Guardar lecturas"}
          </button>
        </div>
      )}
      {!puede && <p className="mt-3 text-sm text-muted">Solo la administración registra lecturas.</p>}
    </section>
  );
}
