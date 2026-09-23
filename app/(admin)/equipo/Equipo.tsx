"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { fecha } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import {
  agregarCoadministrador,
  designarValidador,
  quitarCoadministrador,
  transferirTitularidad,
  type Resultado,
} from "./acciones";

type Fn = Database["public"]["Functions"];
type Miembro = Fn["equipo_admin"]["Returns"][number];
type Vecino = Fn["vecinos_con_cuenta"]["Returns"][number];
type Validacion = Fn["estado_validacion"]["Returns"][number];

const NIVEL: Record<string, { texto: string; clase: string }> = {
  titular: { texto: "Titular", clase: "activo" },
  operador: { texto: "Coadministrador", clase: "info" },
  lectura: { texto: "Saliente · solo lectura", clase: "warn" },
};

const inicial: Resultado = { ok: false, mensaje: null };

type Props = { equipo: Miembro[]; validacion: Validacion | null; vecinos: Vecino[]; esTitular: boolean; codigo: string };

export function Equipo({ equipo, validacion, vecinos, esTitular, codigo }: Props) {
  const router = useRouter();
  const [aviso, setAviso] = useState<Resultado>(inicial);
  const [ventana, setVentana] = useState<"coadmin" | "transferir" | null>(null);
  const [pendiente, iniciar] = useTransition();
  const coadmins = equipo.filter((m) => m.nivel === "operador");
  const hayCupo = coadmins.length < 2;

  const cerrar = (r?: Resultado) => {
    setVentana(null);
    if (r) setAviso(r);
  };

  function quitar(m: Miembro) {
    if (!confirm(`¿Quitar a ${m.nombre} como coadministrador? Ya no podrá entrar a la administración.`)) return;
    iniciar(async () => setAviso(await quitarCoadministrador(m.perfil_id)));
  }

  function validador(perfil: string | null) {
    iniciar(async () => setAviso(await designarValidador(perfil)));
  }

  // Tras transferir, el nivel cambia: se vuelve a cargar todo desde el servidor
  function trasTransferir(r: Resultado) {
    cerrar(r);
    router.refresh();
  }

  return (
    <>
      <div className="mb-5">
        <h1>Equipo de administración</h1>
        <p className="mt-1 text-muted">
          Un administrador titular y hasta dos coadministradores. El titular decide todo; los coadministradores registran los
          datos del día a día.
        </p>
      </div>

      {aviso.mensaje && (
        <p className={aviso.ok ? "aviso" : "err"} role={aviso.ok ? "status" : "alert"}>
          {aviso.mensaje}
        </p>
      )}
      {!esTitular && <p className="hint mb-4">Puedes ver el equipo. Solo el administrador titular puede cambiarlo.</p>}

      <section className="panel">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex-1">Equipo actual</h3>
          {esTitular && (
            <button className="btn" onClick={() => setVentana("coadmin")} disabled={!hayCupo} title={hayCupo ? undefined : "Máximo 2 coadministradores"}>
              Agregar coadministrador
            </button>
          )}
        </div>
        <ul className="divide-y divide-line">
          {equipo.map((m) => {
            const n = NIVEL[m.nivel] ?? NIVEL.lectura;
            return (
              <li key={m.perfil_id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-[200px] flex-1">
                  <b>{m.nombre}</b>
                  {m.soy_yo && <span className="text-muted"> (tú)</span>}
                  <span className="block text-sm text-muted">
                    {m.departamento_numero ? `Vecino del departamento ${m.departamento_numero}` : "Administrador externo"}
                    {m.nivel === "lectura" && m.vigente_hasta && ` · acceso hasta el ${fecha(m.vigente_hasta)}`}
                  </span>
                </div>
                <span className={`chip ${n.clase}`}>{n.texto}</span>
                {esTitular && m.nivel === "operador" && (
                  <button className="btn quiet sm" onClick={() => quitar(m)} disabled={pendiente}>
                    Quitar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {!hayCupo && esTitular && <p className="mt-2 text-sm text-muted">El edificio ya tiene 2 coadministradores, el máximo permitido.</p>}
      </section>

      <SeccionValidador validacion={validacion} vecinos={vecinos} esTitular={esTitular} pendiente={pendiente} onElegir={validador} />

      {esTitular && (
        <section className="panel">
          <h3 className="mb-1">Transferir la titularidad</h3>
          <p className="mb-3 text-sm text-muted">
            Entrega la administración a un coadministrador, a un vecino o a un externo. Tú quedarás con acceso de solo lectura
            durante 15 días o como coadministrador. Los periodos abiertos y los pagos en revisión continúan con el nuevo titular.
          </p>
          <button className="btn danger" onClick={() => setVentana("transferir")}>
            Transferir la titularidad
          </button>
        </section>
      )}

      <Modal abierto={ventana === "coadmin"} titulo="Agregar coadministrador" onCerrar={() => cerrar()}>
        <FormCoadmin vecinos={vecinos.filter((v) => !v.nivel)} onListo={cerrar} />
      </Modal>
      <Modal abierto={ventana === "transferir"} titulo="Transferir la titularidad" onCerrar={() => cerrar()}>
        <FormTransferir
          coadmins={coadmins}
          vecinos={vecinos.filter((v) => v.nivel !== "titular")}
          hayCupoParaMi={hayCupo}
          codigo={codigo}
          onListo={trasTransferir}
        />
      </Modal>
    </>
  );
}

function SeccionValidador({
  validacion,
  vecinos,
  esTitular,
  pendiente,
  onElegir,
}: {
  validacion: Validacion | null;
  vecinos: Vecino[];
  esTitular: boolean;
  pendiente: boolean;
  onElegir: (perfil: string | null) => void;
}) {
  const [elegido, setElegido] = useState("");
  if (!validacion) return null;
  const candidatos = vecinos.filter((v) => v.nivel !== "titular" && !v.vive_con_titular && !v.es_validador);

  return (
    <section className="panel">
      <h3 className="mb-1">Validación de los pagos del titular</h3>
      <p className="mb-3 text-sm text-muted">
        Nadie valida los pagos de su propio departamento. Si el titular vive en el edificio, sus pagos los valida un
        coadministrador o, si no hay, el vecino validador que designe.
      </p>

      {validacion.quien_valida === "no_aplica" && (
        <p className="hint">El titular no vive en el edificio: no hace falta un vecino validador.</p>
      )}
      {validacion.quien_valida === "coadministrador" && (
        <p className="aviso">
          Los pagos del departamento {validacion.titular_departamento} los valida un coadministrador.
        </p>
      )}
      {validacion.alerta && (
        <p className="err" role="alert">
          El titular vive en el departamento {validacion.titular_departamento} y no hay coadministrador ni vecino validador: sus
          pagos quedarán en revisión hasta que designes a alguien.
        </p>
      )}

      {validacion.validador_nombre && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span>
            Vecino validador: <b>{validacion.validador_nombre}</b>
            {validacion.validador_departamento && ` (depto ${validacion.validador_departamento})`}
            {validacion.quien_valida === "coadministrador" && (
              <span className="text-sm text-muted"> · actúa solo si no hay coadministrador</span>
            )}
          </span>
          {esTitular && (
            <button className="btn quiet sm" onClick={() => onElegir(null)} disabled={pendiente}>
              Quitar designación
            </button>
          )}
        </div>
      )}

      {esTitular && validacion.titular_vive_en_edificio && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="field mb-0 min-w-[240px] flex-1">
            <label htmlFor="val">{validacion.validador_nombre ? "Cambiar vecino validador" : "Designar vecino validador"}</label>
            <select id="val" value={elegido} onChange={(e) => setElegido(e.target.value)}>
              <option value="">Elige un vecino con cuenta activa…</option>
              {candidatos.map((v) => (
                <option key={v.perfil_id} value={v.perfil_id}>
                  {v.nombre} · depto {v.departamento_numero}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={() => elegido && onElegir(elegido)} disabled={!elegido || pendiente}>
            Designar
          </button>
        </div>
      )}
      {esTitular && validacion.titular_vive_en_edificio && candidatos.length === 0 && (
        <p className="mt-2 text-sm text-muted">No hay vecinos con cuenta activa que puedan ser validadores. Invítalos desde Departamentos.</p>
      )}
    </section>
  );
}

function useFormulario(accion: (r: Resultado, f: FormData) => Promise<Resultado>, onListo: (r: Resultado) => void) {
  const [r, enviar, enviando] = useActionState(accion, inicial);
  const [avisado, setAvisado] = useState<Resultado | null>(null);
  useEffect(() => {
    if (r.ok && avisado !== r) {
      setAvisado(r);
      onListo(r);
    }
  }, [r, avisado, onListo]);
  const error = !r.ok && r.mensaje && (
    <p className="err" role="alert">
      {r.mensaje}
    </p>
  );
  return { enviar, enviando, error };
}

function Origen({ valor, onCambio, vecinosDisponibles, etiquetaVecino }: { valor: string; onCambio: (v: string) => void; vecinosDisponibles: boolean; etiquetaVecino: string }) {
  return (
    <div className="opts">
      <label className="opt">
        <input type="radio" name="origen" value="vecino" checked={valor === "vecino"} onChange={() => onCambio("vecino")} disabled={!vecinosDisponibles} />
        <span>
          <b className="block">{etiquetaVecino}</b>
          <span className="text-sm text-muted">
            {vecinosDisponibles ? (
              "Con su cuenta de vecino."
            ) : (
              <>
                Solo se puede elegir a vecinos que ya tienen cuenta. Invítalos desde{" "}
                <a href="/departamentos" className="font-semibold text-brand underline">
                  Departamentos
                </a>{" "}
                (columna Acceso) y, cuando creen su contraseña, aparecerán aquí.
              </>
            )}
          </span>
        </span>
      </label>
      <label className="opt">
        <input type="radio" name="origen" value="externo" checked={valor === "externo"} onChange={() => onCambio("externo")} />
        <span>
          <b className="block">Externo</b>
          <span className="text-sm text-muted">Persona o empresa administradora. Le enviamos una invitación por correo.</span>
        </span>
      </label>
    </div>
  );
}

function CamposExterno() {
  return (
    <div className="grid gap-x-4 sm:grid-cols-2">
      <div className="field">
        <label htmlFor="ex-n">Nombre completo</label>
        <input id="ex-n" name="nombre" required minLength={3} />
      </div>
      <div className="field">
        <label htmlFor="ex-e">Correo</label>
        <input id="ex-e" name="email" type="email" required />
      </div>
    </div>
  );
}

function FormCoadmin({ vecinos, onListo }: { vecinos: Vecino[]; onListo: (r: Resultado) => void }) {
  const { enviar, enviando, error } = useFormulario(agregarCoadministrador, onListo);
  const [origen, setOrigen] = useState(vecinos.length ? "vecino" : "externo");
  return (
    <form action={enviar}>
      {error}
      <Origen valor={origen} onCambio={setOrigen} vecinosDisponibles={vecinos.length > 0} etiquetaVecino="Un vecino del edificio" />
      {origen === "vecino" ? (
        <div className="field">
          <label htmlFor="co-v">Vecino</label>
          <select id="co-v" name="perfil" required defaultValue="">
            <option value="" disabled>
              Elige un vecino…
            </option>
            {vecinos.map((v) => (
              <option key={v.perfil_id} value={v.perfil_id}>
                {v.nombre} · depto {v.departamento_numero}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <CamposExterno />
      )}
      <p className="hint">
        El coadministrador registra gastos, agua y lecturas, valida pagos y envía recibos. No confirma gastos, no abre el mes,
        no emite cargos ni cambia la configuración o los usuarios.
      </p>
      <div className="mt-3 flex justify-end">
        <button className="btn" disabled={enviando}>
          {enviando ? "Guardando…" : "Agregar coadministrador"}
        </button>
      </div>
    </form>
  );
}

function FormTransferir({
  coadmins,
  vecinos,
  hayCupoParaMi,
  codigo,
  onListo,
}: {
  coadmins: Miembro[];
  vecinos: Vecino[];
  hayCupoParaMi: boolean;
  codigo: string;
  onListo: (r: Resultado) => void;
}) {
  const { enviar, enviando, error } = useFormulario(transferirTitularidad, onListo);
  const candidatos = [
    ...coadmins.map((c) => ({ id: c.perfil_id, texto: `${c.nombre} · coadministrador`, esCoadmin: true })),
    ...vecinos.filter((v) => v.nivel !== "operador").map((v) => ({ id: v.perfil_id, texto: `${v.nombre} · depto ${v.departamento_numero}`, esCoadmin: false })),
  ];
  const [origen, setOrigen] = useState(candidatos.length ? "vecino" : "externo");
  const [elegido, setElegido] = useState("");
  const [saliente, setSaliente] = useState("lectura");
  // Si el nuevo titular ya es coadministrador, al salir él libera su cupo
  const liberaCupo = candidatos.find((c) => c.id === elegido)?.esCoadmin ?? false;
  const puedoQuedarComoCoadmin = hayCupoParaMi || (origen === "vecino" && liberaCupo);

  return (
    <form action={enviar}>
      {error}
      <p className="mb-2 text-sm font-semibold text-muted">1. ¿Quién será el nuevo titular?</p>
      <Origen valor={origen} onCambio={setOrigen} vecinosDisponibles={candidatos.length > 0} etiquetaVecino="Un coadministrador o vecino" />
      {origen === "vecino" ? (
        <div className="field">
          <label htmlFor="tr-v">Nuevo titular</label>
          <select id="tr-v" name="perfil" required value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="" disabled>
              Elige a la persona…
            </option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.texto}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <CamposExterno />
      )}

      <p className="mt-2 mb-2 text-sm font-semibold text-muted">2. ¿Qué pasa contigo?</p>
      <div className="opts">
        <label className="opt">
          <input type="radio" name="saliente" value="lectura" checked={saliente === "lectura"} onChange={() => setSaliente("lectura")} />
          <span>
            <b className="block">Solo lectura por 15 días</b>
            <span className="text-sm text-muted">Puedes consultar todo durante la transición; luego pierdes el acceso a la administración.</span>
          </span>
        </label>
        <label className="opt">
          <input
            type="radio"
            name="saliente"
            value="operador"
            checked={saliente === "operador"}
            onChange={() => setSaliente("operador")}
            disabled={!puedoQuedarComoCoadmin}
          />
          <span>
            <b className="block">Quedarme como coadministrador</b>
            <span className="text-sm text-muted">
              {puedoQuedarComoCoadmin ? "Sigues ayudando con los datos del día a día." : "No hay cupo: ya hay 2 coadministradores."}
            </span>
          </span>
        </label>
      </div>

      <div className="errlist">
        <p>
          <b>Esta acción no se puede deshacer por tu cuenta.</b> Dejarás de ser el titular: la configuración, los usuarios y el
          equipo pasarán a manos del nuevo titular. Si vives en el edificio, conservas tu acceso de vecino.
        </p>
      </div>
      <div className="field">
        <label htmlFor="tr-c">
          Para confirmar, escribe el código del edificio: <b className="font-mono text-ink">{codigo}</b>
        </label>
        <input id="tr-c" name="confirmacion" autoComplete="off" required />
      </div>
      <div className="flex justify-end">
        <button className="btn danger" disabled={enviando}>
          {enviando ? "Transfiriendo…" : "Transferir la titularidad"}
        </button>
      </div>
    </form>
  );
}
