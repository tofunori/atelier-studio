/** Notes d'annotation communes au studio LaTeX et au lecteur PDF compilé
 *  (variante B, Thierry 2026-11-09) : une seule liste .tex + PDF, numérotée
 *  dans l'ordre du document, une seule colonne, des marques de même couleur
 *  des deux côtés. Rien ici ne touche au réseau : les deux surfaces chargent
 *  leurs notes elles-mêmes et passent par ces outils purs. */

/** Teintes des notes : `veil` = voile du passage, `ink` = trait et anneau.
 *  Les valeurs vivent dans annotation_ui.css (`.note-c-*`) ; ici, seulement
 *  le nom de la teinte. */
export const NOTE_COLORS = ["amber", "red", "blue", "green", "purple", "orange"] as const;
export type NoteColor = typeof NOTE_COLORS[number];

// Composantes des voiles du lecteur PDF (HL_COLORS) → nom de teinte.
const VEIL_NAMES: ReadonlyArray<[string, NoteColor]> = [
  ["255,213,74", "amber"], ["120,220,140", "green"], ["120,170,255", "blue"],
  ["255,140,160", "red"], ["255,160,80", "orange"], ["185,150,255", "purple"],
];

/** Nom de teinte d'une note, qu'elle porte un nom (.tex : amber, red…) ou
 *  une couleur rgba (PDF : HL_COLORS). Sans teinte : ambre. */
export function noteColorName(color?: string | null): NoteColor {
  const value = String(color || "").trim().toLowerCase();
  if (!value) return "amber";
  if (value === "violet") return "purple";
  if ((NOTE_COLORS as readonly string[]).includes(value)) return value as NoteColor;
  const digits = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (digits) {
    const key = `${digits[1]},${digits[2]},${digits[3]}`;
    const found = VEIL_NAMES.find(([veil]) => veil === key);
    if (found) return found[1];
  }
  return "amber";
}

/** Annotation du lecteur PDF, telle que stockée (`pdf_annots.json`). */
export interface StoredPdfAnnotation {
  id: string | number;
  page?: number | string;
  kind?: string;
  rects?: number[][];
  text?: string;
  note?: string;
  memo?: string;
  color?: string;
  by?: string;
  author?: string;
  number?: number;
  [key: string]: unknown;
}

/** Une annotation PDF compte comme NOTE (liste, pastille numérotée) quand
 *  elle dit quelque chose : un commentaire, un marquage avec une note
 *  personnelle, ou une note de l'agent. Un surlignage nu reste un marquage. */
export function isPdfNote(annotation: StoredPdfAnnotation | null | undefined): boolean {
  if (!annotation || !Array.isArray(annotation.rects) || !annotation.rects.length) return false;
  const kind = annotation.kind || "hl";
  if (kind === "comment") return true;
  if (kind !== "hl" && kind !== "ul" && kind !== "st") return false;
  return Boolean(String(annotation.memo || "").trim()) || annotation.by === "agent" || annotation.by === "claude";
}

/** Texte de la note PDF (commentaire ou note personnelle). */
export function pdfNoteText(annotation: StoredPdfAnnotation): string {
  return String(annotation.memo || annotation.note || "").trim();
}

/** Le fichier source que SyncTeX nomme (`input`) est-il celui ouvert
 *  (`path`) ? SyncTeX garde le chemin vu par le compilateur : absolu avec des
 *  `/./` (« /projet/./sections/discussion_en.tex »), relatif (« ./intro.tex »)
 *  ou sans extension. Sans cette normalisation, toutes les notes du PDF
 *  tombaient dans « Ailleurs dans le PDF » (Thierry 2026-11-09). macOS ne
 *  distingue pas la casse. Un `input` vide (ancienne CLI) passe. */
