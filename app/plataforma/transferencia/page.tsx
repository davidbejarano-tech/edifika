import { FormTransferenciaForzada } from "../FormTransferenciaForzada";

export default function TransferenciaPage() {
  return (
    <>
      <h1 className="mb-1">Transferencia forzada</h1>
      <p className="mb-5 text-muted">Cambio de titular cuando el actual no puede o no quiere transferir (RN-23).</p>
      <section className="panel max-w-[760px]">
        <p className="mb-3 text-sm text-muted">
          Solo con el acta de la junta de propietarios que designa al nuevo administrador. El titular actual queda con acceso de
          solo lectura por 15 días. El acta se archiva en un almacenamiento privado.
        </p>
        <FormTransferenciaForzada />
      </section>
    </>
  );
}
