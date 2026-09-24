"use client";

import { useState } from "react";

export function BotonImprimir() {
  return (
    <button className="btn quiet" onClick={() => window.print()}>
      Imprimir o guardar PDF
    </button>
  );
}

// Desglose opcional de deudas por departamento (RN-14). Empieza según lo que el edificio publica (RN-15).
export function Desglose({ inicial, children }: { inicial: boolean; children: React.ReactNode }) {
  const [ver, setVer] = useState(inicial);
  return (
    <>
      <label className="mt-5 flex items-center gap-2 text-sm print:hidden">
        <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
        Incluir el desglose de cuentas por cobrar por departamento
      </label>
      {ver && children}
    </>
  );
}
