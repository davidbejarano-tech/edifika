/**
 * Ejecuta el corte diario (RN-09) sin esperar a las 00:10: marca como vencidas las cuotas impagas
 * después del día de corte y emite la mora. Es idempotente: cada periodo se corta una sola vez.
 *
 *   npm run corte
 */
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

admin.rpc("ejecutar_cortes").then(({ data, error }) => {
  if (error) {
    console.error(`✖ ${error.message}`);
    process.exit(1);
  }
  console.log(data ? `Corte ejecutado en ${data} ${data === 1 ? "periodo" : "periodos"}.` : "No había cortes pendientes para hoy.");
});
