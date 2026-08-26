// Marge annotée de la vue Lecture — transposition du rail du chat
// (`src/lib/marge.ts` + `.tl-marge`) au document lu, rangée par SECTION.
//
// Chaque section du fichier ouvre un groupe ; une marque vit sous la dernière
// section qui la précède. Deux familles de marques, distinguées par la FORME
// (la couleur est libre, donc elle ne peut plus dire le type) :
//   - signet : ligne nue — il n'y a que la position ;
//   - passage commenté : ligne à point — il y a un texte à lire.
// Et « ici » en encre vive, désigné par la géométrie du défilement.
//
// La dérivation est pure : le rail n'est qu'un consommateur des sections, des
// annotations et des signets. Le groupe n'est jamais stocké — il se recalcule,
// donc un paragraphe déplacé emporte sa marque dans sa nouvelle section.

import type {StudioEditor, StudioPosition} from "../../core/editor_contract";
import {findAnnotationRange, type LatexAnnotation} from "./annotations";
import {proseRuns} from "./reading";

export type ReadingMargeKind = "pin" | "hl";

/** Les cinq teintes des commentaires : un signet se range dans les mêmes
 *  familles, à toi de décider ce qu'elles veulent dire. */
export const MARGE_COLORS: readonly string[] = ["amber", "red", "blue", "green", "purple"];
export const MARGE_DEFAULT_COLOR = "amber";

export interface ReadingMargeMark {
  kind: ReadingMargeKind;
  /** Ligne SOURCE (0-based) du passage. */
  line: number;
  label: string;
  color: string;
  /** Identifiant du signet (kind « pin » seulement) : sert au retrait. */
  id?: string;
}

export interface ReadingMargeGroup {
  /** Ligne SOURCE de la section (−1 = avant la première section du fichier). */
  line: number;
  title: string;
  marks: ReadingMargeMark[];
}

/** Un signet. Ancré par son TEXTE source, comme une annotation : un numéro de
 *  ligne dérive dès qu'on écrit au-dessus, le texte suit son passage. */
export interface ReadingPin {
  id: string;
  text: string;
  from: StudioPosition;
  color?: string;
  created: number;
}

/** Mode d'affichage. « all » = toutes les sections, même vides ; « marks » =
 *  seulement celles qui portent quelque chose — sur un long chapitre, la trame
 *  des sections vides ne se lit plus. Rien n'est perdu : « tout · N » rend la
 *  vue complète. */
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

/** Libellé d'un passage SOURCE : les commandes LaTeX n'ont rien à faire dans
 *  un rail (« \cite{clé} » n'aide personne à reconnaître son passage). */
export function passageLabel(text: string): string {
  const runs = proseRuns(String(text ?? ""));
  return margeLabel(runs.length ? runs.join(" ") : String(text ?? ""));
}

export function margeColor(value: unknown): string {
  const name = String(value ?? "");
  return MARGE_COLORS.includes(name) ? name : MARGE_DEFAULT_COLOR;
}

/** Sections du fichier — tous les niveaux, comme le plan. */
export function readingSections(source: string): Array<{line: number; title: string}> {
  const pattern = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{([^{}]*)\}/;
  const out: Array<{line: number; title: string}> = [];
  String(source ?? "").split("\n").forEach((line, index) => {
    const match = pattern.exec(line);
    if (match) out.push({line: index, title: match[2] || ""});
  });
  return out;
}

/** Les marques du fichier, dans l'ordre du document. Un signet sans ancrage
 *  (`line` nulle) n'entre pas : un rail ne peut pas montrer une position
 *  fausse, c'est toute sa fonction. */
export function deriveReadingMarks(
  pins: ReadonlyArray<{id: string; line: number | null; text: string; color?: string}>,
  annotations: ReadonlyArray<{id?: string; line: number; text: string; color?: string}>,
): ReadingMargeMark[] {
  const out: ReadingMargeMark[] = [];
  for (const pin of pins) {
    if (pin.line === null) continue;
    out.push({kind: "pin", line: pin.line, label: passageLabel(pin.text), color: margeColor(pin.color), id: pin.id});
  }
  for (const annotation of annotations) {
    out.push({kind: "hl", line: annotation.line, label: passageLabel(annotation.text),
      color: margeColor(annotation.color), id: annotation.id});
  }
  return out.sort((left, right) => (left.line - right.line)
    || ((left.kind === "pin" ? 0 : 1) - (right.kind === "pin" ? 0 : 1)));
}

