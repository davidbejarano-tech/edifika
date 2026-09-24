"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { fecha, mes, soles } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import {
  anularCompromiso,
  emitirExtraordinario,
  pagoEfectivo,
  rechazarGrupo,
  rechazarPago,
  resolverAusencia,
  urlComprobante,
  validarGrupo,
  validarPago,
  type Resultado,
} from "./acciones";

type Fn = Database["public"]["Functions"];
type Pago = Fn["pagos_por_validar"]["Returns"][number];
type Cuenta = Fn["cuentas_por_cobrar"]["Returns"][number];
type Compromiso = Fn["compromisos_admin"]["Returns"][number];

const inicial: Resultado = { ok: false, mensaje: null };

const TIPO: Record<string, string> = {
  cuota: "Cuota",
  mora: "Mora",
  extraordinario: "Extraordinario",
  adelanto: "Pago adelantado",
  ajuste: "Ajuste",
  reserva: "Reserva",
  garantia: "Garantía",
};
const ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "warn" },
  vencido: { texto: "Vencido", clase: "bad" },
  en_revision: { texto: "En revisión", clase: "info" },
  pagado: { texto: "Pagado", clase: "activo" },
  anulado: { texto: "Anulado", clase: "tag line-through" },
};

function Aviso({ r }: { r: Resultado }) {
  if (!r.mensaje) return null;
  return (
    <p className={r.ok ? "aviso" : "err"} role={r.ok ? "status" : "alert"}>
      {r.mensaje}
    </p>
  );
}

// ---------------------------------------------------------------------
// Por validar
// ---------------------------------------------------------------------
// Pagos que comparten comprobante (grupo) se muestran juntos y se resuelven completos (RN-10)
type Lote = { clave: string; grupo: string | null; pagos: Pago[] };

