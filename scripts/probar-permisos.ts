/**
 * Prueba de permisos en la base de datos (RLS y funciones), sin pasar por la interfaz.
 * Usa las cuentas demo de los-ficus y no modifica datos: solo intenta cambios que deben ser rechazados.
 *
 *   npm run probar:permisos
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const CLAVE = process.env.DEMO_PASSWORD || "Demo2026!";
let fallas = 0;

async function como(email: string) {
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password: CLAVE });
  if (error) throw new Error(`${email}: ${error.message}`);
  return sb;
}
const bloqueado = (nombre: string, r: { error: { message: string } | null; data?: unknown }) => {
  const filas = Array.isArray(r.data) ? r.data.length : 0;
  const ok = !!r.error || (Array.isArray(r.data) && filas === 0);
  if (!ok) fallas++;
  console.log(`${ok ? "✔" : "✖"} ${nombre} → ${r.error ? r.error.message : ok ? "sin filas afectadas" : "PERMITIDO"}`);
};

async function main() {
  const co = await como("coadmin@demo.buildingbuddy.pe");
  const v302 = await como("302@demo.buildingbuddy.pe");
  const { data: ed } = await co.from("edificios").select("id").eq("codigo", "los-ficus").single();
  const { data: deps } = await co.rpc("departamentos_admin", { p_edificio: ed!.id });
  const d101 = deps!.find((d) => d.numero === "101")!.departamento_id;

  console.log("· Coadministrador (nivel 2): solo datos operativos (RN-20)");
  bloqueado("Cambiar la configuración de la cobranza", await co.from("edificios").update({ monto_fijo_mensual: 1 }).eq("id", ed!.id).select("id"));
  bloqueado("Cambiar el área de un departamento", await co.from("departamentos").update({ area_m2: 1 }).eq("id", d101).select("id"));
  bloqueado("Editar datos de un propietario", await co.from("personas").update({ nombre: "X" }).eq("edificio_id", ed!.id).select("id"));
  bloqueado("Desactivar un acceso", await co.rpc("cambiar_acceso", { p_departamento: d101, p_activo: false }));
  bloqueado("Registrar un medidor", await co.rpc("registrar_medidor", { p_departamento: d101, p_numero_serie: "PRUEBA-1" }));
  bloqueado("Actualizar áreas desde Excel", await co.rpc("actualizar_departamentos", { p_edificio: ed!.id, p_filas: [{ numero: "101", area: 1 }] }));
  bloqueado("Agregar un departamento", await co.rpc("importar_departamentos", { p_edificio: ed!.id, p_filas: [{ numero: "999", propietario: "X" }] }));
  bloqueado("Registrar un cambio de ocupante", await co.rpc("registrar_cambio_ocupante", {
    p_departamento: d101, p_tipo: "inquilino", p_nombre: "X", p_documento: "", p_email: "", p_telefono: "", p_desde: "2026-09-01",
  }));

  console.log("\n· Vecino del 302: no ve la gestión del edificio");
  const tabla = await v302.rpc("departamentos_admin", { p_edificio: ed!.id });
  const ok = !tabla.error && (tabla.data?.length ?? 0) === 0;
  if (!ok) fallas++;
  console.log(`${ok ? "✔" : "✖"} Tabla de departamentos de la administración → ${tabla.data?.length ?? 0} filas`);
  const personas = await v302.from("personas").select("nombre");
  const soloSuyas = (personas.data?.length ?? 0) <= 2;
  if (!soloSuyas) fallas++;
  console.log(`${soloSuyas ? "✔" : "✖"} Personas visibles → ${personas.data?.length ?? 0} (solo las de su departamento)`);
  bloqueado("Cambiar la configuración", await v302.from("edificios").update({ nombre: "X" }).eq("id", ed!.id).select("id"));

  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
