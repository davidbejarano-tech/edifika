import { Chat } from "@/components/Chat";
import { COLUMNAS_MENSAJE, POR_PAGINA, type Mensaje } from "@/lib/chat";
import type { EdificioMio } from "@/lib/contexto";
import type { crearClienteServidor } from "@/lib/supabase/server";

type Props = {
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>;
  actual: EdificioMio;
  yo: string;
  comoAdmin: boolean;
};

// Chat del edificio: carga los últimos mensajes en el servidor; los nuevos llegan por Realtime.
export async function PaginaChat({ supabase, actual, yo, comoAdmin }: Props) {
  const { data } = await supabase
    .from("mensajes")
    .select(COLUMNAS_MENSAJE)
    .eq("edificio_id", actual.edificio_id)
    .order("created_at", { ascending: false })
    .limit(POR_PAGINA);
  const operativo = actual.nivel === "titular" || actual.nivel === "operador";

  return (
    <>
      <div className="mb-4">
        <h1>Chat del edificio</h1>
        <p className="mt-1 text-muted">Canal común para vecinos y administración. Lo leen todos los vecinos con acceso.</p>
      </div>
      <Chat
        edificioId={actual.edificio_id}
        yo={yo}
        iniciales={((data ?? []) as Mensaje[]).reverse()}
        comoAdmin={comoAdmin}
        puedeEscribir={comoAdmin ? operativo : true}
        puedeModerar={comoAdmin && operativo}
      />
    </>
  );
}
