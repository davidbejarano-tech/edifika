// Preparación del comprobante en el navegador (RN-10: imagen o PDF, máximo 5 MB).
// Las fotos del celular se reducen a 1800 px de lado mayor en JPEG para subir rápido y no pasar el límite.

export const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export async function prepararComprobante(archivo: File): Promise<{ archivo: File | Blob; tipo: string; ext: string } | { error: string }> {
  const tipo = archivo.type || (archivo.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (!TIPOS.includes(tipo)) return { error: "El comprobante debe ser una foto (JPG, PNG) o un PDF." };

  if (tipo === "application/pdf" || tipo === "image/heic") {
    if (archivo.size > MAX_BYTES) return { error: "El archivo pesa más de 5 MB. Toma una foto o guarda el PDF más liviano." };
    return { archivo, tipo, ext: tipo === "application/pdf" ? "pdf" : "heic" };
  }

  try {
    const reducida = await reducir(archivo, 1800, 0.85);
    const final = reducida && reducida.size < archivo.size ? reducida : archivo;
    if (final.size > MAX_BYTES) return { error: "La imagen pesa más de 5 MB incluso reducida. Prueba con otra foto." };
    const esJpeg = final === reducida || tipo === "image/jpeg";
    return { archivo: final, tipo: esJpeg ? "image/jpeg" : tipo, ext: esJpeg ? "jpg" : tipo.split("/")[1] };
  } catch {
    if (archivo.size > MAX_BYTES) return { error: "La imagen pesa más de 5 MB." };
    return { archivo, tipo, ext: tipo.split("/")[1] };
  }
}

async function reducir(archivo: File, maximo: number, calidad: number): Promise<Blob | null> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();
  return new Promise((ok) => lienzo.toBlob((b) => ok(b), "image/jpeg", calidad));
}