/** Le rail rangé : une marque tombe sous la dernière section qui la précède.
 *  Ce qui précède la première section ouvre un groupe sans titre — mieux vaut
 *  un groupe anonyme qu'une marque perdue. */
export function groupReadingMarge(
  sections: ReadonlyArray<{line: number; title: string}>,
  marks: readonly ReadingMargeMark[],
  options: {mode?: ReadingMargeMode} = {},
): ReadingMargeGroup[] {
  const groups: ReadingMargeGroup[] = sections
    .slice()
    .sort((left, right) => left.line - right.line)
    .map((section) => ({line: section.line, title: margeLabel(section.title), marks: []}));
  const head: ReadingMargeGroup = {line: -1, title: "", marks: []};
  for (const mark of marks) {
    let host = head;
    for (const group of groups) {
      if (group.line <= mark.line) host = group;
      else break;
    }
    host.marks.push(mark);
  }
  const all = head.marks.length ? [head, ...groups] : groups;
  return (options.mode ?? "all") === "marks" ? all.filter((group) => group.marks.length) : all;
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

/** Ligne SOURCE courante de chaque signet (null = ancrage perdu). */
export function resolvePins(
  source: string,
  pins: readonly ReadingPin[],
  editor: Pick<StudioEditor, "indexFromPos" | "posFromIndex">,
): Array<{id: string; line: number | null; text: string; color?: string}> {
  return pins.map((pin) => {
    const range = findAnnotationRange(source, {text: pin.text, from: pin.from}, editor);
    return {id: pin.id, line: range ? range.from.line : null, text: pin.text, color: pin.color};
  });
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
  getAnnotations?(): readonly LatexAnnotation[];
  /** Recolorer un commentaire depuis la marge : ses marques sont traitées
   *  comme les signets, sinon la couleur ne veut plus rien dire. */
  setAnnotationColor?(id: string, color: string): void;
  /** Ouvrir le commentaire dans son popover — c'est là que vit sa suppression,
   *  armée : un commentaire porte un texte écrit, on ne le jette pas d'un clic. */
  openAnnotation?(id: string): void;
  /** Saut vers une ligne SOURCE (0-based) dans la vue visible. */
  revealSourceLine(line: number): void;
  isReading(): boolean;
  document?: Document;
  window?: Window;
}

export interface LatexReadingMargeController {
  /** Reconstruit le rail à partir du fichier, des signets et des annotations. */
  paint(): void;
  load(): Promise<void>;
  /** Épingle un passage (appelé par la pastille de sélection). */
  add(selection: {text: string; from: StudioPosition}): void;
  pins(): readonly ReadingPin[];
}

export function createLatexReadingMarge(
  options: LatexReadingMargeOptions,
): LatexReadingMargeController {
  const doc = options.document || document;
  const win = options.window || window;
  const relation = `tex-marks:${options.path}`;
  const rail = doc.createElement("div");
  rail.className = "tr-marge";
  rail.setAttribute("role", "tree");
  rail.setAttribute("aria-label", "Marge du document");
  options.host.appendChild(rail);

  let all: ReadingPin[] = [];
  let serial = 0;
  let showAll = false;
  let rows: Array<{line: number; button: HTMLElement}> = [];

  const save = (): void => {
    void win.fetch("/pdfannot", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({rel: relation, annots: all}),
    }).catch(() => { /* le signet vaut au moins pour la session */ });
  };

  // ---- menu d'une marque : cinq couleurs, un retrait ----------------------
  const menu = doc.createElement("div");
  menu.className = "tr-menu";
  menu.setAttribute("role", "menu");
  const swatches = doc.createElement("div");
  swatches.className = "tr-menu-colors";
  const remove = doc.createElement("button");
  remove.type = "button";
  remove.className = "tr-menu-del";
  remove.innerHTML = '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"'
    + ' stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M2 3.5h10M5.5 3.5V2.2h3v1.3M3.6 3.5l.6 8.1h5.6l.6-8.1"/></svg>'
    + '<span>Retirer</span>';
  const openComment = doc.createElement("button");
  openComment.type = "button";
  openComment.className = "tr-menu-del";
  openComment.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"'
    + ' stroke="currentColor" stroke-width="1.3" aria-hidden="true">'
    + '<path d="M3 2.5h10v8H8l-3 3v-3H3v-8z"/></svg><span>Ouvrir le commentaire</span>';
  menu.append(swatches, remove, openComment);
  options.host.appendChild(menu);
  let target: {kind: ReadingMargeKind; id: string} | null = null;
  // Sans ça, un clic droit sur une rangée sans menu (une section) fait
  // surgir le menu natif de WebKit — « Open Frame in New Window », vécu
  // 2026-08-26. Le rail répond de tout ce qui s'y passe.
  rail.addEventListener("contextmenu", (event) => event.preventDefault());

  const closeMenu = (): void => {
    menu.classList.remove("open");
    target = null;
  };
  const recolor = (color: string): void => {
    if (!target) return;
    if (target.kind === "hl") {
      options.setAnnotationColor?.(target.id, margeColor(color));
      closeMenu();
      paint();
      return;
    }
    all = all.map((pin) => (pin.id === target?.id ? {...pin, color: margeColor(color)} : pin));
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
    swatch.addEventListener("click", () => recolor(color));
    swatches.appendChild(swatch);
  }
  remove.addEventListener("click", () => {
    // Sans confirmation : un signet se repose en trois secondes, une boîte de
    // dialogue coûte plus cher que l'erreur qu'elle prévient. Un COMMENTAIRE,
    // lui, porte un texte écrit : sa suppression reste dans son popover, où
    // elle est armée.
    const id = target?.id;
    closeMenu();
    if (!id) return;
    all = all.filter((pin) => pin.id !== id);
    save();
    paint();
  });
  openComment.addEventListener("click", () => {
    const id = target?.id;
    closeMenu();
    if (id) options.openAnnotation?.(id);
  });
  const openMenu = (kind: ReadingMargeKind, id: string, color: string, anchor: HTMLElement): void => {
    target = {kind, id};
    menu.classList.add("open");
    remove.style.display = kind === "pin" ? "" : "none";
    openComment.style.display = kind === "hl" ? "" : "none";
    for (const swatch of swatches.children) {
      swatch.classList.toggle("on", (swatch as HTMLElement).dataset.color === color);
    }
    const box = anchor.getBoundingClientRect();
    const frame = options.host.getBoundingClientRect();
    menu.style.left = `${Math.min(box.right - frame.left + 8, frame.width - menu.offsetWidth - 8)}px`;
    menu.style.top = `${Math.max(4, Math.min(box.top - frame.top, frame.height - menu.offsetHeight - 8))}px`;
  };
  doc.addEventListener("mousedown", (event) => {
    const node = event.target as Element | null;
    if (menu.classList.contains("open") && node && !menu.contains(node)
      && !node.closest(".tr-mk") && !node.closest(".tr-mk-more")) {
      closeMenu();
    }
  });
  doc.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Escape" && menu.classList.contains("open")) closeMenu();
  });

  /** Bloc rendu qui porte une ligne SOURCE : la dernière ancre en amont. */
  const blockForLine = (blocks: readonly HTMLElement[], line: number): HTMLElement | null => {
    let best: HTMLElement | null = null;
    for (const element of blocks) {
      const at = Number.parseInt(element.dataset.line || "", 10);
      if (!Number.isFinite(at)) continue;
      if (at <= line) best = element;
      else break;
    }
    return best;
  };

  const here = (): void => {
    if (!rows.length) return;
    const blocks = [...options.reading.querySelectorAll<HTMLElement>("[data-line]")];
    const tops = rows.map(({line}) => blockForLine(blocks, line + 1)?.offsetTop ?? 0);
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

  const rowButton = (line: number, label: string, title: string): HTMLButtonElement => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tr-mark";
    button.title = title;
    const sign = doc.createElement("span");
    sign.className = "tr-mark-sign";
    sign.setAttribute("aria-hidden", "true");
    const text = doc.createElement("span");
    text.className = "tr-mark-label";
    text.textContent = label;
    button.append(sign, text);
    button.addEventListener("click", () => {
      closeMenu();
      options.revealSourceLine(line);
    });
    return button;
  };

  const paint = (): void => {
    closeMenu();
    rail.textContent = "";
    rows = [];
    const editor = options.getEditor();
    if (!editor || !options.isReading()) return;
    const source = editor.getValue();
    const sections = readingSections(source);
    const annotations = (options.getAnnotations?.() || []).map((annotation) => ({
      id: annotation.id, line: annotation.from.line, text: annotation.text, color: annotation.color,
    }));
    const marks = deriveReadingMarks(resolvePins(source, all, editor), annotations);
    const mode = showAll ? "all" : margeMode(sections.length);
    for (const group of groupReadingMarge(sections, marks, {mode})) {
      const box = doc.createElement("div");
      box.className = "tr-grp";
      const head = rowButton(Math.max(0, group.line), group.title, group.title || "Début du document");
      head.classList.add("tr-sec");
      box.appendChild(head);
      rows.push({line: Math.max(0, group.line), button: head});
      for (const mark of group.marks) {
        const item = rowButton(mark.line, mark.label, `${mark.label} — clic droit : couleur, ${
          mark.kind === "pin" ? "retrait" : "commentaire"}`);
        item.classList.add("tr-mk");
        item.dataset.mark = mark.kind;
        item.dataset.color = mark.color;
        if (mark.id) {
          const id = mark.id;
          const kind = mark.kind;
          const open = (event: Event): void => {
            event.preventDefault();
            event.stopPropagation();
            openMenu(kind, id, mark.color, item);
          };
          item.addEventListener("contextmenu", open);
          // Le clic droit ne se devine pas : une poignée apparaît au survol
          // de la rangée, quand le rail est déplié et qu'il y a la place.
          const handle = doc.createElement("span");
          handle.className = "tr-mk-more";
          handle.setAttribute("role", "button");
          handle.tabIndex = 0;
          handle.title = mark.kind === "pin" ? "Couleur, retrait" : "Couleur, commentaire";
          handle.setAttribute("aria-label", mark.kind === "pin"
            ? "Couleur ou retrait de ce signet"
            : "Couleur ou ouverture de ce commentaire");
          handle.textContent = "···";
          handle.addEventListener("click", open);
          handle.addEventListener("keydown", (event) => {
            const key = event as KeyboardEvent;
            if (key.key === "Enter" || key.key === " ") open(key);
          });
          item.appendChild(handle);
        }
        box.appendChild(item);
        rows.push({line: mark.line, button: item});
      }
      rail.appendChild(box);
    }
    // Le pli ne cache jamais rien pour de bon : la vue complète est à un clic,
    // et le compte dit ce qui dort derrière.
    if (margeMode(sections.length) === "marks") {
      const toggle = doc.createElement("button");
      toggle.type = "button";
      toggle.className = "tr-marge-all";
      toggle.setAttribute("aria-pressed", showAll ? "true" : "false");
      toggle.title = showAll ? "Ne montrer que les sections marquées" : `Toutes les sections (${sections.length})`;
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

  const add = (selection: {text: string; from: StudioPosition}): void => {
    const text = String(selection.text || "").trim();
    if (!text) return;
    serial += 1;
    all = [...all, {
      id: `pin${selection.from.line + 1}-${serial}`,
      text,
      from: {...selection.from},
      color: MARGE_DEFAULT_COLOR,
      created: Date.now(),
    }];
    save();
    paint();
  };

  const load = async (): Promise<void> => {
    try {
      const response = await win.fetch(`/pdfannot?rel=${encodeURIComponent(relation)}`);
      const payload = await response.json() as {annots?: ReadingPin[]};
      all = Array.isArray(payload.annots) ? payload.annots.filter((pin) => pin && pin.text && pin.from) : [];
      paint();
    } catch { /* les signets restent optionnels */ }
  };

  options.scroller.addEventListener("scroll", () => { here(); closeMenu(); }, {passive: true});

  return {paint, load, add, pins: () => all};
}
