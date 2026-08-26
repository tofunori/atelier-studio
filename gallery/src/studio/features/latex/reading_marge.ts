// Marge annotée de la vue Lecture — transposition du rail du chat
// (`src/lib/marge.ts` + `.tl-marge`) au document lu.
//
// Le rail liste LES SECTIONS du fichier, et rien d'autre. On les colore : cinq
// teintes pour se faire ses familles (à revoir, tranchée, à citer…), et
// « aucune » pour rendre la section à sa demi-teinte. Aucune marque ne
// s'ajoute au rail — ni depuis une sélection, ni depuis la lecture : il n'y a
// que ce que le fichier contient, et la couleur que tu y mets.
//
// La couleur est ancrée par le TITRE de la section, jamais par son numéro de
// ligne : écrire au-dessus ne doit pas repeindre la section suivante.
//
// Et « ici » en encre vive, désigné par la géométrie du défilement (le tiers
// haut de la fenêtre, la dernière entrée au bas du document), jamais par un
// clic — même règle que la marge du chat.

import type {StudioEditor} from "../../core/editor_contract";

/** Les cinq teintes des commentaires : à toi de décider ce qu'elles veulent
 *  dire. « none » rend la section à sa demi-teinte. */
export const MARGE_COLORS: readonly string[] = ["blue", "amber", "red", "green", "purple"];
export const MARGE_NO_COLOR = "none";

export interface ReadingSection {
  /** Ligne SOURCE (0-based) de la commande de sectionnement. */
  line: number;
  title: string;
}

/** La couleur posée sur une section, telle qu'elle est stockée. Le titre est
 *  l'ancre ; `line` ne sert qu'à départager deux sections homonymes. */
export interface SectionMark {
  id: string;
  /** Titre de la section au moment où la couleur a été posée. */
  text: string;
  line: number;
  color: string;
}

export type ReadingMargeMode = "all" | "marks";

const LABEL_MAX = 72;
/** En dessous, le rail tient d'un œil : le plier n'apporterait rien. */
const FOLD_THRESHOLD = 25;

export function margeMode(sectionCount: number): ReadingMargeMode {
  return sectionCount > FOLD_THRESHOLD ? "marks" : "all";
}

/** Première ligne utile, espaces compactés, tronquée — un rail se lit d'un œil. */
export function margeLabel(text: string): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
}

export function margeColor(value: unknown): string {
  const name = String(value ?? "");
  return MARGE_COLORS.includes(name) ? name : MARGE_NO_COLOR;
}

/** Sections du fichier — tous les niveaux, comme le plan. */
export function readingSections(source: string): ReadingSection[] {
  const pattern = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{([^{}]*)\}/;
  const out: ReadingSection[] = [];
  String(source ?? "").split("\n").forEach((line, index) => {
    const match = pattern.exec(line);
    if (match) out.push({line: index, title: margeLabel(match[2] || "")});
  });
  return out;
}

/** La couleur de chaque section, dans l'ordre du document.
 *
 *  L'ancre est le TITRE : une section qu'on a fait descendre de 200 lignes
 *  garde sa couleur, et une section insérée au-dessus ne l'hérite pas. Deux
 *  sections homonymes sont départagées par la ligne la plus proche de celle
 *  où la couleur a été posée. Une couleur dont le titre a disparu du fichier
 *  n'est appliquée à personne — le rail ne peut pas peindre une position
 *  fausse, c'est toute sa fonction. */
export function resolveSectionColors(
  sections: readonly ReadingSection[],
  marks: readonly SectionMark[],
): string[] {
  const colors = sections.map(() => MARGE_NO_COLOR);
  for (const mark of marks) {
    const title = margeLabel(mark.text);
    let best = -1;
    sections.forEach((section, index) => {
      if (section.title !== title) return;
      if (best < 0 || Math.abs(section.line - mark.line) < Math.abs((sections[best] as ReadingSection).line - mark.line)) {
        best = index;
      }
    });
    if (best >= 0) colors[best] = margeColor(mark.color);
  }
  return colors;
}

/** Les sections à montrer. « marks » = seulement celles qui portent une
 *  couleur — sur un long chapitre, la trame des sections neutres ne se lit
 *  plus. Rien n'est perdu : « tout · N » rend la vue complète. */
export function visibleSections(
  sections: readonly ReadingSection[],
  colors: readonly string[],
  options: {mode?: ReadingMargeMode} = {},
): Array<{section: ReadingSection; color: string; index: number}> {
  const rows = sections.map((section, index) => ({section, color: colors[index] || MARGE_NO_COLOR, index}));
  return (options.mode ?? "all") === "marks"
    ? rows.filter((row) => row.color !== MARGE_NO_COLOR)
    : rows;
}