export function sameSourceFile(input: string | null | undefined, path: string | null | undefined): boolean {
  const clean = (value: string): string => {
    const parts: string[] = [];
    const absolute = value.startsWith("/");
    for (const part of value.replace(/\\/g, "/").split("/")) {
      if (!part || part === ".") continue;
      if (part === ".." && parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else parts.push(part);
    }
    const joined = (absolute ? "/" : "") + parts.join("/");
    return (/\.[a-z0-9]+$/i.test(parts[parts.length - 1] || "") ? joined : joined + ".tex").toLowerCase();
  };
  if (!input) return true;
  if (!path) return false;
  const a = clean(String(input)), b = clean(String(path));
  return a === b || a.endsWith("/" + b.replace(/^\//, "")) || b.endsWith("/" + a.replace(/^\//, ""));
}

export function isAgentAuthor(by?: string | null): boolean {
  return by === "agent" || by === "claude";
}

/** Écarte les pastilles d'une même marge : `gap` px au moins entre deux
 *  centres, et la colonne remonte si elle sort du bas de la page. */
export function spreadPins(tops: readonly number[], height: number, gap = 24): number[] {
  const out = [...tops];
  for (let index = 1; index < out.length; index += 1) out[index] = Math.max(out[index]!, out[index - 1]! + gap);
  const limit = height - gap / 2;
  if (out.length && out[out.length - 1]! > limit) {
    out[out.length - 1] = limit;
    for (let index = out.length - 2; index >= 0; index -= 1) out[index] = Math.min(out[index]!, out[index + 1]! - gap);
  }
  return out.map(value => Math.max(gap / 2, value));
}

/** Côté de la pastille : marge gauche pour un passage de la moitié gauche
 *  de la page, droite sinon (deux colonnes : chacune sa marge). */
export function pinSide(rect: readonly number[]): "left" | "right" {
  const [x = 0, , width = 0] = rect;
  return x + width / 2 <= 0.5 ? "left" : "right";
}

/** Bornes du texte d'une page, en fractions de sa largeur : 5e et 95e
 *  centiles des débuts et fins de ligne, pour ignorer un numéro de page ou
 *  une note marginale. Sans texte : marges d'un article courant. */
export function textBounds(spans: ReadonlyArray<{left: number; right: number}>, pageWidth: number): {min: number; max: number} {
  if (!spans.length || !(pageWidth > 0)) return {min: 0.12, max: 0.88};
  const lefts = spans.map(span => span.left / pageWidth).sort((a, b) => a - b);
  const rights = spans.map(span => span.right / pageWidth).sort((a, b) => a - b);
  const at = (list: number[], q: number): number => list[Math.min(list.length - 1, Math.max(0, Math.floor(q * (list.length - 1))))]!;
  const min = Math.max(0.02, Math.min(0.45, at(lefts, 0.05)));
  const max = Math.min(0.98, Math.max(0.55, at(rights, 0.95)));
  return {min, max};
}

// ---- Correspondance texte : PDF ↔ source LaTeX ---------------------------

/** Lettres et chiffres seulement, en minuscules, sans accents ni ligatures,
 *  avec pour chaque caractère retenu son indice dans le texte d'origine. */
export function foldText(text: string): {folded: string; map: number[]} {
  let folded = "";
  const map: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const plain = (text[index] || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const character of plain) {
      if (/[\p{L}\p{N}]/u.test(character)) { folded += character; map.push(index); }
    }
  }
  return {folded, map};
}

/** Source LaTeX « lisible » : commentaires, noms de commandes, références et
 *  formules retirés ; `map` ramène chaque caractère gardé à la source. Le
 *  texte d'une commande de mise en forme (\emph{…}) reste. */
export function foldLatex(source: string): {folded: string; map: number[]} {
  let folded = "";
  const map: number[] = [];
  const dropArgument = /^\\(?:cite[a-zA-Z]*|ref|eqref|autoref|cref|Cref|label|pageref|url|href|includegraphics|input|include|bibliography[a-zA-Z]*|usepackage|documentclass|begin|end)\b/;
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (character === "%" && source[index - 1] !== "\\") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "$") {
      const close = source.indexOf("$", index + 1);
      index = close < 0 ? source.length : close + 1;
      continue;
    }
    if (character === "\\") {
      const rest = source.slice(index);
      const name = rest.match(/^\\([a-zA-Z@]+)\*?/);
      if (name) {
        index += name[0].length;
        if (dropArgument.test(rest)) {
          // arguments optionnels puis obligatoires : rien de lisible dedans
          for (let guard = 0; guard < 4; guard += 1) {
            while (source[index] === " ") index += 1;
            const open = source[index];
            if (open !== "{" && open !== "[") break;
            const shut = open === "{" ? "}" : "]";
            let depth = 0;
            for (; index < source.length; index += 1) {
              if (source[index] === open) depth += 1;
              else if (source[index] === shut && --depth === 0) { index += 1; break; }
            }
          }
        }
        continue;
      }
      index += 2; // \' \` \% … : accent ou caractère échappé
      continue;
    }
    const plain = character.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const letter of plain) {
      if (/[\p{L}\p{N}]/u.test(letter)) { folded += letter; map.push(index); }
    }
    index += 1;
  }
  return {folded, map};
}

