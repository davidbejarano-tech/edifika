"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { COLUMNAS_ACTUALIZACION, celdasDeTexto, leerActualizacion } from "@/lib/departamentos";
import { fecha } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import {
  actualizarArea,
  actualizarDesdeTabla,
  agregarDepartamento,
  cambiarAcceso,
  cambioOcupante,
  editarDepartamento,
  invitarOcupante,
  registrarMedidor,
  restablecerClave,
  type Resultado,
} from "./acciones";

type Fila = Database["public"]["Functions"]["departamentos_admin"]["Returns"][number];
type Medidor = { id: string; departamento_id: string; numero_serie: string; lectura_inicial: number; instalado_en: string; retirado_en: string | null };
type Ventana = { tipo: "editar" | "medidor" | "cambio"; fila: Fila } | { tipo: "agregar" | "excel" } | null;

type Props = {
  filas: Fila[];
  medidores: Medidor[];
  totalDeclarado: number;
  conMedidores: boolean;
  puede: boolean;
};

const inicial: Resultado = { ok: false, mensaje: null };
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const pct = (x: number) => `${(x * 100).toFixed(2)} %`;

const ACCESO: Record<string, { texto: string; clase: string }> = {
  activo: { texto: "Activo", clase: "activo" },
  desactivado: { texto: "Desactivado", clase: "bad" },
  sin_cuenta: { texto: "Sin cuenta", clase: "tag" },
};

