"use client";

import { useActionState, useState } from "react";
import { guardarCobranza, guardarPago, type Resultado } from "./acciones";

type Edificio = {
  nombre: string;
  direccion: string;
  total_departamentos: number;
  base_cuota: string | null;
  agua_cuota: string | null;
  monto_fijo_mensual: number | null;
  dia_lectura: number | null;
  area_comun_m2: number | null;
  dia_corte: number;
  mora_monto: number;
  saldo_inicial: number;
  cuenta_bancaria: string | null;
  yape_plin: string | null;
  publicar_desglose: boolean;
};

const inicial: Resultado = { ok: false, mensaje: null };

function Aviso({ r }: { r: Resultado }) {
  if (!r.mensaje) return null;
  return r.ok ? (
    <p className="aviso" role="status">
      {r.mensaje}
    </p>
  ) : (
    <p className="err" role="alert">
      {r.mensaje}
    </p>
  );
}

function Pie({ puede, enviando, texto }: { puede: boolean; enviando: boolean; texto: string }) {
  if (!puede) return <p className="mt-2 text-sm text-muted">Solo el administrador titular puede cambiar estos datos.</p>;
  return (
    <div className="mt-2 flex justify-end">
      <button className="btn" disabled={enviando}>
        {enviando ? "Guardando…" : texto}
      </button>
    </div>
  );
}

const BASES = [
  {
    v: "fijo_area",
    t: "Monto fijo por área",
    d: "Defines un monto mensual para todo el edificio y cada departamento paga según su área (alícuota).",
  },
  {
    v: "fijo_igual",
    t: "Monto fijo igual para todos",
    d: "Todos los departamentos pagan lo mismo, sin importar su área.",
  },
  {
    v: "gastos",
    t: "Gastos reales del mes por área",
    d: "Los gastos confirmados de cada mes se reparten según el área. La cuota cambia cada mes.",
  },
];

const AGUAS = [
  {
    v: "consumo",
    t: "Por consumo (medidores)",
    d: "El recibo se reparte según el % de consumo de cada medidor sobre la suma de todos. Se cobra aparte de la cuota fija.",
  },
  {
    v: "incluida",
    t: "Incluida en la cuota",
    d: "No se cobra agua aparte: la cubre el monto fijo o, si la base son los gastos reales, es un gasto más.",
  },
];

export function FormCobranza({ e, puede }: { e: Edificio; puede: boolean }) {
  const [r, accion, enviando] = useActionState(guardarCobranza, inicial);
  const [base, setBase] = useState(e.base_cuota ?? "");
  const [agua, setAgua] = useState(e.agua_cuota ?? "");

  return (
    <form action={accion} className="panel" id="cobranza">
      <h3 className="mb-1">Configuración de la cobranza</h3>
      <p className="mb-3 text-sm text-muted">Cuota del mes = parte fija + agua. Elige cómo se calcula cada una.</p>
      <Aviso r={r} />
      <fieldset disabled={!puede}>
        <p className="mb-2 text-sm font-semibold text-muted">1. Base de la cuota</p>
        <div className="opts">
          {BASES.map((b) => (
            <label key={b.v} className="opt">
              <input type="radio" name="base" value={b.v} checked={base === b.v} onChange={() => setBase(b.v)} />
              <span>
                <b className="block">{b.t}</b>
                <span className="text-sm text-muted">{b.d}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="mb-2 text-sm font-semibold text-muted">2. Agua</p>
        <div className="opts">
          {AGUAS.map((a) => (
            <label key={a.v} className="opt">
              <input type="radio" name="agua" value={a.v} checked={agua === a.v} onChange={() => setAgua(a.v)} />
              <span>
                <b className="block">{a.t}</b>
                <span className="text-sm text-muted">{a.d}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="grid gap-x-4 sm:grid-cols-3">
          {(base === "fijo_area" || base === "fijo_igual") && (
            <div className="field">
              <label htmlFor="c-f">
                {base === "fijo_igual" ? "Monto por departamento (S/)" : "Monto fijo mensual del edificio (S/)"}
              </label>
              <input
                id="c-f"
                name="monto"
                type="number"
                min={0.01}
                step={0.01}
                defaultValue={e.monto_fijo_mensual ?? ""}
                required
              />
            </div>
          )}
          {agua === "consumo" && (
            <div className="field">
              <label htmlFor="c-l">Día de lectura de medidores</label>
              <input id="c-l" name="dia_lectura" type="number" min={1} max={28} step={1} defaultValue={e.dia_lectura ?? ""} required />
            </div>
          )}
          <div className="field">
            <label htmlFor="c-ac">Áreas comunes (m², informativo)</label>
            <input id="c-ac" name="area_comun" type="number" min={0} step={0.01} defaultValue={e.area_comun_m2 ?? ""} />
          </div>
        </div>
        <p className="text-sm text-muted">
          La alícuota de cada departamento es su área dividida entre la suma de las áreas de todos los departamentos. Las
          áreas comunes no la cambian: solo sirven para mostrar el área asignada.
        </p>
      </fieldset>
      <Pie puede={puede} enviando={enviando} texto="Guardar cobranza" />
    </form>
  );
}

export function FormPago({ e, puede }: { e: Edificio; puede: boolean }) {
  const [r, accion, enviando] = useActionState(guardarPago, inicial);
  return (
    <form action={accion} className="panel" id="pago">
      <h3 className="mb-3">Datos de cobro y recibos</h3>
      <Aviso r={r} />
      <fieldset disabled={!puede}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="c-c">Día de vencimiento (corte)</label>
            <input id="c-c" name="dia_corte" type="number" min={1} max={27} step={1} defaultValue={e.dia_corte} required />
          </div>
          <div className="field">
            <label htmlFor="c-m">Mora por pago tardío (S/)</label>
            <input id="c-m" name="mora" type="number" min={0} step={0.01} defaultValue={e.mora_monto} />
          </div>
          <div className="field">
            <label htmlFor="c-s">Saldo inicial de caja (S/)</label>
            <input id="c-s" name="saldo_inicial" type="number" step={0.01} defaultValue={e.saldo_inicial} />
          </div>
          <div className="field">
            <label htmlFor="c-b">Cuenta bancaria para recibos</label>
            <input id="c-b" name="cuenta" defaultValue={e.cuenta_bancaria ?? ""} placeholder="Ej. BCP Soles 191-2345678-0-12" />
          </div>
          <div className="field">
            <label htmlFor="c-y">Yape / Plin</label>
            <input id="c-y" name="yape" defaultValue={e.yape_plin ?? ""} placeholder="Ej. 987 654 321" />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="desglose" defaultChecked={e.publicar_desglose} className="mt-1" />
          Mostrar a los vecinos el desglose de cuentas por cobrar por departamento
        </label>
      </fieldset>
      <Pie puede={puede} enviando={enviando} texto="Guardar datos de cobro" />
    </form>
  );
}
