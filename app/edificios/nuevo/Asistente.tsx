"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FuentesPlantilla } from "@/components/FuentesPlantilla";
import { EJEMPLO, MAX_FILAS, celdasDeTexto, leerFilas, paraImportar } from "@/lib/departamentos";
import { mes as nombreMes } from "@/lib/format";
import { codigoDisponible, registrarEdificio, type DatosEdificio } from "./acciones";

type Props = {
  miNombre: string;
  mesActual: string; // AAAA-MM
  organizaciones: { id: string; nombre: string }[];
  primerEdificio: boolean;
};

// Las áreas y el método de cálculo se completan después, en la configuración de la cobranza (RN-26).
const PASOS = ["Tu cuenta", "Edificio", "Departamentos"];

// "Edificio Las Palmeras" → "las-palmeras"
const aCodigo = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(edificio|residencial|condominio)\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

const m2 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function Asistente({ miNombre, mesActual, organizaciones, primerEdificio }: Props) {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [d, setD] = useState<DatosEdificio>({
    miNombre,
    nombre: "",
    direccion: "",
    codigo: "",
    total: 0,
    mes: mesActual,
    organizacion: organizaciones[0]?.id ?? null,
  });
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<string | null>(null);

  const filas = useMemo(() => leerFilas(celdasDeTexto(texto)), [texto]);
  const conError = filas.filter((f) => f.error);
  const conArea = filas.filter((f) => f.area !== null);
  const conMedidor = filas.filter((f) => f.medidor);
  const sumaArea = conArea.reduce((s, f) => s + (f.area ?? 0), 0);
  const listos = conError.length === 0 && filas.length <= MAX_FILAS;

  const set = <K extends keyof DatosEdificio>(k: K, v: DatosEdificio[K]) => setD((x) => ({ ...x, [k]: v }));

  // ----- Paso 1: datos del edificio
  async function continuarDatos(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const codigo = d.codigo || aCodigo(d.nombre);
    if (!/^[a-z0-9-]{3,30}$/.test(codigo)) {
      return setError("El código debe tener de 3 a 30 caracteres: letras minúsculas, números o guiones.");
    }
    set("codigo", codigo);
    if (!(await codigoDisponible(codigo))) return setError(`El código "${codigo}" ya está en uso. Elige otro.`);
    setPaso(2);
  }

  // ----- Paso 2: departamentos
  async function leerArchivo(f: File) {
    setError(null);
    if (f.size > 5 * 1024 * 1024) return setError("El archivo pesa más de 5 MB.");
    try {
      if (/\.(csv|txt)$/i.test(f.name)) {
        setTexto(await f.text());
      } else {
        const XLSX = await import("xlsx");
        const libro = XLSX.read(await f.arrayBuffer());
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const celdas = XLSX.utils.sheet_to_json<string[]>(hoja, { header: 1, raw: false, defval: "" });
        setTexto(celdas.map((c) => c.join("\t")).join("\n"));
      }
      setArchivo(f.name);
    } catch {
      setError("No pudimos leer el archivo. Guárdalo como Excel (.xlsx) o CSV e inténtalo otra vez.");
    }
  }


  function crear(conDepartamentos: boolean) {
    setError(null);
    iniciar(async () => {
      const r = await registrarEdificio(d, conDepartamentos ? paraImportar(filas) : []);
      if (r.ok) {
        router.push("/inicio?nuevo=1");
        router.refresh();
      } else {
        setPaso(r.paso);
        setError(r.error);
        window.scrollTo(0, 0);
      }
    });
  }

  const aviso = error && (
    <p className="err" role="alert">
      {error}
    </p>
  );

  const pie = (siguiente: React.ReactNode) => (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" className="btn quiet" onClick={() => router.push("/edificios")}>
        Cancelar
      </button>
      <div className="flex-1" />
      {paso > 1 && (
        <button type="button" className="btn quiet" onClick={() => (setError(null), setPaso(1))}>
          Atrás
        </button>
      )}
      {siguiente}
    </div>
  );

  return (
    <>
      <h1 className="mb-1">{primerEdificio ? "Registra tu edificio" : "Registrar otro edificio"}</h1>
      <p className="mb-5 text-muted">
        En pocos minutos tendrás el edificio creado. Las áreas y la forma de cobro las configuras después, cuando tengas
        los datos.
      </p>

      <ol className="stepper" aria-label="Pasos">
        {PASOS.map((t, i) => {
          const hecho = i < paso;
          return (
            <li key={t} className={hecho ? "done" : ""} aria-current={i === paso ? "step" : undefined}>
              <span className="n">{hecho ? "✓" : i + 1}</span>
              {t}
            </li>
          );
        })}
      </ol>

      {paso === 1 && (
        <form className="panel" onSubmit={continuarDatos}>
          <h3 className="mb-3">Datos del edificio</h3>
          {aviso}
          <div className="grid gap-x-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="we-n">Nombre del edificio</label>
              <input
                id="we-n"
                value={d.nombre}
                onChange={(e) => {
                  set("nombre", e.target.value);
                  if (!codigoTocado) set("codigo", aCodigo(e.target.value));
                }}
                required
                placeholder="Ej. Residencial Las Palmeras"
              />
            </div>
            <div className="field">
              <label htmlFor="we-d">Dirección</label>
              <input id="we-d" value={d.direccion} onChange={(e) => set("direccion", e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="we-c">Código de acceso</label>
              <input
                id="we-c"
                value={d.codigo}
                onChange={(e) => {
                  setCodigoTocado(true);
                  set("codigo", e.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                pattern="[a-z0-9\-]{3,30}"
                placeholder="Se genera del nombre"
                aria-describedby="we-c-ayuda"
              />
            </div>
            <div className="field">
              <label htmlFor="we-t">Cantidad de departamentos</label>
              <input
                id="we-t"
                type="number"
                min={1}
                max={MAX_FILAS}
                step={1}
                value={d.total || ""}
                onChange={(e) => set("total", Number(e.target.value))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="we-m">Mes de inicio</label>
              <input id="we-m" type="month" value={d.mes} onChange={(e) => set("mes", e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="we-y">Tu nombre (figura en el estado de cuenta)</label>
              <input id="we-y" value={d.miNombre} onChange={(e) => set("miNombre", e.target.value)} required />
            </div>
            {organizaciones.length > 0 && (
              <div className="field">
                <label htmlFor="we-o">Organización</label>
                <select
                  id="we-o"
                  value={d.organizacion ?? ""}
                  onChange={(e) => set("organizacion", e.target.value || null)}
                >
                  {organizaciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                  <option value="">Nueva organización</option>
                </select>
              </div>
            )}
          </div>
          <p id="we-c-ayuda" className="text-sm text-muted">
            Los vecinos usarán el código para ingresar: minúsculas, números y guiones.
          </p>
          {pie(<button className="btn">Continuar</button>)}
        </form>
      )}

      {paso === 2 && (
        <div className="panel">
          <h3 className="mb-2">Departamentos</h3>
          <p className="mb-3 text-sm text-muted">
            Sube un Excel o pega la tabla con las columnas{" "}
            <b>número, piso, propietario, inquilino, correo y teléfono</b>. Si ya los tienes, agrega también{" "}
            <b>área m²</b> y <b>número de medidor de agua</b>; si no, los completas después. Si la primera fila tiene los
            nombres de las columnas, se reconocen en cualquier orden. Si una fila tiene un error, no se guarda ninguna hasta
            corregirla.
          </p>
          {aviso}
          <FuentesPlantilla onTexto={(t, origen) => (setTexto(t), setArchivo(origen))} />
          <div className="mb-3 flex flex-wrap gap-2">
            <label className="btn quiet sm cursor-pointer" htmlFor="wz-f">
              Subir Excel o CSV
            </label>
            <input
              id="wz-f"
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
            />
            <button
              type="button"
              className="btn quiet sm"
              onClick={() => (setArchivo(null), setTexto(EJEMPLO.map((c) => c.join("\t")).join("\n")))}
            >
              Usar datos de ejemplo
            </button>
          </div>
          {archivo && <p className="mb-2 text-sm text-muted">Archivo leído: {archivo}. Puedes corregir los datos abajo.</p>}
          <div className="field">
            <label htmlFor="wz-t">O pega aquí la tabla copiada de Excel (también puedes escribir o corregir filas)</label>
            <textarea
              id="wz-t"
              rows={7}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="font-mono text-[0.82rem]"
              spellCheck={false}
            />
          </div>

          {filas.length > MAX_FILAS && (
            <div className="errlist" role="alert">
              <p>
                Hay {filas.length} filas. El máximo es {MAX_FILAS} por importación.
              </p>
            </div>
          )}
          {conError.length > 0 && (
            <div className="errlist" role="alert">
              <p>
                <b>
                  {conError.length} {conError.length > 1 ? "filas con error" : "fila con error"}. Corrígelas para continuar.
                </b>
              </p>
              {conError.slice(0, 12).map((f) => (
                <p key={f.fila}>
                  Fila {f.fila}
                  {f.numero && ` (depto ${f.numero})`}: {f.error}
                </p>
              ))}
              {conError.length > 12 && <p>… y {conError.length - 12} más.</p>}
            </div>
          )}

          {filas.length > 0 && (
            <>
              <p className="mt-3 mb-2 text-sm">
                <b>
                  {filas.length} {filas.length === 1 ? "departamento" : "departamentos"}
                </b>
                {conArea.length > 0 && ` · ${conArea.length} con área (${m2(sumaArea)} m²)`}
                {conMedidor.length > 0 && ` · ${conMedidor.length} con medidor`}
                {filas.length !== d.total && `. Indicaste ${d.total} departamentos.`}
              </p>
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Depto</th>
                      <th>Piso</th>
                      <th>Propietario</th>
                      <th>Inquilino</th>
                      <th>Correo</th>
                      <th className="r">Área m²</th>
                      <th>Medidor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 100).map((f) => (
                      <tr key={f.fila} className={f.error ? "mal" : ""}>
                        <td>{f.fila}</td>
                        <td>{f.numero}</td>
                        <td>{f.piso ?? "—"}</td>
                        <td>{f.propietario || "—"}</td>
                        <td>{f.inquilino || "—"}</td>
                        <td>{f.email || "—"}</td>
                        <td className="r">{f.area !== null && f.area > 0 ? m2(f.area) : "—"}</td>
                        <td>{f.medidor || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filas.length > 100 && <p className="mt-2 text-sm text-muted">Se muestran las primeras 100 filas.</p>}
            </>
          )}

          <p className="hint mt-4">
            Se creará <b>{d.nombre}</b> (código <b>{d.codigo}</b>) con {nombreMes(`${d.mes}-01`)} como primer mes y
            quedarás como administrador titular. Luego configurarás la cobranza (áreas y forma de cálculo) e invitarás a los
            vecinos desde Departamentos.
          </p>
          <p className="mt-3 text-sm text-muted">
            Si el edificio pasa 90 días sin movimiento y sin plan pagado, se elimina con todos sus datos. Te avisaremos a los
            60 y a los 83 días.
          </p>

          {pie(
            <>
              <button type="button" className="btn quiet" onClick={() => crear(false)} disabled={enviando}>
                Crear sin departamentos
              </button>
              <button type="button" className="btn" onClick={() => crear(true)} disabled={enviando || !filas.length || !listos}>
                {enviando ? "Creando…" : "Crear edificio"}
              </button>
            </>,
          )}
        </div>
      )}
    </>
  );
}
