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
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { ArrowLeftIcon, MessageSquarePlusIcon, ShareIcon } from "lucide-react";
import { useEdgeSwipeBack } from "../app/useEdgeSwipeBack.ts";

type Props = {
  credentials: DeviceCredentials;
  projectId: string;
  item: GalleryItem;
  onBack: () => void;
  onAddedToChat?: () => void;
};

export function FileViewer(p: Props) {
  useEdgeSwipeBack(p.onBack);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
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
          setPdfData(new Uint8Array(await blob.arrayBuffer()));
          setUrl(null);
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

  const addSelectionToChat = (selected: { text: string; lineStart: number; lineEnd: number }) => {
    addPendingAttachment({
      fileId: p.item.fileId,
      name: p.item.name,
      size: p.item.size,
      kind: p.item.kind,
      projectId: p.projectId,
      etag: p.item.etag,
      excerpt: selected.text,
      lineStart: selected.lineStart,
      lineEnd: selected.lineEnd,
      addedAt: Date.now(),
    });
    p.onAddedToChat?.();
  };

  return (
    <div className="file-viewer">
      <div className="viewer-header">
        <Button type="button" variant="ghost" size="sm" onClick={p.onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Retour
        </Button>
        <h1 className="screen-title mb-0">
          {p.item.name}
        </h1>
        <div className="viewer-meta">
          {p.item.kind} · {formatBytes(p.item.size)}
        </div>
        <ButtonGroup aria-label="Actions du fichier">
          <Button type="button" variant="outline" size="sm" onClick={() => void share()} disabled={!url && !text}>
            <ShareIcon data-icon="inline-start" />
            Partager
          </Button>
          <Button type="button" size="sm" onClick={addToChat}>
            <MessageSquarePlusIcon data-icon="inline-start" />
            Ajouter au chat
          </Button>
        </ButtonGroup>
      </div>

      <AlertDialog
        open={!confirmedLarge}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !confirmedLarge) p.onBack();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Télécharger ce fichier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le fichier est volumineux ({formatBytes(p.item.size)}). Le téléchargement peut prendre quelques instants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={p.onBack}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => setConfirmedLarge(true)}>Télécharger</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading && <Empty><EmptyHeader><Spinner /><EmptyTitle>Chargement…</EmptyTitle></EmptyHeader></Empty>}
      {error && (
        <Alert variant="destructive" className="m-4 w-auto"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {confirmedLarge && !loading && !error && p.item.kind === "pdf" && pdfData && (
        <PdfViewer data={pdfData} name={p.item.name} />
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
        <TextViewer
          text={text}
          name={p.item.name}
          showLineNumbers
          onAddSelection={addSelectionToChat}
        />
      )}
    </div>
  );
}
