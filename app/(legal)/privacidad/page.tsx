import type { Metadata } from "next";
import Link from "next/link";
import { FECHA_TERMINOS } from "@/lib/legal";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Política de privacidad · EDIFIKA" };

// Política de privacidad (Ley N.° 29733 y su reglamento). Texto base: debe revisarlo un abogado antes de producción.
export default async function PrivacidadPage() {
  const supabase = await crearClienteServidor();
  const { data: contacto } = await supabase.rpc("correo_contacto");

  return (
    <article>
      <h1>Política de privacidad</h1>
      <p className="text-muted">Vigente desde el {FECHA_TERMINOS}.</p>

      <h2>1. Quiénes somos</h2>
      <p>
        EDIFIKA es una plataforma para administrar edificios residenciales en el Perú. Esta política explica qué datos personales
        tratamos, para qué, cuánto tiempo los conservamos y cómo puedes ejercer tus derechos, de acuerdo con la Ley N.° 29733, Ley
        de Protección de Datos Personales, y su reglamento. Puedes escribirnos a <a href={`mailto:${contacto}`}>{contacto}</a>.
      </p>

      <h2>2. Quién decide sobre los datos de cada edificio</h2>
      <p>
        La administración de cada edificio (su administrador titular) registra en EDIFIKA los datos de los departamentos y de sus
        ocupantes, y decide para qué los usa dentro del edificio. EDIFIKA trata esos datos por encargo de la administración, solo
        para prestar el servicio. Los datos de tu propia cuenta (nombre, correo y contraseña) los tratamos directamente para darte
        acceso.
      </p>

      <h2>3. Qué datos tratamos</h2>
      <ul>
        <li>
          <b>De las cuentas:</b> nombre, correo electrónico, teléfono (si lo registras) y la contraseña, que se guarda cifrada y no
          podemos ver.
        </li>
        <li>
          <b>De los departamentos:</b> número, piso, área, propietario, inquilino, documento de identidad (opcional), correo y
          teléfono de contacto, y número de medidor de agua.
        </li>
        <li>
          <b>De la cobranza:</b> cuotas y otros cargos, pagos, comprobantes que suben los vecinos (fotos o PDF), lecturas de agua,
          recibos y el estado de cuenta del edificio.
        </li>
        <li>
          <b>De la comunicación:</b> los mensajes del chat del edificio.
        </li>
        <li>
          <b>Técnicos:</b> registros de actividad necesarios para la seguridad y para dar soporte (por ejemplo, quién validó un
          pago y cuándo).
        </li>
      </ul>

      <h2>4. Para qué los usamos</h2>
      <ul>
        <li>Calcular y cobrar las cuotas de mantenimiento, validar pagos y emitir recibos y estados de cuenta.</li>
        <li>Permitir que cada vecino vea y pague lo suyo, y que vea cómo se usa el dinero del edificio.</li>
        <li>Enviar correos del servicio: invitaciones, recuperación de contraseña, recibos y avisos importantes.</li>
        <li>Dar soporte, prevenir fraudes y mantener la seguridad de la plataforma.</li>
      </ul>
      <p>No vendemos datos personales ni los usamos para publicidad de terceros.</p>

      <h2>5. Quién puede ver los datos</h2>
      <ul>
        <li>
          Cada vecino ve solo los datos de su departamento, más los totales del edificio (ingresos, gastos y saldo). El detalle de
          deudas por departamento solo lo ven los vecinos si la administración decide publicarlo.
        </li>
        <li>La administración del edificio ve la información de todos los departamentos de su edificio.</li>
        <li>
          El equipo de EDIFIKA accede a un edificio solo cuando es necesario para dar soporte, y ese acceso queda registrado.
        </li>
      </ul>

      <h2>6. Proveedores que nos ayudan</h2>
      <p>
        Para funcionar usamos proveedores de infraestructura que tratan los datos por nuestra cuenta y con medidas de seguridad:
        Supabase (base de datos, archivos y cuentas), Vercel (alojamiento de la aplicación) y Resend (envío de correos). Sus
        servidores pueden estar fuera del Perú, por lo que puede haber un flujo transfronterizo de datos, que se realiza con las
        garantías que exige la ley.
      </p>

      <h2 id="conservacion">7. Cuánto tiempo los conservamos</h2>
      <ul>
        <li>Mientras el edificio use EDIFIKA, conservamos sus datos para llevar su historial de cuentas.</li>
        <li>
          <b>Edificios sin plan pagado:</b> si pasan 90 días sin ningún movimiento (un gasto, un pago, un mensaje u otro registro),
          el edificio se elimina por completo con todos sus datos y archivos, y también las cuentas de usuario que no pertenezcan a
          otro edificio. Antes avisamos al administrador titular por correo y dentro de la aplicación a los 60 y a los 83 días, con
          el enlace para exportar los datos a Excel. Cualquier movimiento reinicia el plazo. Los edificios con plan pagado no se
          eliminan por inactividad.
        </li>
        <li>
          De un edificio eliminado solo guardamos un registro técnico sin datos personales (identificador, código y fechas) para
          responder consultas de soporte.
        </li>
      </ul>

      <h2>8. Tus derechos</h2>
      <p>
        Puedes pedir acceder a tus datos, rectificarlos, cancelarlos u oponerte a su tratamiento (derechos ARCO). Si tus datos
        están en un edificio, lo más rápido es pedírselo a su administración; también puedes escribirnos a{" "}
        <a href={`mailto:${contacto}`}>{contacto}</a> y te responderemos dentro de los plazos de ley. Si no quedas conforme, puedes
        acudir a la Autoridad Nacional de Protección de Datos Personales.
      </p>

      <h2>9. Seguridad</h2>
      <p>
        Los datos viajan cifrados, los archivos se guardan en almacenamiento privado y cada persona solo accede a lo que le
        corresponde según su rol. Ninguna medida es infalible: si detectamos un incidente que afecte tus datos, te lo informaremos.
      </p>

      <h2>10. Cambios</h2>
      <p>
        Si cambiamos esta política en algo importante, te lo mostraremos al ingresar y te pediremos aceptarla de nuevo. Consulta
        también los <Link href="/terminos">términos y condiciones</Link>.
      </p>
    </article>
  );
}
