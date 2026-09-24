"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Herramienta de desarrollo: solo se muestra con `npm run dev` (ver app/dev/corte/route.ts)
export function CorteDesarrollo() {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  return (
    <details className="mt-6 rounded-lg border border-dashed border-line p-3 text-sm">
      <summary className="cursor-pointer text-muted">Herramientas de desarrollo</summary>
      <p className="my-2 text-muted">
        Ejecuta ahora el corte diario (marca como vencidas las cuotas impagas y emite la mora). En producción lo hace la base a
        las 00:10 de Lima.
      </p>
      <button
        className="btn quiet sm"
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            const r = await fetch("/dev/corte", { method: "POST" });
            const cuerpo = (await r.json().catch(() => ({}))) as { mensaje?: string; error?: string };
            setMensaje(cuerpo.mensaje ?? cuerpo.error ?? "No se pudo ejecutar.");
            router.refresh();
          })
        }
      >
        {enviando ? "Ejecutando…" : "Ejecutar corte diario ahora"}
      </button>
      {mensaje && <p className="mt-2">{mensaje}</p>}
    </details>
  );
}
