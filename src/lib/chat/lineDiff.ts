// Diff ligne à ligne des fichiers modifiés du fil (refonte 2026-10-18) :
// calcul pur, sans CodeMirror, pour que la ligne « Modifié / Créé » porte ses
// +N −N et que le diff déplié se dessine sans charger d'éditeur.

export type DiffRow =
  | { kind: "ctx" | "add" | "del"; text: string; oldNo: number | null; newNo: number | null }
  | { kind: "hunk"; text: string };


const splitLines = (text: string): string[] => {
  if (text === "") return [];
  const lines = text.split("\n");
  // un fichier terminé par un saut de ligne n'a pas de ligne vide finale
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/** Au-delà de ce produit, la zone centrale est donnée en bloc (retrait puis
 * ajout) plutôt que par plus longue sous-séquence commune : un gros fichier
 * réécrit ne doit pas geler le fil. */
const LCS_BUDGET = 4_000_000;

export function diffLines(before: string, after: string): DiffRow[] {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  const rows: DiffRow[] = [];
  for (let i = 0; i < start; i++) rows.push({ kind: "ctx", text: a[i], oldNo: i + 1, newNo: i + 1 });

  const n = endA - start;
  const m = endB - start;
  if (n * m > LCS_BUDGET || n === 0 || m === 0) {
    for (let i = start; i < endA; i++) rows.push({ kind: "del", text: a[i], oldNo: i + 1, newNo: null });
    for (let j = start; j < endB; j++) rows.push({ kind: "add", text: b[j], oldNo: null, newNo: j + 1 });
  } else {
    // table LCS sur la zone centrale seulement (préfixe et suffixe retirés)
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] = a[start + i] === b[start + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        rows.push({ kind: "ctx", text: a[start + i], oldNo: start + i + 1, newNo: start + j + 1 });
        i++; j++;
      } else if (i < n && (j === m || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
        // à égalité, les retraits passent d'abord : « − ancien » au-dessus de « + nouveau »
        rows.push({ kind: "del", text: a[start + i], oldNo: start + i + 1, newNo: null });
        i++;
      } else {
        rows.push({ kind: "add", text: b[start + j], oldNo: null, newNo: start + j + 1 });
        j++;
      }
    }
  }
  const shift = b.length - a.length;
  for (let i = endA; i < a.length; i++) rows.push({ kind: "ctx", text: a[i], oldNo: i + 1, newNo: i + 1 + shift });
  return rows;
}

/** Diff unifié brut (Codex, repli git) : seules les lignes de contenu et les
 * en-têtes de bloc @@ sont gardés, numérotés d'après ces en-têtes. */
export function parseUnifiedDiff(text: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const line of text.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      rows.push({ kind: "hunk", text: hunk[3].trim() });
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) rows.push({ kind: "add", text: line.slice(1), oldNo: null, newNo: newNo++ });
    else if (line.startsWith("-")) rows.push({ kind: "del", text: line.slice(1), oldNo: oldNo++, newNo: null });
    else if (line.startsWith(" ")) rows.push({ kind: "ctx", text: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
    else if (line.startsWith("\\")) continue; // « \ No newline at end of file »
    else if (line === "") continue;
    else inHunk = false; // en-tête du fichier suivant (diff --git, index…)
  }
  return rows;
}

export function countChanges(rows: DiffRow[]): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const row of rows) {
    if (row.kind === "add") add++;
    else if (row.kind === "del") del++;
  }
  return { add, del };
}

/** Replie les longues suites inchangées : `context` lignes gardées de chaque
 * côté d'une modification, repli seulement au-delà de `minFold` lignes. */
