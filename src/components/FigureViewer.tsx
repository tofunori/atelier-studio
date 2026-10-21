// Visionneuse d'une figure du noyau (piste A choisie par Thierry le
// 2026-10-21) : la figure grandit depuis son aperçu sur un voile givré qui
// couvre la fenêtre, barre en verre en haut. Échap, clic à côté ou ✕
// ferment ; ← → parcourent les figures affichées du fil ; molette (ou
// pincement) zoome vers le pointeur, glisser déplace, double-clic bascule
// entre « ajusté » et 100 %. Rien n'est copié dans le projet sans le bouton
// « enregistrer ».
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../lib/i18n";
import { baseName } from "../lib/kernel";
import { localImagePreviewUrl } from "../lib/localImage";
import { FigureGalleryBar } from "./FigureGalleryBar";
import { IconButton, RowButton } from "./ui";
import "./FigureViewer.css";

/** Une figure affichée dans la surface du noyau, avec son aperçu. */
export type ShownFigure = { path: string; cell: number | null; thumb: HTMLImageElement | null };

type View = { scale: number; x: number; y: number };

/** Émis quand la visionneuse enregistre une figure, pour que l'aperçu le sache. */
export const FIGURE_SAVED_EVENT = "kernel-figure-saved";

const Icon = {
  expand: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>,
  prev: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>,
  next: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>,
  minus: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>,
  plus: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg>,
  chat: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11V11h-6l-3 2.5V11h-2z" /></svg>,
  close: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>,
};

export const EXPAND_ICON = Icon.expand;

/** Figures affichées dans la surface, dans l'ordre du fil. */
export function figuresIn(scope: ParentNode): ShownFigure[] {
  return [...scope.querySelectorAll<HTMLElement>(".kernel-figure[data-path]")].map((el) => ({
    path: el.dataset.path ?? "",
    cell: el.dataset.cell ? Number(el.dataset.cell) : null,
    thumb: el.querySelector("img"),
  }));
}

