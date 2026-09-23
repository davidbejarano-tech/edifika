"use client";

import { useActionState } from "react";
import { transferenciaForzada, type Resultado } from "./acciones";

export function FormTransferenciaForzada() {
  const [r, enviar, enviando] = useActionState<Resultado, FormData>(transferenciaForzada, { ok: false, mensaje: null });
  return (
    <form action={enviar}>
      {r.mensaje && (
        <p className={r.ok ? "aviso" : "err"} role={r.ok ? "status" : "alert"}>
          {r.mensaje}
        </p>
      )}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="tf-c">Código del edificio</label>
          <input id="tf-c" name="codigo" required />
        </div>
        <div className="field">
          <label htmlFor="tf-n">Nombre del nuevo titular</label>
          <input id="tf-n" name="nombre" required minLength={3} />
        </div>
        <div className="field">
          <label htmlFor="tf-e">Correo del nuevo titular</label>
          <input id="tf-e" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="tf-a">Acta de la junta (PDF, JPG o PNG, máx. 10 MB)</label>
          <input id="tf-a" name="acta" type="file" accept="application/pdf,image/jpeg,image/png" required />
        </div>
        <div className="field">
          <label htmlFor="tf-k">Confirma repitiendo el código del edificio</label>
          <input id="tf-k" name="confirmacion" autoComplete="off" required />
        </div>
      </div>
      <div className="flex justify-end">
        <button className="btn danger" disabled={enviando}>
          {enviando ? "Transfiriendo…" : "Hacer la transferencia forzada"}
        </button>
      </div>
    </form>
  );
}
