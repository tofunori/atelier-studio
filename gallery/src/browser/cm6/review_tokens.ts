// Diff de revue calé sur les mots et les commandes LaTeX — pur, sans import
// CodeMirror (testable sous node).
//
// Le diff caractère de @codemirror/merge coupe là où le texte commun le
// permet : `\alpha` → `\bar{\alpha}` s'affichait `\` + [bar{\] + alpha + [}],
// une commande en trois morceaux (Thierry 2026-09-30, maquette A). Un ajout ou
// un retrait pur glisse d'abord vers une position qui ne coupe rien
// (`\bar{` et `}` autour de `\alpha` intact) ; sinon on élargit le changement
// au texte commun qui le touche tant que sa frontière coupe un mot ou une
// commande, puis on fusionne les changements qui se rejoignent.

export interface ReviewChange { fromA: number; toA: number; fromB: number; toB: number }

// Au-delà, on garde la frontière d'origine : un « mot » de 60 caractères est
// une URL ou une clé, l'élargir noierait le vrai changement.
const MAX_GROW = 48;
const WORD = /[\p{L}\p{N}_]/u;

const isWord = (ch: string) => !!ch && WORD.test(ch);

/** La frontière entre `left` et `right` tombe-t-elle au milieu d'un mot ou
 * d'une commande (`\` suivi de sa lettre ou de son symbole) ? */
export function splitsToken(left: string, right: string) {
  if (!left || !right) return false;
  if (isWord(left) && isWord(right)) return true;
  return left === "\\" && !/\s/.test(right);
}

/** Un ajout ou un retrait pur peut glisser le long du texte qui le répète :
 * retirer « , car … longtemps » après « touchés » s'écrit aussi « s, car …
 * longtemp » après « touché ». Le diff choisit l'une ou l'autre ; on garde la
 * position dont les bords ne coupent aucun mot, pour ne pas élargir ensuite
 * le retrait au mot voisin. */
function slideToBoundary(c: ReviewChange, a: string, b: string, lowA: number, lowB: number, highA: number, highB: number): ReviewChange {
  const del = c.fromA < c.toA && c.fromB === c.toB, ins = c.fromB < c.toB && c.fromA === c.toA;
  if (!del && !ins) return c;
  const s = del ? a : b;
  const cuts = (from: number, to: number) => (splitsToken(s[from - 1], s[from]) ? 1 : 0) + (splitsToken(s[to - 1], s[to]) ? 1 : 0);
  let from = del ? c.fromA : c.fromB, to = del ? c.toA : c.toB, shift = 0;
  let best = {shift: 0, score: cuts(from, to)};
  if (!best.score) return c;
  // Glissements possibles : à gauche tant que le caractère précédent répète le
  // dernier du changement, à droite tant que le suivant répète le premier.
  for (let k = 1; k <= MAX_GROW && c.fromA - k >= lowA && c.fromB - k >= lowB && s[from - k] === s[to - k]; k++) {
    const score = cuts(from - k, to - k);
    if (score < best.score) best = {shift: -k, score};
    if (!score) break;
  }
  for (let k = 1; best.score && k <= MAX_GROW && c.toA + k <= highA && c.toB + k <= highB && s[from + k - 1] === s[to + k - 1]; k++) {
    const score = cuts(from + k, to + k);
    if (score < best.score) best = {shift: k, score};
    if (!score) break;
  }
  shift = best.shift;
  return {fromA: c.fromA + shift, toA: c.toA + shift, fromB: c.fromB + shift, toB: c.toB + shift};
}

/** Élargit chaque changement au mot ou à la commande qu'il entame, sans
 * jamais mordre sur le changement voisin, puis fusionne ceux qui se touchent.
 * Les positions restent cohérentes : on n'absorbe que du texte commun, donc
 * le même nombre de caractères des deux côtés. */
