"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string | null };

// Envía el formulario (con el acta) a la Edge Function "transferencia-forzada", que valida al equipo de plataforma.
export async function transferenciaForzada(_: Resultado, f: FormData): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, mensaje: "Tu sesión venció. Vuelve a ingresar." };
  if (String(f.get("confirmacion") ?? "").trim().toLowerCase() !== String(f.get("codigo") ?? "").trim().toLowerCase()) {
    return { ok: false, mensaje: "Para confirmar, repite el código del edificio." };
  }
  const h = await headers();
  const origen = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const cuerpo = new FormData();
  for (const k of ["codigo", "email", "nombre", "acta"]) {
    const v = f.get(k);
    if (v !== null) cuerpo.append(k, v);
  }
  cuerpo.append("redirect_to", `${origen}/auth/callback?next=/nueva-clave`);
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/transferencia-forzada`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${session.access_token}` },
      body: cuerpo,
      cache: "no-store",
    });
    const res = (await r.json().catch(() => ({}))) as { mensaje?: string; error?: string };
    return r.ok ? { ok: true, mensaje: res.mensaje ?? "Transferencia hecha." } : { ok: false, mensaje: res.error ?? "No se pudo transferir." };
  } catch {
    return { ok: false, mensaje: "No pudimos conectar con el servidor. Inténtalo otra vez." };
  }
}

// ---------------------------------------------------------------------
// Consola de plataforma (Etapa 6b). La base valida que quien llama sea del equipo EDIFIKA.
// ---------------------------------------------------------------------
const ok = (mensaje: string, rutas: string[] = []): Resultado => {
  for (const r of rutas) revalidatePath(r);
  return { ok: true, mensaje };
};
const falla = (mensaje: string): Resultado => ({ ok: false, mensaje });

// Entra al edificio en modo Revisión (solo lectura) o Intervención (como titular)
export async function iniciarSoporte(edificioId: string, modo: "revision" | "intervencion", motivo: string, referencia: string) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("iniciar_soporte", {
    p_edificio: edificioId,
    p_modo: modo,
    p_motivo: motivo,
    p_referencia: referencia || undefined,
  });
  if (error) return falla(error.message);
  redirect(`/ir?e=${edificioId}&v=admin`);
}

export async function cerrarSoporte() {
  const supabase = await crearClienteServidor();
  await supabase.rpc("cerrar_soporte");
  redirect("/plataforma/edificios");
}

// plan null: quita el plan pagado
export async function asignarPlan(edificioId: string, plan: string | null) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("asignar_plan", { p_edificio: edificioId, p_plan: plan as string });
  return error ? falla(error.message) : ok(plan ? "Plan asignado: el edificio queda protegido de la depuración." : "Plan quitado.", ["/plataforma", "/plataforma/edificios", "/plataforma/solicitudes"]);
}

export async function atenderSolicitud(solicitudId: string, estado: "atendida" | "cancelada" | "pendiente") {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("atender_solicitud", { p_solicitud: solicitudId, p_estado: estado });
  return error ? falla(error.message) : ok("Solicitud actualizada.", ["/plataforma", "/plataforma/solicitudes"]);
}

export async function posponerDepuracion(edificioId: string, dias: number, motivo: string) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("posponer_depuracion", { p_edificio: edificioId, p_dias: dias, p_motivo: motivo });
  return error ? falla(error.message) : ok(`Eliminación pospuesta: el conteo de inactividad empieza de nuevo el ${data}.`, ["/plataforma/edificios", "/plataforma/depuracion"]);
}

export async function eliminarEdificio(edificioId: string, confirmacion: string, motivo: string) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.functions.invoke("eliminar-edificio", {
    body: { edificio_id: edificioId, confirmacion, motivo },
  });
  if (error) {
    const cuerpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return falla(cuerpo?.error ?? "No se pudo eliminar el edificio.");
  }
  return ok((data as { mensaje: string }).mensaje, ["/plataforma", "/plataforma/edificios", "/plataforma/depuracion"]);
}

export async function guardarPlanes(planes: unknown) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_planes", { p_planes: planes as never });
  return error ? falla(error.message) : ok("Planes guardados. Los titulares ya ven los precios nuevos.", ["/plataforma/planes"]);
}

export async function guardarCorreo(clave: "correo_avisos" | "correo_contacto", correo: string) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_correo_plataforma", { p_clave: clave, p_correo: correo });
  return error ? falla(error.message) : ok("Correo guardado.", ["/plataforma/planes"]);
}

export async function agregarMiembro(correo: string) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("agregar_plataforma", { p_correo: correo });
  return error ? falla(error.message) : ok("Miembro agregado al equipo EDIFIKA.", ["/plataforma/equipo"]);
}

export async function quitarMiembro(perfilId: string) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("quitar_plataforma", { p_perfil: perfilId });
  return error ? falla(error.message) : ok("Miembro quitado del equipo EDIFIKA.", ["/plataforma/equipo"]);
}
