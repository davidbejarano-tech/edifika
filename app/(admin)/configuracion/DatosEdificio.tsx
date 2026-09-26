"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { fecha } from "@/lib/format";
import { prepararImagen } from "@/lib/imagen";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Ubigeo } from "@/lib/ubigeos";
import { borrarCertificacion, crearCertificacion, guardarDatos, guardarImagen, urlArchivoEdificio, type Resultado } from "./acciones";

type Datos = {
  id: string;
  nombre: string;
  direccion: string;
  total_departamentos: number;
  calle: string | null;
  numero_calle: string | null;
  urbanizacion: string | null;
  referencia: string | null;
  ubigeo: string | null;
  anio_construccion: number | null;
  constructora: string | null;
};

function Aviso({ r }: { r: Resultado | null }) {
  if (!r?.mensaje) return null;
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

const unicos = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, "es"));

// Datos del edificio con la dirección por partes (Departamento › Provincia › Distrito del INEI)
export function FormDatos({ e, ubigeos, puede }: { e: Datos; ubigeos: Ubigeo[]; puede: boolean }) {
  const [r, accion, enviando] = useActionState(guardarDatos, { ok: false, mensaje: null });
  const actual = ubigeos.find((u) => u.codigo === e.ubigeo);
  const [depto, setDepto] = useState(actual?.departamento ?? "Lima");
  const [prov, setProv] = useState(actual?.provincia ?? (actual ? "" : "Lima"));
  const [dist, setDist] = useState(actual?.codigo ?? "");

  const departamentos = useMemo(() => unicos(ubigeos.map((u) => u.departamento)), [ubigeos]);
  const provincias = useMemo(() => unicos(ubigeos.filter((u) => u.departamento === depto).map((u) => u.provincia)), [ubigeos, depto]);
  const distritos = useMemo(
    () => ubigeos.filter((u) => u.departamento === depto && u.provincia === prov).sort((a, b) => a.distrito.localeCompare(b.distrito, "es")),
    [ubigeos, depto, prov],
  );

  return (
    <form action={accion} className="panel" id="datos">
      <h3 className="mb-3">Datos del edificio</h3>
      <Aviso r={r} />
      <fieldset disabled={!puede}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="c-n">Nombre del edificio</label>
            <input id="c-n" name="nombre" defaultValue={e.nombre} required />
          </div>
          <div className="field">
            <label htmlFor="c-t">Cantidad total de departamentos</label>
            <input id="c-t" name="total" type="number" min={1} step={1} defaultValue={e.total_departamentos} required />
          </div>
        </div>

        <h4 className="mt-2 mb-2 font-display font-bold">Dirección</h4>
        {!e.calle && e.direccion && (
          <p className="hint mb-3">
            Dirección registrada: <b>{e.direccion}</b>. Complétala por partes: así sale ordenada en los recibos y se puede buscar por distrito.
          </p>
        )}
        <div className="grid gap-x-4 sm:grid-cols-[2fr_1fr]">
          <div className="field">
            <label htmlFor="c-calle">Calle, avenida o jirón</label>
            <input id="c-calle" name="calle" defaultValue={e.calle ?? ""} required placeholder="Ej. Calle Los Ficus" />
          </div>
          <div className="field">
            <label htmlFor="c-num">Número</label>
            <input id="c-num" name="numero" defaultValue={e.numero_calle ?? ""} placeholder="Ej. 245" />
          </div>
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="c-urb">Urbanización</label>
            <input id="c-urb" name="urbanizacion" defaultValue={e.urbanizacion ?? ""} placeholder="Ej. Urb. Corpac" />
          </div>
          <div className="field">
            <label htmlFor="c-ref">Referencia</label>
            <input id="c-ref" name="referencia" defaultValue={e.referencia ?? ""} placeholder="Ej. Frente al parque Bosque El Olivar" />
          </div>
        </div>
        <div className="grid gap-x-4 sm:grid-cols-4">
          <div className="field">
            <label htmlFor="c-dep">Departamento</label>
            <select
              id="c-dep"
              value={depto}
              onChange={(ev) => {
                setDepto(ev.target.value);
                setProv("");
                setDist("");
              }}
            >
              {departamentos.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-prov">Provincia</label>
            <select
              id="c-prov"
              value={prov}
              onChange={(ev) => {
                setProv(ev.target.value);
                setDist("");
              }}
            >
              <option value="">Elige…</option>
              {provincias.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-dist">Distrito</label>
            <select id="c-dist" name="ubigeo" value={dist} onChange={(ev) => setDist(ev.target.value)} required>
              <option value="">Elige…</option>
              {distritos.map((d) => (
                <option key={d.codigo} value={d.codigo}>
                  {d.distrito}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-pais">País</label>
            <select id="c-pais" name="pais" defaultValue="PE">
              <option value="PE">Perú</option>
            </select>
          </div>
        </div>

        <h4 className="mt-2 mb-2 font-display font-bold">
          Datos adicionales <span className="text-sm font-normal text-muted">(opcionales)</span>
        </h4>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="c-anio">Año de construcción</label>
            <input id="c-anio" name="anio" type="number" min={1800} max={2100} defaultValue={e.anio_construccion ?? ""} placeholder="Ej. 2015" />
          </div>
          <div className="field">
            <label htmlFor="c-cons">Constructora</label>
            <input id="c-cons" name="constructora" defaultValue={e.constructora ?? ""} placeholder="Ej. Constructora Los Andes S.A.C." />
          </div>
        </div>
      </fieldset>
      {puede ? (
        <div className="mt-2 flex justify-end">
          <button className="btn" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar datos"}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Solo el administrador titular puede cambiar estos datos.</p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------
// Foto y logo (el logo sale en los recibos y el estado de cuenta en PDF)
// ---------------------------------------------------------------------
type Imagenes = { foto: string | null; logo: string | null }; // enlaces firmados para mostrar

export function FotoYLogo({ edificioId, urls, puede }: { edificioId: string; urls: Imagenes; puede: boolean }) {
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [vista, setVista] = useState(urls);
  const [pendiente, iniciar] = useTransition();

  function subir(tipo: "foto" | "logo", archivo: File | undefined) {
    if (!archivo) return;
    iniciar(async () => {
      const blob = await prepararImagen(archivo, tipo === "logo" ? 600 : 1600, tipo === "logo" ? "image/png" : "image/jpeg");
      if ("error" in blob) return setAviso({ ok: false, mensaje: blob.error });
      const ruta = `${edificioId}/${tipo}-${Date.now()}.${tipo === "logo" ? "png" : "jpg"}`;
      const { error } = await crearClienteNavegador().storage.from("edificios").upload(ruta, blob, { contentType: blob.type });
      if (error) return setAviso({ ok: false, mensaje: "No se pudo subir la imagen. Solo el administrador titular puede cambiarla." });
      const r = await guardarImagen(tipo, ruta);
      setAviso(r);
      if (r.ok) setVista((v) => ({ ...v, [tipo]: URL.createObjectURL(blob) }));
    });
  }

  function quitar(tipo: "foto" | "logo") {
    if (!confirm(tipo === "logo" ? "¿Quitar el logo? Los recibos saldrán solo con el nombre del edificio." : "¿Quitar la foto del edificio?")) return;
    iniciar(async () => {
      const r = await guardarImagen(tipo, null);
      setAviso(r);
      if (r.ok) setVista((v) => ({ ...v, [tipo]: null }));
    });
  }

  const Casilla = ({ tipo, titulo, ayuda }: { tipo: "foto" | "logo"; titulo: string; ayuda: string }) => (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">{titulo}</p>
      <div className={`grid place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-surface2 ${tipo === "logo" ? "h-32" : "h-44"}`}>
        {vista[tipo] ? (
          // eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal de Supabase Storage
          <img src={vista[tipo]!} alt={titulo} className={tipo === "logo" ? "max-h-28 max-w-[80%] object-contain" : "h-full w-full object-cover"} />
        ) : (
          <span className="text-sm text-muted">Sin {tipo === "logo" ? "logo" : "foto"}</span>
        )}
      </div>
      <p className="text-xs text-muted">{ayuda}</p>
      {puede && (
        <div className="flex flex-wrap gap-2">
          <label className={`btn quiet sm cursor-pointer ${pendiente ? "pointer-events-none opacity-60" : ""}`}>
            {vista[tipo] ? "Cambiar" : "Subir"} {tipo === "logo" ? "logo" : "foto"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(ev) => subir(tipo, ev.target.files?.[0])} />
          </label>
          {vista[tipo] && (
            <button type="button" className="btn quiet sm" onClick={() => quitar(tipo)} disabled={pendiente}>
              Quitar
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <section className="panel">
      <h3 className="mb-3">Foto y logo</h3>
      <Aviso r={aviso} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Casilla tipo="foto" titulo="Foto del edificio" ayuda="JPG o PNG. Se reduce sola para que cargue rápido." />
        <Casilla tipo="logo" titulo="Logo del edificio" ayuda="Aparece en los recibos y el estado de cuenta en PDF. Mejor en PNG con fondo transparente." />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Certificaciones (ITSE / Defensa Civil, ascensores, pozo a tierra…)
// ---------------------------------------------------------------------
type Certificacion = { id: string; nombre: string; entidad: string | null; emitida_en: string | null; vence_en: string | null; archivo_path: string | null };

export function Certificaciones({ edificioId, lista, hoy, puede }: { edificioId: string; lista: Certificacion[]; hoy: string; puede: boolean }) {
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const en30 = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 30 * 86400000).toISOString().slice(0, 10);

  function estado(c: Certificacion) {
    if (!c.vence_en) return { texto: "Sin vencimiento", clase: "tag" };
    if (c.vence_en < hoy) return { texto: "Vencida", clase: "bad" };
    if (c.vence_en <= en30) return { texto: "Vence pronto", clase: "warn" };
    return { texto: "Vigente", clase: "activo" };
  }

  return (
    <section className="panel">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="flex-1">Certificaciones</h3>
        {puede && !abierto && (
          <button className="btn quiet sm" onClick={() => setAbierto(true)}>
            Agregar certificación
          </button>
        )}
      </div>
      <Aviso r={aviso} />
      {lista.length === 0 && !abierto && (
        <p className="text-sm text-muted">Registra el certificado ITSE (Defensa Civil), el mantenimiento de ascensores, el pozo a tierra u otros. Te avisamos en Inicio cuando estén por vencer.</p>
      )}
      {lista.length > 0 && (
        <div className="tbl mb-3">
          <table>
            <thead>
              <tr>
                <th>Certificación</th>
                <th>Emitida</th>
                <th>Vence</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const e = estado(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <b>{c.nombre}</b>
                      {c.entidad && <span className="block text-xs text-muted">{c.entidad}</span>}
                    </td>
                    <td>{c.emitida_en ? fecha(c.emitida_en) : "—"}</td>
                    <td>{c.vence_en ? fecha(c.vence_en) : "—"}</td>
                    <td>
                      <span className={`chip ${e.clase}`}>{e.texto}</span>
                    </td>
                    <td className="r whitespace-nowrap">
                      {c.archivo_path && (
                        <button
                          className="btn quiet sm"
                          disabled={pendiente}
                          onClick={() =>
                            iniciar(async () => {
                              const url = await urlArchivoEdificio(c.archivo_path!);
                              if (url) window.open(url, "_blank", "noopener");
                              else setAviso({ ok: false, mensaje: "No se pudo abrir el archivo." });
                            })
                          }
                        >
                          Ver archivo
                        </button>
                      )}
                      {puede && (
                        <button
                          className="ml-1 text-xs text-muted underline hover:text-bad"
                          disabled={pendiente}
                          onClick={() => {
                            if (confirm(`¿Eliminar "${c.nombre}"?`)) iniciar(async () => setAviso(await borrarCertificacion(c.id)));
                          }}
                        >
                          Eliminar
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
      {abierto && (
        <FormCertificacion
          edificioId={edificioId}
          onCancelar={() => setAbierto(false)}
          onListo={(r) => {
            setAviso(r);
            if (r.ok) setAbierto(false);
          }}
        />
      )}
    </section>
  );
}

function FormCertificacion({ edificioId, onCancelar, onListo }: { edificioId: string; onCancelar: () => void; onListo: (r: Resultado) => void }) {
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="rounded-xl border border-line bg-surface2 p-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        const archivo = f.get("archivo") as File | null;
        setError("");
        iniciar(async () => {
          let ruta: string | null = null;
          if (archivo && archivo.size > 0) {
            if (archivo.size > 10 * 1024 * 1024) return setError("El archivo pesa más de 10 MB.");
            const ext = archivo.type === "application/pdf" ? "pdf" : archivo.type === "image/png" ? "png" : "jpg";
            ruta = `${edificioId}/certificaciones/${crypto.randomUUID()}.${ext}`;
            const { error: e } = await crearClienteNavegador().storage.from("edificios").upload(ruta, archivo, { contentType: archivo.type });
            if (e) return setError("No se pudo subir el archivo. Debe ser PDF, JPG o PNG.");
          }
          const r = await crearCertificacion({
            nombre: String(f.get("nombre") ?? ""),
            entidad: String(f.get("entidad") ?? ""),
            emitida_en: String(f.get("emitida") ?? ""),
            vence_en: String(f.get("vence") ?? ""),
            archivo_path: ruta,
          });
          if (r.ok) onListo(r);
          else setError(r.mensaje ?? "");
        });
      }}
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="ce-n">Certificación</label>
          <input id="ce-n" name="nombre" required list="tipos-cert" placeholder="Ej. Certificado ITSE (Defensa Civil)" />
          <datalist id="tipos-cert">
            <option value="Certificado ITSE (Defensa Civil)" />
            <option value="Mantenimiento de ascensores" />
            <option value="Medición de pozo a tierra" />
            <option value="Extintores" />
            <option value="Fumigación y desratización" />
            <option value="Limpieza de cisterna y tanque elevado" />
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="ce-e">Entidad que la emite</label>
          <input id="ce-e" name="entidad" placeholder="Ej. Municipalidad de San Isidro" />
        </div>
        <div className="field">
          <label htmlFor="ce-f">Fecha de emisión</label>
          <input id="ce-f" name="emitida" type="date" />
        </div>
        <div className="field">
          <label htmlFor="ce-v">Vence</label>
          <input id="ce-v" name="vence" type="date" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ce-a">Archivo (PDF, JPG o PNG, opcional)</label>
        <input id="ce-a" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png" />
      </div>
      {error && <p className="err">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn quiet" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar certificación"}
        </button>
      </div>
    </form>
  );
}
