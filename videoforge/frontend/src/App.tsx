import { useCallback, useEffect, useState } from "react";
import {
  api,
  formatTime,
  watchProgress,
  type BalanceReport,
  type Edl,
  type Job,
  type Profile,
  type Saturation,
  type Style,
} from "./api";
import { IdentityCard } from "./components/IdentityCard";
import { SaturationPanel } from "./components/SaturationPanel";
import { StylePicker } from "./components/StylePicker";
import { Timeline } from "./components/Timeline";
import { Uploader } from "./components/Uploader";
import { Button, Panel, ProgressBar } from "./components/ui";

export default function App() {
  const [job, setJob] = useState<Job | null>(null);
  const [styles, setStyles] = useState<Style[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [edl, setEdl] = useState<Edl | null>(null);
  const [saturation, setSaturation] = useState<Saturation | null>(null);
  const [balance, setBalance] = useState<BalanceReport | null>(null);

  const [style, setStyle] = useState("tutorial");
  const [intensity, setIntensity] = useState(50);
  const [broll, setBroll] = useState(true);
  const [skipSpeech, setSkipSpeech] = useState(false);
  const [ocr, setOcr] = useState(false);

  const [progress, setProgress] = useState<{ fraction: number; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.styles().then(setStyles).catch(() => setStyles([]));
  }, []);

  /**
   * Lanza una etapa y sigue su progreso hasta que el backend cierra el stream.
   * Ese cierre es la senal de "etapa terminada": el contrato de la API es que
   * el stream vive solo mientras hay trabajo en marcha.
   */
  const ejecutar = useCallback(
    async (nombre: string, arranque: () => Promise<Job>, alTerminar: (j: Job) => Promise<void>) => {
      if (!job) return;
      setBusy(nombre);
      setError(null);
      setProgress({ fraction: 0, message: "empezando" });
      try {
        await arranque();
        await new Promise<void>((resolve) => {
          watchProgress(
            job.id,
            (evento) => setProgress({ fraction: evento.fraction, message: evento.message }),
            resolve,
          );
        });
        const actualizado = await api.job(job.id);
        setJob(actualizado);
        if (actualizado.state === "error") {
          setError(actualizado.error ?? "algo fallo");
        } else {
          await alTerminar(actualizado);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "algo fallo");
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [job],
  );

  const analizar = () =>
    ejecutar(
      "analizar",
      () => api.analyze(job!.id, { skip_speech: skipSpeech, ocr }),
      async () => {
        const p = await api.profile(job!.id);
        setProfile(p);
        // El estilo sugerido sale del propio material; el usuario puede cambiarlo.
        setStyle(p.suggested_style);
      },
    );

  const montar = () =>
    ejecutar(
      "montar",
      () => api.plan(job!.id, { style, intensity, broll, offline: false }),
      async () => {
        setEdl(await api.edl(job!.id));
        setSaturation(await api.saturation(job!.id));
        setBalance(null);
      },
    );

  const renderizar = (preview: boolean) =>
    ejecutar("render", () => api.render(job!.id, preview), async () => {});

  async function reajustar() {
    if (!job) return;
    setBusy("balance");
    try {
      setBalance(await api.balance(job.id, intensity));
      setEdl(await api.edl(job.id));
      setSaturation(await api.saturation(job.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "no se pudo reajustar");
    } finally {
      setBusy(null);
    }
  }

  function empezarDeNuevo() {
    setJob(null);
    setProfile(null);
    setEdl(null);
    setSaturation(null);
    setBalance(null);
    setError(null);
  }

  const montajeSegundos =
    edl?.timeline.reduce((t, c) => t + (c.source_end - c.source_start) / (c.speed || 1), 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">VideoForge</h1>
          <p className="text-sm text-muted">
            Sube un video, lo entiende, lo monta de verdad y mide que no quede sobresaturado.
          </p>
        </div>
        {job && (
          <Button variant="ghost" onClick={empezarDeNuevo}>
            Otro video
          </Button>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!job ? (
        <Uploader onUploaded={setJob} />
      ) : (
        <>
          <Panel
            title="Analizar"
            step={2}
            aside={<span className="text-xs text-muted">{job.source}</span>}
          >
            {profile ? (
              <IdentityCard profile={profile} />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  Mira el video: planos, movimiento, donde esta el foco, silencios y voz.
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!skipSpeech}
                      onChange={(e) => setSkipSpeech(!e.target.checked)}
                    />
                    Transcribir la voz
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} />
                    Leer el texto en pantalla
                  </label>
                </div>
                <Button onClick={analizar} disabled={busy !== null}>
                  {busy === "analizar" ? "Analizando..." : "Analizar"}
                </Button>
              </div>
            )}
            {busy === "analizar" && progress && (
              <div className="mt-4">
                <ProgressBar fraction={progress.fraction} label={progress.message} />
              </div>
            )}
            {job.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-amber-400/80">
                {job.warnings.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Elegir estilo" step={3} muted={!profile}>
            <StylePicker
              styles={styles}
              value={style}
              onChange={setStyle}
              suggested={profile?.suggested_style}
            />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={broll} onChange={(e) => setBroll(e.target.checked)} />
                Insertar material de apoyo
              </label>
              <Button onClick={montar} disabled={!profile || busy !== null}>
                {busy === "montar" ? "Montando..." : "Montar"}
              </Button>
            </div>
            {busy === "montar" && progress && (
              <div className="mt-4">
                <ProgressBar fraction={progress.fraction} label={progress.message} />
              </div>
            )}
          </Panel>

          {edl && (
            <Panel
              title="Revisar el montaje"
              step={4}
              aside={
                <span className="text-xs text-muted">
                  {formatTime(edl.source_duration)} → {formatTime(montajeSegundos)}
                </span>
              }
            >
              <Timeline edl={edl} />
              {edl.notes.length > 0 && (
                <ul className="mt-4 space-y-1 text-xs text-muted">
                  {edl.notes.map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              )}
              {edl.chapters.length > 0 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-muted">
                    {edl.chapters.length} capitulos para la descripcion de YouTube
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-ink p-3 text-xs">
                    {edl.chapters.map((c) => `${formatTime(c.start)} ${c.title}`).join("\n")}
                  </pre>
                </details>
              )}
            </Panel>
          )}

          {saturation && (
            <Panel title="Medir la saturacion" step={5}>
              <SaturationPanel
                saturation={saturation}
                intensity={intensity}
                onIntensity={setIntensity}
                onBalance={reajustar}
                balancing={busy === "balance"}
                report={balance}
              />
            </Panel>
          )}

          <Panel title="Renderizar" step={6} muted={!edl}>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => renderizar(true)} disabled={!edl || busy !== null}>
                Previsualizar (rapido)
              </Button>
              <Button
                variant="ghost"
                onClick={() => renderizar(false)}
                disabled={!edl || busy !== null}
              >
                Render final
              </Button>
              {job.has_result && (
                <a
                  href={api.resultUrl(job.id)}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-ink hover:brightness-110"
                >
                  Descargar
                </a>
              )}
            </div>
            {busy === "render" && progress && (
              <div className="mt-4">
                <ProgressBar fraction={progress.fraction} label={progress.message} />
              </div>
            )}
            {job.has_result && (
              <video
                key={job.id + job.state}
                src={api.resultUrl(job.id)}
                controls
                className="mt-4 w-full rounded-lg border border-line"
              />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