function occurrences(haystack: string, needle: string, limit = 60): number[] {
  const found: number[] = [];
  if (!needle) return found;
  let at = haystack.indexOf(needle);
  while (at >= 0 && found.length < limit) { found.push(at); at = haystack.indexOf(needle, at + 1); }
  return found;
}

export interface SourceAnchor {
  from: {line: number; ch: number};
  to: {line: number; ch: number};
  /** Passage de la SOURCE (ce que la ronde demandera de réécrire). */
  text: string;
  /** `exact` : le passage du PDF retrouvé dans la source ; `line` : seule la
   *  ligne SyncTeX est connue, la ligne entière sert de passage. */
  match: "exact" | "line";
}

const positionAt = (source: string, offset: number): {line: number; ch: number} => {
  let line = 0, start = 0;
  for (let index = source.indexOf("\n"); index >= 0 && index < offset; index = source.indexOf("\n", index + 1)) {
    line += 1; start = index + 1;
  }
  return {line, ch: offset - start};
};

/** Retrouve dans la source le passage annoté sur le PDF, au plus près de la
 *  ligne donnée par SyncTeX (`lineHint`, base 0). Le texte du PDF est comparé
 *  lettres et chiffres seulement : césures, ligatures, accents et commandes
 *  LaTeX ne gênent pas. Sans correspondance : la ligne SyncTeX entière. */
export function anchorPdfQuote(source: string, quote: string, lineHint: number | null): SourceAnchor | null {
  const lines = source.split("\n");
  const fromLine = (line: number): SourceAnchor | null => {
    if (line < 0 || line >= lines.length) return null;
    const text = lines[line] || "";
    const lead = text.length - text.trimStart().length;
    return {from: {line, ch: lead}, to: {line, ch: text.length}, text: text.slice(lead), match: "line"};
  };
  const target = foldText(quote).folded;
  const tex = foldLatex(source);
  if (target.length >= 4) {
    const near = lineHint === null ? 0 : lines.slice(0, Math.max(0, lineHint)).reduce((sum, line) => sum + line.length + 1, 0);
    const pick = (starts: number[], length: number): [number, number] | null => {
      if (!starts.length) return null;
      const best = [...starts].sort((a, b) => Math.abs((tex.map[a] ?? 0) - near) - Math.abs((tex.map[b] ?? 0) - near))[0]!;
      const from = tex.map[best], last = tex.map[best + length - 1];
      return from === undefined || last === undefined ? null : [from, last + 1];
    };
    let span = pick(occurrences(tex.folded, target), target.length);
    if (!span && target.length > 24) {
      // passage coupé par une formule ou une référence : début et fin à part
      const head = target.slice(0, 16), tail = target.slice(-16);
      const heads = occurrences(tex.folded, head), tails = occurrences(tex.folded, tail);
      let best: [number, number] | null = null, bestDistance = Infinity;
      for (const start of heads) {
        const end = tails.find(candidate => candidate >= start && candidate - start <= target.length * 3);
        if (end === undefined) continue;
        const from = tex.map[start], last = tex.map[end + tail.length - 1];
        if (from === undefined || last === undefined) continue;
        const distance = Math.abs(from - near);
        if (distance < bestDistance) { best = [from, last + 1]; bestDistance = distance; }
      }
      span = best;
    }
    if (span) {
      const from = positionAt(source, span[0]), to = positionAt(source, span[1]);
      // trop loin de SyncTeX : homonyme ailleurs dans le document
      if (lineHint === null || Math.abs(from.line - lineHint) <= 40) {
        return {from, to, text: source.slice(span[0], span[1]), match: "exact"};
      }
    }
  }
  return lineHint === null ? null : fromLine(lineHint);
}

/** Élément de texte d'une page PDF (pdf.js), en points, origine en haut. */
export interface PageTextItem {
  str: string;
  x: number;
  top: number;
  width: number;
  height: number;
}

