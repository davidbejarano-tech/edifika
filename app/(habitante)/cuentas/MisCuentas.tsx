"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { ReciboModal } from "@/components/ReciboModal";
import { prepararComprobante } from "@/lib/comprobante";
import { fecha, mes, soles } from "@/lib/format";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Compromiso = {
  id: string | null;
  tipo: string | null;
  concepto: string | null;
  mes: string | null;
  monto: number;
  vence_en: string | null;
  estado: string | null;
  estado_visible: string | null;
  por_cobrar: boolean | null;
  rechazo: string | null;
  bruto: number | null;
  saldoAplicado: number;
};
type Adelanto = {
  conMontoFijo: boolean;
  aguaPorConsumo: boolean;
  parteFija: number | null;
  saldoFavor: number;
  ultimosPagos: { fecha: string; monto: number; concepto: string }[];
};
type Pago = {
  id: string;
  compromiso_id: string;
  monto: number;
  metodo: string;
  operacion: string | null;
  fecha_pago: string;
  estado: string;
  nota_rechazo: string | null;
  comprobante_path: string | null;
  concepto: string;
};
type Movimiento = { fecha: string; concepto: string; estado: string; cargo: number; abono: number; saldo: number };

type Props = {
  edificioId: string;
  departamentoId: string;
  numero: string;
  nombre: string;
  compromisos: Compromiso[];
  pagos: Pago[];
  movimientos: Movimiento[];
  datosPago: { cuenta: string | null; yape: string | null };
  adelanto: Adelanto;
  ausencia: Ausencia | null;
  mesRecibo: string | null; // mes abierto (AAAA-MM-01)
};
type Ausencia = { id: string; desde: string; hasta: string; motivo: string; estado: string; nota: string | null };

const ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "warn" },
  vencido: { texto: "Vencido", clase: "bad" },
  en_revision: { texto: "En revisión", clase: "info" },
  pagado: { texto: "Pagado", clase: "activo" },
  validado: { texto: "Validado", clase: "activo" },
  rechazado: { texto: "Rechazado", clase: "bad" },
};
const METODOS = ["Yape", "Plin", "Transferencia BCP", "Transferencia BBVA", "Transferencia Interbank", "Transferencia Scotiabank", "Depósito en agencia"];
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

