import type {StudioEditor, StudioPosition} from "../../core/editor_contract";
import {findAnnotationRange, type LatexAnnotation} from "./annotations";
import {proseRuns} from "./reading";

/** Un signet posé en vue Lecture. Ancré comme une annotation : par son TEXTE
 *  source, jamais par un numéro de ligne — le numéro dérive dès qu'on écrit
 *  au-dessus, le texte suit son paragraphe. */
export interface ReadingBookmark {
  id: string;
  /** Fragment de prose SOURCE (sans commandes LaTeX) qui sert d'ancre. */
  text: string;
  /** Position au moment de la pose : départage les occurrences identiques. */
  from: StudioPosition;
  created: number;
}

/** Une rangée de la section « Signets » du plan. `line` nulle = ancrage perdu :
 *  la rangée s'affiche éteinte plutôt que de sauter à un endroit faux. */
export interface ReadingBookmarkRow {
  id: string;
  label: string;
  line: number | null;
}

export interface LatexReadingGutterOptions {
  path: string;
  reading: HTMLElement;
  getEditor(): StudioEditor | null;
  /** Annotations du fichier : la gouttière pose une pastille sur les blocs
   *  commentés. Absent = pas de pastille. */
  getAnnotations?(): readonly LatexAnnotation[];
  /** Un clic sur la pastille rouvre le commentaire dans l'éditeur d'annotations. */
  openAnnotation?(annotation: LatexAnnotation): void;
  /** Le jeu de signets a changé : l'hôte reconstruit le plan. */
  onBookmarksChanged?(): void;
  document?: Document;
  window?: Window;
}

export interface LatexReadingGutterController {
  /** (Re)construit les gouttières du rendu courant. Appelé après chaque rendu
   *  de la Lecture et après chaque repeinte des marques du diff. */
  paint(): void;
  load(): Promise<void>;
  /** Rangées pour la section « Signets » du plan, dans l'ordre du document. */
  rows(): ReadingBookmarkRow[];
  bookmarks(): readonly ReadingBookmark[];
}

const MAX_LABEL = 60;
const MAX_ANCHOR_WORDS = 12;
const MIN_ANCHOR_LENGTH = 4;

/** Libellé d'un signet dans le plan : coupé au mot, jamais au milieu. */
export function bookmarkLabel(text: string): string {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_LABEL) return flat;
  const cut = flat.slice(0, MAX_LABEL).replace(/\s\S*$/, "");
  return `${cut || flat.slice(0, MAX_LABEL)}…`;
}

/** Ancre d'un signet : la première suite de prose du SOURCE du paragraphe,
 *  bornée à quelques mots. Prendre le paragraphe entier condamnerait l'ancre
 *  à la première retouche ; prendre un mot serait ambigu. */
