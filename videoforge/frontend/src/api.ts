/**
 * Cliente tipado de la API de VideoForge.
 *
 * El progreso llega por SSE, y el contrato del backend es que el stream se
 * cierra en cuanto el trabajo queda ocioso. Por eso `watchProgress` se abre al
 * lanzar cada etapa y se cierra sola al terminarla, en vez de mantener una
 * conexion permanente.
 */

export type JobState =
  | "creado"
  | "analizando"
  | "analizado"
  | "planificando"
  | "planificado"
  | "renderizando"
  | "listo"
  | "error";

export interface Job {
  id: string;
  source: string;
  state: JobState;
  message: string;
  fraction: number;
  error: string | null;
  warnings: string[];
  has_analysis: boolean;
  has_edl: boolean;
  has_result: boolean;
}

export interface Style {
  name: string;
  label: string;
  description: string;
  cuts_per_minute: [number, number];
  captions: boolean;
  punch_in: boolean;
  chapters: boolean;
  broll: boolean;
}

export interface Evidence {
  label: string;
  confidence: number;
  source: string;
}

export interface Profile {
  domain: string;
  topic: string;
  entities: Evidence[];
  keywords: string[];
  speech_ratio: number;
  motion_level: number;
  suggested_style: string;
  confidence: number;
  missing: string[];
}

export interface Reading {
  name: string;
  value: number;
  band: [number, number];
  status: "bajo" | "dentro" | "alto";
  score: number;
  counts: boolean;
  advice: string;
}

export interface Saturation {
  score: number;
  verdict: string;
  style: string;
  intensity: number;
  heatmap: number[];
  hot_windows: [number, number][];
  metrics: Record<string, number>;
  duration: number;
  readings: Reading[];
}

export interface Effect {
  id: string;
  kind: string;
  start: number;
  end: number;
  value_score: number;
  cost_weight: number;
  rationale: string;
  locked: boolean;
}

export interface Clip {
  id: string;
  source_start: number;
  source_end: number;
  speed: number;
  reason: string;
}

export interface Chapter {
  start: number;
  title: string;
}

export interface Edl {
  source_duration: number;
  style: string;
  intensity: number;
  timeline: Clip[];
  effects: Effect[];
  chapters: Chapter[];
  notes: string[];
  render: { width: number; height: number; fps: number };
}

export interface BalanceReport {
  summary: string;
  before: number;
  after: number;
  removed: { kind: string; start: number; reason: string }[];
  added: { kind: string; start: number; reason: string }[];
  duration_before: number;
  duration_after: number;
}

export interface RenderResult {
  filename: string;
  duration: number;
  seconds_taken: number;
  encoder: string;
  applied: string[];
  measured_lufs: number | null;
  preview: boolean;
  size_bytes: number;
}

export interface ProgressEvent {
  state: string;
  message: string;
  fraction: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(`/api${path}`, init);
  if (!respuesta.ok) {
    // El backend siempre explica el porque en `detail`; se propaga tal cual
    // para que la interfaz pueda enseñarlo sin inventarse un mensaje.
    let detalle = respuesta.statusText;
    try {
      detalle = (await respuesta.json()).detail ?? detalle;
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new Error(detalle);
  }
  return respuesta.json() as Promise<T>;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export const api = {
  health: () => request<Record<string, unknown>>("/health"),
  styles: () => request<Style[]>("/styles"),
  jobs: () => request<Job[]>("/jobs"),
  job: (id: string) => request<Job>(`/jobs/${id}`),
  deleteJob: (id: string) => request<unknown>(`/jobs/${id}`, { method: "DELETE" }),

  upload: async (file: File): Promise<Job> => {
    const datos = new FormData();
    datos.append("file", file);
    const respuesta = await fetch("/api/jobs", { method: "POST", body: datos });
    if (!respuesta.ok) {
      throw new Error((await respuesta.json().catch(() => ({}))).detail ?? "no se pudo subir");
    }
    return respuesta.json();
  },

  analyze: (id: string, opts: { skip_speech?: boolean; ocr?: boolean } = {}) =>
    post<Job>(`/jobs/${id}/analyze`, opts),
  profile: (id: string) => request<Profile>(`/jobs/${id}/profile`),

  plan: (
    id: string,
    opts: { style: string; intensity: number; broll: boolean; offline?: boolean },
  ) => post<Job>(`/jobs/${id}/plan`, opts),
  edl: (id: string) => request<Edl>(`/jobs/${id}/edl`),
  saveEdl: (id: string, edl: Edl) =>
    request<Saturation>(`/jobs/${id}/edl`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edl),
    }),

  saturation: (id: string) => request<Saturation>(`/jobs/${id}/saturation`),
  balance: (id: string, intensity: number) =>
    post<BalanceReport>(`/jobs/${id}/balance`, { intensity }),
  chapters: (id: string) =>
    request<{ markers: string; chapters: (Chapter & { timestamp: string })[] }>(
      `/jobs/${id}/chapters`,
    ),

  render: (id: string, preview: boolean) => post<Job>(`/jobs/${id}/render`, { preview }),
  resultUrl: (id: string) => `/api/jobs/${id}/result`,
};

/**
 * Sigue el progreso de una etapa. Devuelve una funcion para cortar antes.
 */
export function watchProgress(
  jobId: string,
  onEvent: (evento: ProgressEvent) => void,
  onDone: () => void,
): () => void {
  const fuente = new EventSource(`/api/jobs/${jobId}/events`);

  fuente.onmessage = (mensaje) => {
    try {
      onEvent(JSON.parse(mensaje.data) as ProgressEvent);
    } catch {
      /* un latido o una linea suelta: se ignora */
    }
  };

  // EventSource reintenta sola al cerrarse el stream; como el backend lo cierra
  // a proposito al quedar ocioso, aqui eso significa "etapa terminada".
  fuente.onerror = () => {
    fuente.close();
    onDone();
  };

  return () => fuente.close();
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
