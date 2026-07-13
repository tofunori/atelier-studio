import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

type Props = {
  data: Uint8Array;
  name: string;
};

export function PdfViewer(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [stageWidth, setStageWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    void import("pdfjs-dist").then(({ GlobalWorkerOptions, getDocument }) => {
      if (cancelled) return;
      GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      task = getDocument({ data: p.data.slice() });
      return task.promise;
    }).then((pdf) => {
      if (!pdf || cancelled) return;
      setDocument(pdf);
      setPage(1);
      setError(null);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "PDF illisible");
    });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [p.data]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageWidth(Math.max(0, stage.clientWidth - 24));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvasRef.current || stageWidth <= 0) return;
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    void document.getPage(page).then((pdfPage) => {
      if (cancelled || !canvasRef.current) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      const fitScale = stageWidth / natural.width;
      const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      return renderTask.promise;
    }).catch((reason: unknown) => {
      if (!cancelled && (reason as { name?: string })?.name !== "RenderingCancelledException") {
        setError(reason instanceof Error ? reason.message : "Rendu PDF impossible");
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, page, stageWidth, zoom]);

  return (
    <div className="viewer-pdf">
      <div className="viewer-toolbar viewer-pdf-toolbar">
        <span className="viewer-meta pdf-name">{p.name}</span>
        <ButtonGroup aria-label="Navigation PDF">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Page précédente" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}><ChevronLeftIcon /></Button>
          <ButtonGroupText>{page}/{document?.numPages ?? "…"}</ButtonGroupText>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Page suivante" disabled={!document || page >= document.numPages} onClick={() => setPage((n) => n + 1)}><ChevronRightIcon /></Button>
        </ButtonGroup>
        <ButtonGroup aria-label="Zoom PDF">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Réduire" onClick={() => setZoom((n) => Math.max(0.65, n - 0.15))}><ZoomOutIcon /></Button>
          <Badge variant="outline">{Math.round(zoom * 100)} %</Badge>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Agrandir" onClick={() => setZoom((n) => Math.min(2.5, n + 0.15))}><ZoomInIcon /></Button>
        </ButtonGroup>
      </div>
      {error && <Alert variant="destructive" className="m-3 w-auto"><AlertDescription>{error}</AlertDescription></Alert>}
      {!document && !error && <Skeleton className="m-3 h-96" aria-label="Préparation du PDF" />}
      <div ref={stageRef} className="viewer-pdf-stage" hidden={!!error}>
        <canvas ref={canvasRef} aria-label={`${p.name}, page ${page}`} />
      </div>
    </div>
  );
}