/** Convertit les `items` de pdf.js (origine en bas) en PageTextItem. */
export function pageTextItems(items: ReadonlyArray<{str?: string; transform?: number[]; width?: number; height?: number}>, pageHeight: number): PageTextItem[] {
  const out: PageTextItem[] = [];
  for (const item of items) {
    if (!item.str || !Array.isArray(item.transform)) continue;
    const size = Math.hypot(item.transform[2] || 0, item.transform[3] || 0) || item.height || 10;
    const baseline = pageHeight - (item.transform[5] || 0);
    out.push({str: item.str, x: item.transform[4] || 0, top: baseline - size * 0.82, width: item.width || 0, height: size});
  }
  return out;
}

/** Rectangles (fractions de page) du passage `source` (LaTeX) sur la page,
 *  au plus près de `nearTop` (points, SyncTeX). Pour dessiner une note du
 *  .tex sur le PDF. */
export function locateOnPage(items: readonly PageTextItem[], source: string, nearTop: number | null, page: {width: number; height: number}): number[][] | null {
  const target = foldLatex(source).folded;
  if (target.length < 3 || !(page.width > 0) || !(page.height > 0)) return null;
  let folded = "";
  const owner: Array<[number, number]> = [];
  items.forEach((item, itemIndex) => {
    const piece = foldText(item.str);
    folded += piece.folded;
    piece.map.forEach(charIndex => owner.push([itemIndex, charIndex]));
  });
  const nearest = (starts: number[]): number | null => {
    if (!starts.length) return null;
    if (nearTop === null) return starts[0]!;
    return [...starts].sort((a, b) => Math.abs(items[owner[a]![0]]!.top - nearTop) - Math.abs(items[owner[b]![0]]!.top - nearTop))[0]!;
  };
  let start = nearest(occurrences(folded, target));
  let length = target.length;
  if (start === null && target.length > 24) {
    const head = target.slice(0, 16), tail = target.slice(-16);
    const first = nearest(occurrences(folded, head));
    if (first !== null) {
      const end = occurrences(folded, tail).find(candidate => candidate >= first && candidate - first <= target.length * 3);
      if (end !== undefined) { start = first; length = end + tail.length - first; }
    }
  }
  if (start === null) return null;
  const rects: number[][] = [];
  const byItem = new Map<number, [number, number]>();
  for (let index = start; index < start + length; index += 1) {
    const [itemIndex, charIndex] = owner[index]!;
    const span = byItem.get(itemIndex);
    byItem.set(itemIndex, span ? [Math.min(span[0], charIndex), Math.max(span[1], charIndex)] : [charIndex, charIndex]);
  }
  for (const [itemIndex, [first, last]] of [...byItem.entries()].sort((a, b) => a[0] - b[0])) {
    const item = items[itemIndex]!;
    const count = Math.max(1, item.str.length);
    const x = item.x + item.width * (first / count);
    const width = item.width * ((last + 1 - first) / count);
    const rect = [x / page.width, item.top / page.height, width / page.width, item.height / page.height];
    // même ligne que le rectangle précédent : on prolonge
    const previous = rects[rects.length - 1];
    if (previous && Math.abs(previous[1]! - rect[1]!) < rect[3]! * 0.5 && rect[0]! >= previous[0]!) {
      previous[2] = Math.max(previous[2]!, rect[0]! + rect[2]! - previous[0]!);
      previous[3] = Math.max(previous[3]!, rect[3]!);
    } else rects.push(rect);
  }
  return rects.length ? rects : null;
}

// ---- Colonne commune -------------------------------------------------------

/** Une rangée de la colonne d'annotations, quelle que soit l'origine. */
export interface ColumnNote {
  id: string;
  number: number;
  color: NoteColor;
  /** Passage annoté, tel qu'on le lit (PDF) ou tel qu'écrit (.tex). */
  quote: string;
  note: string;
  page?: number | null;
  line?: number | null;
  lineEnd?: number | null;
  /** Nom de l'agent pour une note de Claude ; vide sinon. */
  agent?: string;
  unread?: boolean;
  active?: boolean;
  state?: {tone: string; icon: string; label: string} | null;
  src: "tex" | "pdf";
  /** Commentaire d'un relecteur importé de Word (reviewer_notes.ts). */
  reviewer?: boolean;
  /** Faux : pas de croix (un commentaire du relecteur ne se supprime pas). */
  removable?: boolean;
}