/** Index de l'encoche « ici » : le dernier point passé au-dessus de `limit`.
 *  Au bas du document, la dernière entrée gagne — sinon la fin n'est jamais
 *  désignée, quel que soit le défilement (piège vécu dans le chat). */
export function activeMargeIndex(
  tops: readonly number[],
  limit: number,
  atBottom: boolean,
): number {
  if (!tops.length) return -1;
  if (atBottom) return tops.length - 1;
  let active = -1;
  tops.forEach((top, index) => { if (top <= limit) active = index; });
  return active;
}

export interface LatexReadingMargeOptions {
  path: string;
  /** Conteneur NON défilant qui porte le rail (#split) : un rail posé dans le
   *  panneau défilant partirait avec le texte. */
  host: HTMLElement;
  /** Panneau défilant de la Lecture (#right). */
  scroller: HTMLElement;
  /** Prose rendue (#texread) : donne l'ancre écran de chaque ligne source. */
  reading: HTMLElement;
  getEditor(): StudioEditor | null;
  /** Saut vers une ligne SOURCE (0-based) dans la vue visible. */
  revealSourceLine(line: number): void;
  isReading(): boolean;
  document?: Document;
  window?: Window;
}

export interface LatexReadingMargeController {
  /** Reconstruit le rail à partir du fichier et des couleurs. */
  paint(): void;
  load(): Promise<void>;
  marks(): readonly SectionMark[];
}