export function Departamentos({ filas, medidores, totalDeclarado, conMedidores, puede }: Props) {
  const [ventana, setVentana] = useState<Ventana>(null);
  const [aviso, setAviso] = useState<Resultado>(inicial);
  const [pendiente, iniciar] = useTransition();

  // Áreas locales para recalcular la alícuota al instante mientras se escribe (solo para mostrar)
  const [areas, setAreas] = useState<Record<string, string>>({});
  useEffect(() => {
    setAreas(Object.fromEntries(filas.map((f) => [f.departamento_id, f.area_m2 === null ? "" : String(f.area_m2)])));
  }, [filas]);
  const sumaAreas = useMemo(
    () => Object.values(areas).reduce((s, a) => s + (Number(a) > 0 ? Number(a) : 0), 0),
    [areas],
  );
  const sinArea = filas.filter((f) => !(Number(areas[f.departamento_id]) > 0)).length;
  const sinMedidor = filas.filter((f) => !f.medidor_serie).length;

  const cerrar = (r?: Resultado) => {
    setVentana(null);
    if (r) setAviso(r);
  };

  function guardarArea(f: Fila) {
    const txt = (areas[f.departamento_id] ?? "").replace(",", ".");
    const nueva = txt === "" ? null : Number(txt);
    if (nueva === (f.area_m2 === null ? null : Number(f.area_m2))) return;
    iniciar(async () => setAviso(await actualizarArea(f.departamento_id, nueva)));
  }

  function acceso(f: Fila, activo: boolean) {
    if (!activo && !confirm(`¿Desactivar el acceso del departamento ${f.numero}? El ocupante ya no podrá ingresar.`)) return;
    iniciar(async () => setAviso(await cambiarAcceso(f.departamento_id, activo)));
  }

  function invitar(f: Fila) {
    if (!confirm(`¿Enviar la invitación a ${f.responsable}, del departamento ${f.numero}?`)) return;
    iniciar(async () => setAviso(await invitarOcupante(f.departamento_id)));
  }

  function restablecer(f: Fila) {
    if (!confirm(`¿Enviar a ${f.responsable} un correo para crear una contraseña nueva?`)) return;
    iniciar(async () => setAviso(await restablecerClave(f.departamento_id)));
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <h1>Departamentos y ocupantes</h1>
          <p className="mt-1 text-muted">
            El número de departamento es el usuario de acceso de los vecinos. Edita el área y la alícuota se recalcula al
            instante.
          </p>
        </div>
        {puede && (
          <div className="flex flex-wrap gap-2">
            <button className="btn quiet" onClick={() => setVentana({ tipo: "excel" })}>
              Áreas y medidores desde Excel
            </button>
            <button className="btn" onClick={() => setVentana({ tipo: "agregar" })}>
              Agregar departamento
            </button>
          </div>
        )}
      </div>

      {aviso.mensaje && (
        <p className={aviso.ok ? "aviso" : "err"} role={aviso.ok ? "status" : "alert"}>
          {aviso.mensaje}
        </p>
      )}
      {!puede && <p className="hint mb-4">Puedes ver los departamentos. Solo el administrador titular puede cambiarlos.</p>}
      {filas.length !== totalDeclarado && (
        <p className="hint mb-3">
          Hay {filas.length} departamentos registrados y la configuración indica {totalDeclarado}. Agrega los que faltan o
          corrige la cantidad en Configuración.
        </p>
      )}
      {filas.length > 0 && sinArea > 0 && (
        <p className="hint mb-3">
          {sinArea} {sinArea === 1 ? "departamento no tiene" : "departamentos no tienen"} área. Sin áreas no se pueden
          calcular cuotas que se repartan por área.
        </p>
      )}
      {conMedidores && filas.length > 0 && sinMedidor > 0 && (
        <p className="hint mb-3">
          El agua se cobra por consumo y {sinMedidor} {sinMedidor === 1 ? "departamento no tiene" : "departamentos no tienen"}{" "}
          medidor registrado.
        </p>
      )}

      <div className="panel">
        {filas.length === 0 ? (
          <p className="text-muted">Todavía no hay departamentos. Agrégalos uno por uno o impórtalos desde Mis edificios.</p>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Depto</th>
                  <th>Propietario</th>
                  <th>Inquilino</th>
                  <th className="r">Área (m²)</th>
                  <th className="r">Alícuota</th>
                  <th>Medidor</th>
                  <th>Acceso</th>
                  {puede && <th className="r">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const a = Number(areas[f.departamento_id]);
                  const ac = ACCESO[f.acceso] ?? ACCESO.sin_cuenta;
                  return (
                    <tr key={f.departamento_id}>
                      <td>
                        <b>{f.numero}</b>
                        <span className="block text-xs text-muted">Piso {f.piso}</span>
                      </td>
                      <td>{f.propietario ?? "—"}</td>
                      <td>{f.inquilino ?? <span className="text-muted">No aplica</span>}</td>
                      <td className="r">
                        <input
                          className="w-24 rounded-md border border-line bg-surface px-2 py-1 text-right tabular-nums"
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={areas[f.departamento_id] ?? ""}
                          onChange={(e) => setAreas((x) => ({ ...x, [f.departamento_id]: e.target.value }))}
                          onBlur={() => guardarArea(f)}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          disabled={!puede}
                          aria-label={`Área del departamento ${f.numero}`}
                        />
                      </td>
                      <td className="r font-semibold">{a > 0 && sumaAreas ? pct(a / sumaAreas) : "—"}</td>
                      <td>
                        {f.medidor_serie ? (
                          <span className="font-mono text-sm">{f.medidor_serie}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {puede && (
                          <button className="btn ghost sm ml-1" onClick={() => setVentana({ tipo: "medidor", fila: f })}>
                            {f.medidor_serie ? "Cambiar" : "Registrar"}
                          </button>
                        )}
                      </td>
                      <td>
                        <span className={`chip ${ac.clase}`}>{ac.texto}</span>
                        {puede && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {f.acceso === "activo" && (
                              <>
                                <button className="btn ghost sm" onClick={() => restablecer(f)} disabled={pendiente}>
                                  Restablecer clave
                                </button>
                                <button className="btn ghost sm" onClick={() => acceso(f, false)} disabled={pendiente}>
                                  Desactivar
                                </button>
                              </>
                            )}
                            {f.acceso === "desactivado" && (
                              <button className="btn ghost sm" onClick={() => acceso(f, true)} disabled={pendiente}>
                                Activar
                              </button>
                            )}
                            {f.acceso === "sin_cuenta" &&
                              (f.responsable_tiene_correo ? (
                                <button className="btn ghost sm" onClick={() => invitar(f)} disabled={pendiente}>
                                  Invitar
                                </button>
                              ) : f.responsable ? (
                                <span className="text-xs text-muted">Falta el correo para invitar</span>
                              ) : null)}
                          </span>
                        )}
                      </td>
                      {puede && (
                        <td className="r">
                          <div className="flex justify-end gap-1">
                            <button className="btn quiet sm" onClick={() => setVentana({ tipo: "editar", fila: f })}>
                              Editar
                            </button>
                            <button className="btn quiet sm" onClick={() => setVentana({ tipo: "cambio", fila: f })}>
                              Cambio de ocupante
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={3}>{filas.length} departamentos</td>
                  <td className="r">{sumaAreas.toLocaleString("en-US")}</td>
                  <td className="r">{sinArea === 0 ? "100.00 %" : "—"}</td>
                  <td colSpan={puede ? 3 : 2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Modal abierto={ventana?.tipo === "agregar"} titulo="Agregar departamento" onCerrar={() => cerrar()}>
        <FormAgregar onListo={cerrar} />
      </Modal>
      <Modal abierto={ventana?.tipo === "excel"} titulo="Áreas y medidores desde Excel" onCerrar={() => cerrar()}>
        <FormExcel numeros={filas.map((f) => f.numero)} onListo={cerrar} />
      </Modal>
      {ventana && "fila" in ventana && (
        <>
          <Modal abierto={ventana.tipo === "editar"} titulo={`Editar departamento ${ventana.fila.numero}`} onCerrar={() => cerrar()}>
            <FormEditar fila={ventana.fila} onListo={cerrar} />
          </Modal>
          <Modal abierto={ventana.tipo === "medidor"} titulo={`Medidor del departamento ${ventana.fila.numero}`} onCerrar={() => cerrar()}>
            <FormMedidor
              fila={ventana.fila}
              historial={medidores.filter((m) => m.departamento_id === ventana.fila.departamento_id)}
              onListo={cerrar}
            />
          </Modal>
          <Modal abierto={ventana.tipo === "cambio"} titulo={`Cambio de ocupante · depto ${ventana.fila.numero}`} onCerrar={() => cerrar()}>
            <FormCambio fila={ventana.fila} onListo={cerrar} />
          </Modal>
        </>
      )}
    </>
  );
}

// ----- Formularios de las ventanas -----

function useFormulario(accion: (r: Resultado, f: FormData) => Promise<Resultado>, onListo: (r: Resultado) => void) {
  const [r, enviar, enviando] = useActionState(accion, inicial);
  const avisado = useRef<Resultado | null>(null);
  useEffect(() => {
    // Cada resultado exitoso cierra la ventana una sola vez
    if (r.ok && avisado.current !== r) {
      avisado.current = r;
      onListo(r);
    }
  }, [r, onListo]);
  const error = !r.ok && r.mensaje && (
    <p className="err" role="alert">
      {r.mensaje}
    </p>
  );
  return { enviar, enviando, error };
}

function Botones({ enviando, texto }: { enviando: boolean; texto: string }) {
  return (
    <div className="mt-2 flex justify-end">
      <button className="btn" disabled={enviando}>
        {enviando ? "Guardando…" : texto}
      </button>
    </div>
  );
}

function FormAgregar({ onListo }: { onListo: (r: Resultado) => void }) {
  const { enviar, enviando, error } = useFormulario(agregarDepartamento, onListo);
  return (
    <form action={enviar}>
      {error}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Campo id="ad-n" nombre="numero" etiqueta="Número" requerido />
        <Campo id="ad-p" nombre="piso" etiqueta="Piso (opcional)" tipo="number" />
        <Campo id="ad-pr" nombre="propietario" etiqueta="Propietario" requerido />
        <Campo id="ad-i" nombre="inquilino" etiqueta="Inquilino (si lo hay)" />
        <Campo id="ad-e" nombre="email" etiqueta="Correo del ocupante" tipo="email" />
        <Campo id="ad-t" nombre="telefono" etiqueta="Teléfono" />
        <Campo id="ad-a" nombre="area" etiqueta="Área m² (opcional)" tipo="number" />
        <Campo id="ad-m" nombre="medidor" etiqueta="N.° de medidor (opcional)" />
      </div>
      <Botones enviando={enviando} texto="Agregar departamento" />
    </form>
  );
}

function FormEditar({ fila, onListo }: { fila: Fila; onListo: (r: Resultado) => void }) {
  const { enviar, enviando, error } = useFormulario(editarDepartamento, onListo);
  return (
    <form action={enviar}>
      {error}
      <input type="hidden" name="departamento_id" value={fila.departamento_id} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Campo id="ed-p" nombre="piso" etiqueta="Piso" tipo="number" valor={fila.piso} requerido />
        <Campo id="ed-a" nombre="area" etiqueta="Área m²" tipo="number" valor={fila.area_m2 ?? ""} />
      </div>
      {(["propietario", "inquilino"] as const).map((rol) =>
        fila[`${rol}_id`] ? (
          <fieldset key={rol} className="mt-2 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-semibold capitalize">{rol}</legend>
            <input type="hidden" name={`${rol}_id`} value={fila[`${rol}_id`] ?? ""} />
            <Campo id={`ed-${rol}-n`} nombre={`${rol}_nombre`} etiqueta="Nombre" valor={fila[rol] ?? ""} requerido />
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Campo id={`ed-${rol}-e`} nombre={`${rol}_email`} etiqueta="Correo" tipo="email" valor={fila[`${rol}_email`] ?? ""} />
              <Campo id={`ed-${rol}-t`} nombre={`${rol}_telefono`} etiqueta="Teléfono" valor={fila[`${rol}_telefono`] ?? ""} />
            </div>
          </fieldset>
        ) : null,
      )}
      <p className="mt-2 text-sm text-muted">Para registrar un nuevo propietario o inquilino usa “Cambio de ocupante”.</p>
      <Botones enviando={enviando} texto="Guardar cambios" />
    </form>
  );
}

function FormMedidor({ fila, historial, onListo }: { fila: Fila; historial: Medidor[]; onListo: (r: Resultado) => void }) {
  const { enviar, enviando, error } = useFormulario(registrarMedidor, onListo);
  return (
    <>
      <form action={enviar}>
        {error}
        <input type="hidden" name="departamento_id" value={fila.departamento_id} />
        <p className="mb-3 text-sm text-muted">
          {fila.medidor_serie
            ? `El medidor actual (${fila.medidor_serie}) pasará al historial y el nuevo empezará con su lectura inicial.`
            : "Registra el número de serie que figura en el medidor y la lectura que marca hoy."}
        </p>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Campo id="md-s" nombre="serie" etiqueta="Número de serie" requerido />
          <Campo id="md-l" nombre="lectura_inicial" etiqueta="Lectura inicial (m³)" tipo="number" valor={0} />
          <Campo id="md-f" nombre="fecha" etiqueta="Fecha de instalación" tipo="date" valor={hoy()} />
        </div>
        <Botones enviando={enviando} texto={fila.medidor_serie ? "Cambiar medidor" : "Registrar medidor"} />
      </form>
      <h3 className="mt-4 mb-2">Historial de medidores</h3>
      {historial.length ? (
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Serie</th>
                <th className="r">Lectura inicial</th>
                <th>Desde</th>
                <th>Hasta</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono">{m.numero_serie}</td>
                  <td className="r">{Number(m.lectura_inicial).toLocaleString("en-US")}</td>
                  <td>{fecha(m.instalado_en)}</td>
                  <td>{m.retirado_en ? fecha(m.retirado_en) : <span className="chip activo">Activo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">Este departamento todavía no tiene medidores registrados.</p>
      )}
    </>
  );
}

function FormCambio({ fila, onListo }: { fila: Fila; onListo: (r: Resultado) => void }) {
  const { enviar, enviando, error } = useFormulario(cambioOcupante, onListo);
  const [tipo, setTipo] = useState<"inquilino" | "propietario">("inquilino");
  return (
    <form action={enviar}>
      {error}
      <input type="hidden" name="departamento_id" value={fila.departamento_id} />
      <div className="opts">
        <label className="opt">
          <input type="radio" name="tipo" value="inquilino" checked={tipo === "inquilino"} onChange={() => setTipo("inquilino")} />
          <span>
            <b className="block">Nuevo inquilino</b>
            <span className="text-sm text-muted">
              {fila.inquilino ? `Reemplaza a ${fila.inquilino}.` : "El propietario sigue siendo el mismo."}
            </span>
          </span>
        </label>
        <label className="opt">
          <input type="radio" name="tipo" value="propietario" checked={tipo === "propietario"} onChange={() => setTipo("propietario")} />
          <span>
            <b className="block">Venta: nuevo propietario</b>
            <span className="text-sm text-muted">Cierra también el alquiler vigente, si lo hay.</span>
          </span>
        </label>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Campo id="co-n" nombre="nombre" etiqueta="Nombre completo" requerido />
        <Campo id="co-d" nombre="documento" etiqueta="DNI o CE (opcional)" />
        <Campo id="co-e" nombre="email" etiqueta="Correo (para la invitación)" tipo="email" />
        <Campo id="co-t" nombre="telefono" etiqueta="Teléfono" />
        <Campo id="co-f" nombre="desde" etiqueta="Ocupa desde" tipo="date" valor={hoy()} requerido />
      </div>
      <p className="hint">
        El acceso actual del departamento se desactivará y quedará en el historial. La deuda pertenece al departamento, no a
        la persona.
      </p>
      <Botones enviando={enviando} texto="Registrar cambio" />
    </form>
  );
}

function FormExcel({ numeros, onListo }: { numeros: string[]; onListo: (r: Resultado) => void }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const existentes = useMemo(() => new Set(numeros.map((n) => n.toLowerCase())), [numeros]);
  const filas = useMemo(() => leerActualizacion(celdasDeTexto(texto), existentes), [texto, existentes]);
  const conError = filas.filter((f) => f.error);

  async function leerArchivo(f: File) {
    setError(null);
    try {
      if (/\.(csv|txt)$/i.test(f.name)) return setTexto(await f.text());
      const XLSX = await import("xlsx");
      const libro = XLSX.read(await f.arrayBuffer());
      const celdas = XLSX.utils.sheet_to_json<string[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: false, defval: "" });
      setTexto(celdas.map((c) => c.join("\t")).join("\n"));
    } catch {
      setError("No pudimos leer el archivo. Guárdalo como Excel (.xlsx) o CSV e inténtalo otra vez.");
    }
  }

  async function plantilla() {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS_ACTUALIZACION, ...numeros.map((n) => [n, "", "", ""])]);
    XLSX.utils.book_append_sheet(libro, hoja, "Departamentos");
    XLSX.writeFile(libro, "areas-y-medidores.xlsx");
  }

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await actualizarDesdeTabla(
        filas.map(({ numero, area, medidor, lectura_inicial }) => ({ numero, area, medidor, lectura_inicial })),
      );
      if (r.ok) onListo(r);
      else setError(r.mensaje);
    });
  }

  return (
    <>
      <p className="mb-3 text-sm text-muted">
        Columnas: <b>número, área m², medidor y lectura inicial</b>. Una celda vacía no cambia el dato. Un medidor distinto al
        actual lo reemplaza y el anterior pasa al historial. Si una fila tiene un error, no se guarda ninguna.
      </p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="btn quiet sm cursor-pointer" htmlFor="ax-f">
          Subir Excel o CSV
        </label>
        <input
          id="ax-f"
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
        />
        <button type="button" className="btn quiet sm" onClick={plantilla}>
          Descargar plantilla con mis departamentos
        </button>
      </div>
      <div className="field">
        <label htmlFor="ax-t">O pega aquí la tabla</label>
        <textarea id="ax-t" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} className="font-mono text-[0.82rem]" spellCheck={false} />
      </div>
      {conError.length > 0 && (
        <div className="errlist" role="alert">
          {conError.slice(0, 10).map((f) => (
            <p key={f.fila}>
              Fila {f.fila}: {f.error}
            </p>
          ))}
        </div>
      )}
      {filas.length > 0 && conError.length === 0 && (
        <p className="mb-2 text-sm">
          <b>{filas.length} departamentos</b> listos: {filas.filter((f) => f.area !== null).length} con área y{" "}
          {filas.filter((f) => f.medidor).length} con medidor.
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" className="btn" onClick={guardar} disabled={enviando || !filas.length || conError.length > 0}>
          {enviando ? "Guardando…" : "Actualizar departamentos"}
        </button>
      </div>
    </>
  );
}

function Campo({
  id,
  nombre,
  etiqueta,
  tipo = "text",
  valor,
  requerido,
}: {
  id: string;
  nombre: string;
  etiqueta: string;
  tipo?: string;
  valor?: string | number;
  requerido?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        name={nombre}
        type={tipo}
        defaultValue={valor}
        required={requerido}
        step={tipo === "number" ? "any" : undefined}
      />
    </div>
  );
}
