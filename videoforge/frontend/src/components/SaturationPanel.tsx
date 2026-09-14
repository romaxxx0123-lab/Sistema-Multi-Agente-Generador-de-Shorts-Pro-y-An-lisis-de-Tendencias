import { formatTime, type BalanceReport, type Saturation } from "../api";
import { Button } from "./ui";

/** Las cuatro zonas de la escala, con su color. */
const ZONAS = [
  { hasta: 28, nombre: "sub-editado", color: "text-sky-400", barra: "bg-sky-500" },
  { hasta: 68, nombre: "en el punto", color: "text-emerald-400", barra: "bg-emerald-500" },
  { hasta: 85, nombre: "cargado", color: "text-amber-400", barra: "bg-amber-500" },
  { hasta: 101, nombre: "sobresaturado", color: "text-red-400", barra: "bg-red-500" },
];

function zonaDe(score: number) {
  return ZONAS.find((z) => score < z.hasta) ?? ZONAS[ZONAS.length - 1];
}

/** Color de cada columna del mapa de calor segun su densidad. */
function colorCalor(v: number): string {
  if (v < 0.45) return "bg-emerald-500";
  if (v < 0.72) return "bg-amber-500";
  return "bg-red-500";
}

const NOMBRES: Record<string, string> = {
  cuts_per_minute: "cortes por minuto",
  effect_density_mean: "densidad media",
  effect_density_peak: "densidad de pico",
  overlay_coverage: "cobertura de b-roll",
  text_coverage: "texto en pantalla",
  max_layers: "capas simultaneas",
  sfx_per_minute: "efectos de sonido/min",
  transitions_per_minute: "transiciones/min",
  caption_wpm: "velocidad de lectura",
  motion_conflicts_per_minute: "zooms sobre movimiento",
};

export function SaturationPanel({
  saturation,
  intensity,
  onIntensity,
  onBalance,
  balancing,
  report,
}: {
  saturation: Saturation;
  intensity: number;
  onIntensity: (v: number) => void;
  onBalance: () => void;
  balancing: boolean;
  report: BalanceReport | null;
}) {
  const zona = zonaDe(saturation.score);
  const problemas = saturation.readings.filter((r) => r.status !== "dentro" && r.counts);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Saturacion</p>
          <p className={`text-4xl font-semibold ${zona.color}`}>
            {Math.round(saturation.score)}
            <span className="text-lg text-muted">/100</span>
          </p>
          <p className={`text-sm ${zona.color}`}>{saturation.verdict}</p>
        </div>
        <Button onClick={onBalance} disabled={balancing}>
          {balancing ? "Reajustando..." : "Reajustar automaticamente"}
        </Button>
      </div>

      {/* Escala: deja claro que el veredicto es relativo al estilo. */}
      <div>
        <div className="relative h-2 overflow-hidden rounded-full bg-line">
          <div className="absolute inset-y-0 left-0 w-[28%] bg-sky-500/40" />
          <div className="absolute inset-y-0 left-[28%] w-[40%] bg-emerald-500/40" />
          <div className="absolute inset-y-0 left-[68%] w-[17%] bg-amber-500/40" />
          <div className="absolute inset-y-0 left-[85%] w-[15%] bg-red-500/40" />
          <div
            className="absolute -top-0.5 h-3 w-1 rounded-full bg-white"
            style={{ left: `calc(${Math.min(100, saturation.score)}% - 2px)` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted">
          La escala es relativa al estilo <b>{saturation.style}</b>: la misma carga puede ser
          correcta en un short y excesiva en una guia.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">
          Densidad a lo largo del montaje
        </p>
        <div className="flex h-16 items-end gap-px overflow-hidden rounded-lg border border-line bg-ink p-1">
          {saturation.heatmap.map((v, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${colorCalor(v)}`}
              style={{ height: `${Math.max(4, v * 100)}%` }}
              title={`${Math.round(v * 100)}%`}
            />
          ))}
        </div>
        {saturation.hot_windows.length > 0 && (
          <p className="mt-2 text-xs text-amber-400">
            Zonas mas cargadas:{" "}
            {saturation.hot_windows
              .slice(0, 5)
              .map(([a, b]) => `${formatTime(a)}–${formatTime(b)}`)
              .join(", ")}
          </p>
        )}
      </div>

      <div>
        <label className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted">
          <span>Cuanta edicion quieres</span>
          <span className="text-white">{intensity}</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={intensity}
          onChange={(e) => onIntensity(Number(e.target.value))}
          className="w-full"
        />
        <p className="mt-1 text-[11px] text-muted">
          Mas bajo exige un montaje mas sobrio, asi que el mismo video pasa a leerse como
          mas cargado y el reajuste podara mas.
        </p>
      </div>

      {problemas.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Que se sale</p>
          <ul className="space-y-1.5 text-sm">
            {problemas.map((r) => (
              <li key={r.name} className="flex flex-wrap items-baseline gap-2">
                <span className={r.status === "alto" ? "text-red-400" : "text-sky-400"}>
                  {r.status}
                </span>
                <span>{NOMBRES[r.name] ?? r.name}</span>
                <span className="text-muted">
                  {r.value.toFixed(2)} (banda {r.band[0]}–{r.band[1]})
                </span>
                {r.advice && <span className="w-full text-xs text-muted">{r.advice}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && (
        <div className="rounded-lg border border-line bg-ink p-4 text-sm">
          <p className="font-medium">{report.summary}</p>
          <p className="mt-1 text-xs text-muted">
            Duracion {report.duration_before.toFixed(2)}s → {report.duration_after.toFixed(2)}s
            {report.duration_before === report.duration_after && " (los efectos no la cambian)"}
          </p>
          {report.removed.slice(0, 5).map((c, i) => (
            <p key={i} className="mt-1 text-xs text-muted">
              <span className="text-red-400">−</span> {c.kind} en {formatTime(c.start)}: {c.reason}
            </p>
          ))}
          {report.added.slice(0, 5).map((c, i) => (
            <p key={i} className="mt-1 text-xs text-muted">
              <span className="text-emerald-400">+</span> {c.kind} en {formatTime(c.start)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
