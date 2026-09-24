/**
 * Prueba de transparencia y comunicación (RN-15, Etapa 4b) sobre un edificio temporal.
 *
 *   npm run probar:comunicacion
 *
 * Titular externa, dos vecinos (101 y 102) y una persona ajena al edificio. Reportes y totales para
 * los vecinos, desglose por departamento solo si se publica, y chat con Realtime y moderación.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CLAVE = "PruebaChat2026!";
const sufijo = Date.now().toString(36);
let fallas = 0;
const ok = (cond: boolean, texto: string) => {
  if (!cond) fallas++;
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
};
const cuentas: string[] = [];
type Cliente = SupabaseClient<Database>;
type Evento = { tipo: string; texto: string; id: string };

async function cuenta(alias: string) {
  const email = `chat-${alias}-${sufijo}@demo.buildingbuddy.pe`;
  const { data } = await admin.auth.admin.createUser({ email, password: CLAVE, email_confirm: true });
  cuentas.push(data.user!.id);
  await admin.from("perfiles").insert({ id: data.user!.id, nombre: `Prueba ${alias}` });
  const sb = createClient<Database>(url, publica, { auth: { persistSession: false } });
  const { data: s } = await sb.auth.signInWithPassword({ email, password: CLAVE });
  await sb.realtime.setAuth(s.session!.access_token);
  return { id: data.user!.id, sb };
}

// Escucha los cambios del chat del edificio como lo hace la app
async function escuchar(sb: Cliente, ed: string) {
  const eventos: Evento[] = [];
  const canal = sb
    .channel(`prueba-${ed}-${Math.random()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "mensajes", filter: `edificio_id=eq.${ed}` }, (c) => {
      const m = c.new as { id: string; texto: string };
      eventos.push({ tipo: c.eventType, texto: m.texto, id: m.id });
    });
  await new Promise<void>((listo, falla) => {
    const t = setTimeout(() => falla(new Error("Realtime no se conectó en 15 s")), 15000);
    canal.subscribe((estado) => {
      if (estado === "SUBSCRIBED") {
        clearTimeout(t);
        listo();
      }
    });
  });
  await new Promise((r) => setTimeout(r, 1500)); // el servidor termina de registrar el filtro
  return { eventos, cerrar: () => sb.removeChannel(canal) };
}

async function esperar(cond: () => boolean, ms = 10000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) await new Promise((r) => setTimeout(r, 200));
  return cond();
}

async function main() {
  const T = await cuenta("titular");
  const A = await cuenta("101");
  const B = await cuenta("102");
  const X = await cuenta("ajena");
  let ed = "";
  const canales: (() => unknown)[] = [];
  try {
    const r0 = await T.sb.rpc("registrar_edificio", {
      p_nombre: "Prueba chat",
      p_direccion: "Temporal",
      p_codigo: `prueba-chat-${sufijo}`,
      p_total_departamentos: 2,
      p_mes_inicio: "2026-08-01",
      p_mi_nombre: "Prueba titular",
      p_filas: ["101", "102"].map((n) => ({ numero: n, propietario: `Prop ${n}`, area: 100 })),
    });
    if (r0.error) throw new Error(r0.error.message);
    ed = r0.data;
    const deps = (await T.sb.from("departamentos").select("id, numero").eq("edificio_id", ed)).data!;
    const dep = (n: string) => deps.find((d) => d.numero === n)!.id;
    await admin.from("membresias").insert([
      { edificio_id: ed, perfil_id: A.id, rol: "habitante", departamento_id: dep("101") },
      { edificio_id: ed, perfil_id: B.id, rol: "habitante", departamento_id: dep("102") },
    ]);
    await T.sb.from("edificios").update({ base_cuota: "fijo_igual", agua_cuota: "incluida", monto_fijo_mensual: 100, dia_corte: 27 }).eq("id", ed);
    const agosto = (await T.sb.from("periodos").select("id").eq("edificio_id", ed).single()).data!.id;
    await T.sb.from("gastos").insert({ edificio_id: ed, periodo_id: agosto, tipo: "recurrente", categoria: "Limpieza", descripcion: "Servicio", monto: 150, fecha: "2026-08-15" });
    const cf = await T.sb.rpc("confirmar_gastos", { p_periodo: agosto });
    const ab = await T.sb.rpc("abrir_periodo", { p_edificio: ed, p_recurrentes: [] });
    if (cf.error || ab.error) throw new Error(`Preparación: ${cf.error?.message ?? ab.error?.message}`);

    console.log("\n· Transparencia (RN-15)");
    const rep = await A.sb.rpc("reporte_meses", { p_edificio: ed, p_meses: 6 });
    ok(!rep.error && rep.data!.length === 2 && rep.data![0].mes === "2026-08-01", "El vecino ve ingresos y gastos de agosto y setiembre");
    ok(Number(rep.data?.[0].gastos) === 150 && Number(rep.data?.[0].acumulado) === -150, "Agosto: S/ 150 de gastos y acumulado de −S/ 150");
    ok(rep.data?.[0].oficial === true && rep.data?.[1].oficial === false, "Agosto oficial, setiembre borrador");
    const cob = (await A.sb.rpc("cobranza_edificio", { p_edificio: ed }).single()).data;
    ok(cob?.departamentos === 2 && Number(cob?.por_cobrar) === 200, "El vecino ve el total por cobrar del edificio (S/ 200) sin detalle");
    ok(((await X.sb.rpc("reporte_meses", { p_edificio: ed })).data ?? []).length === 0, "Una persona ajena no ve los reportes");
    ok(!(await X.sb.rpc("cobranza_edificio", { p_edificio: ed }).maybeSingle()).data?.departamentos, "Ni los totales de cobranza");
    await T.sb.from("edificios").update({ publicar_desglose: false }).eq("id", ed);
    ok(((await A.sb.rpc("cuentas_por_cobrar", { p_edificio: ed })).data ?? []).length === 0, "Sin publicar, el vecino no ve el desglose por departamento");
    ok(((await T.sb.rpc("cuentas_por_cobrar", { p_edificio: ed })).data ?? []).length === 2, "La titular sí lo ve");
    await T.sb.from("edificios").update({ publicar_desglose: true }).eq("id", ed);
    ok(((await A.sb.rpc("cuentas_por_cobrar", { p_edificio: ed })).data ?? []).length === 2, "Publicado, el vecino ve el desglose");

    console.log("\n· Chat del edificio con Realtime");
    const oyeB = await escuchar(B.sb, ed);
    const oyeX = await escuchar(X.sb, ed);
    canales.push(oyeB.cerrar, oyeX.cerrar);
    const m1 = await A.sb.from("mensajes").insert({ edificio_id: ed, texto: "  Hola vecinos  ", autor_id: B.id }).select().single();
    ok(!m1.error, "El 101 escribe en el chat");
    ok(m1.data?.autor_id === A.id && m1.data?.autor_depto === "101" && m1.data?.autor_nombre === "Prueba 101", "El mensaje queda a su nombre y con su departamento (aunque intente firmar como otro)");
    ok(m1.data?.texto === "Hola vecinos", "Se quitan los espacios de los extremos");
    ok(await esperar(() => oyeB.eventos.some((e) => e.tipo === "INSERT" && e.id === m1.data?.id)), "El 102 lo recibe sin recargar");
    ok(!!(await A.sb.from("mensajes").insert({ edificio_id: ed, texto: "Soy la administración", como_admin: true })).error, "Un vecino no puede escribir como administración");
    ok(!!(await A.sb.from("mensajes").insert({ edificio_id: ed, texto: "   " })).error, "No se envían mensajes vacíos");
    const m2 = await T.sb.from("mensajes").insert({ edificio_id: ed, texto: "Mañana cortan el agua de 9 a 12" }).select().single();
    ok(!m2.error && m2.data?.como_admin === true && m2.data?.autor_rol === "Administrador titular" && !m2.data?.autor_depto, "La titular externa escribe como administración");
    ok(!!(await X.sb.from("mensajes").insert({ edificio_id: ed, texto: "Intruso" })).error, "Una persona ajena no puede escribir");
    ok(((await X.sb.from("mensajes").select("id").eq("edificio_id", ed)).data ?? []).length === 0, "Ni leer el chat");
    const m3 = (await B.sb.from("mensajes").insert({ edificio_id: ed, texto: "Mensaje fuera de lugar" }).select().single()).data!;

    console.log("\n· Eliminar mensajes");
    await A.sb.from("mensajes").update({ texto: "Editado" }).eq("id", m1.data!.id);
    ok((await A.sb.from("mensajes").select("texto").eq("id", m1.data!.id).single()).data?.texto === "Hola vecinos", "Nadie edita mensajes directamente");
    ok(!!(await B.sb.rpc("eliminar_mensaje", { p_mensaje: m1.data!.id })).error, "El 102 no puede eliminar un mensaje del 101");
    ok(!(await A.sb.rpc("eliminar_mensaje", { p_mensaje: m1.data!.id })).error, "El 101 elimina su propio mensaje");
    ok(!(await T.sb.rpc("eliminar_mensaje", { p_mensaje: m3.id })).error, "La administración elimina un mensaje de otro vecino");
    const borrado = (await B.sb.from("mensajes").select("texto, eliminado_en").eq("id", m3.id).single()).data;
    ok(borrado?.texto === "Mensaje eliminado" && !!borrado.eliminado_en, "Queda «Mensaje eliminado» en lugar del texto");
    ok(await esperar(() => oyeB.eventos.some((e) => e.tipo === "UPDATE" && e.id === m1.data?.id && e.texto === "Mensaje eliminado")), "La eliminación también llega sin recargar");
    ok(!!(await A.sb.rpc("eliminar_mensaje", { p_mensaje: m1.data!.id })).error, "No se elimina dos veces");
    ok(oyeX.eventos.length === 0, "La persona ajena no recibió ningún mensaje por Realtime");
  } finally {
    for (const cerrar of canales) await cerrar();
    if (ed) {
      const { data: e } = await admin.from("edificios").select("organizacion_id").eq("id", ed).single();
      const ids = (await admin.from("departamentos").select("id").eq("edificio_id", ed)).data!.map((d) => d.id);
      await admin.from("mensajes").delete().eq("edificio_id", ed);
      await admin.from("pagos").delete().eq("edificio_id", ed);
      await admin.from("compromisos").delete().eq("edificio_id", ed);
      await admin.from("membresias").delete().eq("edificio_id", ed);
      await admin.from("ocupaciones").delete().in("departamento_id", ids);
      await admin.from("auditoria").delete().eq("edificio_id", ed);
      await admin.from("periodos").update({ gastos_confirmados_en: null }).eq("edificio_id", ed);
      await admin.from("gastos").delete().eq("edificio_id", ed);
      const { error } = await admin.from("edificios").delete().eq("id", ed);
      if (error) console.log(`✖ No se pudo borrar el edificio temporal: ${error.message}`);
      await admin.from("organizaciones").delete().eq("id", e!.organizacion_id);
    }
    for (const id of cuentas) await admin.auth.admin.deleteUser(id);
  }
  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
