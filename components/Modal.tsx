"use client";

import { useEffect, useRef } from "react";

type Props = {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  amplio?: boolean; // documentos como el recibo
};

// Ventana modal accesible con <dialog>: foco atrapado, Escape para cerrar y fondo oscurecido.
export function Modal({ abierto, titulo, onCerrar, children, amplio = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      aria-labelledby="modal-titulo"
      className={`m-auto ${amplio ? "w-[min(820px,calc(100%-1rem))]" : "w-[min(560px,calc(100%-2rem))]"} rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40`}
    >
      {abierto && (
        <div className="max-h-[85dvh] overflow-y-auto p-5">
          <div className="mb-3 flex items-start gap-3">
            <h2 id="modal-titulo" className="flex-1 text-xl">
              {titulo}
            </h2>
            <button type="button" className="btn quiet sm" onClick={onCerrar} aria-label="Cerrar">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