export function bookmarkAnchorText(sourceText: string): string {
  for (const run of proseRuns(sourceText)) {
    const words = run.split(/\s+/).filter(Boolean).slice(0, MAX_ANCHOR_WORDS);
    const candidate = words.join(" ");
    if (candidate.length >= MIN_ANCHOR_LENGTH) return candidate;
  }
  return String(sourceText || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Numérotation de la marge : les paragraphes de prose seulement. Les titres,
 *  les items de liste et les environnements gardent une marge nue — numéroter
 *  un titre ferait croire à une numérotation de section. */
export function proseParagraphNumbers(tags: readonly string[]): Array<number | null> {
  let counter = 0;
  return tags.map((tag) => (String(tag).toLowerCase() === "p" ? (counter += 1) : null));
}

/** Référence copiable d'un paragraphe : « methodes.tex ¶12 ». */
export function paragraphReference(path: string, index: number): string {
  const name = String(path || "").split("/").filter(Boolean).pop() || "document";
  return `${name} ¶${index}`;
}

/** Ligne SOURCE courante de chaque signet (null = ancrage perdu). */
export function resolveBookmarks(
  source: string,
  list: readonly ReadingBookmark[],
  editor: Pick<StudioEditor, "indexFromPos" | "posFromIndex">,
): Array<{bookmark: ReadingBookmark; line: number | null}> {
  return list.map((bookmark) => {
    const range = findAnnotationRange(source, {text: bookmark.text, from: bookmark.from}, editor);
    return {bookmark, line: range ? range.from.line : null};
  });
}

const RIBBON = '<svg viewBox="0 0 11 14" fill="none" stroke="currentColor" stroke-width="1.4"'
  + ' stroke-linejoin="round" aria-hidden="true">'
  + '<path class="tr-bk-body" d="M1.4 1.4h8.2v11.2L5.5 9.4 1.4 12.6V1.4Z"/></svg>';

export function createLatexReadingGutter(
  options: LatexReadingGutterOptions,
): LatexReadingGutterController {
  const doc = options.document || document;
  const win = options.window || window;
  const relation = `tex-marks:${options.path}`;
  let all: ReadingBookmark[] = [];
  let serial = 0;

  const save = (): void => {
    void win.fetch("/pdfannot", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({rel: relation, annots: all}),
    }).catch(() => { /* le signet vaut au moins pour la session */ });
    options.onBookmarksChanged?.();
  };

  /** Bloc rendu qui porte une ligne SOURCE : la dernière ancre en amont. Même
   *  règle que les surlignages de la Lecture — le rendu n'a pas d'ancre pour
   *  chaque ligne du fichier. */
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

  const resolved = (): Array<{bookmark: ReadingBookmark; line: number | null}> => {
    const editor = options.getEditor();
    if (!editor || !all.length) return all.map((bookmark) => ({bookmark, line: null}));
    return resolveBookmarks(editor.getValue(), all, editor);
  };

  const sourceOfBlock = (block: HTMLElement): {text: string; from: StudioPosition} | null => {
    const editor = options.getEditor();
    const first = Number.parseInt(block.dataset.line || "", 10) - 1;
    const last = Number.parseInt(block.dataset.lineEnd || block.dataset.line || "", 10) - 1;
    if (!editor || !Number.isFinite(first) || !Number.isFinite(last) || last < first) return null;
    const text = editor.getRange({line: first, ch: 0}, {line: last, ch: (editor.getLine(last) || "").length});
    return {text, from: {line: first, ch: 0} as StudioPosition};
  };

  const toggleBookmark = (block: HTMLElement, existing: ReadingBookmark | null): void => {
    if (existing) {
      all = all.filter((bookmark) => bookmark.id !== existing.id);
      save();
      paint();
      return;
    }
    const source = sourceOfBlock(block);
    if (!source) return;
    const text = bookmarkAnchorText(source.text);
    if (!text) return;
    serial += 1;
    all = [...all, {id: `bk${source.from.line + 1}-${serial}`, text, from: source.from, created: Date.now()}];
    save();
    paint();
  };

  const copyReference = (button: HTMLElement, reference: string): void => {
    const clipboard = (win.navigator as Navigator | undefined)?.clipboard;
    void Promise.resolve(clipboard?.writeText(reference)).catch(() => { /* pas de presse-papiers */ });
    const label = button.textContent || "";
    button.classList.add("on");
    button.textContent = "✓";
    win.setTimeout(() => {
      button.classList.remove("on");
      button.textContent = label;
    }, 900);
  };

  /** Bloc → première annotation qui y tombe (la pastille dit « il y a un
   *  commentaire ici », pas combien). Une seule passe sur le jeu : la marge se
   *  repeint à chaque frappe, elle n'a pas les moyens d'un balayage par bloc. */
  const annotationsByBlock = (blocks: readonly HTMLElement[]): Map<HTMLElement, LatexAnnotation> => {
    const map = new Map<HTMLElement, LatexAnnotation>();
    for (const annotation of options.getAnnotations?.() || []) {
      const block = blockForLine(blocks, annotation.from.line + 1);
      if (block && !map.has(block)) map.set(block, annotation);
    }
    return map;
  };

  const track = (className: string): HTMLElement => {
    const element = doc.createElement("span");
    element.className = `tr-trk ${className}`;
    return element;
  };

  const paint = (): void => {
    for (const old of options.reading.querySelectorAll(".tr-gutter")) {
      // Les coupes du diff vivent dans la piste d'état : les rendre au bloc
      // avant de jeter la gouttière, sinon un repaint les efface.
      const cut = old.querySelector(".tr-cut");
      if (cut) old.parentElement?.insertBefore(cut, old.parentElement.firstChild);
      old.remove();
    }
    const blocks = [...options.reading.querySelectorAll<HTMLElement>("[data-line]")];
    const numbers = proseParagraphNumbers(blocks.map((block) => block.tagName));
    const commented = annotationsByBlock(blocks);
    const marks = new Map<HTMLElement, ReadingBookmark>();
    for (const {bookmark, line} of resolved()) {
      if (line === null) continue;
      const block = blockForLine(blocks, line + 1);
      if (block && !marks.has(block)) marks.set(block, bookmark);
    }

    blocks.forEach((block, index) => {
      const gutter = doc.createElement("span");
      gutter.className = "tr-gutter";

      // piste 1, au plus près de la prose : ce que le document signale de
      // lui-même — coupe du diff (déjà injectée par la Lecture) ou commentaire.
      const state = track("tr-state");
      const cut = block.querySelector(".tr-cut");
      if (cut) state.appendChild(cut);
      const annotation = commented.get(block) || null;
      if (annotation && !cut) {
        const dot = doc.createElement("button");
        dot.type = "button";
        dot.className = `tr-pastille texc-c-${annotation.color || "amber"}`;
        dot.title = "Ouvrir le commentaire";
        dot.setAttribute("aria-label", "Ouvrir le commentaire de ce paragraphe");
        dot.addEventListener("click", (event) => {
          event.stopPropagation();
          options.openAnnotation?.(annotation);
        });
        state.appendChild(dot);
      }
      gutter.appendChild(state);

      const number = numbers[index] ?? null;
      if (number !== null) {
        // piste 2 : le signet — ce qu'on pose.
        const posed = marks.get(block) || null;
        const bookmark = doc.createElement("button");
        bookmark.type = "button";
        bookmark.className = `tr-trk tr-bk${posed ? " on" : ""}`;
        bookmark.innerHTML = RIBBON;
        bookmark.title = posed ? "Retirer le signet" : "Poser un signet";
        bookmark.setAttribute("aria-pressed", posed ? "true" : "false");
        bookmark.setAttribute("aria-label", posed ? "Retirer le signet" : "Poser un signet sur ce paragraphe");
        bookmark.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleBookmark(block, posed);
        });
        gutter.appendChild(bookmark);

        // piste 3, la plus éloignée : le numéro — ce qui sert à désigner.
        const reference = paragraphReference(options.path, number);
        const pnum = doc.createElement("button");
        pnum.type = "button";
        pnum.className = "tr-trk tr-pnum";
        pnum.textContent = String(number);
        pnum.title = `Copier « ${reference} »`;
        pnum.setAttribute("aria-label", `Copier la référence du paragraphe ${number}`);
        pnum.addEventListener("click", (event) => {
          event.stopPropagation();
          copyReference(pnum, reference);
        });
        gutter.appendChild(pnum);
      }
      block.appendChild(gutter);
    });
  };

  const load = async (): Promise<void> => {
    try {
      const response = await win.fetch(`/pdfannot?rel=${encodeURIComponent(relation)}`);
      const payload = await response.json() as {annots?: ReadingBookmark[]};
      all = Array.isArray(payload.annots) ? payload.annots.filter((item) => item && item.text && item.from) : [];
      paint();
      options.onBookmarksChanged?.();
    } catch { /* les signets restent optionnels */ }
  };

  const rows = (): ReadingBookmarkRow[] => resolved()
    .map(({bookmark, line}) => ({id: bookmark.id, label: bookmarkLabel(bookmark.text), line}))
    .sort((left, right) => (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER));

  return {paint, load, rows, bookmarks: () => all};
}
