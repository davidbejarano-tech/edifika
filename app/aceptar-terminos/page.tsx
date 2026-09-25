import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/Logo";
import { obtenerContexto } from "@/lib/contexto";
import { terminosAceptados } from "@/lib/legal";
import { BotonAceptar } from "./BotonAceptar";

// Consentimiento al activar la cuenta (Ley 29733): cada cuenta acepta la versión vigente de los
// términos y la política de privacidad antes de usar la aplicación.
export default async function AceptarTerminosPage() {
  const { supabase, user } = await obtenerContexto();
  if (!user) redirect("/login");
  if (await terminosAceptados(supabase, user.id, user.user_metadata)) redirect("/edificios?vista=auto");

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-[520px] rounded-2xl border border-line bg-surface p-7">
        <Marca size={40} lema />
        <h1 className="mt-4 mb-2">Antes de continuar</h1>
        <p className="mb-3 text-muted">
          Para usar EDIFIKA necesitamos que leas y aceptes los{" "}
          <Link href="/terminos" target="_blank" className="font-semibold text-brand">
            términos y condiciones
          </Link>{" "}
          y la{" "}
          <Link href="/privacidad" target="_blank" className="font-semibold text-brand">
            política de privacidad
          </Link>
          . En resumen:
        </p>
        <ul className="mb-4 grid list-disc gap-1.5 pl-5 text-sm">
          <li>Usamos tus datos solo para administrar el edificio: cuotas, pagos, recibos y comunicación.</li>
          <li>Cada vecino ve solo lo de su departamento, más los totales del edificio.</li>
          <li>No vendemos tus datos. Puedes pedir acceder a ellos, corregirlos o eliminarlos.</li>
          <li>Un edificio sin plan pagado se elimina tras 90 días sin movimiento, con avisos previos a los 60 y 83 días.</li>
        </ul>
        <BotonAceptar />
        <p className="mt-4 text-center text-sm">
          <a href="/salir" className="text-muted hover:text-ink">
            No acepto: cerrar sesión
          </a>
        </p>
      </div>
    </main>
  );
}