export function PorValidar({ pagos }: { pagos: Pago[] }) {
  const [aviso, setAviso] = useState<Resultado>(inicial);
  const [pendiente, iniciar] = useTransition();
  const [rechazo, setRechazo] = useState<Lote | null>(null);
  const [comprobante, setComprobante] = useState<{ url: string; pdf: boolean; titulo: string } | null>(null);

  const lotes = useMemo(() => {
    const porGrupo = new Map<string, Lote>();
    for (const p of pagos) {
      const clave = p.grupo ?? p.pago_id;
      const lote = porGrupo.get(clave) ?? { clave, grupo: p.grupo, pagos: [] };
      lote.pagos.push(p);
      porGrupo.set(clave, lote);
    }
    return [...porGrupo.values()];
  }, [pagos]);

  function ver(p: Pago) {
    if (!p.comprobante_path) return;
    iniciar(async () => {
      const r = await urlComprobante(p.comprobante_path!);
      if (r.url) setComprobante({ url: r.url, pdf: /\.pdf$/i.test(p.comprobante_path!), titulo: `Comprobante · depto ${p.numero}` });
      else setAviso({ ok: false, mensaje: r.error });
    });
  }

  function validar(l: Lote) {
    const total = l.pagos.reduce((s, p) => s + Number(p.monto), 0);
    const texto = l.pagos.length > 1 ? `los ${l.pagos.length} compromisos (${soles(total)})` : `el pago de ${soles(total)}`;
    if (!confirm(`¿Validar ${texto} del departamento ${l.pagos[0].numero}? Revisa antes el comprobante.`)) return;
    iniciar(async () => setAviso(l.grupo ? await validarGrupo(l.grupo) : await validarPago(l.pagos[0].pago_id)));
  }

  return (
    <>
      <Aviso r={aviso} />
      {lotes.length === 0 ? (
        <p className="hint">No hay pagos por validar.</p>
      ) : (
        <div className="grid gap-3">
          {lotes.map((l) => {
            const p = l.pagos[0];
            const total = l.pagos.reduce((s, x) => s + Number(x.monto), 0);
            const puede = l.pagos.every((x) => x.puede_validar);
            return (
              <article key={l.clave} className="panel mb-0 flex flex-wrap items-center gap-4">
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm text-muted">
                    Departamento {p.numero}
                    {l.pagos.length > 1 && <span className="chip info ml-2">Pago agrupado · {l.pagos.length} compromisos</span>}
                  </p>
                  {l.pagos.length === 1 ? (
                    <p className="font-semibold">{p.concepto}</p>
                  ) : (
                    <ul className="my-1 text-sm">
                      {l.pagos.map((x) => (
                        <li key={x.pago_id} className="flex justify-between gap-3">
                          <span>{x.concepto}</span>
                          <span className="tabular-nums">{soles(x.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-sm text-muted">
                    {p.metodo}
                    {p.operacion && ` · operación ${p.operacion}`} · pagado el {fecha(p.fecha_pago)}
                    {p.registrado_por && ` · enviado por ${p.registrado_por}`}
                  </p>
                </div>
                <b className="font-display text-xl tabular-nums">{soles(total)}</b>
                <div className="flex flex-wrap items-center gap-2">
                  {p.comprobante_path ? (
                    <button className="btn quiet sm" onClick={() => ver(p)} disabled={pendiente}>
                      Ver comprobante
                    </button>
                  ) : (
                    <span className="text-sm text-muted">Sin comprobante</span>
                  )}
                  {puede ? (
                    <>
                      <button className="btn danger sm" onClick={() => setRechazo(l)} disabled={pendiente}>
                        Rechazar{l.pagos.length > 1 ? " todo" : ""}
                      </button>
                      <button className="btn sm" onClick={() => validar(l)} disabled={pendiente}>
                        Validar {l.pagos.length > 1 ? "todo" : "pago"}
                      </button>
                    </>
                  ) : (
                    <p className="max-w-[320px] text-sm text-muted">{l.pagos.find((x) => !x.puede_validar)?.motivo}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal abierto={!!rechazo} titulo={`Rechazar el pago del depto ${rechazo?.pagos[0].numero ?? ""}`} onCerrar={() => setRechazo(null)}>
        {rechazo && (
          <FormMotivo
            ayuda={
              rechazo.pagos.length > 1
                ? `Se rechazan los ${rechazo.pagos.length} compromisos pagados con este comprobante. El vecino verá el motivo y podrá volver a enviarlo.`
                : "El vecino verá este motivo y podrá volver a enviar su pago. La cuota vuelve a pendiente."
            }
            placeholder="Ej. El monto del voucher no coincide con el total"
            boton={rechazo.pagos.length > 1 ? "Rechazar todo" : "Rechazar pago"}
            onEnviar={async (m) => {
              const r = rechazo.grupo ? await rechazarGrupo(rechazo.grupo, m) : await rechazarPago(rechazo.pagos[0].pago_id, m);
              if (r.ok) {
                setRechazo(null);
                setAviso(r);
              }
              return r;
            }}
          />
        )}
      </Modal>

      <Modal abierto={!!comprobante} titulo={comprobante?.titulo ?? ""} onCerrar={() => setComprobante(null)}>
        {comprobante && (
          <>
            {comprobante.pdf ? (
              <iframe src={comprobante.url} title={comprobante.titulo} className="h-[60dvh] w-full rounded-lg border border-line" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal de Supabase Storage
              <img src={comprobante.url} alt={comprobante.titulo} className="mx-auto max-h-[60dvh] rounded-lg" />
            )}
            <p className="mt-2 text-right text-sm">
              <a href={comprobante.url} target="_blank" rel="noreferrer" className="font-semibold text-brand">
                Abrir en otra pestaña
              </a>
            </p>
          </>
        )}
      </Modal>
    </>
  );
}

function FormMotivo({
  ayuda,
  placeholder,
  boton,
  onEnviar,
}: {
  ayuda: string;
  placeholder: string;
  boton: string;
  onEnviar: (motivo: string) => Promise<Resultado>;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await onEnviar(motivo);
          if (!r.ok) setError(r.mensaje);
        });
      }}
    >
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="motivo">Motivo</label>
        <textarea id="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={placeholder} required />
      </div>
      <p className="mb-3 text-sm text-muted">{ayuda}</p>
      <div className="flex justify-end">
        <button className="btn danger" disabled={enviando || !motivo.trim()}>
          {enviando ? "Guardando…" : boton}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Cuentas por cobrar
// ---------------------------------------------------------------------
export function CuentasPorCobrar({ cuentas }: { cuentas: Cuenta[] }) {
  const pendiente = cuentas.reduce((s, c) => s + Number(c.pendiente), 0);
  const vencido = cuentas.reduce((s, c) => s + Number(c.vencido), 0);
  const conDeuda = cuentas.filter((c) => Number(c.pendiente) > 0);
  const aFavor = cuentas.reduce((s, c) => s + Number(c.saldo_favor), 0);
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Por cobrar" valor={soles(pendiente)} />
        <Cifra titulo="Vencido" valor={soles(vencido)} alerta={vencido > 0} />
        <Cifra titulo="Departamentos con deuda" valor={`${conDeuda.length} de ${cuentas.length}`} />
      </div>
      <section className="panel">
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Depto</th>
                <th className="r">Por cobrar</th>
                <th className="r">Vencido</th>
                <th className="r">Saldo a favor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.departamento_id}>
                  <td>{c.numero}</td>
                  <td className="r">{soles(c.pendiente)}</td>
                  <td className={`r ${Number(c.vencido) > 0 ? "font-semibold text-bad" : ""}`}>{soles(c.vencido)}</td>
                  <td className="r text-ok">{Number(c.saldo_favor) > 0 ? soles(c.saldo_favor) : ""}</td>
                  <td className="r">
                    {Number(c.pendiente) > 0 ? (
                      <Link href={`/cobranza?t=emitidos&d=${c.numero}`} className="btn quiet sm">
                        Ver compromisos
                      </Link>
                    ) : (
                      <span className="chip activo">Al día</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td>Total</td>
                <td className="r">{soles(pendiente)}</td>
                <td className="r">{soles(vencido)}</td>
                <td className="r text-ok">{aFavor > 0 ? soles(aFavor) : ""}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-sm text-muted">Incluye los pagos en revisión. Los pagos adelantados no son deuda: al validarse pasan a saldo a favor y se aplican solos a las siguientes cuotas.</p>
      </section>
    </>
  );
}

function Cifra({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`font-display text-xl font-bold tabular-nums ${alerta ? "text-bad" : ""}`}>{valor}</p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Compromisos emitidos
// ---------------------------------------------------------------------
export function Emitidos({ compromisos, esTitular, filtroDepto }: { compromisos: Compromiso[]; esTitular: boolean; filtroDepto: string }) {
  const [aviso, setAviso] = useState<Resultado>(inicial);
  const [pendiente, iniciar] = useTransition();
  const [depto, setDepto] = useState(filtroDepto);
  const [estado, setEstado] = useState("");
  const [anular, setAnular] = useState<Compromiso | null>(null);

  const deptos = useMemo(() => [...new Set(compromisos.map((c) => c.numero))], [compromisos]);
  const lista = compromisos.filter((c) => (!depto || c.numero === depto) && (!estado || c.estado_visible === estado));
  const total = lista.filter((c) => c.estado !== "anulado").reduce((s, c) => s + Number(c.monto), 0);

  function efectivo(c: Compromiso) {
    if (!confirm(`¿Registrar el pago en efectivo de ${soles(c.monto)} del departamento ${c.numero}?`)) return;
    iniciar(async () => setAviso(await pagoEfectivo(c.compromiso_id)));
  }

  return (
    <>
      <Aviso r={aviso} />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          Departamento
          <select value={depto} onChange={(e) => setDepto(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-ink">
            <option value="">Todos</option>
            {deptos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-ink">
            <option value="">Todos</option>
            {Object.entries(ESTADO).map(([k, v]) => (
              <option key={k} value={k}>
                {v.texto}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <b className="tabular-nums">
          {lista.length} compromisos · {soles(total)}
        </b>
      </div>

      <section className="panel">
        {lista.length === 0 ? (
          <p className="text-muted">No hay compromisos con esos filtros.</p>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Depto</th>
                  <th>Concepto</th>
                  <th>Vence</th>
                  <th className="r">Monto</th>
                  <th>Estado</th>
                  <th className="r">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const e = ESTADO[c.estado_visible] ?? ESTADO.pendiente;
                  const cobrable = c.estado === "pendiente";
                  return (
                    <tr key={c.compromiso_id}>
                      <td>{c.numero}</td>
                      <td>
                        {c.concepto}
                        <span className="block text-xs text-muted">
                          {TIPO[c.tipo] ?? c.tipo} · {mes(c.mes)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{fecha(c.vence_en)}</td>
                      <td className="r">{soles(c.monto)}</td>
                      <td>
                        <span className={`chip ${e.clase}`}>{e.texto}</span>
                        {c.estado === "pagado" && c.pago_metodo && (
                          <span className="block text-xs text-muted">
                            {c.pago_metodo} · {c.pago_fecha && fecha(c.pago_fecha)}
                            {c.validado_por && ` · validó ${c.validado_por}`}
                          </span>
                        )}
                        {c.estado === "anulado" && c.anulado_motivo && <span className="block text-xs text-muted">{c.anulado_motivo}</span>}
                        {cobrable && c.ultimo_rechazo && <span className="block text-xs text-bad">Rechazado: {c.ultimo_rechazo}</span>}
                      </td>
                      <td className="r">
                        <div className="flex justify-end gap-1">
                          {cobrable && c.puede_validar && (
                            <button className="btn quiet sm" onClick={() => efectivo(c)} disabled={pendiente}>
                              Efectivo
                            </button>
                          )}
                          {cobrable && esTitular && (
                            <button className="btn danger sm" onClick={() => setAnular(c)} disabled={pendiente}>
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal abierto={!!anular} titulo={`Anular: ${anular?.concepto ?? ""}`} onCerrar={() => setAnular(null)}>
        {anular && (
          <FormMotivo
            ayuda={`Se anulará el compromiso de ${soles(anular.monto)} del departamento ${anular.numero}. Deja de ser una cuenta por cobrar.`}
            placeholder="Ej. Emitido por error"
            boton="Anular compromiso"
            onEnviar={async (m) => {
              const r = await anularCompromiso(anular.compromiso_id, m);
              if (r.ok) {
                setAnular(null);
                setAviso(r);
              }
              return r;
            }}
          />
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------
// Nuevo compromiso extraordinario (solo titular)
// ---------------------------------------------------------------------
export function NuevoExtraordinario({ departamentos, mesAbierto }: { departamentos: { id: string; numero: string }[]; mesAbierto: string }) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<Resultado>(inicial);
  return (
    <>
      <button className="btn" onClick={() => setAbierto(true)}>
        Nuevo compromiso extraordinario
      </button>
      {aviso.mensaje && (
        <p className="aviso w-full" role="status">
          {aviso.mensaje}
        </p>
      )}
      <Modal abierto={abierto} titulo="Nuevo compromiso extraordinario" onCerrar={() => setAbierto(false)}>
        <FormExtraordinario
          departamentos={departamentos}
          mesAbierto={mesAbierto}
          onListo={(r) => {
            setAbierto(false);
            setAviso(r);
          }}
        />
      </Modal>
    </>
  );
}

function FormExtraordinario({
  departamentos,
  mesAbierto,
  onListo,
}: {
  departamentos: { id: string; numero: string }[];
  mesAbierto: string;
  onListo: (r: Resultado) => void;
}) {
  const [r, enviar, enviando] = useActionState(emitirExtraordinario, inicial);
  const [destino, setDestino] = useState("");
  const [reparto, setReparto] = useState("alicuota");
  const avisado = useRef<Resultado | null>(null);
  useEffect(() => {
    if (r.ok && avisado.current !== r) {
      avisado.current = r;
      onListo(r);
    }
  }, [r, onListo]);
  const [a, m] = mesAbierto.split("-").map(Number);
  const venceSugerido = `${mesAbierto.slice(0, 7)}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;

  return (
    <form action={enviar}>
      {!r.ok && r.mensaje && (
        <p className="err" role="alert">
          {r.mensaje}
        </p>
      )}
      <div className="field">
        <label htmlFor="ex-c">Concepto</label>
        <input id="ex-c" name="concepto" required placeholder="Ej. Pintura de fachada, cuota 1 de 3" />
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="ex-d">A quién se cobra</label>
          <select id="ex-d" name="departamento" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Todos los departamentos</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                Departamento {d.numero}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ex-v">Vence</label>
          <input id="ex-v" name="vence" type="date" defaultValue={venceSugerido} required />
        </div>
      </div>
      {!destino && (
        <div className="opts">
          <label className="opt">
            <input type="radio" name="reparto" value="alicuota" checked={reparto === "alicuota"} onChange={() => setReparto("alicuota")} />
            <span>
              <b className="block">Repartir un total por área</b>
              <span className="text-sm text-muted">Escribes el total y cada departamento paga según su alícuota.</span>
            </span>
          </label>
          <label className="opt">
            <input type="radio" name="reparto" value="igual" checked={reparto === "igual"} onChange={() => setReparto("igual")} />
            <span>
              <b className="block">El mismo monto a cada uno</b>
              <span className="text-sm text-muted">Escribes el monto que paga cada departamento.</span>
            </span>
          </label>
        </div>
      )}
      {destino && <input type="hidden" name="reparto" value="igual" />}
      <div className="field">
        <label htmlFor="ex-m">
          {destino ? "Monto (S/)" : reparto === "alicuota" ? "Monto total a repartir (S/)" : "Monto por departamento (S/)"}
        </label>
        <input id="ex-m" name="monto" type="number" step="0.01" min="0.01" required />
      </div>
      <p className="hint">Se registra como cuenta por cobrar y los vecinos lo verán en “Mis cuentas” para pagarlo.</p>
      <div className="mt-3 flex justify-end">
        <button className="btn" disabled={enviando}>
          {enviando ? "Emitiendo…" : "Emitir compromiso"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Ausencias (RN-40)
// ---------------------------------------------------------------------
type Ausencia = Fn["ausencias_admin"]["Returns"][number];
const ESTADO_AUSENCIA: Record<string, { texto: string; clase: string }> = {
  solicitada: { texto: "Por aprobar", clase: "info" },
  aprobada: { texto: "Aprobada", clase: "activo" },
  rechazada: { texto: "Rechazada", clase: "bad" },
  cancelada: { texto: "Cancelada", clase: "tag" },
};

export function Ausencias({ ausencias }: { ausencias: Ausencia[] }) {
  const [aviso, setAviso] = useState<Resultado>(inicial);
  const [pendiente, iniciar] = useTransition();
  const [rechazo, setRechazo] = useState<Ausencia | null>(null);

  function aprobar(a: Ausencia) {
    if (!confirm(`¿Aprobar la ausencia del departamento ${a.numero} del ${fecha(a.desde)} al ${fecha(a.hasta)}?`)) return;
    iniciar(async () => setAviso(await resolverAusencia(a.ausencia_id, true, "")));
  }

  return (
    <>
      <Aviso r={aviso} />
      <p className="mb-3 text-sm text-muted">
        Con una ausencia aprobada, el agua y los compromisos extraordinarios del vecino vencen 15 días después de su regreso, sin
        mora. La cuota fija sigue venciendo cada mes.
      </p>
      {ausencias.length === 0 ? (
        <p className="hint">No hay solicitudes de ausencia.</p>
      ) : (
        <div className="grid gap-3">
          {ausencias.map((a) => {
            const e = ESTADO_AUSENCIA[a.estado] ?? ESTADO_AUSENCIA.cancelada;
            return (
              <article key={a.ausencia_id} className="panel mb-0 flex flex-wrap items-center gap-4">
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm text-muted">
                    Departamento {a.numero}
                    {a.solicitante && ` · ${a.solicitante}`}
                  </p>
                  <p className="font-semibold">
                    Del {fecha(a.desde)} al {fecha(a.hasta)}
                  </p>
                  <p className="text-sm text-muted">{a.motivo}</p>
                  {a.nota && <p className="text-sm text-bad">Motivo del rechazo: {a.nota}</p>}
                  {a.resuelta_por && a.estado !== "solicitada" && <p className="text-xs text-muted">Resolvió {a.resuelta_por}</p>}
                </div>
                <span className={`chip ${e.clase}`}>{e.texto}</span>
                {a.estado === "solicitada" &&
                  (a.puede_resolver ? (
                    <div className="flex gap-2">
                      <button className="btn danger sm" onClick={() => setRechazo(a)} disabled={pendiente}>
                        Rechazar
                      </button>
                      <button className="btn sm" onClick={() => aprobar(a)} disabled={pendiente}>
                        Aprobar
                      </button>
                    </div>
                  ) : (
                    <p className="max-w-[280px] text-sm text-muted">
                      La aprueba el administrador titular (si es su propio departamento, un coadministrador).
                    </p>
                  ))}
              </article>
            );
          })}
        </div>
      )}

      <Modal abierto={!!rechazo} titulo={`Rechazar la ausencia del depto ${rechazo?.numero ?? ""}`} onCerrar={() => setRechazo(null)}>
        {rechazo && (
          <FormMotivo
            ayuda="El vecino verá este motivo. Sus cargos seguirán venciendo en las fechas normales."
            placeholder="Ej. Tiene deuda vencida pendiente"
            boton="Rechazar ausencia"
            onEnviar={async (m) => {
              const r = await resolverAusencia(rechazo.ausencia_id, false, m);
              if (r.ok) {
                setRechazo(null);
                setAviso(r);
              }
              return r;
            }}
          />
        )}
      </Modal>
    </>
  );
}
