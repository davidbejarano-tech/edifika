"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { enLima, fecha } from "@/lib/format";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { COLUMNAS_MENSAJE, POR_PAGINA, type Mensaje } from "@/lib/chat";

type Props = {
  edificioId: string;
  yo: string;
  iniciales: Mensaje[]; // del más antiguo al más reciente
  comoAdmin: boolean; // vista de administración: escribe como administración
  puedeEscribir: boolean; // el saliente en lectura solo lee
  puedeModerar: boolean; // titular y coadministradores eliminan mensajes de otros
};

// Chat del edificio con Supabase Realtime. Quién lee y escribe lo decide la base (RLS de mensajes).
export function Chat({ edificioId, yo, iniciales, comoAdmin, puedeEscribir, puedeModerar }: Props) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [mensajes, setMensajes] = useState<Mensaje[]>(iniciales);
  const [hayAnteriores, setHayAnteriores] = useState(iniciales.length >= POR_PAGINA);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [enVivo, setEnVivo] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const pegadoAbajo = useRef(true);

  // Mensajes nuevos o eliminados llegan sin recargar
  useEffect(() => {
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let activo = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (!activo) return;
      canal = supabase
        .channel(`chat-${edificioId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "mensajes", filter: `edificio_id=eq.${edificioId}` },
          (cambio) => {
            if (cambio.eventType === "DELETE") return;
            const m = cambio.new as Mensaje;
            setMensajes((lista) => (lista.some((x) => x.id === m.id) ? lista.map((x) => (x.id === m.id ? m : x)) : [...lista, m]));
          },
        )
        .subscribe((estado) => setEnVivo(estado === "SUBSCRIBED"));
    })();
    return () => {
      activo = false;
      if (canal) supabase.removeChannel(canal);
    };
  }, [supabase, edificioId]);

  // Baja al último mensaje si la persona ya estaba abajo
  useLayoutEffect(() => {
    const el = log.current;
    if (el && pegadoAbajo.current) el.scrollTop = el.scrollHeight;
  }, [mensajes]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setError("");
    const { data, error } = await supabase
      .from("mensajes")
      .insert({ edificio_id: edificioId, texto: t, como_admin: comoAdmin })
      .select(COLUMNAS_MENSAJE)
      .single();
    setEnviando(false);
    if (error) return setError(error.message);
    pegadoAbajo.current = true;
    setTexto("");
    setMensajes((lista) => (lista.some((x) => x.id === data.id) ? lista : [...lista, data]));
  }

  async function eliminar(m: Mensaje) {
    if (!confirm("¿Eliminar este mensaje? Los vecinos verán «Mensaje eliminado».")) return;
    const { error } = await supabase.rpc("eliminar_mensaje", { p_mensaje: m.id });
    if (error) return setError(error.message);
    setMensajes((lista) => lista.map((x) => (x.id === m.id ? { ...x, texto: "Mensaje eliminado", eliminado_en: new Date().toISOString() } : x)));
  }

  async function anteriores() {
    const primero = mensajes[0];
    if (!primero) return;
    const { data, error } = await supabase
      .from("mensajes")
      .select(COLUMNAS_MENSAJE)
      .eq("edificio_id", edificioId)
      .lt("created_at", primero.created_at)
      .order("created_at", { ascending: false })
      .limit(POR_PAGINA);
    if (error) return setError(error.message);
    const el = log.current;
    const alto = el?.scrollHeight ?? 0;
    pegadoAbajo.current = false;
    setHayAnteriores(data.length >= POR_PAGINA);
    setMensajes((lista) => [...data.reverse(), ...lista]);
    // Conserva la posición de lectura
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - alto;
    });
  }

  return (
    <div className="flex h-[min(70dvh,640px)] flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div
        ref={log}
        className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3 sm:p-4"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {hayAnteriores && (
          <button className="btn quiet sm self-center" onClick={anteriores}>
            Ver mensajes anteriores
          </button>
        )}
        {mensajes.length === 0 && <p className="m-auto text-sm text-muted">Todavía no hay mensajes. Escribe el primero.</p>}
        {mensajes.map((m, i) => {
          const mio = m.autor_id === yo;
          const eliminado = !!m.eliminado_en;
          const { dia, hora } = enLima(m.created_at);
          const nuevoDia = i === 0 || enLima(mensajes[i - 1].created_at).dia !== dia;
          return (
            <div key={m.id} className="contents">
              {nuevoDia && <p className="my-1 self-center text-xs font-semibold text-muted">{fecha(dia)}</p>}
              <div
                className={`group max-w-[85%] rounded-xl border px-3 py-2 sm:max-w-[75%] ${
                  mio ? "self-end border-transparent bg-brand-soft" : "self-start border-line bg-surface2"
                }`}
              >
                <p className={`mb-0.5 text-xs font-bold ${m.como_admin ? "text-brass" : "text-muted"}`}>
                  {m.autor_nombre ?? "Vecino"}
                  {m.como_admin ? ` · ${m.autor_rol ?? "Administración"}` : m.autor_depto ? `, depto ${m.autor_depto}` : ""}
                  <span className="ml-1.5 font-normal">{hora}</span>
                </p>
                <p className={`break-words whitespace-pre-wrap ${eliminado ? "text-sm text-muted italic" : ""}`}>{m.texto}</p>
                {!eliminado && (mio || puedeModerar) && (
                  <button
                    className="mt-0.5 text-xs text-muted underline opacity-70 hover:text-bad hover:opacity-100"
                    onClick={() => eliminar(m)}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="border-t border-line bg-bad-bg px-3 py-2 text-sm text-bad" role="alert">
          {error}
        </p>
      )}

      {puedeEscribir ? (
        <form className="flex items-center gap-2 border-t border-line p-2.5" onSubmit={enviar}>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={comoAdmin ? "Escribe un mensaje como administración" : "Escribe un mensaje"}
            aria-label="Mensaje"
            autoComplete="off"
            maxLength={2000}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface2 px-3 py-2"
          />
          <button className="btn" disabled={enviando || !texto.trim()}>
            Enviar
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-3 py-2.5 text-sm text-muted">Tu acceso es de solo lectura: puedes leer el chat, pero no escribir.</p>
      )}
      <p className="flex items-center gap-1.5 border-t border-line bg-surface2 px-3 py-1 text-xs text-muted">
        <i className={`inline-block size-2 rounded-full ${enVivo ? "bg-ok" : "bg-warn"}`} />
        {enVivo ? "En vivo: los mensajes nuevos aparecen solos" : "Conectando…"}
      </p>
    </div>
  );
}
