import { useMemo, useState } from "react";
import { formatTime, type Edl, type Effect } from "../api";

/** Color por tipo de efecto, para que cada pista se distinga de un vistazo. */
const COLOR: Record<string, string> = {
  caption: "bg-sky-500/70",
  punch_in: "bg-amber-500/70",
  ken_burns: "bg-amber-400/50",
  broll: "bg-fuchsia-500/70",
  text_card: "bg-emerald-500/70",
  callout: "bg-orange-500/70",
  lower_third: "bg-teal-500/70",
  sfx: "bg-rose-500/70",
  music: "bg-indigo-500/60",
  transition: "bg-violet-500/70",
  grade: "bg-slate-500/60",
};

/** Orden de las pistas. Lo que mas cambia la imagen, arriba. */
const ORDEN = [
  "broll",
  "punch_in",
  "ken_burns",
  "text_card",
  "callout",
  "lower_third",
  "caption",
  "transition",
  "sfx",
  "music",
  "grade",
];

export function Timeline({ edl }: { edl: Edl }) {
  const [elegido, setElegido] = useState<Effect | null>(null);

  const duracion = useMemo(
    () =>
      edl.timeline.reduce(
        (total, c) => total + (c.source_end - c.source_start) / (c.speed || 1),
        0,
      ),
    [edl],
  );

  const pistas = useMemo(() => {
    const agrupado = new Map<string, Effect[]>();
    for (const e of edl.effects) {
      const lista = agrupado.get(e.kind) ?? [];
      lista.push(e);
      agrupado.set(e.kind, lista);
    }
    return ORDEN.filter((k) => agrupado.has(k)).map((k) => [k, agrupado.get(k)!] as const);
  }, [edl]);

  const pct = (valor: number) => `${(valor / Math.max(duracion, 0.001)) * 100}%`;

  // Los cortes se acumulan a lo largo de la linea de tiempo montada.
  const cortes: number[] = [];
  let acumulado = 0;
  for (const c of edl.timeline.slice(0, -1)) {
    acumulado += (c.source_end - c.source_start) / (c.speed || 1);
    cortes.push(acumulado);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-xs text-muted">
        <span>
          {edl.timeline.length} clips · {edl.effects.length} efectos
        </span>
        <span>{formatTime(duracion)}</span>
      </div>

      <div className="space-y-1.5 overflow-hidden rounded-lg border border-line bg-ink p-3">
        {/* Pista de video: los clips y sus cortes */}
        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-muted">
            video
          </span>
          <div className="relative h-6 flex-1 overflow-hidden rounded bg-line">
            {cortes.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 h-full w-px bg-ink"
                style={{ left: pct(t) }}
                title={`corte en ${formatTime(t)}`}
              />
            ))}
          </div>
        </div>

        {pistas.map(([kind, efectos]) => (
          <div key={kind} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-[10px] uppercase tracking-wider text-muted">
              {kind}
            </span>
            <div className="relative h-6 flex-1 rounded bg-line/40">
              {efectos.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setElegido(e)}
                  title={e.rationale}
                  className={`absolute top-0.5 h-5 rounded-sm ${COLOR[kind] ?? "bg-slate-500/70"} ${
                    elegido?.id === e.id ? "ring-2 ring-white" : ""
                  }`}
                  style={{
                    left: pct(e.start),
                    // Minimo visible: un SFX de 0.3s seria invisible si no.
                    width: `max(3px, ${(e.end - e.start) / Math.max(duracion, 0.001) * 100}%)`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {elegido ? (
        <div className="rounded-lg border border-line bg-ink p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{elegido.kind}</span>
            <span className="text-xs text-muted">
              {formatTime(elegido.start)} – {formatTime(elegido.end)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{elegido.rationale}</p>
          <p className="mt-2 text-xs text-muted">
            aporta {elegido.value_score.toFixed(2)} · carga {elegido.cost_weight.toFixed(2)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Pulsa cualquier bloque para ver por que esta ahi.
        </p>
      )}
    </div>
  );
}
