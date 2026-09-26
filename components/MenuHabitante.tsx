"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; texto: string; listo?: boolean };

// Navegación del vecino (prototipo navHab).
const ITEMS: Item[] = [
  { href: "/cuentas", texto: "Mis cuentas", listo: true },
  { href: "/mi-estado-cuenta", texto: "Estado de cuenta", listo: true },
  { href: "/reportes", texto: "Reportes", listo: true },
  { href: "/mi-chat", texto: "Chat del edificio", listo: true },
  { href: "/perfil", texto: "Mi perfil", listo: true },
];

// areas: el edificio tiene el módulo Áreas comunes activo (o el vecino tiene reservas)
export function MenuHabitante({ areas = false }: { areas?: boolean }) {
  const ruta = usePathname();
  const items = areas ? [ITEMS[0], { href: "/reservas", texto: "Áreas comunes", listo: true }, ...ITEMS.slice(1)] : ITEMS;
  return (
    <nav
      aria-label="Secciones"
      className="flex gap-1 overflow-x-auto border-b border-line bg-surface2 px-2 py-1.5 print:hidden md:h-full md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-3 md:py-4"
    >
      {items.map((i) =>
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
