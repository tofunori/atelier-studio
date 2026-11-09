import {compileProgressLabel, type LatexCompileProgress} from "./compile";

export interface CompileProgressUiOptions {
  document: Document;
  window: Window;
  /** Volet PDF (`#right`) ; les repères vivent dans son parent, qui ne défile pas. */
  right: HTMLElement;
  now?: () => number;
}

export interface CompileProgressUi {
  /** Progression reçue du serveur ; `null` : la compilation est finie. */
  progress(progress: LatexCompileProgress | null): void;
  /** Échec avec le PDF d'avant intact : sa date (s), ou `null` pour retirer le repère. */
  stale(pdfMtimeSeconds: number | null): void;
  destroy(): void;
}

/** « il y a 3 min » à partir d'un écart en millisecondes. */
export function staleAgeLabel(milliseconds: number): string {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

const STALE_ICON = "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/></svg>";

/**
 * Compilation vivante, côté volet PDF : un filet de 2 px en haut du volet qui
 * avance avec les pages de la passe en cours (les pages du PDF d'avant donnent
 * le total), une étiquette « Compilation · passe 2 · page 14 » en haut à
 * gauche, et, après un échec qui a gardé le PDF, à la même place, le repère
 * « Dernier PDF valide · il y a 3 min ».
 */
export function createCompileProgressUi(options: CompileProgressUiOptions): CompileProgressUi {
  const {document: doc, window: win, right} = options;
  const now = options.now || Date.now;
  const host = right.parentElement;
  if (!host) return {progress() {}, stale() {}, destroy() {}};

  const line = doc.createElement("div");
  line.className = "pdf-progress";
  line.setAttribute("aria-hidden", "true");
  const fill = doc.createElement("span");
  line.appendChild(fill);
  line.hidden = true;

  const flag = doc.createElement("div");
  flag.className = "pdf-stale";
  flag.setAttribute("role", "status");
  flag.hidden = true;
  host.append(line, flag);

  const visible = (): boolean =>
    right.style.display !== "none" && !right.classList.contains("reading") && right.clientWidth > 0;
  const place = (element: HTMLElement): void => {
    element.style.left = `${right.offsetLeft}px`;
    element.style.top = `${right.offsetTop}px`;
    element.style.width = `${right.clientWidth}px`;
  };

  let live: LatexCompileProgress | null = null;
  const progress = (state: LatexCompileProgress | null): void => {
    live = state?.running ? state : null;
    renderFlag();
    if (!state?.running || !visible()) {
      line.hidden = true;
      line.classList.remove("known");
      fill.style.transform = "";
      return;
    }
    place(line);
    line.hidden = false;
    const total = right.querySelectorAll(".pdfpage").length;
    const page = Number(state.page) || 0;
    // Sans total (premier PDF) ou hors d'une passe TeX : filet indéterminé.
    if (state.stage === "tex" && total > 0 && page > 0) {
      line.classList.add("known");
      fill.style.transform = `scaleX(${Math.min(1, page / total)})`;
    } else {
      line.classList.remove("known");
      fill.style.transform = "";
    }
  };

  let staleSince: number | null = null;
  let ageTimer: number | null = null;
  function renderFlag(): void {
    if ((!live && staleSince === null) || !visible()) { flag.hidden = true; return; }
    if (live) {
      const label = compileProgressLabel(live, 0);
      flag.classList.add("live");
      flag.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    } else {
      flag.classList.remove("live");
      flag.innerHTML = `${STALE_ICON}<span>Dernier PDF valide · ${staleAgeLabel(now() - (staleSince as number))}</span>`;
    }
    flag.style.left = `${right.offsetLeft + 16}px`;
    flag.style.top = `${right.offsetTop + 12}px`;
    flag.hidden = false;
  }
  const stale = (pdfMtimeSeconds: number | null): void => {
    if (ageTimer !== null) win.clearInterval(ageTimer);
    ageTimer = null;
    staleSince = pdfMtimeSeconds === null || !Number.isFinite(pdfMtimeSeconds) ? null : pdfMtimeSeconds * 1000;
    renderFlag();
    if (staleSince !== null) ageTimer = win.setInterval(renderFlag, 30000);
  };

  // Lecture, volet masqué, redimensionnement : suivre le volet.
  const MutationObserverConstructor = (win as Window & {MutationObserver?: typeof MutationObserver}).MutationObserver;
  const observer = MutationObserverConstructor ? new MutationObserverConstructor(() => renderFlag()) : null;
  observer?.observe(right, {attributes: true, attributeFilter: ["class", "style"]});

  return {
    progress,
    stale,
    destroy(): void {
      if (ageTimer !== null) win.clearInterval(ageTimer);
      observer?.disconnect();
      line.remove();
      flag.remove();
    },
  };
}