export function foldUnchanged<R extends DiffRow>(rows: R[], context = 3, minFold = 8): (R | { kind: "fold"; rows: R[] })[] {
  const changed = rows.map((row) => row.kind === "add" || row.kind === "del");
  if (!changed.some(Boolean)) return rows;
  const keep = rows.map((row) => row.kind !== "ctx");
  changed.forEach((isChanged, index) => {
    if (!isChanged) return;
    for (let k = Math.max(0, index - context); k <= Math.min(rows.length - 1, index + context); k++) keep[k] = true;
  });
  const items: (R | { kind: "fold"; rows: R[] })[] = [];
  let run: R[] = [];
  const flush = () => {
    if (run.length >= minFold) items.push({ kind: "fold", rows: run });
    else items.push(...run);
    run = [];
  };
  rows.forEach((row, index) => {
    if (keep[index]) { flush(); items.push(row); } else run.push(row);
  });
  flush();
  return items;
}

/** Plages [début, fin[ changées dans deux lignes appariées, au mot près. */
export type MarkRange = [number, number];

const tokenize = (line: string) => line.match(/\w+|\s+|[^\w\s]/gu) ?? [];

export function wordMarks(before: string, after: string): [MarkRange[], MarkRange[]] | null {
  return wordMarksScored(before, after)?.marks ?? null;
}

/** Marques et part des caractères visibles communs aux deux lignes. */
function wordMarksScored(before: string, after: string): { marks: [MarkRange[], MarkRange[]]; score: number } | null {
  const a = tokenize(before);
  const b = tokenize(after);
  if (!a.length || !b.length || a.length * b.length > 40_000) return null;
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const common = table[0];
  // lignes trop différentes : marquer chaque mot serait du bruit
  const commonChars = (() => {
    let chars = 0;
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { if (a[i].trim()) chars += a[i].length; i++; j++; }
      else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
      else j++;
    }
    return chars;
  })();
  const visible = Math.max(before.replace(/\s/g, "").length, after.replace(/\s/g, "").length);
  const score = commonChars / Math.max(1, visible);
  if (!common || score < 0.4) return null;

  const marksA: MarkRange[] = [];
  const marksB: MarkRange[] = [];
  const push = (marks: MarkRange[], from: number, to: number) => {
    const last = marks[marks.length - 1];
    if (last && last[1] === from) last[1] = to;
    else marks.push([from, to]);
  };
  let i = 0;
  let j = 0;
  let posA = 0;
  let posB = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      posA += a[i++].length;
      posB += b[j++].length;
    } else if (j >= b.length || (i < a.length && table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      push(marksA, posA, posA + a[i].length);
      posA += a[i++].length;
    } else {
      push(marksB, posB, posB + b[j].length);
      posB += b[j++].length;
    }
  }
  return { marks: [marksA, marksB], score };
}

/** Appariement des lignes retirées et ajoutées d'un même bloc : chaque ligne
 * retirée répond à la ligne ajoutée la plus proche encore libre (un bloc trop
 * grand n'est pas apparié : ce serait une réécriture, pas une retouche). */
export function pairChangedLines(rows: DiffRow[]): Map<number, MarkRange[]> {
  const marks = new Map<number, MarkRange[]>();
  let index = 0;
  while (index < rows.length) {
    if (rows[index].kind !== "del") { index++; continue; }
    const dels: number[] = [];
    while (index < rows.length && rows[index].kind === "del") dels.push(index++);
    const adds: number[] = [];
    while (index < rows.length && rows[index].kind === "add") adds.push(index++);
    if (dels.length * adds.length > 400) continue;
    const used = new Set<number>();
    for (const del of dels) {
      let best: { add: number; marks: [MarkRange[], MarkRange[]]; score: number } | null = null;
      for (const add of adds) {
        if (used.has(add)) continue;
        const scored = wordMarksScored(rows[del].text, rows[add].text);
        if (scored && (!best || scored.score > best.score)) best = { add, ...scored };
      }
      if (!best) continue;
      used.add(best.add);
      if (best.marks[0].length) marks.set(del, best.marks[0]);
      if (best.marks[1].length) marks.set(best.add, best.marks[1]);
    }
  }
  return marks;
}
