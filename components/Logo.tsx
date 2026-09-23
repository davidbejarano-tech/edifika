export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="3" width="26" height="26" rx="8" fill="var(--brand)" />
      <rect x="9" y="8.5" width="5" height="5" rx="1.3" fill="var(--surface)" />
      <rect x="18" y="8.5" width="5" height="5" rx="1.3" fill="var(--surface)" />
      <path d="M10 19.5c3 3.6 9 3.6 12 0" stroke="var(--surface)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Marca({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2 font-display text-lg font-bold">
      <Logo size={size} />
      <span>Building Buddy</span>
    </div>
  );
}
