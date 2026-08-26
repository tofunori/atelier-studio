// Marge annotée de la vue Lecture — transposition du rail du chat
// (`src/lib/marge.ts` + `.tl-marge`) au document lu, rangée par SECTION.
//
// Le rail ne montre QUE ce que le lecteur y a mis. Il ne dérive rien des
// commentaires : un rail qui se peuple tout seul cesse d'être une carte de ce
// qu'on a marqué (vécu 2026-08-26 — un chapitre commenté donnait un rail plein
// de jaune que personne n'avait demandé).
//
// Chaque section du fichier ouvre un groupe ; une marque vit sous la dernière
// section qui la précède. Le groupe n'est jamais stocké — il se recalcule,
// donc un paragraphe déplacé emporte sa marque dans sa nouvelle section.
//
// Trois gestes, tous à portée du rail : poser (« marquer ici », ou depuis la
// pastille de sélection), colorer, retirer. Et « ici » en encre vive, désigné
// par la géométrie du défilement, jamais par un clic.

import type {StudioEditor, StudioPosition} from "../../core/editor_contract";
import {findAnnotationRange} from "./annotations";
import {proseRuns} from "./reading";

/** Les cinq teintes des commentaires : une marque se range dans les mêmes
 *  familles, à toi de décider ce qu'elles veulent dire. */
export const MARGE_COLORS: readonly string[] = ["blue", "amber", "red", "green", "purple"];
/** Bleu et non ambre : l'ambre est déjà la couleur des passages commentés dans
 *  la prose — une marque neuve ne doit pas se faire passer pour un commentaire. */
export const MARGE_DEFAULT_COLOR = "blue";

export interface ReadingMargeMark {
  /** Ligne SOURCE (0-based) du passage. */
  line: number;
  label: string;
  color: string;
  id: string;
}

export interface ReadingMargeGroup {
  /** Ligne SOURCE de la section (−1 = avant la première section du fichier). */
  line: number;
  title: string;
  marks: ReadingMargeMark[];
}

/** Une marque. Ancrée par son TEXTE source, comme une annotation : un numéro
 *  de ligne dérive dès qu'on écrit au-dessus, le texte suit son passage. */
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

/** Ancre d'une marque : la première suite de prose du SOURCE, bornée à
 *  quelques mots. Le paragraphe entier condamnerait l'ancre à la première
 *  retouche ; un seul mot serait ambigu. */
