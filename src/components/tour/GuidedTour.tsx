// Interface de la visite guidée (version Fable, 2026-11-19). Chargée à la
// demande par App quand la visite s'ouvre ; l'état vit dans lib/guidedTour.
//
// Rien n'est assombri : un anneau neutre entoure ce dont parle la carte, et
// la carte se pose à côté (ou dans un grand panneau, en bas à gauche). Les
// cibles sont des éléments marqués `data-tour="…"` dans l'app ; une cible
// absente (colonne repliée, panneau fermé) laisse la carte en bas à droite.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeftIcon } from "lucide-react";
import { Button, IconButton } from "../ui";
import { t, type I18nKey } from "../../lib/i18n";
import {
  TOUR_STEPS,
  closeGuidedTour,
  nextTourStep,
  openOwnFolderFromTour,
  previousTourStep,
  startGuidedTour,
  useGuidedTour,
  type TourStepId,
} from "../../lib/guidedTour";
import { placeCard, type Side, type TourRect } from "./placement";
import "./GuidedTour.css";

type StepSpec = {
  /** cibles `data-tour`, la première ancre la carte */
  targets: string[];
  sides: Side[];
};

const STEPS: Record<TourStepId, StepSpec> = {
  projects: { targets: ["project", "projects"], sides: ["right", "below"] },
  chat: { targets: ["composer"], sides: ["above", "right"] },
  gallery: { targets: ["atelier", "gallery-button"], sides: ["inside"] },
  annotate: { targets: ["atelier"], sides: ["inside"] },
  documents: { targets: ["atelier"], sides: ["inside"] },
  surfaces: { targets: ["surfaces", "layout"], sides: ["below-end", "left"] },
};

const MEASURE_MS = 120;

function measure(targets: string[]): TourRect[] {
  const rects: TourRect[] = [];
  for (const name of targets) {
    const el = document.querySelector(`[data-tour="${name}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    rects.push({ left: r.left, top: r.top, width: r.width, height: r.height });
  }
  return rects;
}

function sameRects(a: TourRect[], b: TourRect[]): boolean {
  return a.length === b.length && a.every((r, i) =>
    Math.abs(r.left - b[i].left) < 0.5 && Math.abs(r.top - b[i].top) < 0.5
    && Math.abs(r.width - b[i].width) < 0.5 && Math.abs(r.height - b[i].height) < 0.5);
}

/** Vrai un cadre après le montage : de quoi jouer le fondu d'entrée. */
function useShown(key: string): boolean {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(key));
    return () => cancelAnimationFrame(frame);
  }, [key]);
  return shown === key;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** Boîtes des cibles de l'arrêt, relevées régulièrement : les panneaux
 *  s'ouvrent, les onglets changent, la fenêtre se redimensionne. L'état
 *  ne change que si une boîte a bougé. */
function useTargets(spec: StepSpec | null) {
  const [rects, setRects] = useState<TourRect[]>([]);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    if (!spec) { setRects([]); return; }
    const tick = () => {
      setRects((current) => {
        const next = measure(spec.targets);
        return sameRects(current, next) ? current : next;
      });
      setView((current) => (current.w === window.innerWidth && current.h === window.innerHeight
        ? current : { w: window.innerWidth, h: window.innerHeight }));
    };
    tick();
    const timer = window.setInterval(tick, MEASURE_MS);
    window.addEventListener("resize", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", tick);
    };
  }, [spec]);
  return { rects, view };
}

/** Échap ferme ; →, Entrée (hors carte) et ← parcourent les arrêts. */
function useTourKeys(phase: string, cardRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const inCard = cardRef.current?.contains(event.target as Node) ?? false;
      if (!inCard && isEditable(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeGuidedTour();
      } else if (phase !== "step") {
        return;
      } else if (event.key === "ArrowRight" || (event.key === "Enter" && !inCard)) {
        event.preventDefault();
        nextTourStep();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previousTourStep();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, cardRef]);
}

function InviteBody({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <>
      <h2 id="tour-title" className="tour-title">{t("tour.invite-title")}</h2>
      <p className="tour-text">{t("tour.invite-text")}</p>
      {error && <p className="tour-error" role="alert">{t("tour.example-failed", { error })}</p>}
      <div className="tour-actions">
        <Button variant="ghost" onClick={closeGuidedTour}>{t("tour.later")}</Button>
        <Button variant="secondary" loading={loading} onClick={() => { void startGuidedTour(); }}>
          {t("tour.start")}
        </Button>
      </div>
    </>
  );
}

function EndBody() {
  return (
    <>
      <h2 id="tour-title" className="tour-title">{t("tour.end-title")}</h2>
      <p className="tour-text">{t("tour.end-text")}</p>
      <div className="tour-actions">
        <Button variant="ghost" onClick={openOwnFolderFromTour}>{t("tour.open-own")}</Button>
        <Button variant="secondary" onClick={closeGuidedTour}>{t("tour.stay")}</Button>
      </div>
    </>
  );
}

function StepBody({ id, step }: { id: TourStepId; step: number }) {
  const total = TOUR_STEPS.length;
  return (
    <>
      <div className="tour-count">{t("tour.count", { n: step + 1, total })}</div>
      <h2 id="tour-title" className="tour-title">{t(`tour.${id}-title` as I18nKey)}</h2>
      <p className="tour-text">{t(`tour.${id}-text` as I18nKey)}</p>
      <div className="tour-actions">
        {step > 0 && (
          <IconButton className="tour-back" label={t("tour.back")} title={t("tour.back")} onClick={previousTourStep}>
            <ChevronLeftIcon size={14} aria-hidden="true" />
          </IconButton>
        )}
        <Button variant="ghost" onClick={closeGuidedTour}>{t("tour.skip")}</Button>
        <Button variant="secondary" onClick={nextTourStep}>
          {step === total - 1 ? t("tour.finish") : t("tour.next")}
        </Button>
      </div>
    </>
  );
}

export default function GuidedTour() {
  const tour = useGuidedTour();
  const stepId = tour.phase === "step" ? TOUR_STEPS[tour.step] : null;
  const spec = stepId ? STEPS[stepId] : null;
  const { rects, view } = useTargets(spec);
  const [cardSize, setCardSize] = useState({ w: 272, h: 160 });
  const cardRef = useRef<HTMLDialogElement>(null);
  const key = tour.phase === "step" ? `step-${tour.step}` : tour.phase;
  const shown = useShown(key);
  useTourKeys(tour.phase, cardRef);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const next = { w: el.offsetWidth, h: el.offsetHeight };
    setCardSize((current) => (current.w === next.w && current.h === next.h ? current : next));
  });

  if (tour.phase === "idle") return null;

  const pos = placeCard(rects[0] ?? null, spec?.sides ?? [], view, cardSize);
  const cardStyle: CSSProperties = { left: pos.left, top: pos.top };
  const body = stepId
    ? <StepBody id={stepId} step={tour.step} />
    : tour.phase === "end"
      ? <EndBody />
      : <InviteBody loading={tour.phase === "loading"} error={tour.error} />;

  // <dialog open> non modal : l'app reste utilisable pendant la visite.
  return createPortal(
    <div className="tour-layer">
      {rects.map((r, i) => (
        <div key={`${key}-${i}`} className="tour-ring" data-shown={shown ? "" : undefined} aria-hidden="true"
          style={{ left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 }} />
      ))}
      <dialog open key={key} ref={cardRef} className="tour-card" aria-labelledby="tour-title"
        data-phase={tour.phase} data-shown={shown ? "" : undefined} style={cardStyle}>
        {body}
      </dialog>
    </div>,
    document.body,
  );
}
