import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";

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
    send(ws, { type: "generateImage", prompt: p, size, editFrom, projectRoot });
    // filet de sécurité si le sidecar ne répond jamais (réseau down, etc.)
    timeoutRef.current = window.setTimeout(() => {
      setBusy(false);
      setError("délai dépassé (30 s)");
    }, 30000);
  }

  const imageUrl = result?.path ? toGalleryImageUrl(result.path, projectRoot, galleryUrl) : null;

  return (
    <div className="generateur-surface">
      <div className="generateur-form">
        <div className="generateur-label">{t("generateur.prompt-placeholder")}</div>
        <textarea
          className="generateur-textarea"
          placeholder={t("generateur.prompt-placeholder")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          rows={6}
        />
        <div className="generateur-label">{t("generateur.size")}</div>
        <div className="generateur-seg">
          {SIZES.map((s) => (
            <button
              key={s.id}
              className={size === s.id ? "on" : ""}
              disabled={busy}
              onClick={() => setSize(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="generateur-cost">{t("generateur.cost-estimate")}</div>
        <button className="generateur-generate" disabled={busy || !prompt.trim()} onClick={() => generate()}>
          {busy ? t("generateur.generating") : t("generateur.generate")}
        </button>
        {error && <div className="generateur-error">{error}</div>}
      </div>

      <div className="generateur-result">
        {!result && !busy && <div className="generateur-empty">{t("generateur.no-image")}</div>}
        {busy && <div className="generateur-empty">{t("generateur.generating")}</div>}
        {imageUrl && !busy && (
          <>
            <div className="generateur-preview">
              <img src={imageUrl} alt={result?.prompt ?? ""} />
            </div>
            <div className="generateur-edit-row">
              <input
                className="generateur-edit-input"
                placeholder={t("generateur.edit-prompt-placeholder")}
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                disabled={busy}
              />
              <button
                className="generateur-edit-btn"
                disabled={busy || !editPrompt.trim() || !result?.path}
                onClick={() => {
                  if (!result?.path) return;
                  setPrompt(editPrompt);
                  generate(editPrompt, result.path);
                }}
              >
                {t("generateur.edit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
