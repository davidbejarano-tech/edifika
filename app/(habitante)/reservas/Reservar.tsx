"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ACTIVAS, DIAS, ESTADO_GARANTIA, ESTADO_RESERVA, diaLimaMas, diasTexto, duracion, hm, turnoTexto } from "@/lib/areas";
import { enLima, fecha, soles } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import { cancelarMiReserva, reservar, verTurnos, type Resultado, type Turno } from "./acciones";

type Zona = {
  id: string;
  nombre: string;
  descripcion: string | null;
  aforo: number | null;
  reglamento: string;
  dias_semana: number[];
  hora_apertura: string;
  hora_cierre: string;
  duracion_turno_min: number;
  anticipacion_min_dias: number;
  anticipacion_max_dias: number;
  max_reservas_mes: number;
  requiere_aprobacion: boolean;
  tarifa: number;
  garantia: number;
  permite_morosos: boolean;
  plazo_pago_horas: number;
};
type MiReserva = Database["public"]["Functions"]["mis_reservas"]["Returns"][number];

export function Reservar({ zonas, mias, habilitado }: { zonas: Zona[]; mias: MiReserva[]; habilitado: boolean }) {
  const [zona, setZona] = useState<Zona | null>(null);
  const [aviso, setAviso] = useState<Resultado | null>(null);

  return (
    <>
      {aviso && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} role="status">
          {aviso.mensaje}
          {aviso.ok && /Mis cuentas/.test(aviso.mensaje) && (
            <Link href="/cuentas" className="ml-1 font-bold underline">
              Ir a pagar
            </Link>
          )}
        </p>
      )}

      {zona ? (
        <Turnos
          zona={zona}
          habilitado={habilitado}
          onVolver={() => setZona(null)}
          onListo={(r) => {
            setAviso(r);
            if (r.ok) setZona(null);
          }}
        />
      ) : zonas.length === 0 ? (
        <p className="hint mb-4">La administración aún no configuró zonas para reservar.</p>
      ) : (
        <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {zonas.map((z) => (
            <article key={z.id} className="panel mb-0 flex flex-col gap-1.5">
              <h3>{z.nombre}</h3>
              {z.descripcion && <p className="text-sm text-muted">{z.descripcion}</p>}
              <p className="text-sm">
                <b>{z.tarifa ? soles(z.tarifa) : "Sin costo"}</b>
                {z.garantia > 0 && ` + garantía reembolsable ${soles(z.garantia)}`}
              </p>
              <p className="text-sm text-muted">
                {diasTexto(z.dias_semana)}, {hm(z.hora_apertura)} a {hm(z.hora_cierre)}
              </p>
              <button className="btn sm mt-auto self-start" onClick={() => setZona(z)} disabled={!habilitado}>
                Ver turnos
              </button>
            </article>
          ))}
        </div>
      )}

      <MisReservas mias={mias} onAviso={setAviso} />
    </>
  );
}

