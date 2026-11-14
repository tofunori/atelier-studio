// Annotations de réponse (plan « sélection annotable », 2026-08-22).
//
// Une annotation = un passage de la réponse + un commentaire FACULTATIF. Elle
// remplace les anciennes marques « hl » / « ul » : une annotation sans
// commentaire fait exactement le travail d'un surlignage, en mieux ancré.

export type Mark = { text: string; kind: "an"; note?: string; color?: string };

// Les fils déjà ouverts portent des marques hl/ul dans localStorage : on les
// relit comme des annotations muettes plutôt que de les jeter.
export function migrateMarks(raw: unknown): Mark[] {
  if (!Array.isArray(raw)) return [];
  const out: Mark[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { text, note, color } = entry as { text?: unknown; note?: unknown; color?:unknown };
    if (typeof text !== "string" || !text.trim()) continue;
    out.push(typeof note === "string" && note ? { text, kind: "an", note } : { text, kind: "an" });
    if(typeof color==="string") out[out.length-1]!.color=color;
  }
  return out;
}

/** En-tête du bloc — partagé par l'écriture et la relecture, pour que le
 *  rendu du fil ne puisse pas dériver du format réellement envoyé. */
export const ANNOTATION_BLOCK_HEADER = "Annotations sur ma réponse :";
/** Ce que le bloc écrit quand l'annotation n'a pas de commentaire. */
export const ANNOTATION_NO_NOTE = "(sans commentaire)";

// Bloc unique envoyé à l'agent, en tête du contexte du prochain message.
export function buildAnnotationBlock(marks: Mark[]): string {
  marks=marks.filter(mark=>!mark.color);
  if (!marks.length) return "";
  const lines = [ANNOTATION_BLOCK_HEADER];
  marks.forEach((mark, i) => {
    lines.push(`[${i + 1}] « ${mark.text.replace(/\s+/g, " ").trim()} »`);
    lines.push(`    → ${mark.note?.trim() || ANNOTATION_NO_NOTE}`);
  });
  return lines.join("\n");
}

export type ParsedAnnotations = {
  items: { text: string; note: string | null }[];
  /** Ce que l'utilisateur a réellement tapé sous le bloc. */
  tail: string;
};

const ITEM_RE = /^\[(\d+)\] « (.+) »$/;

/** Relit un message utilisateur qui commence par un bloc d'annotations.
 *
 * Sert UNIQUEMENT au rendu : le texte envoyé au modèle reste celui que
 * buildAnnotationBlock a écrit. Rend `null` dès que la forme n'est pas
 * exactement celle attendue — la bulle retombe alors sur son texte brut,
 * jamais sur un rendu partiel qui perdrait du contenu. */
export function parseAnnotationBlock(text: string): ParsedAnnotations | null {
  const lines = text.split("\n");
  if (lines[0] !== ANNOTATION_BLOCK_HEADER) return null;

  const items: ParsedAnnotations["items"] = [];
  let i = 1;
  while (i < lines.length) {
    const head = ITEM_RE.exec(lines[i]);
    // la numérotation doit se suivre : un « [7] » isolé n'est pas notre bloc
    if (!head || Number(head[1]) !== items.length + 1) break;
    const noteLine = lines[i + 1];
    if (noteLine === undefined || !noteLine.startsWith("    → ")) break;
    i += 2;

    // un commentaire multi-lignes déborde sur les lignes suivantes : on les
    // reprend jusqu'à la prochaine entrée ou la ligne vide qui sépare le bloc
    // du message tapé
    const note = [noteLine.slice("    → ".length)];
    while (i < lines.length && lines[i] !== "" && !ITEM_RE.test(lines[i])) {
      note.push(lines[i]);
      i += 1;
    }
    const joined = note.join("\n");
    items.push({
      text: head[2],
      note: joined === ANNOTATION_NO_NOTE ? null : joined,
    });
  }

  if (!items.length) return null;
  return { items, tail: lines.slice(i).join("\n").trim() };
}

// Un caractère de mot : lettres, chiffres, apostrophes et traits d'union
// internes (« l'annexe », « sous-bassin »).
const WORD_CHAR = /[\p{L}\p{N}_'’-]/u;

/** Étend la sélection aux mots entiers (2026-11-14) : une annotation prise
 *  au vol (« ort que … 19,9 es ») garde « rapporte que … 19,9 est ». La
 *  sélection visible suit, pour que la marque posée dans la réponse et le
 *  passage envoyé restent le même texte. Seuls les bouts posés dans un nœud
 *  texte bougent ; un bout entre deux balises est déjà une frontière. */
export function snapSelectionToWords(sel: Selection | null): void {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const isWord = (ch: string | undefined) => ch !== undefined && WORD_CHAR.test(ch);
  let start = range.startOffset;
  let end = range.endOffset;
  const startText = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.textContent ?? "" : null;
  const endText = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.textContent ?? "" : null;
  if (startText != null) while (start > 0 && isWord(startText[start - 1]) && isWord(startText[start])) start -= 1;
  if (endText != null) while (end < endText.length && isWord(endText[end - 1]) && isWord(endText[end])) end += 1;
  if (start === range.startOffset && end === range.endOffset) return;
  const snapped = range.cloneRange();
  snapped.setStart(range.startContainer, start);
  snapped.setEnd(range.endContainer, end);
  sel.removeAllRanges();
  sel.addRange(snapped);
}

/** Bouts ouverts d'un passage cité : « … » devant un passage qui commence en
 *  cours de phrase (minuscule), derrière un passage qui s'arrête avant sa
 *  ponctuation finale. Rendu seulement : le texte envoyé ne change pas. */
export function quoteEdges(text: string): { open: boolean; close: boolean } {
  const t = text.trim();
  return { open: /^\p{Ll}/u.test(t), close: !/[.!?:;…»)\]"”]$/u.test(t) };
}
