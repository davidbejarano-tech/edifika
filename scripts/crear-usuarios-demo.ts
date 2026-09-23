/**
 * Crea las cuentas de demostración del edificio los-ficus (requiere haber cargado seed.sql):
 *   · titular externa, coadministrador externo y habitantes de los departamentos 101 y 302.
 * Se puede ejecutar varias veces: reutiliza las cuentas y restablece sus contraseñas.
 *
 *   npm run demo:usuarios
 *
 * Variables opcionales en .env.local:
 *   DEMO_PASSWORD  contraseña de todas las cuentas (por defecto "Demo2026!")
 *   DEMO_CORREO    tu correo real, p. ej. tucorreo@gmail.com, para recibir los correos de prueba
 *                  (se usan alias: tucorreo+titular@gmail.com, tucorreo+302@gmail.com…)
 *
 * Usa la service role: es un script de desarrollo que corre en tu computadora, nunca en el navegador.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secreta) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const CLAVE = process.env.DEMO_PASSWORD || "Demo2026!";
const correoReal = process.env.DEMO_CORREO?.trim().toLowerCase();
const correo = (alias: string) => {
  if (!correoReal) return `${alias}@demo.buildingbuddy.pe`;
  const [usuario, dominio] = correoReal.split("@");
  return `${usuario}+${alias}@${dominio}`;
};

const db = createClient<Database>(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });

async function falla(mensaje: string, error: { message: string } | null) {
  if (error) throw new Error(`${mensaje}: ${error.message}`);
}

async function asegurarCuenta(email: string, nombre: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    await falla("No se pudo listar las cuentas", error);
    const existente = data.users.find((u) => u.email?.toLowerCase() === email);
    if (existente) {
      const { error: e } = await db.auth.admin.updateUserById(existente.id, { password: CLAVE, email_confirm: true });
      await falla(`No se pudo actualizar ${email}`, e);
      await asegurarPerfil(existente.id, nombre);
      return existente.id;
    }
    if (data.users.length < 1000) break;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { nombre },
  });
  await falla(`No se pudo crear ${email}`, error);
  await asegurarPerfil(data.user!.id, nombre);
  return data.user!.id;
}

async function asegurarPerfil(id: string, nombre: string) {
  const { error } = await db.from("perfiles").upsert({ id, nombre });
  await falla("No se pudo guardar el perfil", error);
}

async function asegurarAdmin(edificio: string, perfil: string, nivel: "titular" | "operador") {
  const { data: actual } = await db
    .from("membresias")
    .select("id, perfil_id, nivel")
    .eq("edificio_id", edificio)
    .eq("rol", "admin")
    .eq("estado", "activo");
  const mia = actual?.find((m) => m.perfil_id === perfil);
  if (mia) {
    if (mia.nivel !== nivel) console.warn(`  ⚠ Ya era ${mia.nivel}; no se cambia su nivel.`);
    return;
  }
  if (nivel === "titular" && actual?.some((m) => m.nivel === "titular")) {
    console.warn("  ⚠ El edificio ya tiene otro titular activo; no se reemplaza.");
    return;
  }
  const { error } = await db.from("membresias").insert({ edificio_id: edificio, perfil_id: perfil, rol: "admin", nivel });
  await falla("No se pudo crear la membresía de administración", error);
}

async function asegurarHabitante(edificio: string, numero: string, perfil: string) {
  const { data: depto, error } = await db
    .from("departamentos")
    .select("id")
    .eq("edificio_id", edificio)
    .eq("numero", numero)
    .single();
  await falla(`No existe el departamento ${numero}`, error);

  const { data: activa } = await db
    .from("membresias")
    .select("perfil_id")
    .eq("departamento_id", depto!.id)
    .eq("rol", "habitante")
    .eq("estado", "activo")
    .maybeSingle();
  if (activa && activa.perfil_id !== perfil) {
    console.warn(`  ⚠ El ${numero} ya tiene otro habitante activo; no se reemplaza.`);
    return;
  }
  if (!activa) {
    const { error: e } = await db
      .from("membresias")
      .insert({ edificio_id: edificio, perfil_id: perfil, rol: "habitante", departamento_id: depto!.id });
    await falla("No se pudo crear la membresía de habitante", e);
  }

  // Liga la cuenta a la persona responsable: el inquilino vigente o, si no hay, el propietario.
  const { data: ocupaciones } = await db
    .from("ocupaciones")
    .select("tipo, persona_id")
    .eq("departamento_id", depto!.id)
    .is("hasta", null);
  const responsable = ocupaciones?.find((o) => o.tipo === "inquilino") ?? ocupaciones?.find((o) => o.tipo === "propietario");
  if (responsable) {
    const { error: e } = await db.from("personas").update({ perfil_id: perfil }).eq("id", responsable.persona_id);
    await falla("No se pudo ligar la persona", e);
  }
}

async function main() {
  const { data: edificio, error } = await db.from("edificios").select("id, nombre").eq("codigo", "los-ficus").maybeSingle();
  await falla("No se pudo leer el edificio", error);
  if (!edificio) throw new Error('No existe el edificio "los-ficus". Carga primero supabase/seed.sql.');
  console.log(`Edificio: ${edificio.nombre}\n`);

  const cuentas = [
    { alias: "titular", nombre: "Carmen Rojas Díaz", tipo: "titular" as const },
    { alias: "coadmin", nombre: "Jorge Tello Ruiz", tipo: "operador" as const },
    { alias: "101", nombre: "Rosa Huamán Quispe", tipo: "101" },
    { alias: "302", nombre: "Héctor Ramírez Lozano", tipo: "302" },
  ];

  for (const c of cuentas) {
    const email = correo(c.alias);
    console.log(`• ${c.nombre} <${email}>`);
    const id = await asegurarCuenta(email, c.nombre);
    if (c.tipo === "titular" || c.tipo === "operador") await asegurarAdmin(edificio.id, id, c.tipo);
    else await asegurarHabitante(edificio.id, c.tipo, id);
  }

  console.log(`
Listo. Contraseña de todas las cuentas: ${CLAVE}

  Administración (pestaña "Administración"):
    Titular          ${correo("titular")}
    Coadministrador  ${correo("coadmin")}

  Vecinos (pestaña "Vecino", código los-ficus):
    Departamento 101 y departamento 302
`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