const STEP = 1.25;
// Sortie : --motion-fast (120 ms) ; la fermeture attend la fin du fondu.
const OUT_MS = 120;

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function FigureViewer({ threadId, figures, start, onClose }: {
  threadId: string;
  figures: ShownFigure[];
  start: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const figure = figures[index] ?? figures[0];
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // null = ajustée à la fenêtre et centrée.
  const [view, setView] = useState<View | null>(null);
  const [animate, setAnimate] = useState(false);
  const [phase, setPhase] = useState<"enter" | "open" | "closing">("enter");
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; view: View } | null>(null);

  // L'aperçu a déjà l'image en mémoire : on la reprend, sinon on la relit.
  useEffect(() => {
    setNatural(null);
    setFailed(false);
    const src = figure?.thumb?.isConnected ? figure.thumb.currentSrc || figure.thumb.src : "";
    if (src || !figure) { setUrl(src || null); return; }
    let disposed = false;
    let owned: string | undefined;
    void localImagePreviewUrl(figure.path).then((next) => {
      if (next.startsWith("blob:")) owned = next;
      if (disposed) { if (owned) URL.revokeObjectURL(owned); return; }
      setUrl(next);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (owned) URL.revokeObjectURL(owned); };
  }, [figure]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { root.current?.focus(); }, []);

  const fit = natural && box && box.w > 0 && box.h > 0 ? Math.min(box.w / natural.w, box.h / natural.h) : 1;
  const current: View = view ?? { scale: fit, x: 0, y: 0 };
  const minScale = fit;
  const maxScale = Math.max(fit, 1) * 8;

  /** Position de l'aperçu, dans le repère du centre de la scène. */
  const fromThumb = useCallback((thumb: HTMLImageElement | null): View | null => {
    const host = stage.current;
    if (!thumb?.isConnected || !host || !natural) return null;
    const r = thumb.getBoundingClientRect();
    const s = host.getBoundingClientRect();
    if (r.width === 0) return null;
    return {
      scale: r.width / natural.w,
      x: r.left + r.width / 2 - (s.left + s.width / 2),
      y: r.top + r.height / 2 - (s.top + s.height / 2),
    };
  }, [natural]);

  // Ouverture : la figure part de son aperçu et grandit jusqu'à la fenêtre.
  useLayoutEffect(() => {
    if (phase !== "enter" || !natural || !box) return;
    const origin = reducedMotion() ? null : fromThumb(figure?.thumb ?? null);
    if (!origin) { setPhase("open"); return; }
    setAnimate(false);
    setView(origin);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => { setAnimate(true); setView(null); setPhase("open"); });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [phase, natural, box, figure, fromThumb]);

  const close = useCallback(() => {
    if (phase === "closing") return;
    if (reducedMotion()) { onClose(); return; }
    const origin = fromThumb(figure?.thumb ?? null);
    setAnimate(true);
    if (origin) setView(origin);
    setPhase("closing");
    window.setTimeout(onClose, OUT_MS);
  }, [phase, figure, fromThumb, onClose]);

  const zoomTo = useCallback((scale: number, px = 0, py = 0, smooth = true) => {
    const next = Math.min(maxScale, Math.max(minScale, scale));
    setAnimate(smooth);
    if (next - minScale < 1e-3) { setView(null); return; }
    const k = next / current.scale;
    setView({ scale: next, x: px - (px - current.x) * k, y: py - (py - current.y) * k });
  }, [current, minScale, maxScale]);

  const go = useCallback((delta: number) => {
    if (figures.length < 2) return;
    setAnimate(false);
    setView(null);
    setIndex((i) => (i + delta + figures.length) % figures.length);
  }, [figures.length]);

  /** Point du pointeur, dans le repère du centre de la scène. */
  const pointOf = (event: { clientX: number; clientY: number }) => {
    const s = stage.current?.getBoundingClientRect();
    return s ? { x: event.clientX - (s.left + s.width / 2), y: event.clientY - (s.top + s.height / 2) } : { x: 0, y: 0 };
  };

  // Les écouteurs natifs lisent toujours la dernière version des actions.
  const latest = useRef({ close, zoomTo, go, current, natural });
  useLayoutEffect(() => { latest.current = { close, zoomTo, go, current, natural }; });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { close, zoomTo, go, current } = latest.current;
      const keys: Record<string, () => void> = {
        Escape: close,
        ArrowLeft: () => go(-1),
        ArrowRight: () => go(1),
        "+": () => zoomTo(current.scale * STEP),
        "=": () => zoomTo(current.scale * STEP),
        "-": () => zoomTo(current.scale / STEP),
        "0": () => zoomTo(0),
      };
      const action = keys[event.key];
      if (!action || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { zoomTo, current, natural } = latest.current;
      if (!natural) return;
      const p = pointOf(event);
      // Le pincement du trackpad arrive en molette avec ctrlKey et de petits pas.
      zoomTo(current.scale * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)), p.x, p.y, false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onDoubleClick = (event: React.MouseEvent) => {
    if (view) { zoomTo(0); return; }
    const p = pointOf(event);
    zoomTo(fit < 0.95 ? 1 : fit * 2, p.x, p.y);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!view || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view };
    setDragging(true);
    setAnimate(false);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    setView({ ...d.view, x: d.view.x + event.clientX - d.x, y: d.view.y + event.clientY - d.y });
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  const cite = () => {
    if (!figure) return;
    const text = figure.cell != null ? t("kernel.viewer-cite", { n: figure.cell, path: figure.path }) : figure.path;
    window.dispatchEvent(new CustomEvent("chat-compose-append", { detail: { text, threadId } }));
    close();
  };

  const fitted = view == null;
  const zoomLabel = fitted ? t("kernel.viewer-fit") : `${Math.round(current.scale * 100)} %`;
  const name = figure ? baseName(figure.path) : "";

  return createPortal(
    <div ref={root} className="figure-viewer" data-state={phase} data-zoomed={!fitted || undefined} role="dialog" aria-modal="true"
      aria-label={t("kernel.viewer", { name })} tabIndex={-1} data-testid="figure-viewer">
      <RowButton className="figure-viewer-scrim" aria-label={t("kernel.viewer-close")} tabIndex={-1} onClick={close} />
      <div ref={stage} className="figure-viewer-stage">
        {failed ? <p className="figure-viewer-missing">{t("kernel.figure-missing", { name })}</p> : url ? (
          <img
            key={url}
            className="figure-viewer-img"
            src={url}
            alt={name}
            draggable={false}
            data-animate={animate || undefined}
            data-zoomed={!fitted || undefined}
            data-dragging={dragging || undefined}
            style={{
              width: natural?.w,
              height: natural?.h,
              visibility: natural ? "visible" : "hidden",
              transform: `translate(-50%, -50%) translate(${current.x}px, ${current.y}px) scale(${current.scale})`,
              ["--figure-scale" as string]: current.scale,
            }}
            onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
            onError={() => setFailed(true)}
            onDoubleClick={onDoubleClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ) : null}
      </div>
      <div className="figure-viewer-bar" role="toolbar" aria-label={t("kernel.viewer-tools")}>
        <span className="figure-viewer-name" title={figure?.path}>{name}</span>
        {figure?.cell != null ? <span className="figure-viewer-meta">{t("kernel.cell-n", { n: figure.cell })}</span> : null}
        <span className="figure-viewer-sep" aria-hidden="true" />
        {figures.length > 1 ? <>
          <IconButton label={t("kernel.viewer-prev")} title={t("kernel.viewer-prev")} onClick={() => go(-1)}>{Icon.prev}</IconButton>
          <span className="figure-viewer-count">{index + 1} / {figures.length}</span>
          <IconButton label={t("kernel.viewer-next")} title={t("kernel.viewer-next")} onClick={() => go(1)}>{Icon.next}</IconButton>
          <span className="figure-viewer-sep" aria-hidden="true" />
        </> : null}
        <IconButton label={t("kernel.viewer-zoom-out")} title={t("kernel.viewer-zoom-out")} disabled={fitted}
          onClick={() => zoomTo(current.scale / STEP)}>{Icon.minus}</IconButton>
        <RowButton className="figure-viewer-zoom" title={t("kernel.viewer-fit-title")} aria-label={t("kernel.viewer-fit-title")}
          onClick={() => zoomTo(0)}>{zoomLabel}</RowButton>
        <IconButton label={t("kernel.viewer-zoom-in")} title={t("kernel.viewer-zoom-in")} disabled={current.scale >= maxScale}
          onClick={() => zoomTo(current.scale * STEP)}>{Icon.plus}</IconButton>
        <span className="figure-viewer-sep" aria-hidden="true" />
        <IconButton label={t("kernel.viewer-chat")} title={t("kernel.viewer-chat")} onClick={cite}>{Icon.chat}</IconButton>
        {figure ? <FigureGalleryBar key={figure.path} path={figure.path} threadId={threadId} cell={figure.cell}
          onSaved={(rel) => window.dispatchEvent(new CustomEvent(FIGURE_SAVED_EVENT, { detail: { path: figure.path, rel } }))} /> : null}
        <IconButton label={t("kernel.viewer-close")} title={t("kernel.viewer-close")} onClick={close}>{Icon.close}</IconButton>
      </div>
      <p className="figure-viewer-hint">{t("kernel.viewer-hint")}</p>
    </div>,
    document.body,
  );
}
