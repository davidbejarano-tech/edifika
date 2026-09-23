"use client";

import { useActionState, useState, useTransition } from "react";
import { soles } from "@/lib/format";
import { eliminarRecibo, guardarRecibo, type Resultado } from "./acciones";

type Props = {
  periodo: { id: string; nombre: string; confirmado: boolean };
  recibo: { monto: number; consumo: number } | null;
  sumaLecturas: number;
  conAgua: boolean;
  puede: boolean;
};

const inicial: Resultado = { ok: false, mensaje: null };

export function ReciboAgua({ periodo, recibo, sumaLecturas, conAgua, puede }: Props) {
  const [r, enviar, enviando] = useActionState(guardarRecibo, inicial);
  const [aviso, setAviso] = useState<Resultado>(inicial);
  const [borrando, iniciar] = useTransition();
  const editable = puede && !periodo.confirmado;
  const mensaje = aviso.mensaje ? aviso : r;
  const comun = recibo ? recibo.consumo - sumaLecturas : 0;

  function eliminar() {
    if (!confirm("¿Eliminar el recibo de agua de este mes? También se elimina su gasto “Agua”.")) return;
    iniciar(async () => setAviso(await eliminarRecibo(periodo.id)));
  }

  return (
    <section className="panel">
      <h3 className="mb-1">
        Recibo de agua de <span className="capitalize">{periodo.nombre}</span>
      </h3>
      <p className="mb-3 text-sm text-muted">
        {conAgua
          ? "El recibo se reparte según el % de consumo de cada medidor sobre la suma de todos. Se registra también como gasto “Agua”."
          : "El agua va incluida en la cuota: el recibo se registra como gasto “Agua” del mes."}
      </p>
      {mensaje.mensaje && (
        <p className={mensaje.ok ? "aviso" : "err"} role={mensaje.ok ? "status" : "alert"}>
          {mensaje.mensaje}
        </p>
      )}

      {editable ? (
        <form action={(f) => (setAviso(inicial), enviar(f))}>
          <input type="hidden" name="periodo_id" value={periodo.id} />
          <div className="grid gap-x-4 sm:grid-cols-3">
            <div className="field">
              <label htmlFor="ra-m">Monto del recibo (S/)</label>
              <input id="ra-m" name="monto" type="number" step="0.01" min="0.01" defaultValue={recibo?.monto ?? ""} required />
            </div>
            <div className="field">
              <label htmlFor="ra-c">Consumo del medidor general (m³)</label>
              <input id="ra-c" name="consumo" type="number" step="0.01" min="0.01" defaultValue={recibo?.consumo ?? ""} required />
            </div>
            <div className="flex items-end gap-2 pb-[0.85rem]">
              <button className="btn" disabled={enviando}>
                {enviando ? "Guardando…" : recibo ? "Actualizar recibo" : "Guardar recibo"}
              </button>
              {recibo && (
                <button type="button" className="btn danger" onClick={eliminar} disabled={borrando}>
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </form>
      ) : recibo ? (
        <p>
          Recibo: <b>{soles(recibo.monto)}</b> por <b>{recibo.consumo.toLocaleString("en-US")} m³</b>.
        </p>
      ) : (
        <p className="text-sm text-muted">Sin recibo registrado.</p>
      )}

      {conAgua && recibo && (
        <p className="mt-2 text-sm">
          Medidores de los departamentos: <b>{sumaLecturas.toLocaleString("en-US")} m³</b>
          {sumaLecturas > 0 ? (
            comun >= 0 ? (
              <>
                {" · "}agua común (riego, limpieza, áreas comunes): <b>{comun.toLocaleString("en-US")} m³</b>, incluida en el
                reparto según el consumo de cada uno.
              </>
            ) : (
              <span className="text-bad"> · la suma de los medidores supera el consumo del recibo: revisa las lecturas.</span>
            )
          ) : (
            <span className="text-muted"> · aún sin lecturas: el recibo se repartiría por área.</span>
          )}
        </p>
      )}
      {periodo.confirmado && <p className="hint mt-3">Los gastos de este mes están confirmados: el recibo no se puede cambiar.</p>}
    </section>
  );
}