function Turnos({ zona, habilitado, onVolver, onListo }: { zona: Zona; habilitado: boolean; onVolver: () => void; onListo: (r: Resultado) => void }) {
  const min = diaLimaMas(zona.anticipacion_min_dias);
  const max = diaLimaMas(zona.anticipacion_max_dias);
  const [dia, setDia] = useState(min);
  const [turnos, setTurnos] = useState<Turno[] | null>(null);
  const [error, setError] = useState("");
  const [elegido, setElegido] = useState<Turno | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    let vigente = true;
    setTurnos(null);
    setElegido(null);
    verTurnos(zona.id, dia).then((r) => {
      if (!vigente) return;
      setTurnos(r.turnos);
      setError(r.error ?? "");
    });
    return () => {
      vigente = false;
    };
  }, [zona.id, dia]);

  const costo = zona.tarifa + zona.garantia;
  return (
    <section className="panel mb-5">
      <button className="btn quiet sm mb-2" onClick={onVolver}>
        ← Volver a las zonas
      </button>
      <h2 className="text-xl">{zona.nombre}</h2>
      {zona.descripcion && <p className="text-sm text-muted">{zona.descripcion}</p>}

      <div className="my-3 flex flex-wrap items-center gap-3">
        <label htmlFor="dia" className="text-sm text-muted">
          Fecha
        </label>
        <input
          id="dia"
          type="date"
          min={min}
          max={max}
          value={dia}
          onChange={(e) => e.target.value && setDia(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2 py-1.5"
        />
        <span className="text-sm text-muted">
          {DIAS[new Date(`${dia}T12:00:00`).getDay()]} {fecha(dia)}
        </span>
      </div>

      {error && <p className="err">{error}</p>}
      {!turnos ? (
        <p className="text-sm text-muted">Buscando turnos…</p>
      ) : turnos.length === 0 ? (
        <p className="text-sm text-muted">No hay turnos este día.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {turnos.map((t) => {
            const sel = elegido?.inicio === t.inicio;
            return (
              <button
                key={t.inicio}
                type="button"
                disabled={!t.libre || !habilitado}
                onClick={() => setElegido(t)}
                aria-pressed={sel}
                aria-label={`${enLima(t.inicio).hora} a ${enLima(t.fin).hora}, ${t.libre ? "libre" : t.motivo}`}
                className={`rounded-lg border px-3 py-2 text-left font-semibold tabular-nums ${
                  sel ? "border-brand bg-brand-soft" : t.libre ? "border-line bg-surface hover:border-brand" : "cursor-not-allowed border-line bg-surface2 text-muted"
                }`}
              >
                {enLima(t.inicio).hora} a {enLima(t.fin).hora}
                <span className={`block text-xs font-normal ${t.libre ? "text-ok" : ""}`}>{t.libre ? "Libre" : t.motivo}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-sm text-muted">
        Turnos de {duracion(zona.duracion_turno_min)}. Reserva de {zona.anticipacion_min_dias} a {zona.anticipacion_max_dias} días antes, máximo{" "}
        {zona.max_reservas_mes} al mes.{zona.requiere_aprobacion ? " La administración debe aprobar la solicitud." : ""}
        {zona.permite_morosos ? "" : " Necesitas estar al día en tus pagos."}
      </p>

      {elegido && (
        <form
          className="mt-4 rounded-xl border border-brand bg-brand-soft p-4"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => onListo(await reservar(zona.id, elegido.inicio, acepto)));
          }}
        >
          <p className="font-semibold">{turnoTexto(elegido.inicio, elegido.fin)}</p>
          {costo > 0 ? (
            <p className="text-sm">
              Tarifa {soles(zona.tarifa)}
              {zona.garantia > 0 && ` + garantía reembolsable ${soles(zona.garantia)}`} = <b>{soles(costo)}</b>. Se suman a Mis cuentas; págalos en{" "}
              {zona.plazo_pago_horas} horas o el turno se libera. La garantía se devuelve después del uso si no hay daños.
            </p>
          ) : (
            <p className="text-sm">Sin costo.</p>
          )}
          {zona.reglamento && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold text-brand">Leer el reglamento</summary>
              <p className="mt-1 whitespace-pre-wrap">{zona.reglamento}</p>
            </details>
          )}
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-1" required />
            Acepto el reglamento de uso de {zona.nombre}.
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn quiet" onClick={() => setElegido(null)}>
              Elegir otro
            </button>
            <button className="btn" disabled={!acepto || pendiente}>
              {pendiente ? "Reservando…" : zona.requiere_aprobacion ? "Solicitar reserva" : "Reservar"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function MisReservas({ mias, onAviso }: { mias: MiReserva[]; onAviso: (r: Resultado) => void }) {
  const [pendiente, iniciar] = useTransition();
  const ahora = new Date().toISOString();
  return (
    <section className="panel">
      <h3 className="mb-2">Mis reservas</h3>
      {mias.length === 0 ? (
        <p className="text-sm text-muted">Aún no tienes reservas.</p>
      ) : (
        mias.map((r) => {
          const e = ESTADO_RESERVA[r.estado] ?? ESTADO_RESERVA.cancelada;
          return (
            <article key={r.reserva_id} className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-b-0">
              <div className="min-w-[200px] flex-1">
                <p>
                  <b>{r.zona}</b> <span className="text-muted">{turnoTexto(r.inicio, r.fin)}</span>
                </p>
                {(Number(r.tarifa) > 0 || Number(r.garantia_monto) > 0) && (
                  <p className="text-sm text-muted">
                    {Number(r.tarifa) > 0 && `Tarifa ${soles(r.tarifa)}`}
                    {Number(r.garantia_monto) > 0 && `${Number(r.tarifa) > 0 ? " · " : ""}${ESTADO_GARANTIA[r.garantia_estado]} (${soles(r.garantia_monto)})`}
                    {Number(r.garantia_retenida) > 0 && `, retenido ${soles(r.garantia_retenida)}`}
                  </p>
                )}
                {r.estado === "pendiente_pago" && r.vence_pago_en && (
                  <p className="text-sm text-warn">
                    {r.pago_en_revision ? "Tu pago está en revisión." : `Paga antes del ${fecha(enLima(r.vence_pago_en).dia)} a las ${enLima(r.vence_pago_en).hora} o el turno se libera.`}
                  </p>
                )}
                {r.nota && <p className="text-sm">{r.nota}</p>}
              </div>
              <span className={`chip ${e.clase}`}>{e.texto}</span>
              <div className="flex flex-wrap gap-2">
                {r.estado === "pendiente_pago" && r.cargos_pendientes > 0 && (
                  <Link href="/cuentas" className="btn sm">
                    Pagar cargos
                  </Link>
                )}
                {ACTIVAS.includes(r.estado) && r.inicio > ahora && (
                  <button
                    className="btn quiet sm"
                    disabled={pendiente}
                    onClick={() => {
                      if (confirm(`¿Cancelar tu reserva de ${r.zona}? Los cargos sin pagar se anulan; la tarifa pagada no se devuelve.`))
                        iniciar(async () => onAviso(await cancelarMiReserva(r.reserva_id)));
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
