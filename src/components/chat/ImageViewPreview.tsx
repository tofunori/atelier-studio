import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ImageOffIcon, XIcon } from "lucide-react";
import { localImagePreviewUrl } from "../../lib/localImage";
import { t } from "../../lib/i18n";
import { Button } from "../shadcn/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../shadcn/dialog";

function imageName(path: string): string {
  const clean = path.split(/[?#]/u, 1)[0] ?? path;
  return clean.split(/[\\/]/u).filter(Boolean).pop() ?? t("context.kind-image");
}

export function ImageViewPreview({ paths }: { paths: string[] }) {
  const pathKey = paths.join("\u0000");
  const stablePaths = useMemo(() => [...new Set(paths.filter(Boolean))], [pathKey]);
  const [urls, setUrls] = useState<(string | null)[]>(() => stablePaths.map(() => null));
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ownedUrls: string[] = [];
    setUrls(stablePaths.map(() => null));
    setFailed(new Set());
    void Promise.all(stablePaths.map(async (path, index) => {
      try {
        const url = await localImagePreviewUrl(path);
        if (url.startsWith("blob:")) {
          if (cancelled) URL.revokeObjectURL(url);
          else ownedUrls.push(url);
        }
        if (!cancelled) setUrls((current) => current.map((value, offset) => offset === index ? url : value));
      } catch {
        if (!cancelled) setFailed((current) => new Set(current).add(index));
      }
    }));
    return () => {
      cancelled = true;
      ownedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stablePaths]);

  useEffect(() => {
    if (expandedIndex === null || stablePaths.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setExpandedIndex((current) => current === null
        ? null
        : (current + direction + stablePaths.length) % stablePaths.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedIndex, stablePaths.length]);

  if (stablePaths.length === 0) return null;
  const expandedUrl = expandedIndex === null ? null : urls[expandedIndex];
  const expandedName = expandedIndex === null ? "" : imageName(stablePaths[expandedIndex] ?? "");

  return (
    <>
      <div className="image-view-thumbnails" aria-label={t("context.attachments")}>
        {stablePaths.map((path, index) => {
          const url = urls[index];
          const name = imageName(path);
          return (
            <button type="button" key={`${path}:${index}`} className="image-view-thumbnail" disabled={!url}
              aria-label={t("context.preview-image", { name })} onClick={() => setExpandedIndex(index)}>
              {url ? <img src={url} alt={name} draggable={false} />
                : failed.has(index) ? <ImageOffIcon aria-hidden="true" />
                : <span className="image-view-loading" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <Dialog open={expandedIndex !== null} onOpenChange={(open) => { if (!open) setExpandedIndex(null); }}>
        {expandedIndex !== null && expandedUrl ? (
          <DialogContent showCloseButton={false} aria-label={t("context.expanded-image-preview")}
            overlayClassName="tw:bg-black/75 tw:backdrop-blur-none"
            className="tw:inset-0 tw:top-0 tw:left-0 tw:isolate tw:flex tw:h-dvh tw:w-dvw tw:max-w-none tw:translate-x-0 tw:translate-y-0 tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-none tw:bg-transparent tw:p-4 tw:ring-0 tw:shadow-none"
            style={{ inset: 0, top: 0, left: 0, width: "100dvw", height: "100dvh", maxWidth: "none", transform: "none", translate: "none" }}>
            <DialogTitle className="tw:sr-only">{t("context.expanded-image-preview")}</DialogTitle>
            <DialogClose className="tw:absolute tw:inset-0 tw:z-0 tw:cursor-default tw:border-0 tw:bg-transparent tw:p-0" aria-hidden="true" tabIndex={-1} />
            <DialogClose render={<Button type="button" size="icon-sm" variant="ghost" className="tw:absolute tw:top-2 tw:right-2 tw:z-20 tw:bg-black/35 tw:text-white tw:hover:bg-black/55 tw:hover:text-white" />}>
              <XIcon /><span className="tw:sr-only">{t("context.close-image-preview")}</span>
            </DialogClose>
            <div className="tw:pointer-events-none tw:relative tw:z-10 tw:flex tw:max-h-full tw:max-w-full tw:flex-col tw:items-center tw:justify-center tw:gap-2">
              <img src={expandedUrl} alt={expandedName} className="tw:max-h-[86vh] tw:max-w-[92vw] tw:select-none tw:rounded-lg tw:border tw:border-border tw:bg-popover tw:object-contain tw:shadow-2xl" draggable={false} />
              <p className="tw:m-0 tw:max-w-[92vw] tw:truncate tw:text-center tw:text-xs tw:text-white/75">
                {expandedName}{stablePaths.length > 1 ? ` (${expandedIndex + 1}/${stablePaths.length})` : ""}
              </p>
            </div>
            {stablePaths.length > 1 ? <>
              <Button type="button" size="icon" variant="ghost" className="tw:fixed tw:left-2 tw:top-1/2 tw:z-[calc(var(--z-modal)+1)] tw:-translate-y-1/2 tw:text-white/90 tw:hover:bg-white/10 tw:hover:text-white tw:sm:left-6" aria-label={t("context.previous-image")} onClick={() => setExpandedIndex((expandedIndex - 1 + stablePaths.length) % stablePaths.length)}><ChevronLeftIcon /></Button>
              <Button type="button" size="icon" variant="ghost" className="tw:fixed tw:right-2 tw:top-1/2 tw:z-[calc(var(--z-modal)+1)] tw:-translate-y-1/2 tw:text-white/90 tw:hover:bg-white/10 tw:hover:text-white tw:sm:right-6" aria-label={t("context.next-image")} onClick={() => setExpandedIndex((expandedIndex + 1) % stablePaths.length)}><ChevronRightIcon /></Button>
            </> : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
