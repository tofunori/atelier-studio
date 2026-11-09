// Passage révisé dans le chat (variante E, 2026-11-01) : l'agent envoie
// l'ancienne et la nouvelle version dans un bloc ```revision, l'app calcule
// les changements mot à mot. Calcul pur, chargé avec le bloc (chunk lazy).

export type RevisionParts = { before: string; after: string; complete: boolean };
export type WordSegment = { kind: "same" | "add" | "del"; text: string };

const BEFORE_MARK = /^-{3}\s*(avant|before|original)\s*:?\s*$/i;
const AFTER_MARK = /^\+{3}\s*(après|apres|after|revised|révisé|revise)\s*:?\s*$/i;

/** Sépare les deux versions. Sans marqueur « après » (bloc en cours de
 * stream ou mal formé), complete=false : l'appelant rend le texte brut. */
export function parseRevision(source: string): RevisionParts {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex(line => BEFORE_MARK.test(line.trim()));
  const mid = lines.findIndex((line, i) => i > start && AFTER_MARK.test(line.trim()));
  if (start < 0 || mid < 0) return { before: "", after: source.trim(), complete: false };
  return {
    before: lines.slice(start + 1, mid).join("\n").trim(),
    after: lines.slice(mid + 1).join("\n").trim(),
    complete: true,
  };
}

// Un mot emporte l'espace qui le suit : sans cela, la plus longue sous-suite
// commune s'accroche aux espaces et rate les mots (« MODIS » non reconnu).
// Une commande LaTeX à arguments (\citep{a, b}, \ref{fig:x}) reste UN mot,
// même avec des espaces dedans : la couper la rendrait illisible à moitié.
const TOKEN = /(?:\\[A-Za-z]+\*?(?:\[[^\]\n]*\])*(?:\{[^{}\n]*\})+[^\s]*|[^\s]+)\s*|\s+/g;

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** Au-delà, la zone centrale passe en un seul retrait + ajout : un passage
 * énorme ne doit pas geler le fil. */
const LCS_BUDGET = 2_000_000;

function rawDiff(a: string[], b: string[]): WordSegment[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const out: WordSegment[] = [];
  for (let i = 0; i < start; i++) out.push({ kind: "same", text: a[i] });
  const n = endA - start;
  const m = endB - start;
  if (n * m > LCS_BUDGET || n === 0 || m === 0) {
    for (let i = start; i < endA; i++) out.push({ kind: "del", text: a[i] });
    for (let j = start; j < endB; j++) out.push({ kind: "add", text: b[j] });
  } else {
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
        out.push({ kind: "same", text: a[start + i] }); i++; j++;
      } else if (i < n && (j === m || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
        out.push({ kind: "del", text: a[start + i] }); i++;
      } else {
        out.push({ kind: "add", text: b[start + j] }); j++;
      }
    }
  }
  for (let i = endA; i < a.length; i++) out.push({ kind: "same", text: a[i] });
  return out;
}

const isBlank = (s: string) => /^\s*$/.test(s);

/** Un petit mot commun (« of », « the », « de ») coincé entre deux changements
 * les hacherait : il passe dans la zone modifiée, retiré puis réécrit. */
function absorbShortCommon(raw: WordSegment[]): WordSegment[] {
  const out: WordSegment[] = [];
  const neighbour = (from: number, step: number) => {
    for (let k = from; k >= 0 && k < raw.length; k += step) if (!isBlank(raw[k].text) || raw[k].kind !== "same") return raw[k].kind;
    return "same";
  };
  raw.forEach((seg, k) => {
    if (seg.kind === "same" && !isBlank(seg.text) && seg.text.trim().length <= 3
      && neighbour(k - 1, -1) !== "same" && neighbour(k + 1, 1) !== "same") {
      out.push({ kind: "del", text: seg.text }, { kind: "add", text: seg.text });
    } else out.push(seg);
  });
  return out;
}

/** Diff mot à mot, regroupé pour la lecture : dans chaque zone modifiée, tout
 * le retiré d'abord puis tout l'ajouté (« ancien nouveau », jamais
 * « an-nou-cien-veau »). Un passage commun plus court que les changements qui
 * l'entourent est absorbé (nettoyage « sémantique » à la diff-match-patch) :
 * une phrase réécrite reste UNE phrase barrée puis UNE phrase soulignée, au
 * lieu d'être hachée sur chaque « the » ou « fire slope » retrouvé. */
