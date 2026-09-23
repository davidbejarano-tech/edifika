// Identidad EDIFIKA: tres volúmenes de edificio (el primero con forma de "E") sobre un arco.
// Los colores salen de las variables --logo-* para que el logo se adapte al modo oscuro.
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size * 1.2} height={size} viewBox="0 0 48 40" aria-hidden="true">
      <path d="M11 9.2 17 5.8V1.6L11 4.9Z" fill="var(--logo-profundo)" />
      <path
        d="M4 13.2 17 7.2v5L9.4 15.6v3.6l5-1.9v3.9l-5 1.9v4.4l7.6-2.6v11c-4.6.2-9 1.1-13 2.4Z"
        fill="var(--logo-navy)"
      />
      <path d="M19 1l8.2 3.7v31c-2.8-.6-5.5-.9-8.2-.9Z" fill="var(--logo-azul)" />
      <path d="M29.2 8.6 35.4 11.6v26c-2-.8-4-1.3-6.2-1.7Z" fill="var(--logo-celeste)" />
      <path d="M1 39.4c10.4-5.6 24.6-6.4 36.4-1.2-11.4-3.1-24.6-2.4-36.4 1.2Z" fill="var(--logo-navy)" />
    </svg>
  );
}

export function Marca({ size = 32, lema = false }: { size?: number; lema?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={size} />
      <div className="leading-none">
        <span
          className="block font-display font-extrabold tracking-[0.04em] text-[var(--logo-navy)]"
          style={{ fontSize: size * 0.72 }}
        >
          EDIFIKA
        </span>
        {lema && <span className="mt-1 block text-[0.72rem] font-medium text-muted">Administra tus edificios, sin complicaciones</span>}
      </div>
    </div>
  );
}
