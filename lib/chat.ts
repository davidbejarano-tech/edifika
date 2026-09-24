import type { Database } from "./supabase/types";

// Lo que la pantalla del chat lee de cada mensaje (compartido por el servidor y el navegador)
export type Mensaje = Pick<
  Database["public"]["Tables"]["mensajes"]["Row"],
  "id" | "autor_id" | "texto" | "created_at" | "como_admin" | "autor_nombre" | "autor_depto" | "autor_rol" | "eliminado_en"
>;

export const COLUMNAS_MENSAJE = "id, autor_id, texto, created_at, como_admin, autor_nombre, autor_depto, autor_rol, eliminado_en";
export const POR_PAGINA = 60;
