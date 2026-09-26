import type { crearClienteServidor } from "./supabase/server";

export type Ubigeo = { codigo: string; departamento: string; provincia: string; distrito: string };
type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/** Los 1,893 distritos del Perú (INEI). PostgREST entrega hasta 1000 filas por consulta. */
export async function cargarUbigeos(supabase: Cliente): Promise<Ubigeo[]> {
  const todos: Ubigeo[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await supabase.from("ubigeos").select("codigo, departamento, provincia, distrito").order("codigo").range(desde, desde + 999);
    todos.push(...(data ?? []));
    if ((data ?? []).length < 1000) return todos;
  }
}
