"use client";

import { useActionState, useEffect, useRef } from "react";
import { CampoClave } from "@/components/CampoClave";
import { cambiarClave, type Resultado } from "./acciones";

export function FormClave() {
  const [r, enviar, enviando] = useActionState<Resultado, FormData>(cambiarClave, { ok: false, mensaje: null });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (r.ok) form.current?.reset();
  }, [r]);
  return (
    <form action={enviar} ref={form} className="max-w-[380px]">
      {r.mensaje && (
        <p className={r.ok ? "aviso" : "err"} role={r.ok ? "status" : "alert"}>
          {r.mensaje}
        </p>
      )}
      <div className="field">
        <label htmlFor="pc-a">Contraseña actual</label>
        <CampoClave id="pc-a" name="actual" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="pc-n">Nueva contraseña (mínimo 8 caracteres)</label>
        <CampoClave id="pc-n" name="nueva" minLength={8} autoComplete="new-password" required />
      </div>
      <div className="field">
        <label htmlFor="pc-r">Repite la nueva contraseña</label>
        <CampoClave id="pc-r" name="repite" minLength={8} autoComplete="new-password" required />
      </div>
      <button className="btn" disabled={enviando}>
        {enviando ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