export function margeAnchorText(source: string): string {
  const runs = proseRuns(String(source ?? ""));
  const first = runs[0] || String(source ?? "");
  return first.split(/\s+/).filter(Boolean).slice(0, 12).join(" ");
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

/** Les marques du fichier, dans l'ordre du document. Une marque sans ancrage
 *  (`line` nulle) n'entre pas : un rail ne peut pas montrer une position
 *  fausse, c'est toute sa fonction. */
export function deriveReadingMarks(
  pins: ReadonlyArray<{id: string; line: number | null; text: string; color?: string}>,
): ReadingMargeMark[] {
  const out: ReadingMargeMark[] = [];
  for (const pin of pins) {
    if (pin.line === null) continue;
    out.push({line: pin.line, label: passageLabel(pin.text), color: margeColor(pin.color), id: pin.id});
  }
  return out.sort((left, right) => left.line - right.line);
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

/** Ligne SOURCE courante de chaque marque (null = ancrage perdu). */
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
  /** Saut vers une ligne SOURCE (0-based) dans la vue visible. */
  revealSourceLine(line: number): void;
  isReading(): boolean;
  document?: Document;
  window?: Window;
}

export interface LatexReadingMargeController {
  /** Reconstruit le rail à partir du fichier et des marques. */
  paint(): void;
  load(): Promise<void>;
  /** Marque un passage (appelé par la pastille de sélection). */
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
  // Sans ça, un clic droit dans le rail fait surgir le menu natif de WebKit
  // (« Open Frame in New Window », vécu 2026-08-26).
  rail.addEventListener("contextmenu", (event) => event.preventDefault());

  let all: ReadingPin[] = [];
  let serial = 0;
  let showAll = false;
  let rows: Array<{line: number; button: HTMLElement}> = [];

  const save = (): void => {
    void win.fetch("/pdfannot", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({rel: relation, annots: all}),
    }).catch(() => { /* la marque vaut au moins pour la session */ });
  };

  // ---- palette d'une marque : les cinq teintes, rien d'autre --------------
  // Le retrait ne vit PAS ici : il a sa croix sur la rangée, d'un seul clic.
  const menu = doc.createElement("div");
  menu.className = "tr-menu";
  menu.setAttribute("role", "menu");
  const swatches = doc.createElement("div");
  swatches.className = "tr-menu-colors";
  menu.appendChild(swatches);
  options.host.appendChild(menu);
  let target: string | null = null;

  const closeMenu = (): void => {
    menu.classList.remove("open");
    target = null;
  };
  const recolor = (color: string): void => {
    if (!target) return;
    all = all.map((pin) => (pin.id === target ? {...pin, color: margeColor(color)} : pin));
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
  const openMenu = (id: string, color: string, anchor: HTMLElement): void => {
    target = id;
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
    if (menu.classList.contains("open") && node && !menu.contains(node) && !node.closest(".tr-mk")) {
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

  /** Le tiers haut de la fenêtre : au-dessus, on a lu ; en dessous, on n'y est
   *  pas encore. Même règle que la marge du chat. */
  const readingLimit = (): number => options.scroller.scrollTop
    + Math.max(8, options.scroller.clientHeight / 3);

  /** Le paragraphe qu'on est en train de lire — la cible de « marquer ici ». */
  const blockHere = (): HTMLElement | null => {
    const limit = readingLimit();
    let best: HTMLElement | null = null;
    for (const element of blocks()) {
      if (element.offsetTop <= limit) best = element;
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
    const active = activeMargeIndex(tops, readingLimit(), atBottom);
    rows.forEach(({button}, index) => {
      if (index === active) button.setAttribute("data-here", "true");
      else button.removeAttribute("data-here");
    });
  };

  const drop = (id: string): void => {
    // Sans confirmation : une marque se repose en un clic, une boîte de
    // dialogue coûte plus cher que l'erreur qu'elle prévient.
    all = all.filter((pin) => pin.id !== id);
    closeMenu();
    save();
    paint();
  };

  const pin = (text: string, from: StudioPosition): void => {
    const passage = margeAnchorText(text);
    if (passage.length < 4) return;
    serial += 1;
    all = [...all, {
      id: `pin${from.line + 1}-${serial}`,
      text: passage,
      from: {...from},
      color: MARGE_DEFAULT_COLOR,
      created: Date.now(),
    }];
    save();
    paint();
  };

  /** Marquer le paragraphe qu'on lit, sans rien sélectionner. */
  const pinHere = (): void => {
    const editor = options.getEditor();
    const block = blockHere();
    if (!editor || !block) return;
    const first = Number.parseInt(block.dataset.line || "", 10) - 1;
    const last = Number.parseInt(block.dataset.lineEnd || block.dataset.line || "", 10) - 1;
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return;
    const source = editor.getRange({line: first, ch: 0}, {line: last, ch: (editor.getLine(last) || "").length});
    pin(source, {line: first, ch: 0} as StudioPosition);
  };

  const CROSS = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"'
    + ' stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6"/></svg>';
  const PLUS = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"'
    + ' stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M5 1.6v6.8M1.6 5h6.8"/></svg>';

  /** Commande d'une rangée : un <span role="button">, car un <button> dans un
   *  <button> n'est pas du HTML valide. */
  const iconButton = (className: string, title: string, glyph: string, run: (event: Event) => void): HTMLElement => {
    const button = doc.createElement("span");
    button.className = className;
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = glyph;
    button.addEventListener("click", run);
    button.addEventListener("keydown", (event) => {
      const key = event as KeyboardEvent;
      if (key.key === "Enter" || key.key === " ") run(key);
    });
    return button;
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
    const marks = deriveReadingMarks(resolvePins(source, all, editor));
    const mode = showAll ? "all" : margeMode(sections.length);

    // Poser une marque sans rien sélectionner : « marquer ici » vise le
    // paragraphe qu'on lit. Le rail est l'outil autant que la carte.
    const addHere = doc.createElement("button");
    addHere.type = "button";
    addHere.className = "tr-add";
    addHere.title = "Marquer le passage en cours de lecture";
    addHere.setAttribute("aria-label", "Marquer le passage en cours de lecture");
    addHere.innerHTML = `<span class="tr-add-sign" aria-hidden="true">${PLUS}</span>`
      + '<span class="tr-mark-label">marquer ici</span>';
    addHere.addEventListener("click", pinHere);
    rail.appendChild(addHere);

    for (const group of groupReadingMarge(sections, marks, {mode})) {
      const box = doc.createElement("div");
      box.className = "tr-grp";
      const head = rowButton(Math.max(0, group.line), group.title, group.title || "Début du document");
      head.classList.add("tr-sec");
      box.appendChild(head);
      rows.push({line: Math.max(0, group.line), button: head});
      for (const mark of group.marks) {
        const item = rowButton(mark.line, mark.label, `${mark.label} — clic droit : couleur`);
        item.classList.add("tr-mk");
        item.dataset.color = mark.color;
        const open = (event: Event): void => {
          event.preventDefault();
          event.stopPropagation();
          openMenu(mark.id, mark.color, item);
        };
        item.addEventListener("contextmenu", open);
        item.append(
          iconButton("tr-mk-more", "Couleur", "···", open),
          iconButton("tr-mk-del", "Retirer la marque", CROSS, (event) => {
            event.preventDefault();
            event.stopPropagation();
            drop(mark.id);
          }),
        );
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
    pin(selection.text, selection.from);
  };

  const load = async (): Promise<void> => {
    try {
      const response = await win.fetch(`/pdfannot?rel=${encodeURIComponent(relation)}`);
      const payload = await response.json() as {annots?: ReadingPin[]};
      all = Array.isArray(payload.annots) ? payload.annots.filter((entry) => entry && entry.text && entry.from) : [];
      paint();
    } catch { /* les marques restent optionnelles */ }
  };

  options.scroller.addEventListener("scroll", () => { here(); closeMenu(); }, {passive: true});

  return {paint, load, add, pins: () => all};
}
