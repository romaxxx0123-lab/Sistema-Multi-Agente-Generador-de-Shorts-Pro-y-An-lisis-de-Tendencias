import type { Profile } from "../api";
import { Stat } from "./ui";

const COLOR_FUENTE: Record<string, string> = {
  pantalla: "text-emerald-400",
  vision: "text-fuchsia-400",
  voz: "text-sky-400",
};

export function IdentityCard({ profile }: { profile: Profile }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label="Tipo de material" value={profile.domain} />
        <Stat
          label="Tema"
          value={profile.topic || <span className="text-muted">sin determinar</span>}
          hint={`${Math.round(profile.confidence * 100)}% de confianza`}
        />
        <Stat label="Voz" value={`${Math.round(profile.speech_ratio * 100)}%`} />
        <Stat label="Movimiento" value={`${Math.round(profile.motion_level * 100)}%`} />
      </div>

      {profile.entities.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">En que se basa</p>
          <ul className="flex flex-wrap gap-2">
            {profile.entities.slice(0, 8).map((e, i) => (
              <li
                key={`${e.label}-${i}`}
                className="rounded-full border border-line px-3 py-1 text-xs"
              >
                <span className={COLOR_FUENTE[e.source] ?? "text-muted"}>{e.source}</span>
                <span className="mx-1.5 text-muted">·</span>
                {e.label}
                <span className="ml-1.5 text-muted">{Math.round(e.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.missing.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">
            {profile.missing.length} senales no disponibles
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {profile.missing.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
