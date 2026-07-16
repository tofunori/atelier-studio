import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { Input } from "./shadcn/input";
import { Textarea } from "./shadcn/textarea";
import { ToggleGroup, ToggleGroupItem } from "./shadcn/toggle-group";
import { Button } from "./ui";

type ImageGeneratedMsg = {
  projectRoot?: string;
  path: string | null;
  prompt?: string;
  model?: string;
  size?: string;
  editFrom?: string | null;
  createdAt?: string;
  error?: string;
};

function send(ws: WebSocket | null, msg: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function galleryOrigin(galleryUrl: string): string | null {
  try {
    return new URL(galleryUrl).origin;
  } catch {
    return null;
  }
}

/** Chemin projet absolu → URL servie par la galerie (même origine que l'iframe atelier). */
function toGalleryImageUrl(absPath: string, projectRoot: string, galleryUrl: string): string | null {
  const origin = galleryOrigin(galleryUrl);
  if (!origin || !absPath.startsWith(projectRoot)) return null;
  const rel = absPath.slice(projectRoot.length).replace(/^\/+/, "");
  return `${origin}/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

const SIZES: { id: "1K" | "2K"; label: string }[] = [
  { id: "1K", label: "1K" },
  { id: "2K", label: "2K" },
];

type Engine = "seedream" | "codex";
const ENGINES: { id: Engine; label: string }[] = [
  { id: "seedream", label: "Seedream 5.0 Pro" },
  { id: "codex", label: "GPT Image 2" },
];

export default function GeneratorSurface({
  ws,
  projectRoot,
  galleryUrl,
}: {
  ws: WebSocket | null;
  projectRoot: string;
  galleryUrl: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [engine, setEngine] = useState<Engine>("seedream");
  const [size, setSize] = useState<"1K" | "2K">("2K");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageGeneratedMsg | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const onGenerated = (e: Event) => {
      const msg = (e as CustomEvent<ImageGeneratedMsg>).detail;
      if (msg.projectRoot && msg.projectRoot !== projectRoot) return;
      if (timeoutRef.current) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setBusy(false);
      if (msg.error || !msg.path) {
        setError(msg.error ?? "erreur inconnue");
        return;
      }
      setError(null);
      setResult(msg);
      // la galerie tourne sur un serveur Node séparé du sidecar : c'est le
      // frontend, qui connaît déjà son URL, qui déclenche le rescan.
      const origin = galleryOrigin(galleryUrl);
      if (origin) fetch(`${origin}/rescan`, { method: "POST" }).catch(() => {});
    };
    window.addEventListener("image-generated", onGenerated);
    return () => window.removeEventListener("image-generated", onGenerated);
  }, [projectRoot, galleryUrl]);

  function generate(promptOverride?: string, editFrom?: string) {
    const p = (promptOverride ?? prompt).trim();
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    send(ws, { type: "generateImage", prompt: p, size, engine, editFrom, projectRoot });
    // Filet de sécurité si le sidecar ne répond jamais (réseau down, etc.).
    // Seedream 5.0 Pro (deep-reasoning) est lent : ~140 s observés au lancement.
    // On laisse une marge large — le vrai signal de fin est le message WS.
    timeoutRef.current = window.setTimeout(() => {
      setBusy(false);
      setError(t("generateur.timeout"));
    }, 480000);
  }

  const imageUrl = result?.path ? toGalleryImageUrl(result.path, projectRoot, galleryUrl) : null;

  return (
    <div className="generateur-surface">
      <div className="generateur-form">
        <div className="generateur-label">{t("generateur.prompt-placeholder")}</div>
        <Textarea
          className="generateur-textarea"
          placeholder={t("generateur.prompt-placeholder")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          rows={6}
        />
        <div className="generateur-label">{t("generateur.engine")}</div>
        <ToggleGroup
          aria-label={t("generateur.engine")}
          value={[engine]}
          disabled={busy}
          onValueChange={(next) => {
            const selected = next[0];
            if (selected === "seedream" || selected === "codex") setEngine(selected);
          }}
          className="generateur-engines"
        >
          {ENGINES.map((eng) => (
            <ToggleGroupItem
              key={eng.id}
              value={eng.id}
              aria-label={eng.label}
              className={`generateur-chip ${engine === eng.id ? "sel" : ""}`}
            >
              {eng.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="generateur-label">{t("generateur.size")}</div>
        <ToggleGroup
          aria-label={t("generateur.size")}
          value={[size]}
          disabled={busy}
          onValueChange={(next) => {
            const selected = next[0];
            if (selected === "1K" || selected === "2K") setSize(selected);
          }}
          className="generateur-seg"
        >
          {SIZES.map((s) => (
            <ToggleGroupItem
              key={s.id}
              value={s.id}
              aria-label={s.label}
              className={size === s.id ? "on" : ""}
            >
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="generateur-cost">
          {engine === "codex" ? t("generateur.cost-codex") : t("generateur.cost-estimate")}
        </div>
        <Button variant="primary" className="generateur-generate" disabled={busy || !prompt.trim()} onClick={() => generate()}>
          {busy ? t("generateur.generating") : t("generateur.generate")}
        </Button>
        {error && <div className="generateur-error">{error}</div>}
      </div>

      <div className="generateur-result">
        {!result && !busy && <div className="generateur-empty">{t("generateur.no-image")}</div>}
        {busy && (
          <div className="generateur-empty">
            {t("generateur.generating")}
            <div className="generateur-hint">{t("generateur.generating-hint")}</div>
          </div>
        )}
        {imageUrl && !busy && (
          <>
            <div className="generateur-preview">
              <img src={imageUrl} alt={result?.prompt ?? ""} />
            </div>
            <div className="generateur-edit-row">
              <Input
                className="generateur-edit-input"
                placeholder={t("generateur.edit-prompt-placeholder")}
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                disabled={busy}
              />
              <Button
                variant="secondary"
                className="generateur-edit-btn"
                disabled={busy || !editPrompt.trim() || !result?.path}
                onClick={() => {
                  if (!result?.path) return;
                  setPrompt(editPrompt);
                  generate(editPrompt, result.path);
                }}
              >
                {t("generateur.edit")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
