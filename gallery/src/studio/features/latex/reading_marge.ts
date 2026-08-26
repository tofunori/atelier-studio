// Marge annotée de la vue Lecture — transposition du rail du chat
// (`src/lib/marge.ts` + `.tl-marge`) au document lu.
//
// Un seul signe décliné, une ligne de 12 × 1 px :
//   - « sec » : chaque section du fichier, donnée sans qu'on la demande ;
//   - « pin » : ce qu'on a épinglé depuis la pastille de sélection ;
//   - « hl »  : un passage commenté ;
//   - « ici » : où l'on lit — désigné par la géométrie du défilement, jamais
//     par un clic.
//
// La dérivation est pure : le rail n'est qu'un consommateur de plus des
// sections du fichier, des annotations chargées et des signets. Aucun état de
// lecture ne vit dans le rail lui-même.

import type {StudioEditor, StudioPosition} from "../../core/editor_contract";
import {findAnnotationRange, type LatexAnnotation} from "./annotations";
import {proseRuns} from "./reading";

export type ReadingMargeKind = "sec" | "pin" | "hl";

export interface ReadingMargeEntry {
  kind: ReadingMargeKind;
  /** Ligne SOURCE (0-based) où l'entrée se trouve dans le fichier. */
  line: number;
  label: string;
  /** Identifiant du signet (kind « pin » seulement) : sert au retrait. */
  id?: string;
}

/** Un signet. Ancré par son TEXTE source, comme une annotation : un numéro de
 *  ligne dérive dès qu'on écrit au-dessus, le texte suit son passage. */
export interface ReadingPin {
  id: string;
  text: string;
  from: StudioPosition;
  created: number;
}

/** Mode d'affichage, repris du chat. « all » = chaque section ; « marks » = ne
 *  garder que ce qui a été marqué — sur un long chapitre, la trame d'encoches
 *  de sections ne se lit plus. Rien n'est perdu : « tout · N » rend la vue
 *  complète. */
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

const RANK: Readonly<Record<ReadingMargeKind, number>> = {sec: 0, pin: 1, hl: 2};

/** Les entrées du rail, dans l'ordre du document. Fonction pure : ni DOM, ni
 *  requête, ni état. */
export function deriveReadingMarge(
  sections: ReadonlyArray<{line: number; title: string}>,
  pins: ReadonlyArray<{id: string; line: number | null; text: string}>,
  annotations: ReadonlyArray<{line: number; text: string}>,
  options: {mode?: ReadingMargeMode} = {},
): ReadingMargeEntry[] {
  const mode = options.mode ?? "all";
  const out: ReadingMargeEntry[] = [];
  if (mode === "all") {
    for (const section of sections) out.push({kind: "sec", line: section.line, label: margeLabel(section.title)});
  }
  for (const pin of pins) {
    // Ancrage perdu : pas d'encoche. Un rail ne peut pas montrer une position
    // fausse — c'est toute sa fonction.
    if (pin.line === null) continue;
    out.push({kind: "pin", line: pin.line, label: passageLabel(pin.text), id: pin.id});
  }
  for (const annotation of annotations) {
    out.push({kind: "hl", line: annotation.line, label: passageLabel(annotation.text)});
  }
  return out.sort((left, right) => (left.line - right.line) || (RANK[left.kind] - RANK[right.kind]));
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
): Array<{id: string; line: number | null; text: string}> {
  return pins.map((pin) => {
    const range = findAnnotationRange(source, {text: pin.text, from: pin.from}, editor);
    return {id: pin.id, line: range ? range.from.line : null, text: pin.text};
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
  rail.setAttribute("role", "list");
  rail.setAttribute("aria-label", "Marge du document");
  options.host.appendChild(rail);

  let all: ReadingPin[] = [];
  let serial = 0;
  let showAll = false;
  let rows: Array<{entry: ReadingMargeEntry; button: HTMLElement}> = [];

  const save = (): void => {
    void win.fetch("/pdfannot", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({rel: relation, annots: all}),
    }).catch(() => { /* le signet vaut au moins pour la session */ });
  };

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
    const tops = rows.map(({entry}) => blockForLine(blocks, entry.line + 1)?.offsetTop ?? 0);
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

  const remove = (id: string): void => {
    all = all.filter((pin) => pin.id !== id);
    save();
    paint();
  };

  const glyphRow = (entry: ReadingMargeEntry): HTMLElement => {
    const item = doc.createElement("span");
    item.setAttribute("role", "listitem");
    item.className = "tr-mark-item";
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tr-mark";
    button.dataset.mark = entry.kind;
    button.title = entry.kind === "pin" ? `${entry.label} — clic droit pour retirer` : entry.label;
    const sign = doc.createElement("span");
    sign.className = "tr-mark-sign";
    sign.setAttribute("aria-hidden", "true");
    const label = doc.createElement("span");
    label.className = "tr-mark-label";
    label.textContent = entry.label;
    button.append(sign, label);
    button.addEventListener("click", () => options.revealSourceLine(entry.line));
    if (entry.kind === "pin" && entry.id) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        remove(entry.id as string);
      });
    }
    item.appendChild(button);
    return item;
  };

  const paint = (): void => {
    rail.textContent = "";
    rows = [];
    const editor = options.getEditor();
    if (!editor || !options.isReading()) return;
    const source = editor.getValue();
    const sections = readingSections(source);
    const mode = showAll ? "all" : margeMode(sections.length);
    const annotations = (options.getAnnotations?.() || [])
      .map((annotation) => ({line: annotation.from.line, text: annotation.text}));
    const entries = deriveReadingMarge(sections, resolvePins(source, all, editor), annotations, {mode});
    for (const entry of entries) {
      const item = glyphRow(entry);
      rail.appendChild(item);
      rows.push({entry, button: item.firstElementChild as HTMLElement});
    }
    // Le pli ne cache jamais rien pour de bon : la vue complète est à un clic,
    // et le compte dit ce qui dort derrière.
    if (margeMode(sections.length) === "marks") {
      const toggle = doc.createElement("button");
      toggle.type = "button";
      toggle.className = "tr-marge-all";
      toggle.setAttribute("aria-pressed", showAll ? "true" : "false");
      toggle.title = showAll ? "Replier" : `Toutes les sections (${sections.length})`;
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

  options.scroller.addEventListener("scroll", here, {passive: true});

  return {paint, load, add, pins: () => all};
}
