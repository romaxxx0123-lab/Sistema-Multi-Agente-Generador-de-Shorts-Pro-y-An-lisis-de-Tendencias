import { useRef, useState } from "react";
import { api, type Job } from "../api";
import { Button, Panel } from "./ui";

export function Uploader({ onUploaded }: { onUploaded: (job: Job) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      onUploaded(await api.upload(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "no se pudo subir");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Panel title="Sube tu video" step={1}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void subir(file);
        }}
        className={`grid place-items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition ${
          encima ? "border-accent bg-accent/5" : "border-line"
        }`}
      >
        <p className="text-sm text-muted">
          Arrastra aqui el video, o
        </p>
        <Button onClick={() => input.current?.click()} disabled={subiendo}>
          {subiendo ? "Subiendo..." : "Elegir fichero"}
        </Button>
        <p className="text-xs text-muted">MP4, MOV, MKV, WEBM o AVI</p>
        <input
          ref={input}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void subir(file);
          }}
        />
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </Panel>
  );
}
