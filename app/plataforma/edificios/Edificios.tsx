"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { fecha } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import { asignarPlan, eliminarEdificio, iniciarSoporte, posponerDepuracion, type Resultado } from "../acciones";

type Edificio = Database["public"]["Functions"]["plataforma_edificios"]["Returns"][number];
type PlanCorto = { id: string; nombre: string };
type Accion = "revision" | "intervencion" | "plan" | "posponer" | "eliminar";

const NOMBRE_ACCION: Record<Accion, string> = {
  revision: "Revisar en solo lectura",
  intervencion: "Intervenir con cambios",
  plan: "Asignar plan",
  posponer: "Posponer la eliminación",
  eliminar: "Eliminar el edificio",
};

// Lista de edificios con su ficha y las acciones del equipo EDIFIKA
export function Edificios({ edificios, planes }: { edificios: Edificio[]; planes: PlanCorto[] }) {
  const [buscar, setBuscar] = useState("");
  const [ficha, setFicha] = useState<Edificio | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [aviso, setAviso] = useState<Resultado | null>(null);

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q
      ? edificios.filter((e) => [e.nombre, e.codigo, e.titular, e.correo_titular].some((x) => (x ?? "").toLowerCase().includes(q)))
      : edificios;
  }, [buscar, edificios]);
  const nombrePlan = (id: string | null) => planes.find((p) => p.id === id)?.nombre ?? id;

  return (
    <>
      {aviso && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} role="status">
          {aviso.mensaje}
        </p>
      )}
      <input
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por nombre, código, titular o correo"
        aria-label="Buscar edificio"
        className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2 sm:max-w-[420px]"
      />
      <div className="panel tbl">
        <table>
          <thead>
            <tr>
              <th>Edificio</th>
              <th>Titular</th>
              <th className="r">Deptos</th>
              <th>Plan</th>
              <th className="r">Sin movimiento</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.edificio_id}>
                <td>
                  <b>{e.nombre}</b>
                  <span className="block text-xs text-muted">
                    {e.codigo} · desde {fecha(e.creado)}
                  </span>
                </td>
                <td>
                  {e.titular ?? "—"}
                  <span className="block text-xs text-muted">{e.correo_titular}</span>
                </td>
                <td className="r">{e.departamentos}</td>
                <td>
                  {e.pagado ? <span className="chip activo">{nombrePlan(e.plan)}</span> : <span className="chip tag">Sin plan</span>}
                  {e.solicitudes > 0 && <span className="chip warn ml-1">Solicitud</span>}
                </td>
                <td className={`r ${!e.pagado && e.dias_sin_movimiento >= 60 ? "font-bold text-bad" : ""}`}>{e.dias_sin_movimiento} días</td>
                <td className="r">
                  <button className="btn quiet sm" onClick={() => setFicha(e)}>
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">
                  No hay edificios que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal abierto={!!ficha && !accion} titulo={ficha?.nombre ?? ""} onCerrar={() => setFicha(null)}>
        {ficha && (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Dato t="Código" v={ficha.codigo} />
              <Dato t="Dirección" v={ficha.direccion} />
              <Dato t="Titular" v={ficha.titular ?? "—"} />
              <Dato t="Correo del titular" v={ficha.correo_titular ?? "—"} />
              <Dato t="Departamentos" v={String(ficha.departamentos)} />
              <Dato t="Plan" v={ficha.pagado ? `${nombrePlan(ficha.plan)} (pagado)` : "Sin plan"} />
              <Dato t="Sin movimiento" v={`${ficha.dias_sin_movimiento} días`} />
              <Dato t="Eliminación pospuesta" v={ficha.no_depurar_hasta ? `Hasta el ${fecha(ficha.no_depurar_hasta)}` : "No"} />
            </dl>
            <h3 className="mb-2 text-base">Soporte</h3>
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              <button className="btn quiet" onClick={() => setAccion("revision")}>
                🔍 Revisar en solo lectura
              </button>
              <button className="btn quiet" onClick={() => setAccion("intervencion")}>
                🛠️ Intervenir con cambios
              </button>
            </div>
            <h3 className="mb-2 text-base">Cuenta</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <button className="btn quiet" onClick={() => setAccion("plan")}>
                Asignar plan
              </button>
              <button className="btn quiet" onClick={() => setAccion("posponer")} disabled={ficha.pagado}>
                Posponer eliminación
              </button>
              <button className="btn danger" onClick={() => setAccion("eliminar")}>
                Eliminar edificio
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal abierto={!!ficha && !!accion} titulo={accion ? `${NOMBRE_ACCION[accion]} · ${ficha?.nombre}` : ""} onCerrar={() => setAccion(null)}>
        {ficha && accion && (
          <FormAccion
            accion={accion}
            edificio={ficha}
            planes={planes}
            onListo={(r) => {
              setAviso(r);
              if (r.ok) {
                setAccion(null);
                setFicha(null);
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{t}</dt>
      <dd className="font-semibold break-words">{v}</dd>
    </div>
  );
}

function FormAccion({
  accion,
  edificio,
  planes,
  onListo,
}: {
  accion: Accion;
  edificio: Edificio;
  planes: PlanCorto[];
  onListo: (r: Resultado) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [plan, setPlan] = useState(edificio.pagado ? (edificio.plan ?? "") : "");
  const [dias, setDias] = useState(30);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    iniciar(async () => {
      const r =
        accion === "revision" || accion === "intervencion"
          ? await iniciarSoporte(edificio.edificio_id, accion, motivo, referencia)
          : accion === "plan"
            ? await asignarPlan(edificio.edificio_id, plan || null)
            : accion === "posponer"
              ? await posponerDepuracion(edificio.edificio_id, dias, motivo)
              : await eliminarEdificio(edificio.edificio_id, codigo, motivo);
      // iniciarSoporte redirige al edificio; si vuelve, es un error
      if (r && !r.ok) setError(r.mensaje ?? "No se pudo completar la acción.");
      else if (r) onListo(r);
    });
  }

  return (
    <form onSubmit={enviar}>
      {accion === "revision" && (
        <p className="hint mb-3">
          Verás las pantallas de administración del edificio sin poder cambiar nada, durante 2 horas. El acceso queda en la auditoría
          del edificio.
        </p>
      )}
      {accion === "intervencion" && (
        <p className="mb-3 rounded-lg border border-warn bg-warn-bg px-3 py-2 text-sm text-warn">
          Tendrás los permisos del titular durante 1 hora (salvo validar pagos y cambiar accesos). Cada cambio queda firmado con tu
          nombre y la referencia, y el titular verá un aviso en su Inicio.
        </p>
      )}
      {accion === "eliminar" && (
        <p className="mb-3 rounded-lg border border-bad bg-bad-bg px-3 py-2 text-sm text-bad">
          Se borran para siempre los datos, los comprobantes, los recibos y las cuentas que no pertenezcan a otro edificio. No se
          puede deshacer. Hazlo solo a pedido escrito del titular.
        </p>
      )}

      {accion === "plan" ? (
        <div className="field">
          <label htmlFor="ac-plan">Plan pagado</label>
          <select id="ac-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Sin plan (quitar el plan pagado)</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Asigna el plan cuando confirmes el pago. Un edificio con plan pagado no se elimina por inactividad.</p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="ac-motivo">Motivo</label>
          <textarea
            id="ac-motivo"
            rows={2}
            required
            minLength={5}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              accion === "eliminar"
                ? "Ej. Pedido del titular por correo del 26/09: el edificio cambió de administración"
                : accion === "posponer"
                  ? "Ej. El titular pidió más tiempo para decidir el plan"
                  : "Ej. El titular consulta por qué la cuota del 302 subió"
            }
          />
        </div>
      )}
      {accion === "intervencion" && (
        <div className="field">
          <label htmlFor="ac-ref">Referencia del reclamo</label>
          <input
            id="ac-ref"
            required
            maxLength={200}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Ej. Correo del titular del 26/09 · Ticket 15"
          />
        </div>
      )}
      {accion === "posponer" && (
        <div className="field">
          <label htmlFor="ac-dias">Días</label>
          <input id="ac-dias" type="number" min={1} max={180} value={dias} onChange={(e) => setDias(Number(e.target.value))} />
          <p className="mt-1 text-xs text-muted">El conteo de 90 días sin movimiento empieza de nuevo al terminar este plazo.</p>
        </div>
      )}
      {accion === "eliminar" && (
        <div className="field">
          <label htmlFor="ac-cod">
            Para confirmar, escribe el código del edificio: <b>{edificio.codigo}</b>
          </label>
          <input id="ac-cod" required value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="off" />
        </div>
      )}

      {error && <p className="err">{error}</p>}
      <div className="flex justify-end">
        <button
          className={`btn ${accion === "eliminar" ? "danger" : ""}`}
          disabled={pendiente || (accion === "eliminar" && codigo.trim().toLowerCase() !== edificio.codigo)}
        >
          {pendiente ? "Procesando…" : accion === "revision" || accion === "intervencion" ? "Entrar al edificio" : NOMBRE_ACCION[accion]}
        </button>
      </div>
    </form>
  );
}
