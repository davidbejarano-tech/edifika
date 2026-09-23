import { Marca } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-[440px] rounded-2xl border border-line bg-surface p-7">
        <Marca size={40} lema />
        {children}
      </div>
    </main>
  );
}
