"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; texto: string; listo?: boolean };

// Navegación del vecino (prototipo navHab). Las secciones de la Etapa 4b se muestran deshabilitadas.
const ITEMS: Item[] = [
  { href: "/cuentas", texto: "Mis cuentas", listo: true },
  { href: "/mi-estado-cuenta", texto: "Estado de cuenta" },
  { href: "/reportes", texto: "Reportes" },
  { href: "/chat", texto: "Chat del edificio" },
  { href: "/perfil", texto: "Mi perfil", listo: true },
];

export function MenuHabitante() {
  const ruta = usePathname();
  return (
    <nav
      aria-label="Secciones"
      className="flex gap-1 overflow-x-auto border-b border-line bg-surface2 px-2 py-1.5 print:hidden md:h-full md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-3 md:py-4"
    >
      {ITEMS.map((i) =>
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
            title="Disponible pronto"
            className="hidden shrink-0 cursor-not-allowed rounded-lg px-3 py-2 font-medium whitespace-nowrap text-muted opacity-50 md:block"
          >
            {i.texto}
          </span>
        ),
      )}
    </nav>
  );
}