export function createLatexReadingMarge(
  options: LatexReadingMargeOptions,
): LatexReadingMargeController {
  const doc = options.document || document;
  const win = options.window || window;
  const relation = `tex-marks:${options.path}`;
  const rail = doc.createElement("div");
  rail.className = "tr-marge";
  rail.setAttribute("role", "list");
  rail.setAttribute("aria-label", "Sections du document");
  options.host.appendChild(rail);
  // Sans ça, un clic droit dans le rail fait surgir le menu natif de WebKit
  // (« Open Frame in New Window », vécu 2026-08-26).
  rail.addEventListener("contextmenu", (event) => event.preventDefault());

  let all: SectionMark[] = [];
  let showAll = false;
  let rows: Array<{line: number; button: HTMLElement}> = [];

  const save = (): void => {
    void win.fetch("/pdfannot", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({rel: relation, annots: all}),
    }).catch(() => { /* la couleur vaut au moins pour la session */ });
  };

  // ---- palette d'une section : cinq teintes et « aucune » -----------------
  const menu = doc.createElement("div");
  menu.className = "tr-menu";
  menu.setAttribute("role", "menu");
  const swatches = doc.createElement("div");
  swatches.className = "tr-menu-colors";
  menu.appendChild(swatches);
  options.host.appendChild(menu);
  let target: ReadingSection | null = null;

  const closeMenu = (): void => {
    menu.classList.remove("open");
    target = null;
  };
  const setColor = (color: string): void => {
    if (!target) return;
    const title = target.title;
    const line = target.line;
    // Une seule couleur par section : reposer ou effacer remplace, n'empile pas.
    all = all.filter((mark) => margeLabel(mark.text) !== title);
    if (color !== MARGE_NO_COLOR) {
      all = [...all, {id: `sec${line + 1}`, text: title, line, color: margeColor(color)}];
    }
    closeMenu();
    save();
    paint();
  };
  for (const color of MARGE_COLORS) {
    const swatch = doc.createElement("button");
    swatch.type = "button";
    swatch.className = `sw-${color}`;
    swatch.dataset.color = color;
    swatch.title = color;
    swatch.setAttribute("aria-label", `Couleur ${color}`);
    swatch.addEventListener("click", () => setColor(color));
    swatches.appendChild(swatch);
  }
  const clear = doc.createElement("button");
  clear.type = "button";
  clear.className = "sw-none";
  clear.dataset.color = MARGE_NO_COLOR;
  clear.title = "Aucune couleur";
  clear.setAttribute("aria-label", "Retirer la couleur");
  clear.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"'
    + ' stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M2 2l6 6M8 2l-6 6"/></svg>';
  clear.addEventListener("click", () => setColor(MARGE_NO_COLOR));
  swatches.appendChild(clear);

  const openMenu = (section: ReadingSection, color: string, anchor: HTMLElement): void => {
    target = section;
    menu.classList.add("open");
    for (const swatch of swatches.children) {
      swatch.classList.toggle("on", (swatch as HTMLElement).dataset.color === color);
    }
    const box = anchor.getBoundingClientRect();
    const frame = options.host.getBoundingClientRect();
    menu.style.left = `${Math.min(box.right - frame.left + 8, frame.width - menu.offsetWidth - 8)}px`;
    menu.style.top = `${Math.max(4, Math.min(box.top - frame.top - 4, frame.height - menu.offsetHeight - 8))}px`;
  };
  doc.addEventListener("mousedown", (event) => {
    const node = event.target as Element | null;
    if (menu.classList.contains("open") && node && !menu.contains(node) && !node.closest(".tr-mark")) {
      closeMenu();
    }
  });
  doc.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Escape" && menu.classList.contains("open")) closeMenu();
  });

  const blocks = (): HTMLElement[] => [...options.reading.querySelectorAll<HTMLElement>("[data-line]")];

  /** Bloc rendu qui porte une ligne SOURCE : la dernière ancre en amont. */
  const blockForLine = (list: readonly HTMLElement[], line: number): HTMLElement | null => {
    let best: HTMLElement | null = null;
    for (const element of list) {
      const at = Number.parseInt(element.dataset.line || "", 10);
      if (!Number.isFinite(at)) continue;
      if (at <= line) best = element;
      else break;
    }
    return best;
  };

  const here = (): void => {
    if (!rows.length) return;
    const list = blocks();
    const tops = rows.map(({line}) => blockForLine(list, line + 1)?.offsetTop ?? 0);
    const atBottom = options.scroller.scrollTop + options.scroller.clientHeight
      >= options.scroller.scrollHeight - 4;
    // Le tiers haut de la fenêtre : au-dessus, on a lu ; en dessous, on n'y est
    // pas encore. Même règle que la marge du chat.
    const limit = options.scroller.scrollTop + Math.max(8, options.scroller.clientHeight / 3);
    const active = activeMargeIndex(tops, limit, atBottom);
    rows.forEach(({button}, index) => {
      if (index === active) button.setAttribute("data-here", "true");
      else button.removeAttribute("data-here");
    });
  };

  const paint = (): void => {
    closeMenu();
    rail.textContent = "";
    rows = [];
    const editor = options.getEditor();
    if (!editor || !options.isReading()) return;
    const sections = readingSections(editor.getValue());
    const colors = resolveSectionColors(sections, all);
    const mode = showAll ? "all" : margeMode(sections.length);

    for (const {section, color} of visibleSections(sections, colors, {mode})) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "tr-mark";
      button.dataset.color = color;
      button.title = `${section.title} — clic droit : couleur`;
      const sign = doc.createElement("span");
      sign.className = "tr-mark-sign";
      sign.setAttribute("aria-hidden", "true");
      const label = doc.createElement("span");
      label.className = "tr-mark-label";
      label.textContent = section.title;
      button.append(sign, label);
      button.addEventListener("click", () => {
        closeMenu();
        options.revealSourceLine(section.line);
      });
      const open = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        openMenu(section, color, button);
      };
      button.addEventListener("contextmenu", open);
      // Le clic droit ne se devine pas : une poignée apparaît au survol de la
      // rangée, quand le rail est déplié.
      const handle = doc.createElement("span");
      handle.className = "tr-mk-more";
      handle.setAttribute("role", "button");
      handle.tabIndex = 0;
      handle.title = "Couleur de la section";
      handle.setAttribute("aria-label", `Couleur de la section ${section.title}`);
      handle.textContent = "···";
      handle.addEventListener("click", open);
      handle.addEventListener("keydown", (event) => {
        const key = event as KeyboardEvent;
        if (key.key === "Enter" || key.key === " ") open(key);
      });
      button.appendChild(handle);
      rail.appendChild(button);
      rows.push({line: section.line, button});
    }
    // Le pli ne cache jamais rien pour de bon : la vue complète est à un clic,
    // et le compte dit ce qui dort derrière.
    if (margeMode(sections.length) === "marks") {
      const toggle = doc.createElement("button");
      toggle.type = "button";
      toggle.className = "tr-marge-all";
      toggle.setAttribute("aria-pressed", showAll ? "true" : "false");
      toggle.title = showAll ? "Ne montrer que les sections colorées" : `Toutes les sections (${sections.length})`;
      toggle.innerHTML = '<svg class="tr-marge-all-sign" width="12" height="8" viewBox="0 0 12 8"'
        + ' fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true"><path d="M1.5 2.5 6 6l4.5-3.5"/></svg>'
        + '<span class="tr-mark-label"></span>';
      const label = toggle.querySelector(".tr-mark-label");
      if (label) label.textContent = showAll ? "replier" : `tout · ${sections.length}`;
      toggle.addEventListener("click", () => { showAll = !showAll; paint(); });
      rail.appendChild(toggle);
    }
    here();
  };

  const load = async (): Promise<void> => {
    try {
      const response = await win.fetch(`/pdfannot?rel=${encodeURIComponent(relation)}`);
      const payload = await response.json() as {annots?: SectionMark[]};
      all = Array.isArray(payload.annots)
        ? payload.annots.filter((mark) => mark && typeof mark.text === "string" && mark.color)
        : [];
      paint();
    } catch { /* les couleurs restent optionnelles */ }
  };

  options.scroller.addEventListener("scroll", () => { here(); closeMenu(); }, {passive: true});

  return {paint, load, marks: () => all};
}
