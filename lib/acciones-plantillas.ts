"use server";

// Lee una hoja de Google Sheets compartida ("cualquiera con el enlace") como CSV.
// Solo acepta enlaces de docs.google.com/spreadsheets: el servidor no descarga otras direcciones.
export async function leerGoogleSheets(enlace: string): Promise<{ texto: string } | { error: string }> {
  let url: URL;
  try {
    url = new URL(enlace.trim());
  } catch {
    return { error: "Pega el enlace completo de la hoja de Google Sheets." };
  }
  const id = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)?.[1];
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !id) {
    return { error: "El enlace debe ser de una hoja de Google Sheets (docs.google.com/spreadsheets/…)." };
  }
  const gid = (url.hash.match(/gid=(\d+)/) ?? url.search.match(/gid=(\d+)/))?.[1] ?? "0";
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`, { cache: "no-store", redirect: "follow" });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !tipo.includes("text/csv")) {
      return { error: "No pudimos leer la hoja. En Google Sheets pulsa Compartir y elige \"Cualquier persona con el enlace\" como lector." };
    }
    const csv = await r.text();
    if (csv.length > 500_000) return { error: "La hoja es demasiado grande (máximo 500 departamentos)." };
    // Se entrega separada por tabulaciones, como cuando se pega desde Excel (respeta comas dentro de un nombre)
    return { texto: leerCsv(csv).map((fila) => fila.map((c) => c.replace(/\t/g, " ")).join("\t")).join("\n") };
  } catch {
    return { error: "No pudimos conectar con Google Sheets. Inténtalo otra vez." };
  }
}

function leerCsv(t: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"' && t[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ",") {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda || fila.length) filas.push([...fila, celda]);
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}
