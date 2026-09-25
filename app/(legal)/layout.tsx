import Link from "next/link";
import { Marca } from "@/components/Logo";

// Páginas públicas de términos y privacidad
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[860px] items-center gap-3 px-4 py-3">
          <Link href="/" aria-label="EDIFIKA, inicio">
            <Marca size={30} />
          </Link>
          <span className="flex-1" />
          <Link href="/terminos" className="text-sm font-semibold text-muted hover:text-ink">
            Términos
          </Link>
          <Link href="/privacidad" className="text-sm font-semibold text-muted hover:text-ink">
            Privacidad
          </Link>
        </div>
      </header>
      <main className="legal mx-auto max-w-[860px] px-4 pt-8 pb-16">{children}</main>
    </div>
  );
}
