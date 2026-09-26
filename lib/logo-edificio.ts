import type { crearClienteServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;
export type LogoPdf = { data: Buffer; format: "png" | "jpg" };

/** Logo del edificio para los PDF (lo pueden leer todos los miembros: RLS del bucket "edificios"). */
export async function logoParaPdf(supabase: Cliente, edificioId: string): Promise<LogoPdf | null> {
  const { data: e } = await supabase.from("edificios").select("logo_path").eq("id", edificioId).maybeSingle();
  if (!e?.logo_path) return null;
  const { data } = await supabase.storage.from("edificios").download(e.logo_path);
  if (!data) return null;
  return { data: Buffer.from(await data.arrayBuffer()), format: /\.png$/i.test(e.logo_path) ? "png" : "jpg" };
}
