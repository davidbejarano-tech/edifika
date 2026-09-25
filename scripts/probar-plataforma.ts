/**
 * Prueba de la consola de plataforma (Etapa 6b) sobre un edificio temporal.
 *
 *   npm run probar:plataforma
 *
 * Un miembro temporal del equipo EDIFIKA da soporte en modo Revisión e Intervención, asigna planes,
 * cambia precios y correos (y los restaura), gestiona el equipo, pospone y elimina el edificio.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaPlataforma2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];
type Cliente = SupabaseClient<Database>;

async function cuenta(alias: string) {
  const email = `plataforma-${alias}-${sufijo}@demo.buildingbuddy.pe`;
  let { data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true });
  for (let i = 0; !data.user && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    ({ data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true }));
  }
  cuentas.push(data.user!.id);
  await admin.from("perfiles").insert({ id: data.user!.id, nombre: `Prueba ${alias}` });
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password: CLAVE });
  return { id: data.user!.id, email, sb };
}

const deptos = async (sb: Cliente, ed: string) => ((await sb.from("departamentos").select("id").eq("edificio_id", ed)).data ?? []).length;

async function main() {
  const T = await cuenta("titular");
  const V = await cuenta("vecino");
  const P = await cuenta("soporte");
  const X = await cuenta("ajeno");
  await admin.from("plataforma_admins").insert({ perfil_id: P.id });
  const { data: cfgOriginal } = await admin.from("plataforma_config").select("clave, valor");
  let ed = "";
  try {
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba plataforma",
      p_direccion: "Temporal",
      p_codigo: `prueba-plat-${sufijo}`,
      p_total_departamentos: 2,
      p_mes_inicio: "2026-09-01",
      p_mi_nombre: "Prueba titular",
      p_filas: ["101", "102"].map((n) => ({ numero: n, propietario: `Prop ${n}`, area: 100 })),
    });
    if (r0.error) throw new Error(r0.error.message);
    ed = r0.data;
    const deps = (await T.sb.from("departamentos").select("id, numero").eq("edificio_id", ed)).data!;
    const dep = (n: string) => deps.find((d) => d.numero === n)!.id;
    await admin.from("membresias").insert({ edificio_id: ed, perfil_id: V.id, rol: "habitante", departamento_id: dep("101") });
    await T.sb.from("edificios").update({ base_cuota: "fijo_igual", agua_cuota: "incluida", monto_fijo_mensual: 100, dia_corte: 27 }).eq("id", ed);
    const periodo = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).single()).data!.id;

    console.log("\n· Acceso a la consola");
    ok(((await X.sb.rpc("plataforma_edificios")).data ?? []).length === 0, "Alguien ajeno al equipo no ve la lista de edificios");
    ok(!!(await X.sb.rpc("iniciar_soporte", { p_edificio: ed, p_modo: "revision", p_motivo: "Curiosidad" })).error, "Ni puede entrar en modo soporte");
    ok(((await P.sb.rpc("plataforma_edificios")).data ?? []).some((e) => e.edificio_id === ed), "El equipo EDIFIKA ve el edificio en la consola");
    ok((await deptos(P.sb, ed)) === 0, "Sin sesión de soporte, el equipo no ve los datos del edificio");

    console.log("\n· Revisión (solo lectura)");
    ok(!!(await P.sb.rpc("iniciar_soporte", { p_edificio: ed, p_modo: "revision", p_motivo: "abc" })).error, "Pide un motivo");
    const rev = await P.sb.rpc("iniciar_soporte", { p_edificio: ed, p_modo: "revision", p_motivo: "El titular consulta su cuota" });
    ok(!rev.error, "Entra en modo Revisión");
    ok((await deptos(P.sb, ed)) === 2, "Ve los departamentos del edificio");
    const mio = (await P.sb.rpc("mis_edificios")).data?.find((e) => e.edificio_id === ed);
    ok(mio?.nivel === "lectura", "La app lo trata como administración en solo lectura");
    const gastoRev = await P.sb.from("gastos").insert({ edificio_id: ed, periodo_id: periodo, tipo: "recurrente", categoria: "Limpieza", descripcion: "x", monto: 10, fecha: "2026-09-10" });
    ok(!!gastoRev.error, "No puede registrar gastos");
    ok(!!(await P.sb.rpc("emitir_extraordinario", { p_edificio: ed, p_concepto: "X", p_monto: 10, p_reparto: "igual", p_vence: "2026-10-10" })).error, "Ni emitir cargos");
    ok(!!(await P.sb.from("mensajes").insert({ edificio_id: ed, texto: "Hola" })).error, "Ni escribir en el chat");

    console.log("\n· Intervención (como titular, con referencia)");
    ok(!!(await P.sb.rpc("iniciar_soporte", { p_edificio: ed, p_modo: "intervencion", p_motivo: "Corregir la mora" })).error, "Sin referencia del reclamo no entra");
    const inter = await P.sb.rpc("iniciar_soporte", { p_edificio: ed, p_modo: "intervencion", p_motivo: "Corregir la mora cobrada", p_referencia: "Correo del titular 26/09" });
    ok(!inter.error, "Entra en modo Intervención");
    ok(((await P.sb.from("sesiones_soporte").select("id").eq("perfil_id", P.id).is("cerrada_en", null)).data ?? []).length === 1, "La revisión anterior se cerró: una sola sesión abierta");
    ok((await P.sb.rpc("es_titular", { p_edificio: ed })).data === true, "Tiene los permisos del titular");
    ok(!(await P.sb.rpc("emitir_extraordinario", { p_edificio: ed, p_concepto: "Ajuste por reclamo", p_monto: 10, p_reparto: "igual", p_vence: "2026-10-10" })).error, "Puede emitir un cargo");
    ok(!(await P.sb.from("edificios").update({ mora_monto: 15 }).eq("id", ed)).error, "Puede corregir la configuración");
    const cuota = (await P.sb.from("compromisos").select("id").eq("departamento_id", dep("101")).limit(1).single()).data!;
    await V.sb.from("pagos").insert({ compromiso_id: cuota.id, edificio_id: ed, departamento_id: dep("101"), monto: 5, metodo: "Yape", registrado_por: V.id, estado: "en_revision" });
    const pago = (await admin.from("pagos").select("id").eq("edificio_id", ed).single()).data!;
    ok(!!(await P.sb.rpc("validar_pago", { p_pago: pago.id })).error, "Nunca valida pagos");
    ok(!!(await P.sb.rpc("registrar_pago_efectivo", { p_compromiso: cuota.id })).error, "Ni registra pagos en efectivo");
    ok(!!(await P.sb.from("membresias").insert({ edificio_id: ed, perfil_id: X.id, rol: "admin", nivel: "operador" })).error, "Ni cambia los accesos del edificio");
    const msj = await P.sb.from("mensajes").insert({ edificio_id: ed, texto: "Corregimos tu cargo" }).select("autor_rol").single();
    ok(msj.data?.autor_rol === "Soporte EDIFIKA", "En el chat firma como Soporte EDIFIKA");
    const firmados = (await admin.from("auditoria").select("accion").eq("soporte_id", inter.data!)).data ?? [];
    ok(firmados.length >= 3 && firmados.some((a) => a.accion === "soporte_update"), `Cada cambio queda firmado con la sesión (${firmados.length} registros)`);

    console.log("\n· Aviso al titular");
    const aviso = (await T.sb.rpc("intervenciones_soporte", { p_edificio: ed })).data ?? [];
    ok(aviso.length === 1 && aviso[0].referencia === "Correo del titular 26/09" && aviso[0].cambios >= 3, "El titular ve la intervención con su referencia y cambios");
    ok(((await V.sb.rpc("intervenciones_soporte", { p_edificio: ed })).data ?? []).length === 0, "Un vecino no la ve");
    await P.sb.rpc("cerrar_soporte");
    ok((await deptos(P.sb, ed)) === 0, "Al salir del modo soporte deja de ver el edificio");
    await P.sb.rpc("iniciar_soporte", { p_edificio: ed, p_modo: "revision", p_motivo: "Revisión que vencerá" });
    await admin.from("sesiones_soporte").update({ expira: new Date(Date.now() - 60000).toISOString() }).eq("perfil_id", P.id).is("cerrada_en", null);
    ok((await deptos(P.sb, ed)) === 0, "Una sesión vencida ya no da acceso");

    console.log("\n· Planes, precios y correos");
    const planes = (await P.sb.rpc("plataforma_config_leer")).data as { planes: Record<string, unknown>[] };
    ok(!!(await X.sb.rpc("guardar_planes", { p_planes: planes.planes as never })).error, "Alguien ajeno no cambia los planes");
    const negativo = planes.planes.map((p) => (p.id === "pro" ? { ...p, precio: -1 } : p));
    ok(!!(await P.sb.rpc("guardar_planes", { p_planes: negativo as never })).error, "No se aceptan precios negativos");
    const porDepto = planes.planes.map((p) => (p.id === "pro" ? { ...p, precio: 0, precio_departamento: 5, minimo: 100 } : p));
    ok(!(await P.sb.rpc("guardar_planes", { p_planes: porDepto as never })).error, "Se guarda un precio por departamento con mínimo");
    const paraT = ((await T.sb.rpc("planes_para_edificio", { p_edificio: ed })).data ?? []) as { id: string; total: number }[];
    ok(paraT.find((p) => p.id === "pro")?.total === 100 && paraT.find((p) => p.id === "basico")?.total === 149, "El titular ve Pro a S/ 100 (mínimo) y Básico a S/ 149");
    ok(Number((await P.sb.rpc("precio_plan", { p_plan: { precio: 50, precio_departamento: 1.5 } as never, p_departamentos: 40 })).data) === 110, "S/ 50 + S/ 1.50 × 40 departamentos = S/ 110");
    ok(!!(await P.sb.rpc("guardar_correo_plataforma", { p_clave: "correo_avisos", p_correo: "no-es-correo" })).error, "Un correo inválido se rechaza");
    ok(!(await P.sb.rpc("guardar_correo_plataforma", { p_clave: "correo_contacto", p_correo: "Soporte@Edifika.pe" })).error, "Se cambia el correo de contacto");
    ok((await X.sb.rpc("correo_contacto")).data === "soporte@edifika.pe", "El correo público se actualiza al instante");

    console.log("\n· Plan pagado");
    await T.sb.rpc("solicitar_plan", { p_edificio: ed, p_plan: "pro" });
    ok(!!(await X.sb.rpc("asignar_plan", { p_edificio: ed, p_plan: "pro" })).error, "Alguien ajeno no asigna planes");
    ok(!(await P.sb.rpc("asignar_plan", { p_edificio: ed, p_plan: "pro" })).error, "El equipo asigna el plan Pro");
    ok((await T.sb.rpc("estado_modulos", { p_edificio: ed })).data?.find((m) => m.modulo === "areas_comunes")?.estado === "activo", "Se activan sus módulos");
    ok(((await P.sb.rpc("plataforma_solicitudes")).data ?? []).find((s) => s.edificio_id === ed)?.estado === "atendida", "La solicitud queda atendida");
    await P.sb.rpc("asignar_plan", { p_edificio: ed, p_plan: null as unknown as string });
    ok((await admin.from("edificios").select("suscripcion_pagada").eq("id", ed).single()).data?.suscripcion_pagada === false, "Y se puede quitar el plan");

    console.log("\n· Equipo EDIFIKA");
    ok(!!(await X.sb.rpc("agregar_plataforma", { p_correo: X.email })).error, "Alguien ajeno no se agrega al equipo");
    ok(!(await P.sb.rpc("agregar_plataforma", { p_correo: X.email })).error && (await X.sb.rpc("es_plataforma")).data === true, "El equipo agrega a un miembro por su correo");
    ok(!!(await P.sb.rpc("quitar_plataforma", { p_perfil: P.id })).error, "Nadie se quita a sí mismo");
    ok(!(await P.sb.rpc("quitar_plataforma", { p_perfil: X.id })).error && (await X.sb.rpc("es_plataforma")).data === false, "Y lo puede quitar");

    console.log("\n· Depuración manual");
    await admin.from("edificios").update({ ultima_actividad: new Date(Date.now() - 100 * 86400000).toISOString() }).eq("id", ed);
    const antes = (await P.sb.rpc("plataforma_edificios")).data!.find((e) => e.edificio_id === ed)!;
    ok(antes.dias_sin_movimiento >= 99, `Sin movimiento hace ${antes.dias_sin_movimiento} días`);
    ok(!(await P.sb.rpc("posponer_depuracion", { p_edificio: ed, p_dias: 30, p_motivo: "El titular pidió más tiempo" })).error, "Se pospone la eliminación 30 días");
    ok(!((await admin.rpc("edificios_por_depurar")).data ?? []).some((e) => e.edificio_id === ed), "Ya no está en la lista de la depuración automática");
    const fx = (sb: Cliente, body: Record<string, unknown>) => sb.functions.invoke("eliminar-edificio", { body });
    ok(!!(await fx(X.sb, { edificio_id: ed, confirmacion: `prueba-plat-${sufijo}`, motivo: "Pedido del titular" })).error, "Alguien ajeno no elimina edificios");
    ok(!!(await fx(P.sb, { edificio_id: ed, confirmacion: "otro-codigo", motivo: "Pedido del titular" })).error, "Sin el código correcto no se elimina");
    const el = await fx(P.sb, { edificio_id: ed, confirmacion: `prueba-plat-${sufijo}`, motivo: "Pedido del titular por correo" });
    ok(!el.error, "El equipo elimina el edificio a pedido");
    ok(!(await admin.from("edificios").select("id").eq("id", ed).maybeSingle()).data, "El edificio ya no existe");
    ok(!(await admin.auth.admin.getUserById(V.id)).data.user, "La cuenta del vecino, sin otro edificio, se eliminó");
    const rastro = (await admin.from("depuraciones").select("motivo").eq("edificio_id", ed).single()).data;
    ok(rastro?.motivo === "A pedido: Pedido del titular por correo", "Queda el rastro con el motivo");
    ed = "";
  } finally {
    for (const c of cfgOriginal ?? []) await admin.from("plataforma_config").update({ valor: c.valor }).eq("clave", c.clave);
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((x) => x.id);
      await admin.from("sesiones_soporte").delete().eq("edificio_id", ed);
      await admin.from("solicitudes_plan").delete().eq("edificio_id", ed);
      await admin.from("pagos").delete().eq("edificio_id", ed);
      await admin.from("compromisos").delete().eq("edificio_id", ed);
      await admin.from("membresias").delete().eq("edificio_id", ed);
      await admin.from("ocupaciones").delete().in("departamento_id", ids);
      await admin.from("auditoria").delete().eq("edificio_id", ed);
      await admin.from("periodos").update({ gastos_confirmados_en: null }).eq("edificio_id", ed);
      await admin.from("edificios").delete().eq("id", ed);
      await admin.from("organizaciones").delete().eq("id", e!.organizacion_id);
    }
    await admin.from("depuraciones").delete().like("codigo", `prueba-plat-%${sufijo}`);
    await admin.from("plataforma_admins").delete().in("perfil_id", [P.id, X.id]);
    for (const id of cuentas) await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
