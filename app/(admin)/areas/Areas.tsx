"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { ACTIVAS, DIAS, ESTADO_GARANTIA, ESTADO_RESERVA, diasTexto, duracion, hm, turnoTexto } from "@/lib/areas";
import { enLima, fecha, soles } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import {
  aprobarReserva,
  bloquearFechas,
  cancelarReservaAdmin,
  cerrarReserva,
  devolverGarantia,
  guardarZona,
  quitarBloqueo,
  rechazarReserva,
  type Resultado,
} from "./acciones";

type Reserva = Database["public"]["Functions"]["reservas_admin"]["Returns"][number];
type Zona = Database["public"]["Tables"]["zonas_comunes"]["Row"];
type Bloqueo = { id: string; zona_id: string; desde: string; hasta: string; motivo: string };

function Aviso({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return (
    <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${r.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} role="status">
      {r.mensaje}
    </p>
  );
}

// ---------------------------------------------------------------------
// Reservas: por aprobar, pendientes de pago, próximas, por cerrar y garantías por devolver
// ---------------------------------------------------------------------
type Dialogo = { tipo: "rechazar" | "cancelar" | "cerrar"; r: Reserva } | null;

export function Reservas({ reservas }: { reservas: Reserva[] }) {
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [pendiente, iniciar] = useTransition();
  const ahora = new Date().toISOString();
  const hacer = (f: () => Promise<Resultado>) => iniciar(async () => setAviso(await f()));

  const secciones: { titulo: string; lista: Reserva[]; vacio: string; acciones: (r: Reserva) => React.ReactNode }[] = [
    {
      titulo: "Por aprobar",
      lista: reservas.filter((r) => r.estado === "solicitada"),
      vacio: "No hay solicitudes pendientes.",
      acciones: (r) => (
        <>
          <button className="btn danger sm" disabled={pendiente} onClick={() => setDialogo({ tipo: "rechazar", r })}>
            Rechazar
          </button>
          <button className="btn sm" disabled={pendiente} onClick={() => hacer(() => aprobarReserva(r.reserva_id))}>
            Aprobar
          </button>
        </>
      ),
    },
    {
      titulo: "Pendientes de pago",
      lista: reservas.filter((r) => r.estado === "pendiente_pago"),
      vacio: "Ninguna.",
      acciones: (r) => (
        <>
          <span className="text-sm text-muted">
            {r.pago_en_revision ? "Pago en revisión" : r.vence_pago_en ? `Paga hasta el ${fecha(enLima(r.vence_pago_en).dia)} ${enLima(r.vence_pago_en).hora}` : ""}
          </span>
          <button className="btn quiet sm" disabled={pendiente} onClick={() => setDialogo({ tipo: "cancelar", r })}>
            Cancelar
          </button>
        </>
      ),
    },
    {
      titulo: "Próximas confirmadas",
      lista: reservas.filter((r) => r.estado === "confirmada" && r.fin > ahora),
      vacio: "Ninguna.",
      acciones: (r) => (
        <button className="btn quiet sm" disabled={pendiente} onClick={() => setDialogo({ tipo: "cancelar", r })}>
          Cancelar
        </button>
      ),
    },
    {
      titulo: "Por cerrar (ya se usaron)",
      lista: reservas.filter((r) => r.estado === "confirmada" && r.fin <= ahora),
      vacio: "Ninguna.",
      acciones: (r) => (
        <button className="btn sm" disabled={pendiente} onClick={() => setDialogo({ tipo: "cerrar", r })}>
          Cerrar{r.garantia_estado === "en_custodia" ? " y resolver la garantía" : ""}
        </button>
      ),
    },
    {
      titulo: "Garantías por devolver",
      lista: reservas.filter((r) => r.garantia_estado === "por_devolver"),
      vacio: "Ninguna.",
      acciones: (r) => (
        <button
          className="btn sm"
          disabled={pendiente}
          onClick={() => {
            if (confirm(`¿Registrar que devolviste ${soles(r.garantia_monto)} al departamento ${r.numero}?`)) hacer(() => devolverGarantia(r.reserva_id));
          }}
        >
          Registrar devolución
        </button>
      ),
    },
  ];

  const recientes = reservas.filter((r) => !ACTIVAS.includes(r.estado)).slice(-10).reverse();

  return (
    <>
      <Aviso r={aviso} />
      {secciones.map((s) => (
        <section key={s.titulo} className="panel">
          <h3 className="mb-2">
            {s.titulo} <span className="text-sm font-normal text-muted">({s.lista.length})</span>
          </h3>
          {s.lista.length === 0 ? (
            <p className="text-sm text-muted">{s.vacio}</p>
          ) : (
            <div className="grid gap-2">
              {s.lista.map((r) => (
                <FilaReserva key={r.reserva_id} r={r} acciones={r.puede_gestionar ? s.acciones(r) : <span className="text-sm text-muted">La gestiona otro administrador (es tu departamento).</span>} />
              ))}
            </div>
          )}
        </section>
      ))}
      {recientes.length > 0 && (
        <section className="panel">
          <h3 className="mb-2">Historial reciente</h3>
          <div className="grid gap-2">
            {recientes.map((r) => (
              <FilaReserva key={r.reserva_id} r={r} />
            ))}
          </div>
        </section>
      )}

      <Modal
        abierto={!!dialogo}
        titulo={dialogo ? `${dialogo.tipo === "rechazar" ? "Rechazar" : dialogo.tipo === "cancelar" ? "Cancelar" : "Cerrar"} la reserva del depto ${dialogo.r.numero}` : ""}
        onCerrar={() => setDialogo(null)}
      >
        {dialogo && (
          <FormDialogo
            dialogo={dialogo}
            onListo={(r) => {
              setAviso(r);
              if (r.ok) setDialogo(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function FilaReserva({ r, acciones }: { r: Reserva; acciones?: React.ReactNode }) {
  const e = ESTADO_RESERVA[r.estado] ?? ESTADO_RESERVA.cancelada;
  return (
    <article className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-b-0">
      <div className="min-w-[220px] flex-1">
        <p>
          <b>{r.zona}</b> <span className="text-muted">{turnoTexto(r.inicio, r.fin)}</span>
        </p>
        <p className="text-sm text-muted">
          Depto {r.numero}
          {r.responsable ? `, ${r.responsable}` : ""}
          {Number(r.garantia_monto) > 0 && `. ${ESTADO_GARANTIA[r.garantia_estado]} (${soles(r.garantia_monto)})`}
          {Number(r.garantia_retenida) > 0 && `, retenido ${soles(r.garantia_retenida)}`}
        </p>
        {r.nota && <p className="text-sm">{r.nota}</p>}
      </div>
      <span className={`chip ${e.clase}`}>{e.texto}</span>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </article>
  );
}

function FormDialogo({ dialogo, onListo }: { dialogo: NonNullable<Dialogo>; onListo: (r: Resultado) => void }) {
  const { tipo, r } = dialogo;
  const [nota, setNota] = useState("");
  const [retener, setRetener] = useState(0);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const conGarantia = tipo === "cerrar" && r.garantia_estado === "en_custodia";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        iniciar(async () => {
          const res =
            tipo === "rechazar"
              ? await rechazarReserva(r.reserva_id, nota)
              : tipo === "cancelar"
                ? await cancelarReservaAdmin(r.reserva_id, nota)
                : await cerrarReserva(r.reserva_id, retener, nota);
          if (res.ok) onListo(res);
          else setError(res.mensaje);
        });
      }}
    >
      <p className="mb-3 text-sm text-muted">
        {r.zona}, {turnoTexto(r.inicio, r.fin)}.{" "}
        {tipo === "cancelar" && "Los cargos sin pagar se anulan; si la garantía ya se pagó, queda por devolver. La tarifa pagada no se devuelve."}
        {tipo === "cerrar" && !conGarantia && "Se marca como usada."}
      </p>
      {conGarantia && (
        <div className="field">
          <label htmlFor="ret">Retener por daños (de {soles(r.garantia_monto)})</label>
          <input id="ret" type="number" min={0} max={Number(r.garantia_monto)} step="0.01" value={retener} onChange={(e) => setRetener(Number(e.target.value))} />
          <p className="mt-1 text-xs text-muted">
            Deja 0 para devolver toda la garantía. Lo retenido pasa a ser ingreso del edificio este mes; el resto se devuelve al vecino.
          </p>
        </div>
      )}
      <div className="field">
        <label htmlFor="nota">
          {tipo === "rechazar" ? "Motivo del rechazo (lo verá el vecino)" : tipo === "cancelar" ? "Motivo (opcional)" : "Descripción de los daños"}
        </label>
        <textarea
          id="nota"
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          required={tipo === "rechazar" || retener > 0}
          placeholder={tipo === "cerrar" ? "Obligatoria si retienes parte de la garantía" : ""}
        />
      </div>
      {error && <p className="err">{error}</p>}
      <div className="flex justify-end">
        <button className={`btn ${tipo === "cerrar" ? "" : "danger"}`} disabled={pendiente}>
          {tipo === "rechazar" ? "Rechazar reserva" : tipo === "cancelar" ? "Cancelar reserva" : retener > 0 ? `Cerrar y retener ${soles(retener)}` : "Cerrar reserva"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Zonas (RN-30) y bloqueos de fechas
// ---------------------------------------------------------------------
export function Zonas({ zonas, bloqueos, esTitular, puedeBloquear }: { zonas: Zona[]; bloqueos: Bloqueo[]; esTitular: boolean; puedeBloquear: boolean }) {
  const [editar, setEditar] = useState<Zona | "nueva" | null>(null);
  const [bloquear, setBloquear] = useState<Zona | null>(null);
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <>
      <Aviso r={aviso} />
      {esTitular && (
        <div className="mb-3 flex justify-end">
          <button className="btn" onClick={() => setEditar("nueva")}>
            Nueva zona
          </button>
        </div>
      )}
      {zonas.length === 0 ? (
        <p className="hint">Aún no hay zonas. {esTitular ? "Crea la primera: por ejemplo, la parrilla o el salón de usos múltiples." : "El administrador titular las configura."}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {zonas.map((z) => (
            <article key={z.id} className="panel mb-0 flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <h3 className="flex-1">{z.nombre}</h3>
                <span className={`chip ${z.activa ? "activo" : "tag"}`}>{z.activa ? "Activa" : "Inactiva"}</span>
              </div>
              {z.descripcion && <p className="text-sm text-muted">{z.descripcion}</p>}
              <p className="text-sm">
                {diasTexto(z.dias_semana)}, {hm(z.hora_apertura)} a {hm(z.hora_cierre)}. Turnos de {duracion(z.duracion_turno_min)}.
              </p>
              <p className="text-sm">
                <b>{Number(z.tarifa) ? soles(z.tarifa) : "Sin costo"}</b>
                {Number(z.garantia) > 0 && ` + garantía ${soles(z.garantia)}`}
                {z.aforo ? `. Aforo ${z.aforo}.` : "."}
              </p>
              <p className="text-sm text-muted">
                Reserva de {z.anticipacion_min_dias} a {z.anticipacion_max_dias} días antes; máximo {z.max_reservas_mes} al mes por departamento.
                {z.requiere_aprobacion ? " Requiere aprobación." : ""}
                {z.permite_morosos ? "" : " No para departamentos con deuda vencida."}
                {Number(z.tarifa) + Number(z.garantia) > 0 ? ` Plazo para pagar: ${z.plazo_pago_horas} horas.` : ""}
              </p>
              {bloqueos
                .filter((b) => b.zona_id === z.id)
                .map((b) => (
                  <p key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="chip warn">Bloqueada</span>
                    {fecha(enLima(b.desde).dia)}
                    {enLima(new Date(new Date(b.hasta).getTime() - 1).toISOString()).dia !== enLima(b.desde).dia &&
                      ` al ${fecha(enLima(new Date(new Date(b.hasta).getTime() - 1).toISOString()).dia)}`}
                    : {b.motivo}
                    {puedeBloquear && (
                      <button className="text-xs text-muted underline hover:text-bad" disabled={pendiente} onClick={() => iniciar(async () => setAviso(await quitarBloqueo(b.id)))}>
                        Quitar
                      </button>
                    )}
                  </p>
                ))}
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                {esTitular && (
                  <button className="btn quiet sm" onClick={() => setEditar(z)}>
                    Editar
                  </button>
                )}
                {puedeBloquear && (
                  <button className="btn quiet sm" onClick={() => setBloquear(z)}>
                    Bloquear fechas
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal abierto={!!editar} titulo={editar === "nueva" ? "Nueva zona" : `Editar ${editar?.nombre ?? ""}`} onCerrar={() => setEditar(null)} amplio>
        {editar && (
          <FormZona
            zona={editar === "nueva" ? null : editar}
            onListo={(r) => {
              setAviso(r);
              setEditar(null);
            }}
          />
        )}
      </Modal>
      <Modal abierto={!!bloquear} titulo={`Bloquear fechas · ${bloquear?.nombre ?? ""}`} onCerrar={() => setBloquear(null)}>
        {bloquear && (
          <FormBloqueo
            zona={bloquear}
            onListo={(r) => {
              setAviso(r);
              setBloquear(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

const ZONA_NUEVA = {
  nombre: "",
  descripcion: "",
  aforo: null as number | null,
  reglamento: "",
  activa: true,
  dias_semana: [0, 1, 2, 3, 4, 5, 6],
  hora_apertura: "09:00",
  hora_cierre: "22:00",
  duracion_turno_min: 240,
  anticipacion_min_dias: 1,
  anticipacion_max_dias: 30,
  max_reservas_mes: 2,
  requiere_aprobacion: false,
  tarifa: 0,
  garantia: 0,
  permite_morosos: false,
  plazo_pago_horas: 48,
};

function FormZona({ zona, onListo }: { zona: Zona | null; onListo: (r: Resultado) => void }) {
  const [z, setZ] = useState(
    zona
      ? {
          ...ZONA_NUEVA,
          ...zona,
          descripcion: zona.descripcion ?? "",
          hora_apertura: hm(zona.hora_apertura),
          hora_cierre: hm(zona.hora_cierre),
          tarifa: Number(zona.tarifa),
          garantia: Number(zona.garantia),
        }
      : ZONA_NUEVA,
  );
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const campo = <K extends keyof typeof ZONA_NUEVA>(k: K, v: (typeof ZONA_NUEVA)[K]) => setZ((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        iniciar(async () => {
          const { nombre, descripcion, aforo, reglamento, activa, dias_semana, hora_apertura, hora_cierre, duracion_turno_min } = z;
          const r = await guardarZona(zona?.id ?? null, {
            nombre,
            descripcion: descripcion || null,
            aforo: aforo || null,
            reglamento,
            activa,
            dias_semana,
            hora_apertura,
            hora_cierre,
            duracion_turno_min,
            anticipacion_min_dias: z.anticipacion_min_dias,
            anticipacion_max_dias: z.anticipacion_max_dias,
            max_reservas_mes: z.max_reservas_mes,
            requiere_aprobacion: z.requiere_aprobacion,
            tarifa: z.tarifa,
            garantia: z.garantia,
            permite_morosos: z.permite_morosos,
            plazo_pago_horas: z.plazo_pago_horas,
          });
          if (r.ok) onListo(r);
          else setError(r.mensaje);
        });
      }}
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="z-n">Nombre</label>
          <input id="z-n" required value={z.nombre} onChange={(e) => campo("nombre", e.target.value)} placeholder="Ej. Parrilla de la azotea" />
        </div>
        <div className="field">
          <label htmlFor="z-a">Aforo (personas)</label>
          <input id="z-a" type="number" min={1} value={z.aforo ?? ""} onChange={(e) => campo("aforo", e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="z-d">Descripción</label>
        <input id="z-d" value={z.descripcion} onChange={(e) => campo("descripcion", e.target.value)} placeholder="Ej. Parrilla, mesa para 12 personas y baño" />
      </div>
      <div className="field">
        <label htmlFor="z-r">Reglamento (el vecino lo acepta al reservar)</label>
        <textarea id="z-r" rows={3} value={z.reglamento} onChange={(e) => campo("reglamento", e.target.value)} placeholder="Ej. Dejar limpio. Música hasta las 22:00." />
      </div>

      <fieldset className="field">
        <legend className="mb-1 text-sm font-semibold">Días de atención</legend>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d, i) => (
            <label key={d} className="opt flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-sm">
              <input
                type="checkbox"
                checked={z.dias_semana.includes(i)}
                onChange={(e) => campo("dias_semana", e.target.checked ? [...z.dias_semana, i].sort() : z.dias_semana.filter((x) => x !== i))}
              />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
        <div className="field">
          <label htmlFor="z-ho">Abre</label>
          <input id="z-ho" type="time" required value={z.hora_apertura} onChange={(e) => campo("hora_apertura", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="z-hc">Cierra</label>
          <input id="z-hc" type="time" required value={z.hora_cierre} onChange={(e) => campo("hora_cierre", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="z-t">Turno (minutos)</label>
          <input id="z-t" type="number" min={30} max={720} step={15} required value={z.duracion_turno_min} onChange={(e) => campo("duracion_turno_min", num(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="z-amin">Anticipación mínima (días)</label>
          <input id="z-amin" type="number" min={0} required value={z.anticipacion_min_dias} onChange={(e) => campo("anticipacion_min_dias", num(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="z-amax">Anticipación máxima (días)</label>
          <input id="z-amax" type="number" min={0} required value={z.anticipacion_max_dias} onChange={(e) => campo("anticipacion_max_dias", num(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="z-max">Reservas al mes por depto</label>
          <input id="z-max" type="number" min={1} required value={z.max_reservas_mes} onChange={(e) => campo("max_reservas_mes", num(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="z-tar">Tarifa de uso (S/)</label>
          <input id="z-tar" type="number" min={0} step="0.01" value={z.tarifa} onChange={(e) => campo("tarifa", num(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="z-gar">Garantía reembolsable (S/)</label>
          <input id="z-gar" type="number" min={0} step="0.01" value={z.garantia} onChange={(e) => campo("garantia", num(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="z-pl">Plazo para pagar (horas)</label>
          <input id="z-pl" type="number" min={1} max={168} value={z.plazo_pago_horas} onChange={(e) => campo("plazo_pago_horas", num(e.target.value))} />
        </div>
      </div>
      <div className="mb-3 grid gap-1.5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={z.requiere_aprobacion} onChange={(e) => campo("requiere_aprobacion", e.target.checked)} />
          La administración aprueba cada reserva
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={z.permite_morosos} onChange={(e) => campo("permite_morosos", e.target.checked)} />
          Pueden reservar departamentos con deuda vencida
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={z.activa} onChange={(e) => campo("activa", e.target.checked)} />
          Zona activa (se puede reservar)
        </label>
      </div>
      {error && <p className="err">{error}</p>}
      <div className="flex justify-end">
        <button className="btn" disabled={pendiente}>
          {pendiente ? "Guardando…" : zona ? "Guardar cambios" : "Crear zona"}
        </button>
      </div>
    </form>
  );
}

function FormBloqueo({ zona, onListo }: { zona: Zona; onListo: (r: Resultado) => void }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await bloquearFechas(zona.id, desde, hasta || desde, motivo);
          if (r.ok) onListo(r);
          else setError(r.mensaje);
        });
      }}
    >
      <p className="mb-3 text-sm text-muted">Los días bloqueados no se pueden reservar. Las reservas que ya existan en esas fechas no se cancelan solas.</p>
      <div className="grid grid-cols-2 gap-x-4">
        <div className="field">
          <label htmlFor="b-d">Desde</label>
          <input id="b-d" type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="b-h">Hasta (opcional)</label>
          <input id="b-h" type="date" min={desde} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="b-m">Motivo</label>
        <input id="b-m" required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Mantenimiento de la parrilla" />
      </div>
      {error && <p className="err">{error}</p>}
      <div className="flex justify-end">
        <button className="btn" disabled={pendiente}>
          Bloquear
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Garantías (RN-36)
// ---------------------------------------------------------------------
export function Garantias({ reservas }: { reservas: Reserva[] }) {
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [pendiente, iniciar] = useTransition();
  const grupos: [string, Reserva[]][] = [
    ["En custodia", reservas.filter((r) => r.garantia_estado === "en_custodia")],
    ["Por devolver", reservas.filter((r) => r.garantia_estado === "por_devolver")],
    ["Retenidas por daños", reservas.filter((r) => r.garantia_estado === "retenida")],
  ];
  return (
    <>
      <Aviso r={aviso} />
      {grupos.map(([titulo, lista]) => (
        <section key={titulo} className="panel">
          <h3 className="mb-2">
            {titulo} <span className="text-sm font-normal text-muted">({lista.length})</span>
          </h3>
          {lista.length === 0 ? (
            <p className="text-sm text-muted">Ninguna.</p>
          ) : (
            lista.map((r) => (
              <FilaReserva
                key={r.reserva_id}
                r={r}
                acciones={
                  r.garantia_estado === "por_devolver" && r.puede_gestionar ? (
                    <button
                      className="btn sm"
                      disabled={pendiente}
                      onClick={() => {
                        if (confirm(`¿Registrar que devolviste ${soles(r.garantia_monto)} al departamento ${r.numero}?`))
                          iniciar(async () => setAviso(await devolverGarantia(r.reserva_id)));
                      }}
                    >
                      Registrar devolución
                    </button>
                  ) : undefined
                }
              />
            ))
          )}
        </section>
      ))}
    </>
  );
}
