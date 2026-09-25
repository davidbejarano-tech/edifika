"use client";

import { useState, useTransition } from "react";
import { fecha } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import { agregarMiembro, quitarMiembro, type Resultado } from "../acciones";

type Miembro = Database["public"]["Functions"]["plataforma_equipo"]["Returns"][number];

export function Equipo({ miembros }: { miembros: Miembro[] }) {
  const [correo, setCorreo] = useState("");
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <>
      {aviso && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} role="status">
          {aviso.mensaje}
        </p>
      )}
      <div className="panel tbl">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Desde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {miembros.map((m) => (
              <tr key={m.perfil_id}>
                <td>
                  {m.nombre} {m.soy_yo && <span className="chip tag ml-1">Tú</span>}
                </td>
                <td>{m.correo}</td>
                <td>{fecha(m.desde.slice(0, 10))}</td>
                <td className="r">
                  {!m.soy_yo && (
                    <button
                      className="btn danger sm"
                      disabled={pendiente}
                      onClick={() => {
                        if (confirm(`¿Quitar a ${m.nombre} del equipo EDIFIKA? Pierde el acceso a la consola.`))
                          iniciar(async () => setAviso(await quitarMiembro(m.perfil_id)));
                      }}
                    >
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="panel flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const r = await agregarMiembro(correo);
            setAviso(r);
            if (r.ok) setCorreo("");
          });
        }}
      >
        <div className="field mb-0 min-w-[240px] flex-1">
          <label htmlFor="eq-correo">Agregar por correo</label>
          <input id="eq-correo" type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="persona@edifika.pe" />
          <p className="mt-1 text-xs text-muted">La persona debe tener una cuenta en EDIFIKA con ese correo.</p>
        </div>
        <button className="btn" disabled={pendiente}>
          Agregar al equipo
        </button>
      </form>
    </>
  );
}
