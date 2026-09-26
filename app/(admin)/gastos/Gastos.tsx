"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { fecha, soles } from "@/lib/format";
import { FRECUENCIAS, nombreFrecuencia } from "@/lib/gastos";
import { confirmarGastos, eliminarGasto, registrarGasto, type Resultado } from "./acciones";

type Gasto = { id: string; tipo: string; categoria: string; descripcion: string; monto: number; fecha: string; origen: string; frecuencia_meses: number };
type Props = {
  periodo: { id: string; nombre: string; mes: string; confirmado: boolean };
  gastos: Gasto[];
  categorias: string[];
  puedeRegistrar: boolean;
  esTitular: boolean;
};

const inicial: Resultado = { ok: false, mensaje: null };
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const ultimoDia = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
};

export function Gastos({ periodo, gastos, categorias, puedeRegistrar, esTitular }: Props) {
  const [aviso, setAviso] = useState<Resultado>(inicial);
  const [pendiente, iniciar] = useTransition();
  const [r, enviar, enviando] = useActionState(registrarGasto, inicial);
  const form = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState("extraordinario");
  const editable = puedeRegistrar && !periodo.confirmado;
  const total = gastos.reduce((s, g) => s + g.monto, 0);

  // Tras registrar, se limpia el formulario y se muestra el aviso
  useEffect(() => {
    if (r.mensaje) setAviso(r);
    if (r.ok) {
      form.current?.reset();
      setTipo("extraordinario");
    }
  }, [r]);

  function eliminar(g: Gasto) {
    if (!confirm(`¿Eliminar "${g.descripcion}" por ${soles(g.monto)}?`)) return;
    iniciar(async () => setAviso(await eliminarGasto(g.id)));
  }

  function confirmar() {
    if (!confirm(`¿Confirmar los gastos de ${periodo.nombre}? Ya no se podrán cambiar los gastos, el agua ni las lecturas del mes.`)) return;
    iniciar(async () => setAviso(await confirmarGastos(periodo.id)));
  }

  const hoy = hoyLima();
  const fechaInicial = hoy.slice(0, 7) === periodo.mes.slice(0, 7) ? hoy : periodo.mes;

  const seccion = (tipo: string, titulo: string) => {
    const lista = gastos.filter((g) => g.tipo === tipo);
    const conFrecuencia = tipo === "recurrente";
    return (
      <>
        <h3 className="mt-4 mb-2">{titulo}</h3>
        {lista.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Detalle</th>
                  {conFrecuencia && <th>Frecuencia</th>}
                  <th className="r">Monto</th>
                  {editable && <th></th>}
                </tr>
              </thead>
              <tbody>
                {lista.map((g) => (
                  <tr key={g.id}>
                    <td className="whitespace-nowrap">{fecha(g.fecha)}</td>
                    <td>{g.categoria}</td>
                    <td>{g.descripcion}</td>
                    {conFrecuencia && <td>{nombreFrecuencia(g.frecuencia_meses)}</td>}
                    <td className="r">{soles(g.monto)}</td>
                    {editable && (
                      <td className="r">
                        {g.origen === "agua" ? (
                          <span className="text-xs text-muted">Se edita en Cálculo</span>
                        ) : (
                          <button className="btn danger sm" onClick={() => eliminar(g)} disabled={pendiente}>
                            Eliminar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={conFrecuencia ? 4 : 3}>Subtotal</td>
                  <td className="r">{soles(lista.reduce((s, g) => s + g.monto, 0))}</td>
                  {editable && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Sin registros.</p>
        )}
      </>
    );
  };

  return (
    <>
      {aviso.mensaje && (
        <p className={aviso.ok ? "aviso" : "err"} role={aviso.ok ? "status" : "alert"}>
          {aviso.mensaje}
        </p>
      )}

      <section className="panel">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="capitalize">{periodo.nombre}</h3>
          <span className={`chip ${periodo.confirmado ? "activo" : "warn"}`}>{periodo.confirmado ? "Confirmado" : "Sin confirmar"}</span>
          <div className="flex-1" />
          <b className="tabular-nums">Total {soles(total)}</b>
        </div>
        {seccion("recurrente", "Recurrentes")}
        {seccion("extraordinario", "Extraordinarios")}
        {!periodo.confirmado && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {esTitular ? (
              <button className="btn" onClick={confirmar} disabled={pendiente}>
                Confirmar gastos de {periodo.nombre.split(" ")[0]}
              </button>
            ) : (
              <p className="text-sm text-muted">Solo el administrador titular confirma los gastos.</p>
            )}
          </div>
        )}
        {periodo.confirmado && (
          <p className="hint mt-4">Los gastos de {periodo.nombre} están confirmados: ya no se pueden agregar, cambiar ni eliminar.</p>
        )}
      </section>

      {editable && (
        <section className="panel">
          <h3 className="mb-3">Registrar gasto</h3>
          <form action={enviar} ref={form}>
            <input type="hidden" name="periodo_id" value={periodo.id} />
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="g-t">Tipo</label>
                <select id="g-t" name="tipo" defaultValue="extraordinario" onChange={(e) => setTipo(e.target.value)}>
                  <option value="extraordinario">Extraordinario</option>
                  <option value="recurrente">Recurrente (se repite)</option>
                </select>
              </div>
              {tipo === "recurrente" && (
                <div className="field">
                  <label htmlFor="g-fr">Frecuencia</label>
                  <select id="g-fr" name="frecuencia_meses" required defaultValue="">
                    <option value="" disabled>
                      ¿Cada cuánto se paga?
                    </option>
                    {FRECUENCIAS.map((f) => (
                      <option key={f.meses} value={f.meses}>
                        {f.nombre}
                        {f.meses > 1 ? ` (cada ${f.meses} meses)` : " (cada mes)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="g-c">Categoría</label>
                <input id="g-c" name="categoria" list="categorias" required placeholder="Ej. Reparaciones" />
                <datalist id="categorias">
                  {categorias.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="g-d">Detalle</label>
                <input id="g-d" name="descripcion" required placeholder="Ej. Cambio de luminarias del hall" />
              </div>
              <div className="field">
                <label htmlFor="g-m">Monto (S/)</label>
                <input id="g-m" name="monto" type="number" step="0.01" min="0.01" required />
              </div>
              <div className="field">
                <label htmlFor="g-f">Fecha</label>
                <input
                  id="g-f"
                  name="fecha"
                  type="date"
                  defaultValue={fechaInicial}
                  min={periodo.mes}
                  max={ultimoDia(periodo.mes)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn" disabled={enviando}>
                {enviando ? "Registrando…" : "Registrar gasto"}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
