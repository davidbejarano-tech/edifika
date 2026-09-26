// Reduce una imagen en el navegador antes de subirla (foto y logo del edificio).
// El logo se guarda en PNG para conservar la transparencia; la foto, en JPEG.
export async function prepararImagen(archivo: File, maximo: number, formato: "image/png" | "image/jpeg"): Promise<Blob | { error: string }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) return { error: "La imagen debe ser JPG, PNG o WEBP." };
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    const ctx = lienzo.getContext("2d");
    if (!ctx) return { error: "No se pudo procesar la imagen." };
    if (formato === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    }
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, formato, 0.88));
    return blob ?? { error: "No se pudo procesar la imagen." };
  } catch {
    return { error: "No se pudo leer la imagen. Prueba con otro archivo." };
  }
}