const escapeHtml = (value: string): string => String(value).replace(/[&<>"]/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
})[character] || character);

const PAGE_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/></svg>';
const CODE_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

/** « p. 3 · ligne 18 » : où lire la note, dans le PDF et dans la source. */
export function noteLocation(note: Pick<ColumnNote, "page" | "line" | "lineEnd">): string {
  const parts: string[] = [];
  if (note.page) parts.push(`<span class="tp-where">${PAGE_ICON}p. ${note.page}</span>`);
  if (note.line !== null && note.line !== undefined) {
    const label = note.lineEnd && note.lineEnd !== note.line ? `lignes ${note.line}-${note.lineEnd}` : `ligne ${note.line}`;
    parts.push(`<span class="tp-where">${CODE_ICON}${label}</span>`);
  }
  return parts.join('<span class="tp-dot">·</span>');
}

/** Rangée de la colonne : pastille de la couleur de la note, passage cité
 *  (deux lignes au plus, filet de la couleur), note, puis où la lire. */
export function columnItemHtml(note: ColumnNote): string {
  const ring = `atelier-annotation-number tp-ring note-c-${note.color}${note.reviewer ? " is-reviewer" : note.agent ? " is-agent" : ""}${note.unread ? " is-unread" : ""}`;
  const quote = note.quote.trim() ? `<span class="tp-quote">${escapeHtml(note.quote.replace(/\s+/g, " ").trim().slice(0, 240))}</span>` : "";
  const text = note.note.trim() ? `<span class="tp-note">${escapeHtml(note.note)}</span>` : "";
  const state = note.state
    ? `<span class="tp-state tone-${escapeHtml(note.state.tone)}"><span class="tp-ic">${note.state.icon}</span>${escapeHtml(note.state.label)}</span>`
    : "";
  const who = note.agent ? `<span class="tp-who">${escapeHtml(note.agent)}</span>` : "";
  const where = noteLocation(note);
  const meta = [who, state, where ? `<span class="tp-loc">${where}</span>` : ""].filter(Boolean).join('<span class="tp-dot">·</span>');
  return `<div class="tp-item note-c-${note.color}${note.active ? " is-active" : ""}" data-id="${escapeHtml(note.id)}" data-src="${note.src}" role="button" tabindex="0">`
    + `<span class="${ring}">${note.number}</span>`
    + `<span class="tp-body">${quote}${text}${meta ? `<span class="tp-meta">${meta}</span>` : ""}</span>`
    + (note.removable === false ? "" : `<button type="button" class="tp-x" data-x="${escapeHtml(note.id)}" title="Supprimer la note" aria-label="Supprimer la note">${CLOSE_ICON}</button>`) + "</div>";
}

/** Ordre du document : ligne de la source, puis colonne ; une note sans
 *  ligne connue suit, par page puis hauteur. */
export function compareNotes(
  left: {line?: number | null; ch?: number | null; page?: number | null; top?: number | null},
  right: {line?: number | null; ch?: number | null; page?: number | null; top?: number | null},
): number {
  const hasLeft = left.line !== null && left.line !== undefined, hasRight = right.line !== null && right.line !== undefined;
  if (hasLeft && hasRight) return (left.line! - right.line!) || ((left.ch || 0) - (right.ch || 0));
  if (hasLeft !== hasRight) return hasLeft ? -1 : 1;
  return ((left.page || 0) - (right.page || 0)) || ((left.top || 0) - (right.top || 0));
}

/** Id de note admis par l'outil atelier_revision (lettres, chiffres, - et _). */
export function pdfNoteId(id: string | number): string {
  return `pdf_${String(id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 56) || "x"}`;
}

/** Clé de la demande « Réviser avec l'agent » posée depuis l'onglet PDF :
 *  le studio LaTeX la lit à l'ouverture si l'onglet n'était pas ouvert. */
export const reviewRequestKey = (texPath: string): string => `atelier.texReview:${texPath}`;

/** Section d'une ligne (« 2 · Methods ») et libellé d'état de ronde : les
 *  mêmes dans les deux colonnes. */
export {sectionOf, stateLabel} from "./latex/revision_round";
