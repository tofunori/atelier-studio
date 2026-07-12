import { useEffect, useState } from "react";
import type { DeviceCredentials } from "../transport/types.ts";
import { fetchFileById } from "../transport/filesClient.ts";
import { formatBytes } from "./classify.ts";
import { LARGE_FILE_BYTES } from "./types.ts";
import type { GalleryItem } from "./types.ts";
import { ImageViewer } from "./viewers/ImageViewer.tsx";
import { PdfViewer } from "./viewers/PdfViewer.tsx";
import { SvgViewer } from "./viewers/SvgViewer.tsx";
import { TextViewer } from "./viewers/TextViewer.tsx";
import { addPendingAttachment } from "./pendingAttach.ts";

type Props = {
  credentials: DeviceCredentials;
  projectId: string;
  item: GalleryItem;
  onBack: () => void;
  onAddedToChat?: () => void;
};

export function FileViewer(p: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [confirmedLarge, setConfirmedLarge] = useState(p.item.size <= LARGE_FILE_BYTES);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    if (!confirmedLarge) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchFileById(p.credentials, p.item.fileId, {
          ifNoneMatch: p.item.etag,
        });
        if (cancelled) return;
        if (res.notModified) {
          // rare without prior cache — refetch full
          const full = await fetchFileById(p.credentials, p.item.fileId);
          if (cancelled) return;
          await materialize(full.blob, full.contentType);
        } else {
          await materialize(res.blob, res.contentType);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }

      async function materialize(blob: Blob, contentType: string) {
        const kind = p.item.kind;
        const ext = p.item.ext.toLowerCase();
        if (kind === "figure" && ext === "svg") {
          const raw = await blob.text();
          setText(raw);
          setUrl(null);
        } else if (kind === "figure") {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          setText(null);
        } else if (kind === "pdf") {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          setText(null);
        } else if (kind === "latex" || kind === "data" || kind === "code" || ext === "md" || ext === "txt") {
          const raw = await blob.text();
          setText(raw);
          setUrl(null);
        } else if (contentType.startsWith("text/") || contentType.includes("json")) {
          setText(await blob.text());
          setUrl(null);
        } else {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          setText(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [confirmedLarge, p.credentials, p.item.etag, p.item.ext, p.item.fileId, p.item.kind]);

  const share = async () => {
    if (!url && !text) return;
    try {
      if (navigator.share) {
        if (url) {
          const blob = await (await fetch(url)).blob();
          const file = new File([blob], p.item.name, { type: blob.type });
          await navigator.share({ files: [file], title: p.item.name });
        } else if (text) {
          await navigator.share({ text, title: p.item.name });
        }
      }
    } catch {
      /* user cancel */
    }
  };

  const addToChat = () => {
    addPendingAttachment({
      fileId: p.item.fileId,
      name: p.item.name,
      size: p.item.size,
      kind: p.item.kind,
      projectId: p.projectId,
      etag: p.item.etag,
      addedAt: Date.now(),
    });
    p.onAddedToChat?.();
  };

  return (
    <div className="file-viewer">
      <div className="viewer-header">
        <button type="button" className="back-btn" onClick={p.onBack}>
          ← Retour
        </button>
        <h1 className="screen-title" style={{ marginBottom: 0 }}>
          {p.item.name}
        </h1>
        <div className="viewer-meta">
          {p.item.kind} · {formatBytes(p.item.size)}
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void share()}>
            Partager
          </button>
          <button type="button" className="btn btn-primary" onClick={addToChat}>
            Ajouter au chat
          </button>
        </div>
      </div>

      {!confirmedLarge && (
        <div className="card" style={{ margin: 16 }}>
          <p>
            Fichier volumineux ({formatBytes(p.item.size)}). Confirmer le téléchargement ?
          </p>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => setConfirmedLarge(true)}>
              Télécharger
            </button>
            <button type="button" className="btn btn-ghost" onClick={p.onBack}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading && <div className="empty">Chargement…</div>}
      {error && (
        <div role="alert" style={{ color: "var(--status-error)", padding: 16 }}>
          {error}
        </div>
      )}

      {confirmedLarge && !loading && !error && p.item.kind === "pdf" && url && (
        <PdfViewer url={url} name={p.item.name} />
      )}
      {confirmedLarge && !loading && !error && p.item.kind === "figure" && p.item.ext === "svg" && text && (
        <SvgViewer raw={text} name={p.item.name} />
      )}
      {confirmedLarge &&
        !loading &&
        !error &&
        p.item.kind === "figure" &&
        p.item.ext !== "svg" &&
        url && (
          <ImageViewer
            url={url}
            name={p.item.name}
            meta={`${formatBytes(p.item.size)}${p.item.etag ? ` · etag` : ""}`}
          />
        )}
      {confirmedLarge &&
        !loading &&
        !error &&
        text &&
        (p.item.kind === "latex" ||
          p.item.kind === "data" ||
          p.item.kind === "code" ||
          p.item.kind === "other") && (
          <TextViewer text={text} name={p.item.name} showLineNumbers />
        )}
    </div>
  );
}
