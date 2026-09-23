"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; texto: string; listo?: boolean };

// Navegación agrupada del prototipo. Las secciones de etapas futuras se muestran deshabilitadas.
const GRUPOS: { grupo: string | null; items: Item[] }[] = [
  { grupo: null, items: [{ href: "/inicio", texto: "Inicio", listo: true }, { href: "/edificios", texto: "Mis edificios", listo: true }] },
  {
    grupo: "Gestión del edificio",
    items: [
      { href: "/configuracion", texto: "Configuración", listo: true },
      { href: "/departamentos", texto: "Departamentos y ocupantes", listo: true },
      { href: "/equipo", texto: "Equipo de administración", listo: true },
    ],
  },
  {
    grupo: "Finanzas y cuotas",
    items: [
      { href: "/resumen", texto: "Resumen" },
      { href: "/ciclo", texto: "Ciclo mensual", listo: true },
      { href: "/gastos", texto: "Gastos", listo: true },
      { href: "/lecturas", texto: "Lecturas de agua", listo: true },
      { href: "/calculo", texto: "Cálculo mensual", listo: true },
      { href: "/cobranza", texto: "Cobranza" },
      { href: "/estado-cuenta", texto: "Estado de cuenta" },
    ],
  },
  { grupo: "Comunicación", items: [{ href: "/chat", texto: "Chat del edificio" }] },
];

export function MenuAdmin() {
  const ruta = usePathname();
  return (
    <nav
      aria-label="Secciones"
      className="flex gap-1 overflow-x-auto border-b border-line bg-surface2 px-2 py-1.5 md:top-0 md:h-full md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-3 md:py-4"
    >
      {GRUPOS.map((g) => (
        <div key={g.grupo ?? "principal"} className="contents md:block">
          {g.grupo && <p className="hidden px-3 pt-4 pb-1 text-xs font-bold text-muted md:block">{g.grupo}</p>}
          {g.items.map((i) =>
            i.listo ? (
              <Link
                key={i.href}
                href={i.href}
                aria-current={ruta.startsWith(i.href) ? "page" : undefined}
                className={`block shrink-0 rounded-lg px-3 py-2 whitespace-nowrap ${
                  ruta.startsWith(i.href) ? "bg-brand-soft font-bold text-ink" : "font-medium text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {i.texto}
              </Link>
            ) : (
              <span
                key={i.href}
                aria-disabled="true"
                title="Disponible en las próximas etapas"
                className="hidden shrink-0 cursor-not-allowed rounded-lg px-3 py-2 font-medium whitespace-nowrap text-muted opacity-50 md:block"
              >
                {i.texto}
              </span>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
