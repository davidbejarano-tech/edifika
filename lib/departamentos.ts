// Lectura de la tabla de departamentos para el asistente (RN-27).
// Esta validación solo sirve para la vista previa: importar_departamentos() vuelve a validar todo en la base.

export type FilaDepto = {
  fila: number;
  numero: string;
  piso: number | null;
  propietario: string;
  inquilino: string;
  email: string;
  telefono: string;
  area: number | null;
  medidor: string;
  error: string | null;
};

type Campo = "numero" | "piso" | "propietario" | "inquilino" | "email" | "telefono" | "area" | "medidor";

/** Orden por defecto cuando la tabla no trae encabezados. Área y medidor son opcionales (RN-27). */
const ORDEN: Campo[] = ["numero", "piso", "propietario", "inquilino", "email", "telefono", "area", "medidor"];

export const COLUMNAS = ["Número", "Piso", "Propietario", "Inquilino", "Correo", "Teléfono", "Área m2 (opcional)", "Medidor (opcional)"];

export const EJEMPLO = [
  COLUMNAS,
  ["101", "1", "Julia Campos Ríos", "", "julia.campos@correo.pe", "987111222", "", ""],
  ["102", "1", "Marco Villanueva", "Lucía Ortega", "lucia.ortega@correo.pe", "987111333", "", ""],
  ["201", "2", "Teresa Aguilar", "", "teresa.aguilar@correo.pe", "987111444", "", ""],
  ["202", "2", "Pedro Salas Quiroz", "", "pedro.salas@correo.pe", "987111555", "", ""],
  ["301", "3", "Raúl Medina", "Sandra Luna", "sandra.luna@correo.pe", "987111666", "", ""],
  ["302", "3", "Cecilia Torres", "", "cecilia.torres@correo.pe", "987111777", "", ""],
];

export const MAX_FILAS = 500;

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Reconoce el campo de un encabezado ("N.° depto", "Área m²", "Nro. de medidor"…). */
function campoDeEncabezado(celda: string): Campo | null {
  const t = normalizar(celda);
  if (!t) return null;
  if (/medidor|serie/.test(t)) return "medidor";
  if (/depto|departamento|dpto|unidad/.test(t) || /^(numero|nro|num|no|n)\b/.test(t)) return "numero";
  if (/piso|nivel/.test(t)) return "piso";
  if (/area|m2|m²|metros/.test(t)) return "area";
  if (/propietario|dueno/.test(t)) return "propietario";
  if (/inquilino|arrendatario/.test(t)) return "inquilino";
  if (/correo|email|e-mail|mail/.test(t)) return "email";
  if (/telefono|celular|movil|whatsapp/.test(t)) return "telefono";
  return null;
}

/** Si la primera fila son encabezados, devuelve qué campo tiene cada columna. */
function mapaDeEncabezados(primera: string[]): Campo[] | null {
  const campos = primera.map(campoDeEncabezado);
  if (!campos.includes("numero") && !campos.includes("propietario")) return null;
  return campos.map((c) => c ?? ("" as Campo));
}

/** Convierte las celdas (de Excel o de texto pegado) en filas con su error, si lo tienen. */
export function leerFilas(celdas: string[][]): FilaDepto[] {
  const limpias = celdas.map((c) => c.map((x) => String(x ?? "").trim())).filter((c) => c.some((x) => x !== ""));
  if (!limpias.length) return [];

  const mapa = mapaDeEncabezados(limpias[0]);
  const datos = mapa ? limpias.slice(1) : limpias;
  const columnas = mapa ?? ORDEN;

  const filas: FilaDepto[] = [];
  const vistos = new Set<string>();
  const medidores = new Set<string>();
  datos.forEach((c) => {
    const v = (campo: Campo) => {
      const i = columnas.indexOf(campo);
      return i >= 0 ? (c[i] ?? "") : "";
    };
    const numero = v("numero");
    const piso = v("piso");
    const areaTxt = v("area").replace(",", ".");
    const area = areaTxt === "" ? null : Number(areaTxt);
    const propietario = v("propietario");
    const email = v("email");
    const medidor = v("medidor").toUpperCase();

    let error: string | null = null;
    if (!/^[0-9A-Za-z-]{1,8}$/.test(numero)) error = "número de departamento no válido";
    else if (vistos.has(numero.toLowerCase())) error = `el departamento ${numero} está repetido`;
    else if (piso !== "" && !/^-?\d+$/.test(piso)) error = "el piso debe ser un número entero";
    else if (!propietario) error = "falta el propietario";
    else if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) error = "correo no válido";
    else if (area !== null && !(area > 0)) error = "el área debe ser un número mayor que cero (o déjala vacía)";
    else if (medidor && !/^[0-9A-Za-z./-]{3,30}$/.test(medidor)) error = "número de medidor no válido";
    else if (medidor && medidores.has(medidor)) error = `el medidor ${medidor} está repetido`;
    vistos.add(numero.toLowerCase());
    if (medidor) medidores.add(medidor);

    filas.push({
      fila: filas.length + 1,
      numero,
      piso: piso === "" ? null : Number(piso),
      propietario,
      inquilino: v("inquilino"),
      email,
      telefono: v("telefono"),
      area,
      medidor,
      error,
    });
  });
  return filas;
}

/** Texto copiado de Excel (tabulaciones) o CSV (punto y coma o coma). */
export function celdasDeTexto(texto: string): string[][] {
  return texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const sep = l.includes("\t") ? "\t" : l.includes(";") ? ";" : ",";
      return l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    });
}

/** Formato que espera importar_departamentos(). */
export const paraImportar = (filas: FilaDepto[]) =>
  filas.map((f) => ({
    numero: f.numero,
    piso: f.piso,
    area: f.area,
    propietario: f.propietario,
    inquilino: f.inquilino,
    email: f.email,
    telefono: f.telefono,
    medidor: f.medidor,
  }));
