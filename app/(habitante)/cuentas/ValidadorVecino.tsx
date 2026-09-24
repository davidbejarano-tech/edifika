import { PorValidar } from "@/app/(admin)/cobranza/Cobranza";
import type { Database } from "@/lib/supabase/types";

type Pago = Database["public"]["Functions"]["pagos_por_validar"]["Returns"][number];

// Vecino validador (RN-22): valida los pagos del departamento del titular cuando no hay coadministrador.
// pagos_por_validar solo le devuelve esos pagos, y validar_pago vuelve a comprobarlo en la base.
export function ValidadorVecino({ pagos }: { pagos: Pago[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-1">Pagos del administrador por validar</h2>
      <p className="mb-3 text-sm text-muted">
        Te designaron para validar los pagos del departamento del administrador titular. Revisa el comprobante antes de validar.
      </p>
      <PorValidar pagos={pagos} />
    </section>
  );
}
