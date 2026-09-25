import type { Metadata } from "next";
import Link from "next/link";
import { FECHA_TERMINOS } from "@/lib/legal";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Términos y condiciones · EDIFIKA" };

// Términos y condiciones del servicio. Texto base: debe revisarlo un abogado antes de producción.
export default async function TerminosPage() {
  const supabase = await crearClienteServidor();
  const { data: contacto } = await supabase.rpc("correo_contacto");

  return (
    <article>
      <h1>Términos y condiciones</h1>
      <p className="text-muted">Vigentes desde el {FECHA_TERMINOS}.</p>

      <h2>1. El servicio</h2>
      <p>
        EDIFIKA es una plataforma en línea para administrar edificios residenciales: cálculo de cuotas, cobranza, gastos, recibos,
        estado de cuenta y comunicación entre vecinos y administración. Al crear una cuenta o ingresar a la plataforma aceptas estos
        términos y la <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2>2. Cuentas y roles</h2>
      <ul>
        <li>Quien registra un edificio queda como su administrador titular y responde por el uso que se haga de él.</li>
        <li>
          El titular puede sumar hasta dos coadministradores y dar acceso a los vecinos. Cada persona es responsable de cuidar su
          contraseña y de lo que haga con su cuenta.
        </li>
        <li>La administración del edificio debe contar con autorización para registrar los datos de los vecinos y usarlos solo para la administración del edificio.</li>
      </ul>

      <h2>3. Cálculo de cuotas y pagos</h2>
      <p>
        EDIFIKA calcula las cuotas con la configuración y los datos que registra la administración (montos, áreas, gastos, lecturas
        de agua). La administración es responsable de revisar esa información antes de confirmar los gastos y emitir las cuotas.
        EDIFIKA no recibe ni guarda el dinero de los edificios: los pagos se hacen directamente a las cuentas del edificio.
      </p>

      <h2>4. Planes, pruebas y pagos</h2>
      <ul>
        <li>
          Los módulos base (Gestión del edificio, Finanzas y cuotas, Comunicación) están disponibles para todos los edificios. Los
          módulos adicionales se incluyen según el plan contratado.
        </li>
        <li>
          Cada módulo adicional puede probarse gratis durante 14 días, una sola vez por edificio. Al terminar la prueba, el módulo se
          bloquea si el edificio no tiene el plan que lo incluye.
        </li>
        <li>
          Los precios vigentes se muestran en la aplicación. El plan se activa cuando confirmamos el pago.
        </li>
        <li>Una persona puede tener como máximo 3 edificios sin plan pagado.</li>
      </ul>

      <h2 id="depuracion">5. Eliminación de edificios inactivos</h2>
      <p>
        Un edificio <b>sin plan pagado</b> que pasa <b>90 días sin movimiento</b> se elimina por completo: sus datos, sus archivos
        (comprobantes, recibos y actas) y las cuentas de usuario que no pertenezcan a otro edificio. Cuenta como movimiento
        cualquier registro hecho por una persona: un gasto, un cargo, un pago, un cambio en los departamentos u ocupantes o un
        mensaje del chat. No cuentan los ingresos a la plataforma ni los procesos automáticos.
      </p>
      <ul>
        <li>
          Avisamos al administrador titular por correo y dentro de la aplicación a los <b>60</b> y a los <b>83 días</b> sin
          movimiento, con el enlace para exportar los datos a Excel.
        </li>
        <li>Cualquier movimiento reinicia el plazo y cancela los avisos.</li>
        <li>Los edificios con plan pagado nunca se eliminan por inactividad.</li>
        <li>La eliminación es definitiva: no podemos recuperar los datos después.</li>
      </ul>

      <h2>6. Uso aceptable</h2>
      <p>
        No está permitido usar EDIFIKA para fines ilegales, subir contenido ofensivo o que infrinja derechos de terceros, intentar
        acceder a datos de otros edificios o departamentos, ni afectar el funcionamiento de la plataforma. La administración de cada
        edificio puede eliminar mensajes del chat, y podemos suspender cuentas que incumplan estos términos.
      </p>

      <h2>7. Disponibilidad y responsabilidad</h2>
      <p>
        Trabajamos para que EDIFIKA esté disponible y funcione correctamente, pero puede haber interrupciones por mantenimiento o
        causas ajenas a nosotros. Recomendamos exportar periódicamente los datos del edificio. EDIFIKA no responde por decisiones de
        la administración de cada edificio ni por datos incorrectos que se registren en la plataforma.
      </p>

      <h2>8. Cambios, ley aplicable y contacto</h2>
      <p>
        Si cambiamos estos términos en algo importante, te lo mostraremos al ingresar y te pediremos aceptarlos de nuevo. Estos
        términos se rigen por las leyes de la República del Perú. Para consultas o reclamos, escríbenos a{" "}
        <a href={`mailto:${contacto}`}>{contacto}</a>.
      </p>
    </article>
  );
}
