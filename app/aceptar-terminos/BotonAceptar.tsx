"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { aceptarTerminos } from "@/lib/acciones-comercial";

export function BotonAceptar() {
  const [marcado, setMarcado] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <>
      <label className="mb-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="mt-1" />
        He leído y acepto los términos y condiciones y la política de privacidad.
      </label>
      {error && <p className="err">{error}</p>}
      <button
        className="btn w-full"
        disabled={!marcado || pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await aceptarTerminos();
            if (r.ok) router.replace("/edificios?vista=auto");
            else setError(r.mensaje);
          })
        }
      >
        Aceptar y continuar
      </button>
    </>
  );
}
