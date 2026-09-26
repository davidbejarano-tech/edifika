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
      { href: "/resumen", texto: "Resumen", listo: true },
      { href: "/ciclo", texto: "Ciclo mensual", listo: true },
      { href: "/gastos", texto: "Gastos", listo: true },
      { href: "/lecturas", texto: "Lecturas de agua", listo: true },
      { href: "/calculo", texto: "Cálculo mensual", listo: true },
      { href: "/cobranza", texto: "Cobranza", listo: true },
      { href: "/recibos", texto: "Recibos", listo: true },
      { href: "/estado-cuenta", texto: "Estado de cuenta", listo: true },
    ],
  },
  { grupo: "Comunicación", items: [{ href: "/chat", texto: "Chat del edificio", listo: true }] },
];

// Módulos adicionales activos (RN-17): aparecen solo si el edificio los tiene
const MODULOS: Item[] = [{ href: "/areas", texto: "Áreas comunes", listo: true }];

// porValidar: pagos en revisión que la persona puede validar (contador junto a Cobranza)
export function MenuAdmin({ porValidar = 0, modulos = [] }: { porValidar?: number; modulos?: string[] }) {
  const ruta = usePathname();
  const extras = MODULOS.filter((m) => modulos.includes(m.href));
  const grupos = extras.length ? [...GRUPOS, { grupo: "Módulos", items: extras }] : GRUPOS;
  return (
    <nav
      aria-label="Secciones"
      className="flex gap-1 print:hidden overflow-x-auto border-b border-line bg-surface2 px-2 py-1.5 md:top-0 md:h-full md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-3 md:py-4"
    >
      {grupos.map((g) => (
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
                {i.href === "/cobranza" && porValidar > 0 && (
                  <span className="ml-1.5 rounded-full bg-bad px-1.5 text-xs font-bold text-white" aria-label={`${porValidar} por validar`}>
                    {porValidar}
                  </span>
                )}
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
