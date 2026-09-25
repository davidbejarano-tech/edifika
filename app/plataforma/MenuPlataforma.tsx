"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/plataforma", texto: "Resumen" },
  { href: "/plataforma/edificios", texto: "Edificios" },
  { href: "/plataforma/solicitudes", texto: "Solicitudes de plan" },
  { href: "/plataforma/planes", texto: "Planes y correos" },
  { href: "/plataforma/depuracion", texto: "Depuración" },
  { href: "/plataforma/equipo", texto: "Equipo EDIFIKA" },
  { href: "/plataforma/transferencia", texto: "Transferencia forzada" },
];

export function MenuPlataforma() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones de la consola" className="flex gap-1 overflow-x-auto border-b border-line bg-surface2 px-2 md:px-5">
      {ITEMS.map((i) => {
        const activo = i.href === "/plataforma" ? ruta === i.href : ruta.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={activo ? "page" : undefined}
            className={`border-b-[3px] px-3 py-2.5 text-sm font-semibold whitespace-nowrap ${
              activo ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {i.texto}
          </Link>
        );
      })}
    </nav>
  );
}