export function diffWords(before: string, after: string): WordSegment[] {
  const raw = absorbShortCommon(rawDiff(tokenize(before), tokenize(after)));
  type Item = { same: string } | { del: string; add: string };
  const items: Item[] = [];
  for (const seg of raw) {
    const last = items[items.length - 1];
    if (seg.kind === "same") {
      if (last && "same" in last) last.same += seg.text; else items.push({ same: seg.text });
    } else {
      let zone = last && !("same" in last) ? last : null;
      if (!zone) { zone = { del: "", add: "" }; items.push(zone); }
      if (seg.kind === "del") zone.del += seg.text; else zone.add += seg.text;
    }
  }
  const size = (z: { del: string; add: string }) => Math.max(z.del.trim().length, z.add.trim().length);
  for (let merged = true; merged;) {
    merged = false;
    for (let k = 1; k < items.length - 1; k++) {
      const left = items[k - 1];
      const mid = items[k];
      const right = items[k + 1];
      if (!("same" in mid) || "same" in left || "same" in right) continue;
      if (mid.same.trim().length > Math.min(size(left), size(right))) continue;
      items.splice(k - 1, 3, { del: left.del + mid.same + right.del, add: left.add + mid.same + right.add });
      merged = true;
      break;
    }
  }
  const out: WordSegment[] = [];
  const pushSame = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last?.kind === "same") last.text += text; else out.push({ kind: "same", text });
  };
  for (const item of items) {
    if ("same" in item) { pushSame(item.same); continue; }
    // espaces de bord rendus au texte commun : le barré et le souligné
    // s'arrêtent sur les mots
    const shown = item.add.trim() ? item.add : item.del;
    pushSame(/^\s*/.exec(shown)?.[0] ?? "");
    if (item.del.trim()) out.push({ kind: "del", text: item.del.trim() });
    if (item.add.trim()) out.push({ kind: "add", text: item.add.trim() });
    pushSame(/\s*$/.exec(shown)?.[0] ?? "");
  }
  return out;
}

/** Bilan affiché sous le passage : zones modifiées, et parmi elles celles qui
 * retirent du texte. */
export function revisionStats(segments: WordSegment[]): { changes: number; removals: number } {
  let changes = 0;
  let removals = 0;
  let inChange = false;
  let removed = false;
  for (const seg of segments) {
    if (seg.kind === "same") {
      if (inChange) { changes++; if (removed) removals++; }
      inChange = false; removed = false;
    } else {
      inChange = true;
      if (seg.kind === "del") removed = true;
    }
  }
  if (inChange) { changes++; if (removed) removals++; }
  return { changes, removals };
}

// --- LaTeX lisible -------------------------------------------------------
// Rendu de lecture seulement : la copie garde toujours le LaTeX d'origine.

export type TexPiece = { kind: "text" | "cite" | "em" | "strong"; text: string };

/** « Menounos2025 » → « Menounos, 2025 » ; « smithEtAl2019a » → « smith et al., 2019a ». */
export function citeKeyLabel(key: string): string {
  const m = /^([A-Za-z][A-Za-z'-]*?)(EtAl|etal)?[_:-]?(\d{4}[a-z]?)$/.exec(key.trim());
  if (!m) return key.trim();
  return `${m[1]}${m[2] ? " et al." : ""}, ${m[3]}`;
}

const TEX_PIECE = /\\(citep|citet|cite|citeauthor|citeyear|parencite|textcite)\*?(?:\[[^\]\n]*\])*\{([^{}\n]*)\}|\\(emph|textit|textbf)\{([^{}\n]*)\}|\\([A-Za-z]+)\{\}/g;

export function texPieces(text: string): TexPiece[] {
  const pieces: TexPiece[] = [];
  const push = (kind: TexPiece["kind"], value: string) => {
    if (!value) return;
    const last = pieces[pieces.length - 1];
    if (kind === "text" && last?.kind === "text") last.text += value;
    else pieces.push({ kind, text: value });
  };
  const plain = (s: string) => s.replace(/(?<!\\)~/g, " ").replace(/\\([%&$#_])/g, "$1");
  let at = 0;
  for (const match of text.matchAll(TEX_PIECE)) {
    push("text", plain(text.slice(at, match.index)));
    if (match[1]) {
      const labels = match[2].split(",").map(citeKeyLabel).filter(Boolean);
      if (match[1] === "citet" || match[1] === "textcite") {
        push("cite", labels.map(l => l.replace(/, (\d{4}[a-z]?)$/, " ($1)")).join("; "));
      } else {
        push("cite", `(${labels.join("; ")})`);
      }
    } else if (match[3]) {
      push(match[3] === "textbf" ? "strong" : "em", plain(match[4]));
    } else if (match[5]) {
      push("cite", match[5]);
    }
    at = (match.index ?? 0) + match[0].length;
  }
  push("text", plain(text.slice(at)));
  return pieces;
}
