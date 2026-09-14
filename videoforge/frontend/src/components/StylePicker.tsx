import type { Style } from "../api";

export function StylePicker({
  styles,
  value,
  onChange,
  suggested,
}: {
  styles: Style[];
  value: string;
  onChange: (name: string) => void;
  suggested?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {styles.map((s) => {
        const activo = s.name === value;
        return (
          <button
            key={s.name}
            onClick={() => onChange(s.name)}
            className={`rounded-lg border p-4 text-left transition ${
              activo
                ? "border-accent bg-accent/10"
                : "border-line hover:border-muted"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.label}</span>
              {s.name === suggested && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-400">
                  sugerido
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.description}</p>
            <p className="mt-2 text-[11px] text-muted">
              {s.cuts_per_minute[0]}–{s.cuts_per_minute[1]} cortes/min
              {s.captions && " · subtitulos"}
              {s.punch_in && " · zooms"}
              {s.chapters && " · capitulos"}
            </p>
          </button>
        );
      })}
    </div>
  );
}
