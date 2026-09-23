"use client";

import { usePathname, useRouter } from "next/navigation";
import { mes } from "@/lib/format";

type Props = { periodos: { id: string; mes: string; estado: string }[]; actual: string; etiqueta?: string };

// Cambia el periodo de la pantalla con ?p=<id>
export function SelectorPeriodo({ periodos, actual, etiqueta = "Periodo" }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      {etiqueta}
      <select
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-ink capitalize"
        value={actual}
        onChange={(e) => router.push(`${ruta}?p=${e.target.value}`)}
      >
        {periodos.map((p) => (
          <option key={p.id} value={p.id}>
            {mes(p.mes)}
            {p.estado === "abierto" ? " (abierto)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
