"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { obtenerContexto } from "@/lib/contexto";

export type Resultado = { ok: boolean; mensaje: string | null };

const SIN_PERMISO = "Solo el administrador titular puede cambiar los departamentos.";
const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const numero = (v: FormDataEntryValue | null) => {
  const t = texto(v).replace(",", ".");
  return t === "" ? null : Number(t);
};
const listo = (mensaje: string): Resultado => {
  revalidatePath("/departamentos");
  revalidatePath("/configuracion");
  revalidatePath("/inicio");
  return { ok: true, mensaje };
};
const falla = (mensaje: string): Resultado => ({ ok: false, mensaje });

// Área editable en la celda (RN-02). La RLS solo deja actualizar al titular.
export async function actualizarArea(departamentoId: string, area: number | null): Promise<Resultado> {
  if (area !== null && !(area > 0)) return falla("El área debe ser mayor que cero.");
  const { supabase } = await obtenerContexto();
  const { data, error } = await supabase.from("departamentos").update({ area_m2: area }).eq("id", departamentoId).select("id");
  if (error) return falla(error.message);
  if (!data?.length) return falla(SIN_PERMISO);
  return listo("Área guardada.");
}

export async function editarDepartamento(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const id = texto(f.get("departamento_id"));
  const piso = numero(f.get("piso"));
  const area = numero(f.get("area"));
  if (piso === null || !Number.isInteger(piso)) return falla("El piso debe ser un número entero.");
  if (area !== null && !(area > 0)) return falla("El área debe ser mayor que cero, o déjala vacía.");

  const { data, error } = await supabase.from("departamentos").update({ piso, area_m2: area }).eq("id", id).select("id");
  if (error) return falla(error.message);
  if (!data?.length) return falla(SIN_PERMISO);

  // Datos de contacto del propietario y del inquilino vigentes
  for (const rol of ["propietario", "inquilino"] as const) {
    const personaId = texto(f.get(`${rol}_id`));
    if (!personaId) continue;
    const nombre = texto(f.get(`${rol}_nombre`));
    const email = texto(f.get(`${rol}_email`)).toLowerCase();
    if (!nombre) return falla(`Escribe el nombre del ${rol}.`);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falla(`El correo del ${rol} no es válido.`);
    const { error: e } = await supabase
      .from("personas")
      .update({ nombre, email: email || null, telefono: texto(f.get(`${rol}_telefono`)) || null })
      .eq("id", personaId);
    if (e) return falla(e.message);
  }
  return listo("Departamento actualizado.");
}

export async function agregarDepartamento(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  const fila = {
    numero: texto(f.get("numero")),
    piso: numero(f.get("piso")),
    area: numero(f.get("area")),
    propietario: texto(f.get("propietario")),
    inquilino: texto(f.get("inquilino")),
    email: texto(f.get("email")),
    telefono: texto(f.get("telefono")),
    medidor: texto(f.get("medidor")),
  };
  const { error } = await supabase.rpc("importar_departamentos", { p_edificio: actual.edificio_id, p_filas: [fila] });
  if (error) return falla(error.message.replace(/^Fila 1( \(depto [^)]+\))?: /, ""));
  return listo(`Departamento ${fila.numero} agregado.`);
}

// RN-38: registrar o cambiar el medidor; el anterior queda en el historial
export async function registrarMedidor(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const lectura = numero(f.get("lectura_inicial")) ?? 0;
  if (Number.isNaN(lectura) || lectura < 0) return falla("La lectura inicial debe ser un número mayor o igual a cero.");
  const { error } = await supabase.rpc("registrar_medidor", {
    p_departamento: texto(f.get("departamento_id")),
    p_numero_serie: texto(f.get("serie")),
    p_lectura_inicial: lectura,
    p_fecha: texto(f.get("fecha")) || undefined,
  });
  if (error) return falla(error.message);
  return listo("Medidor registrado.");
}

// RN-16: el acceso anterior se desactiva y queda en el historial
export async function cambioOcupante(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const tipo = texto(f.get("tipo")) === "propietario" ? "propietario" : "inquilino";
  const nombre = texto(f.get("nombre"));
  const email = texto(f.get("email")).toLowerCase();
  const desde = texto(f.get("desde"));
  const documento = texto(f.get("documento"));
  if (!nombre) return falla("Escribe el nombre del nuevo ocupante.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falla("El correo no es válido.");
  if (documento && (documento.length < 8 || documento.length > 12)) return falla("El documento debe tener de 8 a 12 caracteres.");
  if (!desde) return falla("Indica desde qué fecha ocupa el departamento.");

  const { error } = await supabase.rpc("registrar_cambio_ocupante", {
    p_departamento: texto(f.get("departamento_id")),
    p_tipo: tipo,
    p_nombre: nombre,
    p_documento: documento,
    p_email: email,
    p_telefono: texto(f.get("telefono")),
    p_desde: desde,
  });
  if (error) return falla(error.message);
  return listo(
    `Cambio registrado: ${nombre} es el nuevo ${tipo}. El acceso anterior quedó desactivado.` +
      (email ? " Envíale la invitación desde la columna Acceso." : ""),
  );
}

export async function cambiarAcceso(departamentoId: string, activo: boolean): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const { error } = await supabase.rpc("cambiar_acceso", { p_departamento: departamentoId, p_activo: activo });
  if (error) return falla(error.message);
  return listo(activo ? "Acceso activado." : "Acceso desactivado: el ocupante ya no puede ingresar.");
}

// Áreas y medidores desde Excel: todo o nada (actualizar_departamentos)
export async function actualizarDesdeTabla(filas: { numero: string; area: number | null; medidor: string; lectura_inicial: number | null }[]): Promise<Resultado> {
  const { supabase, actual } = await obtenerContexto();
  if (!actual) return falla("Elige un edificio.");
  const { data, error } = await supabase.rpc("actualizar_departamentos", { p_edificio: actual.edificio_id, p_filas: filas });
  if (error) return falla(error.message);
  return listo(`${data} ${data === 1 ? "departamento actualizado" : "departamentos actualizados"}.`);
}

// Invitación y restablecimiento de clave: Edge Function "invitar-habitante" (solo titular)
async function llamarInvitacion(departamentoId: string, accion: "invitar" | "restablecer"): Promise<Resultado> {
  const { supabase } = await obtenerContexto();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return falla("Tu sesión venció. Vuelve a ingresar.");
  const h = await headers();
  const origen = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invitar-habitante`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ departamento_id: departamentoId, accion, redirect_to: `${origen}/auth/callback?next=/nueva-clave` }),
      cache: "no-store",
    });
    const cuerpo = (await r.json().catch(() => ({}))) as { mensaje?: string; error?: string };
    if (!r.ok) return falla(cuerpo.error ?? "No pudimos enviar el correo. Inténtalo otra vez.");
    return listo(cuerpo.mensaje ?? "Correo enviado.");
  } catch {
    return falla("No pudimos conectar con el servidor. Inténtalo otra vez.");
  }
}

export async function invitarOcupante(departamentoId: string) {
  return llamarInvitacion(departamentoId, "invitar");
}

export async function restablecerClave(departamentoId: string) {
  return llamarInvitacion(departamentoId, "restablecer");
}