export function MisCuentas({ edificioId, departamentoId, numero, nombre, compromisos, pagos, movimientos, datosPago, adelanto: ad, ausencia, mesRecibo }: Props) {
  const router = useRouter();
  const [pagar, setPagar] = useState<Compromiso[] | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [avisoAusencia, setAvisoAusencia] = useState(false);
  const [adelanto, setAdelanto] = useState(false);
  const [verCuenta, setVerCuenta] = useState(false);
  const [verRecibo, setVerRecibo] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [abriendo, iniciar] = useTransition();

  const porPagar = compromisos.filter((c) => c.estado === "pendiente" || c.estado === "en_revision");
  const total = compromisos.filter((c) => c.por_cobrar).reduce((s, c) => s + c.monto, 0);
  const vencido = compromisos.filter((c) => c.estado_visible === "vencido").reduce((s, c) => s + c.monto, 0);
  const pagables = porPagar.filter((c) => c.estado === "pendiente");
  const elegidos = pagables.filter((c) => seleccion.has(c.id!));
  const totalElegido = elegidos.reduce((s, c) => s + c.monto, 0);
  const todos = pagables.length > 0 && elegidos.length === pagables.length;
  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const vigente = ausencia && (ausencia.estado === "solicitada" || ausencia.estado === "aprobada") && ausencia.hasta >= hoyLima();

  function cancelarAusencia() {
    if (!ausencia || !confirm("¿Cancelar tu solicitud de ausencia?")) return;
    iniciar(async () => {
      const { error } = await crearClienteNavegador().rpc("cancelar_ausencia", { p_ausencia: ausencia.id });
      if (error) setAviso({ ok: false, texto: error.message });
      else listo("Solicitud de ausencia cancelada.");
    });
  }

  const adelantoAbierto = compromisos.some((c) => c.tipo === "adelanto" && (c.estado === "pendiente" || c.estado === "en_revision"));
  const puedeAdelantar = ad.conMontoFijo ? (ad.parteFija ?? 0) > 0 : true;

  function cancelarAdelanto(c: Compromiso) {
    if (!confirm(`¿Cancelar "${c.concepto}" por ${soles(c.monto)}?`)) return;
    iniciar(async () => {
      const { error } = await crearClienteNavegador().rpc("cancelar_adelanto", { p_compromiso: c.id! });
      if (error) setAviso({ ok: false, texto: error.message });
      else listo("Pago adelantado cancelado.");
    });
  }

  function verComprobante(p: Pago) {
    if (!p.comprobante_path) return;
    // La pestaña se abre en el clic (si se abre después de esperar, el navegador la bloquea)
    const pestana = window.open("", "_blank");
    iniciar(async () => {
      const { data } = await crearClienteNavegador().storage.from("comprobantes").createSignedUrl(p.comprobante_path!, 120);
      if (data?.signedUrl && pestana) pestana.location.href = data.signedUrl;
      else {
        pestana?.close();
        setAviso({ ok: false, texto: "No pudimos abrir el comprobante." });
      }
    });
  }

  const listo = (texto: string) => {
    setPagar(null);
    setAdelanto(false);
    setAvisoAusencia(false);
    setSeleccion(new Set());
    setAviso({ ok: true, texto });
    router.refresh();
  };

  return (
    <>
      <div className="mb-4">
        <h1>Departamento {numero}</h1>
        <p className="mt-1 text-muted">{nombre}</p>
      </div>

      {aviso && (
        <p className={aviso.ok ? "aviso" : "err"} role={aviso.ok ? "status" : "alert"}>
          {aviso.texto}
        </p>
      )}

      <section className="panel flex flex-wrap items-center gap-4">
        <div className="min-w-[200px] flex-1">
          <p className="text-sm text-muted">Total por pagar</p>
          <p className="font-display text-3xl font-extrabold tabular-nums">{soles(total)}</p>
          {vencido > 0 ? (
            <span className="chip bad">{soles(vencido)} vencido</span>
          ) : total === 0 ? (
            <span className="chip activo">Estás al día</span>
          ) : null}
          {ad.saldoFavor > 0 && (
            <p className="mt-2 text-sm">
              <b className="text-ok">Saldo a favor: {soles(ad.saldoFavor)}</b>
              <span className="block text-muted">
                Se aplica solo a tus próximas cuotas
                {ad.conMontoFijo && ad.aguaPorConsumo ? " (a la parte fija; el agua se cobra cada mes según tu consumo)" : ""}.
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {mesRecibo && (
            <button className="btn quiet" onClick={() => setVerRecibo(true)}>
              Ver mi recibo de {mes(mesRecibo).split(" ")[0]}
            </button>
          )}
          <button className="btn quiet" onClick={() => setVerCuenta((v) => !v)} aria-expanded={verCuenta}>
            {verCuenta ? "Ocultar mi cuenta corriente" : "Mi cuenta corriente"}
          </button>
          <button
            className="btn"
            onClick={() => setAdelanto(true)}
            disabled={!puedeAdelantar || adelantoAbierto}
            title={adelantoAbierto ? "Ya tienes un pago adelantado sin completar" : undefined}
          >
            Pagar por adelantado
          </button>
        </div>
      </section>

      {verCuenta && (
        <section className="panel">
          <h3 className="mb-2">Mi cuenta corriente</h3>
          {movimientos.length ? (
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th className="r">Cargo</th>
                    <th className="r">Abono</th>
                    <th className="r">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m, i) => (
                    <tr key={i} className={m.estado === "anulado" ? "text-muted line-through" : ""}>
                      <td className="whitespace-nowrap">{fecha(m.fecha)}</td>
                      <td>{m.concepto}</td>
                      <td className="r">{m.cargo ? soles(m.cargo) : ""}</td>
                      <td className="r text-ok">{m.abono ? soles(m.abono) : ""}</td>
                      <td className={`r font-semibold ${m.saldo < 0 ? "text-ok" : ""}`}>
                        {m.saldo < 0 ? `${soles(-m.saldo)} a favor` : soles(m.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">Sin movimientos todavía.</p>
          )}
        </section>
      )}

      <section className="panel flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <h3>¿Vas a estar fuera varios meses?</h3>
          {vigente && ausencia ? (
            <p className="mt-1 text-sm">
              {ausencia.estado === "aprobada" ? (
                <>
                  <span className="chip activo mr-1">Ausencia aprobada</span>
                  Del {fecha(ausencia.desde)} al {fecha(ausencia.hasta)}. Tu agua y los extraordinarios de esos meses vencen el{" "}
                  {fecha(sumarDias(ausencia.hasta, 15))}, sin mora.
                </>
              ) : (
                <>
                  <span className="chip info mr-1">Esperando aprobación</span>
                  Del {fecha(ausencia.desde)} al {fecha(ausencia.hasta)}. Mientras no se apruebe, se cobra normal.
                </>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Avisa tu ausencia: si la administración la aprueba, el agua y los extraordinarios de esos meses los pagas a tu regreso, sin
              mora. La cuota fija puedes cubrirla con un pago adelantado.
              {ausencia?.estado === "rechazada" && ausencia.nota && <span className="block text-bad">Tu última solicitud fue rechazada: {ausencia.nota}</span>}
            </p>
          )}
        </div>
        {vigente && ausencia?.estado === "solicitada" ? (
          <button className="btn quiet" onClick={cancelarAusencia} disabled={abriendo}>
            Cancelar solicitud
          </button>
        ) : !vigente ? (
          <button className="btn quiet" onClick={() => setAvisoAusencia(true)}>
            Avisar una ausencia
          </button>
        ) : null}
      </section>

      <section className="panel">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="flex-1">Por pagar</h3>
          {pagables.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={todos}
                onChange={() => setSeleccion(todos ? new Set() : new Set(pagables.map((c) => c.id!)))}
              />
              Marcar todos
            </label>
          )}
        </div>
        {porPagar.length === 0 ? (
          <p className="text-muted">No tienes pagos pendientes.</p>
        ) : (
          <ul className="divide-y divide-line">
            {porPagar.map((c) => {
              const e = ESTADO[c.estado_visible ?? "pendiente"] ?? ESTADO.pendiente;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  {c.estado === "pendiente" ? (
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--brand)]"
                      checked={seleccion.has(c.id!)}
                      onChange={() => alternar(c.id!)}
                      aria-label={`Elegir ${c.concepto} para pagar`}
                    />
                  ) : (
                    <span className="w-5" />
                  )}
                  <div className="min-w-[200px] flex-1">
                    <b>{c.concepto}</b>
                    <p className="text-sm text-muted">
                      {c.tipo === "adelanto" ? (
                        <>
                          <span className="chip tag mr-1">Pago adelantado</span>Al validarse, pasa a tu saldo a favor.
                        </>
                      ) : (
                        <>Vence el {c.vence_en && fecha(c.vence_en)}</>
                      )}
                    </p>
                    {c.saldoAplicado > 0 && c.bruto !== null && (
                      <p className="text-sm text-muted">
                        Cuota {soles(c.bruto)} − saldo a favor {soles(c.saldoAplicado)} = <b className="text-ink">{soles(c.monto)} por pagar</b>
                      </p>
                    )}
                    {c.estado === "pendiente" && c.rechazo && (
                      <p className="mt-1 text-sm text-bad">Comprobante rechazado: {c.rechazo}. Vuelve a enviarlo.</p>
                    )}
                  </div>
                  <span className={`chip ${e.clase}`}>{e.texto}</span>
                  <b className="tabular-nums">{soles(c.monto)}</b>
                  {c.estado === "en_revision" ? (
                    <span className="text-sm text-muted">Esperando validación</span>
                  ) : (
                    <span className="flex gap-1">
                      {c.tipo === "adelanto" && (
                        <button className="btn quiet sm" onClick={() => cancelarAdelanto(c)} disabled={abriendo}>
                          Cancelar
                        </button>
                      )}
                      <button className="btn quiet sm" onClick={() => setPagar([c])}>
                        Pagar
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {elegidos.length > 0 && (
          <div className="sticky bottom-2 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand bg-brand-soft px-4 py-3">
            <span className="flex-1">
              <b>
                {elegidos.length} {elegidos.length === 1 ? "compromiso" : "compromisos"}
              </b>{" "}
              · total <b className="tabular-nums">{soles(totalElegido)}</b>
            </span>
            <button className="btn" onClick={() => setPagar(elegidos)}>
              Pagar {elegidos.length > 1 ? "con un solo comprobante" : "y subir comprobante"}
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <h3 className="mb-3">Mis pagos</h3>
        {pagos.length === 0 ? (
          <p className="text-sm text-muted">Aún no registras pagos.</p>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Medio</th>
                  <th className="r">Monto</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => {
                  const e = ESTADO[p.estado] ?? ESTADO.pendiente;
                  return (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">{fecha(p.fecha_pago)}</td>
                      <td>
                        {p.concepto}
                        {p.estado === "rechazado" && p.nota_rechazo && <span className="block text-xs text-bad">{p.nota_rechazo}</span>}
                      </td>
                      <td>{p.metodo}</td>
                      <td className="r">{soles(p.monto)}</td>
                      <td>
                        <span className={`chip ${e.clase}`}>{e.texto}</span>
                      </td>
                      <td className="r">
                        {p.comprobante_path && (
                          <button className="btn quiet sm" onClick={() => verComprobante(p)} disabled={abriendo}>
                            Comprobante
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal abierto={!!pagar} titulo="Pagar y subir comprobante" onCerrar={() => setPagar(null)}>
        {pagar && (
          <FormPago
            compromisos={pagar}
            edificioId={edificioId}
            departamentoId={departamentoId}
            datosPago={datosPago}
            onListo={() =>
              listo(
                pagar.length > 1
                  ? `Comprobante enviado para ${pagar.length} compromisos. La administración los revisará juntos.`
                  : "Comprobante enviado. La administración lo revisará y tu cuota quedará pagada al validarlo.",
              )
            }
          />
        )}
      </Modal>

      <Modal abierto={avisoAusencia} titulo="Avisar una ausencia" onCerrar={() => setAvisoAusencia(false)}>
        {avisoAusencia && <FormAusencia edificioId={edificioId} onListo={() => listo("Solicitud enviada. La administración te avisará si la aprueba.")} />}
      </Modal>

      <Modal abierto={adelanto} titulo="Pagar por adelantado" onCerrar={() => setAdelanto(false)}>
        {adelanto && (
          <FormAdelanto
            edificioId={edificioId}
            datos={ad}
            onListo={(m) => listo(`Se registró tu pago adelantado de ${soles(m)}. Págalo desde “Por pagar” y sube tu comprobante.`)}
          />
        )}
      </Modal>
      <ReciboModal departamentoId={verRecibo ? departamentoId : null} mesIso={mesRecibo ?? ""} numero={numero} onCerrar={() => setVerRecibo(false)} />
    </>
  );
}

function FormPago({
  compromisos,
  edificioId,
  departamentoId,
  datosPago,
  onListo,
}: {
  compromisos: Compromiso[];
  edificioId: string;
  departamentoId: string;
  datosPago: { cuenta: string | null; yape: string | null };
  onListo: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const total = compromisos.reduce((s, c) => s + c.monto, 0);

  function enviar(f: FormData) {
    setError(null);
    const archivo = f.get("comprobante");
    const metodo = String(f.get("metodo") ?? "");
    const operacion = String(f.get("operacion") ?? "").trim();
    const fechaPago = String(f.get("fecha") ?? "");
    if (!(archivo instanceof File) || archivo.size === 0) return setError("Adjunta la foto o el PDF de tu comprobante.");
    if (!operacion) return setError("Escribe el número de operación que figura en tu comprobante.");

    iniciar(async () => {
      const listoArchivo = await prepararComprobante(archivo);
      if ("error" in listoArchivo) return setError(listoArchivo.error);
      const sb = crearClienteNavegador();
      const { data: sesion } = await sb.auth.getUser();
      if (!sesion.user) return setError("Tu sesión venció. Vuelve a ingresar.");

      // Carpeta del propio departamento: comprobantes/{edificio}/{departamento}/ (la RLS del bucket lo exige)
      const ruta = `${edificioId}/${departamentoId}/${crypto.randomUUID()}.${listoArchivo.ext}`;
      const { error: e1 } = await sb.storage.from("comprobantes").upload(ruta, listoArchivo.archivo, { contentType: listoArchivo.tipo });
      if (e1) return setError(`No pudimos subir el comprobante: ${e1.message}`);

      // RN-10: un pago por compromiso, todos con el mismo comprobante; si son varios, forman un grupo
      const grupo = compromisos.length > 1 ? crypto.randomUUID() : null;
      const { error: e2 } = await sb.from("pagos").insert(
        compromisos.map((c) => ({
          compromiso_id: c.id!,
          edificio_id: edificioId,
          departamento_id: departamentoId,
          monto: c.monto,
          metodo,
          operacion,
          fecha_pago: fechaPago || undefined,
          comprobante_path: ruta,
          registrado_por: sesion.user.id,
          estado: "en_revision" as const,
          grupo,
        })),
      );
      if (e2) {
        await sb.storage.from("comprobantes").remove([ruta]);
        return setError(/no está pendiente/i.test(e2.message) ? "Esta cuota ya tiene un pago en revisión o ya está pagada." : e2.message);
      }
      onListo();
    });
  }

  return (
    <form action={enviar}>
      {compromisos.length === 1 ? (
        <p className="font-semibold">{compromisos[0].concepto}</p>
      ) : (
        <ul className="mb-1 text-sm">
          {compromisos.map((c) => (
            <li key={c.id} className="flex justify-between gap-3">
              <span>{c.concepto}</span>
              <span className="tabular-nums">{soles(c.monto)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mb-3 font-display text-3xl font-extrabold tabular-nums">{soles(total)}</p>
      {compromisos.length > 1 && (
        <p className="mb-3 text-sm text-muted">Haz un solo pago por el total y sube ese comprobante: cubre los {compromisos.length} compromisos.</p>
      )}
      {(datosPago.cuenta || datosPago.yape) && (
        <div className="hint mb-3">
          Paga el monto exacto
          {datosPago.cuenta && (
            <>
              {" "}
              por transferencia a <b className="text-ink">{datosPago.cuenta}</b>
            </>
          )}
          {datosPago.yape && (
            <>
              {datosPago.cuenta ? " o" : ""} por Yape/Plin al <b className="text-ink">{datosPago.yape}</b>
            </>
          )}
          . Luego sube tu constancia.
        </div>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="pg-m">Medio de pago</label>
          <select id="pg-m" name="metodo">
            {METODOS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pg-o">N.° de operación</label>
          <input id="pg-o" name="operacion" required inputMode="numeric" placeholder="Ej. 00482731" />
        </div>
        <div className="field">
          <label htmlFor="pg-f">Fecha del pago</label>
          <input id="pg-f" name="fecha" type="date" defaultValue={hoyLima()} max={hoyLima()} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pg-c">Comprobante (foto o PDF, máximo 5 MB)</label>
        <input
          id="pg-c"
          name="comprobante"
          type="file"
          accept="image/*,application/pdf"
          required
          onChange={(e) => {
            const f = e.target.files?.[0];
            setVista(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
          }}
        />
      </div>
      {vista && (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local del archivo elegido
        <img src={vista} alt="Vista previa del comprobante" className="mb-3 max-h-56 rounded-lg border border-line" />
      )}
      <div className="flex justify-end">
        <button className="btn" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar comprobante"}
        </button>
      </div>
    </form>
  );
}

function FormAdelanto({ edificioId, datos, onListo }: { edificioId: string; datos: Adelanto; onListo: (monto: number) => void }) {
  const [meses, setMeses] = useState(1);
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const fija = datos.parteFija ?? 0;
  const total = datos.conMontoFijo ? fija * meses : Number(monto.replace(",", "."));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!(total > 0)) return setError("Escribe un monto mayor que cero.");
        iniciar(async () => {
          const { error } = await crearClienteNavegador().rpc(
            "solicitar_adelanto",
            datos.conMontoFijo ? { p_edificio: edificioId, p_meses: meses } : { p_edificio: edificioId, p_monto: total },
          );
          if (error) setError(error.message);
          else onListo(total);
        });
      }}
    >
      <p className="mb-3 text-muted">
        Lo que pagues por adelantado queda como <b className="text-ink">saldo a favor</b> y se aplica solo a tus próximas cuotas.
        {datos.saldoFavor > 0 && ` Hoy tienes ${soles(datos.saldoFavor)} a favor.`}
      </p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      {datos.conMontoFijo ? (
        <>
          <div className="field">
            <label htmlFor="ad-m">¿Cuántos meses de cuota fija?</label>
            <select id="ad-m" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "mes" : "meses"} · {soles(fija * n)}
                </option>
              ))}
            </select>
          </div>
          <p className="hint">
            Tu cuota fija es de {soles(fija)} al mes.
            {datos.aguaPorConsumo && " El agua no se adelanta: se cobra cada mes, en su fecha, según tu consumo."}
          </p>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="ad-s">Monto a adelantar (S/)</label>
            <input
              id="ad-s"
              type="number"
              min="1"
              step="0.01"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
          </div>
          <div className="hint">
            <p>En tu edificio la cuota cambia cada mes según los gastos. Como referencia, tus últimos pagos de cuota:</p>
            {datos.ultimosPagos.length ? (
              <ul className="mt-1">
                {datos.ultimosPagos.map((p, i) => (
                  <li key={i}>
                    {p.concepto.replace("Cuota de mantenimiento, ", "")}: <b className="text-ink">{soles(p.monto)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">Todavía no tienes pagos de cuota registrados.</p>
            )}
            <p className="mt-1">Cada mes verás cuánto te toca pagar y cuánto te queda de saldo.</p>
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-end gap-3">
        {total > 0 && <b className="tabular-nums">{soles(total)}</b>}
        <button className="btn" disabled={enviando}>
          {enviando ? "Registrando…" : "Registrar pago adelantado"}
        </button>
      </div>
    </form>
  );
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function FormAusencia({ edificioId, onListo }: { edificioId: string; onListo: () => void }) {
  const hoy = hoyLima();
  const [desde, setDesde] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const maximo = (() => {
    const d = new Date(`${desde}T12:00:00`);
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <form
      action={(f) => {
        setError(null);
        iniciar(async () => {
          const { error } = await crearClienteNavegador().rpc("solicitar_ausencia", {
            p_edificio: edificioId,
            p_desde: String(f.get("desde")),
            p_hasta: String(f.get("hasta")),
            p_motivo: String(f.get("motivo") ?? ""),
          });
          if (error) setError(error.message);
          else onListo();
        });
      }}
    >
      <p className="mb-3 text-muted">
        Si la administración aprueba tu ausencia, el <b className="text-ink">agua</b> y los <b className="text-ink">compromisos extraordinarios</b> de
        esos meses vencerán 15 días después de tu regreso, sin mora. La <b className="text-ink">cuota fija</b> sigue venciendo cada mes: cúbrela con
        un pago adelantado.
      </p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="au-d">Salgo el</label>
          <input id="au-d" name="desde" type="date" value={desde} min={hoy} onChange={(e) => setDesde(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="au-h">Regreso el (máximo 6 meses)</label>
          <input id="au-h" name="hasta" type="date" min={desde} max={maximo} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="au-m">Motivo</label>
        <textarea id="au-m" name="motivo" rows={2} placeholder="Ej. Viaje de trabajo al extranjero" required />
      </div>
      <div className="flex justify-end">
        <button className="btn" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </form>
  );
}
