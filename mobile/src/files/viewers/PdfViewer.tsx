import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Rows3Icon,
  SquareIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";

type Props = {
  data: Uint8Array;
  name: string;
};

type PdfMode = "page" | "scroll";

type PdfPageCanvasProps = {
  document: PDFDocumentProxy;
  pageNumber: number;
  stageWidth: number;
  zoom: number;
  scrollRoot: RefObject<HTMLDivElement | null>;
  lazy?: boolean;
  onError: (message: string) => void;
};

function PdfPageCanvas({
  document,
  pageNumber,
  stageWidth,
  zoom,
  scrollRoot,
  lazy = false,
  onError,
}: PdfPageCanvasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearViewport, setNearViewport] = useState(!lazy);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!lazy || nearViewport) return;
    const shell = shellRef.current;
    if (!shell || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot.current, rootMargin: "100% 0px" },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, [lazy, nearViewport, scrollRoot]);

  useEffect(() => {
    if (!nearViewport || !canvasRef.current || stageWidth <= 0) return;
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    void document.getPage(pageNumber).then((pdfPage) => {
      if (cancelled || !canvasRef.current) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      setAspectRatio(natural.width / natural.height);
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
        onError(reason instanceof Error ? reason.message : "Rendu PDF impossible");
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, nearViewport, onError, pageNumber, stageWidth, zoom]);

  return (
    <div
      ref={shellRef}
      className="pdf-page-shell"
      data-pdf-page={pageNumber}
      style={aspectRatio ? { aspectRatio } : undefined}
      aria-label={`Page ${pageNumber}`}
    >
      {nearViewport ? (
        <canvas ref={canvasRef} aria-label={`Page ${pageNumber} du PDF`} />
      ) : (
        <Skeleton className="pdf-page-skeleton" aria-label={`Préparation de la page ${pageNumber}`} />
      )}
    </div>
  );
}

export function PdfViewer(p: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<PdfMode>("page");
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

  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
  }, []);

  const trackVisiblePage = () => {
    if (mode !== "scroll" || !stageRef.current) return;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const stageTop = stage.getBoundingClientRect().top + 16;
      let nearestPage = page;
      let nearestDistance = Number.POSITIVE_INFINITY;
      stage.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom <= stageTop) return;
        const distance = Math.abs(rect.top - stageTop);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestPage = Number(element.dataset.pdfPage || page);
        }
      });
      setPage(nearestPage);
      scrollFrame.current = null;
    });
  };

  const changeMode = (next: PdfMode) => {
    if (next === mode) return;
    setMode(next);
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      const target = stage?.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`);
      if (stage && target) stage.scrollTop = Math.max(0, target.offsetTop - stage.offsetTop - 12);
    });
  };

  return (
    <div className="viewer-pdf">
      <div className="viewer-toolbar viewer-pdf-toolbar">
        <div className="pdf-toolbar-row pdf-toolbar-title-row">
          <span className="viewer-meta pdf-name">{p.name}</span>
          <ToggleGroup
            value={[mode]}
            onValueChange={(value) => {
              const next = value[0] as PdfMode | undefined;
              if (next) changeMode(next);
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Mode de lecture PDF"
          >
            <ToggleGroupItem value="page" aria-label="Une page à la fois">
              <SquareIcon data-icon="inline-start" />
              Page
            </ToggleGroupItem>
            <ToggleGroupItem value="scroll" aria-label="Défilement vertical">
              <Rows3Icon data-icon="inline-start" />
              Défilement
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="pdf-toolbar-row pdf-toolbar-controls">
          {mode === "page" ? (
            <ButtonGroup aria-label="Navigation PDF">
              <Button type="button" variant="outline" size="icon-sm" aria-label="Page précédente" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}><ChevronLeftIcon /></Button>
              <ButtonGroupText>{page}/{document?.numPages ?? "…"}</ButtonGroupText>
              <Button type="button" variant="outline" size="icon-sm" aria-label="Page suivante" disabled={!document || page >= document.numPages} onClick={() => setPage((n) => n + 1)}><ChevronRightIcon /></Button>
            </ButtonGroup>
          ) : (
            <Badge variant="outline">Page {page}/{document?.numPages ?? "…"}</Badge>
          )}
          <ButtonGroup aria-label="Zoom PDF">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Réduire" onClick={() => setZoom((n) => Math.max(0.65, n - 0.15))}><ZoomOutIcon /></Button>
            <Badge variant="outline">{Math.round(zoom * 100)} %</Badge>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Agrandir" onClick={() => setZoom((n) => Math.min(2.5, n + 0.15))}><ZoomInIcon /></Button>
          </ButtonGroup>
        </div>
      </div>
      {error && <Alert variant="destructive" className="m-3 w-auto"><AlertDescription>{error}</AlertDescription></Alert>}
      {!document && !error && <Skeleton className="m-3 h-96" aria-label="Préparation du PDF" />}
      <div
        ref={stageRef}
        className="viewer-pdf-stage"
        data-mode={mode}
        hidden={!!error}
        onScroll={trackVisiblePage}
      >
        {document && mode === "page" && (
          <PdfPageCanvas
            document={document}
            pageNumber={page}
            stageWidth={stageWidth}
            zoom={zoom}
            scrollRoot={stageRef}
            onError={setError}
          />
        )}
        {document && mode === "scroll" && Array.from({ length: document.numPages }, (_, index) => (
          <PdfPageCanvas
            key={index + 1}
            document={document}
            pageNumber={index + 1}
            stageWidth={stageWidth}
            zoom={zoom}
            scrollRoot={stageRef}
            lazy
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}
