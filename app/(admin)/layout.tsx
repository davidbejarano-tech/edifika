import { redirect } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { MenuAdmin } from "@/components/MenuAdmin";
import { obtenerContexto } from "@/lib/contexto";
import { terminosAceptados } from "@/lib/legal";
import { cerrarSoporte } from "@/app/plataforma/acciones";

// Solo el equipo de administración (titular, coadministrador o saliente en lectura).
// La base de datos protege de verdad con RLS; esto solo evita mostrar pantallas que no corresponden.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, edificios, actual } = await obtenerContexto();
  if (!user) redirect("/login");
  if (!(await terminosAceptados(supabase, user.id, user.user_metadata))) redirect("/aceptar-terminos");
  if (!actual) redirect("/edificios");
  if (!actual.nivel) redirect(actual.departamento_id ? "/cuentas" : "/edificios");
  // Equipo EDIFIKA dando soporte (Revisión o Intervención)
  const { data: soporte } = await supabase.rpc("mi_soporte", { p_edificio: actual.edificio_id }).maybeSingle();
  const vence = soporte
    ? new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(
        new Date(soporte.expira),
      )
    : "";

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr] md:grid-rows-[auto_1fr] print:block">
      <div className="md:col-span-2">
        <Encabezado edificio={actual} vista="admin" variosEdificios={edificios.length > 1} soporte={soporte?.modo ?? null} />
      </div>
      <MenuAdmin porValidar={actual.pagos_por_validar ?? 0} />
      <main className="mx-auto w-full max-w-[1200px] min-w-0 px-4 pt-5 pb-12 md:px-8">
        {soporte && (
          <div
            className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm print:hidden ${
              soporte.modo === "intervencion" ? "border-bad bg-bad-bg text-bad" : "border-info bg-info-bg text-info"
            }`}
            role="status"
          >
            <p className="min-w-[220px] flex-1">
              <b>
                {soporte.modo === "intervencion"
                  ? "🛠️ Soporte EDIFIKA · Intervención"
                  : "🔍 Soporte EDIFIKA · Revisión (solo lectura)"}
              </b>{" "}
              hasta las {vence}. Motivo: {soporte.motivo}
              {soporte.referencia ? ` · Reclamo: ${soporte.referencia}` : ""}.{" "}
              {soporte.modo === "intervencion"
                ? "Cada cambio queda firmado y el titular verá un aviso."
                : "Los botones de cambios no funcionan."}
            </p>
            <form action={cerrarSoporte}>
              <button className="btn quiet sm">Salir del modo soporte</button>
            </form>
          </div>
        )}
        {actual.dias_para_eliminar !== null && (
          <div className="mb-4 rounded-xl border border-warn bg-warn-bg px-4 py-3 text-sm text-warn print:hidden" role="alert">
            <b>Este edificio lleva {actual.dias_sin_movimiento} días sin movimiento.</b> Si llega a 90 días, se eliminará con
            todos sus datos (quedan {actual.dias_para_eliminar} días). Cualquier registro, como un gasto, un pago o un mensaje,
            reinicia el contador. Los edificios con plan pagado no se eliminan.
            {actual.nivel === "titular" && (
              <a href="/exportar" className="ml-1 font-bold underline">
                Exportar los datos a Excel
              </a>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
