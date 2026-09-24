import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { FormClave } from "./FormClave";

export default async function PerfilPage() {
  const { supabase, user, actual } = await obtenerContexto();
  if (!user || !actual?.departamento_id) redirect("/edificios");
  const dep = actual.departamento_id;

  const [{ data: d }, { data: ocup }] = await Promise.all([
    supabase.from("v_departamentos").select("numero, piso, area_m2, alicuota").eq("id", dep).single(),
    supabase.from("ocupaciones").select("tipo, personas(nombre, email, telefono, perfil_id)").eq("departamento_id", dep).is("hasta", null),
  ]);
  type Ocup = { tipo: string; personas: { nombre: string; email: string | null; telefono: string | null; perfil_id: string | null } | null };
  const lista = (ocup ?? []) as unknown as Ocup[];
  const propietario = lista.find((o) => o.tipo === "propietario")?.personas;
  const inquilino = lista.find((o) => o.tipo === "inquilino")?.personas;
  const yo = [propietario, inquilino].find((p) => p?.perfil_id === user.id) ?? inquilino ?? propietario;
  const relacion = inquilino && yo === inquilino ? "Inquilino" : "Propietario residente";

  const filas: [string, string][] = [
    ["Departamento", `${d?.numero ?? actual.departamento_numero} · piso ${d?.piso ?? "—"}`],
    ["Nombre", yo?.nombre ?? "—"],
    ["Relación", relacion],
    ["Propietario", propietario?.nombre ?? "—"],
    [
      "Área y alícuota",
      d?.area_m2 ? `${Number(d.area_m2).toLocaleString("en-US")} m² · ${(Number(d.alicuota) * 100).toFixed(2)} %` : "Sin registrar",
    ],
    ["Correo para recibos", yo?.email ?? "—"],
    ["Teléfono", yo?.telefono ?? "—"],
    ["Edificio", `${actual.nombre} (código ${actual.codigo})`],
  ];

  return (
    <>
      <h1 className="mb-5">Mi perfil</h1>
      <section className="panel">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {filas.map(([t, v]) => (
            <div key={t}>
              <dt className="text-sm text-muted">{t}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-muted">Si algún dato no es correcto, pídele a la administración que lo actualice.</p>
      </section>
      <section className="panel">
        <h3 className="mb-3">Cambiar contraseña</h3>
        <FormClave />
      </section>
    </>
  );
}
