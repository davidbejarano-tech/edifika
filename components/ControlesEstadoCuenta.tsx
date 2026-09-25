"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function BotonImprimir() {
  return (
    <button className="btn quiet" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}

// Desglose opcional de deudas por departamento (RN-14). Empieza según lo que el edificio publica (RN-15).
// Se guarda en la URL (?d=1) para que el PDF incluya lo mismo que la pantalla.
export function Desglose({ activo, children }: { activo: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  function cambiar(ver: boolean) {
    const q = new URLSearchParams(params.toString());
    q.set("d", ver ? "1" : "0");
    router.replace(`${ruta}?${q}`, { scroll: false });
  }
  return (
    <>
      <label className="mt-5 flex items-center gap-2 text-sm print:hidden">
        <input type="checkbox" checked={activo} onChange={(e) => cambiar(e.target.checked)} />
        Incluir el desglose de cuentas por cobrar por departamento
      </label>
      {activo && children}
    </>
  );
}
