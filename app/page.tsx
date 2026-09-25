import Link from "next/link";
import { Logo, Marca } from "@/components/Logo";

// Página de bienvenida pública (SPEC 1.3). Con sesión, el middleware lleva directo al edificio.
const BENEFICIOS = [
  {
    titulo: "Cuotas que se calculan solas",
    texto: "Por alícuota o mixta con agua. Registras los gastos del mes y el sistema reparte a cada departamento.",
  },
  {
    titulo: "Cobranza con comprobantes",
    texto: "Cada vecino ve lo que debe, paga por transferencia o Yape y sube su voucher. Tú solo validas.",
  },
  {
    titulo: "Transparencia para todos",
    texto: "Estado de cuenta, gastos y recibos siempre al día y a la vista de los vecinos.",
  },
];

const PASOS = [
  "Crea tu cuenta y registra el edificio.",
  "Importa los departamentos desde Excel.",
  "Invita a los vecinos y empieza a cobrar.",
];

export default function Bienvenida() {
  return (
    <>
      <header className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-4 md:px-8">
        <Marca />
        <div className="flex-1" />
        <Link href="/login" className="btn quiet sm">
          Ingresar
        </Link>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 pb-16 md:px-8">
        <section className="grid items-center gap-8 py-10 md:grid-cols-[1fr_auto] md:py-16">
          <div>
          <p className="mb-3 text-sm font-semibold tracking-wide text-brass uppercase">Administración de edificios en Perú</p>
          <h1 className="max-w-[16ch] text-[clamp(2rem,6vw,3.2rem)] font-extrabold">
            Administra tus edificios, <span className="text-[var(--logo-azul)]">sin complicaciones.</span>
          </h1>
          <p className="mt-4 max-w-[52ch] text-lg text-muted">
            EDIFIKA calcula las cuotas, ordena la cobranza y mantiene informados a los vecinos. Para administradores vecinos y
            empresas administradoras.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/registro" className="btn px-6 py-3 text-base">
              Registrar mi edificio
            </Link>
            <Link href="/login" className="btn quiet px-6 py-3 text-base">
              Ingresar
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted">¿Eres vecino? Ingresa con el código de tu edificio y tu número de departamento.</p>
          </div>
          <div className="hidden md:block" aria-hidden="true">
            <Logo size={200} />
          </div>
        </section>

        <section aria-label="Beneficios" className="grid gap-4 md:grid-cols-3">
          {BENEFICIOS.map((b) => (
            <article key={b.titulo} className="panel mb-0">
              <h3 className="mb-2">{b.titulo}</h3>
              <p className="text-muted">{b.texto}</p>
            </article>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="mb-4">Empieza en tres pasos</h2>
          <ol className="grid gap-3 md:grid-cols-3">
            {PASOS.map((p, i) => (
              <li key={p} className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand">
                  {i + 1}
                </span>
                <span className="pt-1">{p}</span>
              </li>
            ))}
          </ol>
          <Link href="/registro" className="btn mt-7">
            Registrar mi edificio
          </Link>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        EDIFIKA · Lima, Perú ·{" "}
        <Link href="/terminos" className="hover:text-ink">
          Términos
        </Link>{" "}
        ·{" "}
        <Link href="/privacidad" className="hover:text-ink">
          Privacidad
        </Link>
      </footer>
    </>
  );
}
