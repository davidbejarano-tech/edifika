"use client";

import { useState, useTransition } from "react";
import type { Plan } from "@/lib/modulos";
import { guardarCorreo, guardarPlanes, type Resultado } from "../acciones";

const MODULOS: [string, string][] = [
  ["areas_comunes", "Áreas comunes"],
  ["mantenimiento", "Mantenimiento"],
  ["marketplace", "Marketplace"],
];
const numero = (v: string) => (v.trim() === "" ? null : Number(v));
const monto = (moneda: string, n: number) =>
  `${moneda === "PEN" ? "S/" : "USD"} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Aviso({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return (
    <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${r.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} role="status">
      {r.mensaje}
    </p>
  );
}

type Props = { planes: Plan[]; tamanos: number[]; ejemplos: { id: string; precios: number[] }[] };

export function FormPlanes({ planes, tamanos, ejemplos }: Props) {
  const [lista, setLista] = useState<Plan[]>(planes);
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambiar = (i: number, cambio: Partial<Plan>) => setLista((l) => l.map((p, j) => (j === i ? { ...p, ...cambio } : p)));

  return (
    <form
      className="mb-6"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => setAviso(await guardarPlanes(lista)));
      }}
    >
      <Aviso r={aviso} />
      <div className="grid gap-4 lg:grid-cols-3">
        {lista.map((p, i) => {
          const ej = ejemplos.find((x) => x.id === p.id);
          return (
            <fieldset key={p.id} className="panel mb-0">
              <legend className="px-1 text-xs font-bold text-muted uppercase">{p.id}</legend>
              <div className="field">
                <label htmlFor={`pl-n-${p.id}`}>Nombre</label>
                <input id={`pl-n-${p.id}`} required value={p.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-x-3">
                <div className="field">
                  <label htmlFor={`pl-m-${p.id}`}>Moneda</label>
                  <select id={`pl-m-${p.id}`} value={p.moneda} onChange={(e) => cambiar(i, { moneda: e.target.value })}>
                    <option value="PEN">Soles (S/)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`pl-p-${p.id}`}>Precio fijo al mes</label>
                  <input
                    id={`pl-p-${p.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={p.precio ?? ""}
                    onChange={(e) => cambiar(i, { precio: numero(e.target.value) ?? 0 })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`pl-d-${p.id}`}>Precio por depto</label>
                  <input
                    id={`pl-d-${p.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={p.precio_departamento ?? ""}
                    onChange={(e) => cambiar(i, { precio_departamento: numero(e.target.value) })}
                    placeholder="Opcional"
                  />
                </div>
                <div className="field">
                  <label htmlFor={`pl-min-${p.id}`}>Mínimo al mes</label>
                  <input
                    id={`pl-min-${p.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={p.minimo ?? ""}
                    onChange={(e) => cambiar(i, { minimo: numero(e.target.value) })}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor={`pl-x-${p.id}`}>Máximo de departamentos</label>
                <input
                  id={`pl-x-${p.id}`}
                  type="number"
                  min={1}
                  value={p.max_departamentos ?? ""}
                  onChange={(e) => cambiar(i, { max_departamentos: numero(e.target.value) })}
                  placeholder="Sin límite"
                />
              </div>
              <fieldset className="field">
                <legend className="mb-1 text-sm font-semibold">Módulos incluidos</legend>
                {MODULOS.map(([id, texto]) => (
                  <label key={id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={p.modulos.includes(id)}
                      onChange={(e) => cambiar(i, { modulos: e.target.checked ? [...p.modulos, id] : p.modulos.filter((m) => m !== id) })}
                    />
                    {texto}
                  </label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor={`pl-i-${p.id}`}>Qué incluye (lo ve el titular)</label>
                <textarea id={`pl-i-${p.id}`} rows={3} value={p.incluye} onChange={(e) => cambiar(i, { incluye: e.target.value })} />
              </div>
              {ej && (
                <div className="rounded-lg bg-surface2 p-3 text-sm">
                  <p className="mb-1 font-semibold">Precio guardado según tamaño</p>
                  {tamanos.map((n, k) => (
                    <p key={n} className="flex justify-between tabular-nums">
                      <span className="text-muted">{n} departamentos</span>
                      <span>{monto(planes[i]?.moneda ?? "PEN", ej.precios[k])}</span>
                    </p>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <button className="btn" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar planes"}
        </button>
      </div>
    </form>
  );
}

export function FormCorreos({ avisos, contacto }: { avisos: string; contacto: string }) {
  const [valores, setValores] = useState({ correo_avisos: avisos, correo_contacto: contacto });
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [pendiente, iniciar] = useTransition();
  const campos: [keyof typeof valores, string, string][] = [
    ["correo_avisos", "Correo de avisos internos", "Recibe las solicitudes de plan."],
    ["correo_contacto", "Correo de contacto público", "Aparece en los términos y en la política de privacidad."],
  ];
  return (
    <section className="panel">
      <h3 className="mb-3">Correos de la plataforma</h3>
      <Aviso r={aviso} />
      <div className="grid gap-4 md:grid-cols-2">
        {campos.map(([clave, titulo, ayuda]) => (
          <form
            key={clave}
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              iniciar(async () => setAviso(await guardarCorreo(clave, valores[clave])));
            }}
          >
            <div className="field mb-0 min-w-[220px] flex-1">
              <label htmlFor={clave}>{titulo}</label>
              <input
                id={clave}
                type="email"
                required
                value={valores[clave]}
                onChange={(e) => setValores((v) => ({ ...v, [clave]: e.target.value }))}
              />
              <p className="mt-1 text-xs text-muted">{ayuda}</p>
            </div>
            <button className="btn quiet" disabled={pendiente}>
              Guardar
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
