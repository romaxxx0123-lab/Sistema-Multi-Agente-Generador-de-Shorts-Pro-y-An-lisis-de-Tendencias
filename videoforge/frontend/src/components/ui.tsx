import type { ReactNode } from "react";

export function Panel({
  title,
  step,
  children,
  aside,
  muted,
}: {
  title: string;
  step?: number;
  children: ReactNode;
  aside?: ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-panel ${muted ? "opacity-45" : ""}`}
    >
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-3 text-sm font-semibold tracking-wide">
          {step !== undefined && (
            <span className="grid size-6 place-items-center rounded-full bg-line text-xs text-muted">
              {step}
            </span>
          )}
          {title}
        </h2>
        {aside}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const base =
    "rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const estilo =
    variant === "primary"
      ? "bg-accent text-ink hover:brightness-110"
      : "border border-line text-muted hover:text-white";
  return (
    <button className={`${base} ${estilo}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function ProgressBar({ fraction, label }: { fraction: number; label?: string }) {
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      {label && <p className="text-xs text-muted">{label}</p>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