export function snapChangesToTokens(changes: readonly ReviewChange[], a: string, b: string): ReviewChange[] {
  const out: ReviewChange[] = [];
  for (let i = 0; i < changes.length; i++) {
    const prev = out[out.length - 1];
    const lowA = prev ? prev.toA : 0, lowB = prev ? prev.toB : 0;
    const next = changes[i + 1];
    const highA = next ? next.fromA : a.length, highB = next ? next.fromB : b.length;
    let {fromA, toA, fromB, toB} = slideToBoundary(changes[i], a, b, lowA, lowB, highA, highB);
    for (let n = 0; n < MAX_GROW && fromA > lowA && fromB > lowB; n++) {
      const cut = (fromA < toA && splitsToken(a[fromA - 1], a[fromA]))
        || (fromB < toB && splitsToken(b[fromB - 1], b[fromB]));
      if (!cut) break;
      fromA--; fromB--;
    }
    for (let n = 0; n < MAX_GROW && toA < highA && toB < highB; n++) {
      const cut = (toA > fromA && splitsToken(a[toA - 1], a[toA]))
        || (toB > fromB && splitsToken(b[toB - 1], b[toB]));
      if (!cut) break;
      toA++; toB++;
    }
    if (prev && fromA <= prev.toA && fromB <= prev.toB) {
      prev.toA = Math.max(prev.toA, toA);
      prev.toB = Math.max(prev.toB, toB);
    } else {
      out.push({fromA, toA, fromB, toB});
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diff de revue LaTeX « par ligne, puis par mot » (diff raffiné v2,
// 2026-11-09). Le diff caractère sur tout le texte apparie des fragments d'une
// phrase à l'autre et peut marquer retirée puis rajoutée une ligne intacte
// (un commentaire entre deux retouches). On aligne d'abord les LIGNES ; seules
// les lignes remplacées reçoivent un diff fin, calé sur les mots, nettoyé des
// micro-égalités (« de », une virgule) qui hachent la lecture. Un bloc presque
// entièrement réécrit est montré comme un remplacement entier.

type DiffFn = (a: string, b: string) => readonly ReviewChange[];

// Au-delà, plus de caractère libre pour coder une ligne : on garde le diff
// caractère d'origine (document énorme, cas limite).
const LINE_CODE_BASE = 0x100, LINE_CODE_MAX = 0xd7ff;
// Part de texte commun (hors blancs) sous laquelle un bloc remplacé est
// montré en entier plutôt que mot à mot.
const REWRITE_RATIO = 0.4;

function splitLines(text: string): string[] {
  const lines = text.split(/(?<=\n)/);
  return lines.length === 1 && lines[0] === "" ? [] : lines;
}

/** Une égalité trop courte ou sans mot entre deux changements est absorbée :
 * « remains [negative] in » ne doit pas devenir trois îlots pour une virgule. */
function mergeSmallGaps(changes: ReviewChange[], a: string): ReviewChange[] {
  const out: ReviewChange[] = [];
  for (const change of changes) {
    const prev = out[out.length - 1];
    if (prev) {
      const gap = a.slice(prev.toA, change.fromA);
      if (gap.length <= 2 || /^[\s\p{P}]*$/u.test(gap)) {
        prev.toA = change.toA; prev.toB = change.toB;
        continue;
      }
    }
    out.push({...change});
  }
  return out;
}

const nonSpace = (text: string) => text.replace(/\s+/g, "").length;

/** Diff fin d'un bloc de lignes remplacées, positions relatives au bloc. */
function blockDiff(blockA: string, blockB: string, diff: DiffFn): ReviewChange[] {
  const changes = mergeSmallGaps(snapChangesToTokens(diff(blockA, blockB), blockA, blockB), blockA);
  const common = nonSpace(blockA) - changes.reduce((sum, c) => sum + nonSpace(blockA.slice(c.fromA, c.toA)), 0);
  const size = Math.max(nonSpace(blockA), nonSpace(blockB));
  if (size && common / size < REWRITE_RATIO) {
    // Réécriture : un seul remplacement, sans la fin de ligne commune.
    let end = 0;
    while (end < Math.min(blockA.length, blockB.length) && blockA[blockA.length - 1 - end] === "\n" && blockB[blockB.length - 1 - end] === "\n") end++;
    return [{fromA: 0, toA: blockA.length - end, fromB: 0, toB: blockB.length - end}];
  }
  return changes;
}

/** Diff de revue LaTeX : lignes d'abord, puis mots dans les lignes remplacées. */
export function reviewDiffByLine(a: string, b: string, diff: DiffFn): ReviewChange[] {
  const linesA = splitLines(a), linesB = splitLines(b);
  const codes = new Map<string, string>();
  const encode = (lines: string[]) => {
    let out = "";
    for (const line of lines) {
      let code = codes.get(line);
      if (code === undefined) {
        const next = LINE_CODE_BASE + codes.size;
        if (next > LINE_CODE_MAX) return null;
        code = String.fromCharCode(next); codes.set(line, code);
      }
      out += code;
    }
    return out;
  };
  const encA = encode(linesA), encB = encode(linesB);
  if (encA === null || encB === null) return snapChangesToTokens(diff(a, b), a, b);
  const offsets = (lines: string[]) => {
    const result = [0];
    for (const line of lines) result.push(result[result.length - 1] + line.length);
    return result;
  };
  const offA = offsets(linesA), offB = offsets(linesB);
  const out: ReviewChange[] = [];
  for (const block of diff(encA, encB)) {
    const fromA = offA[block.fromA], toA = offA[block.toA], fromB = offB[block.fromB], toB = offB[block.toB];
    if (fromA === toA || fromB === toB) { out.push({fromA, toA, fromB, toB}); continue; }
    for (const c of blockDiff(a.slice(fromA, toA), b.slice(fromB, toB), diff)) {
      out.push({fromA: fromA + c.fromA, toA: fromA + c.toA, fromB: fromB + c.fromB, toB: fromB + c.toB});
    }
  }
  return out;
}
