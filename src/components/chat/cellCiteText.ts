// Chiffre cité juste avant une pastille « cellule N » (noyau Python, A).

/** Un nombre tel que l'agent l'écrit : signe, virgule décimale, pourcentage. */
const CITED_NUMBER = /[-\u2212\u2013]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?:[eE][-+]?\d+)?(?:[ \u00a0\u202f]?%)?/gu;

/** Dernier nombre avant une citation de cellule, dans la même phrase ; un
 *  nombre collé à une lettre (1er, x2) n'en est pas un. */
export function citedValue(before: string): string | null {
  const sentence = before.slice(-160).split(/(?<=[.!?;])\s|\n/u).pop() ?? "";
  let last: string | null = null;
  for (const m of sentence.matchAll(CITED_NUMBER)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (/[\p{L}_]/u.test(sentence[start - 1] ?? "") || /[\p{L}_]/u.test(sentence[end] ?? "")) continue;
    last = m[0].trim();
  }
  return last;
}

/** Texte du bloc avant la pastille, depuis la pastille précédente : le
 *  chiffre que l'agent a écrit juste avant la citation. */
export function textBefore(el: HTMLElement): string {
  const block = el.closest("p, li, td, th") ?? el.parentElement;
  if (!block) return "";
  const range = document.createRange();
  range.selectNodeContents(block);
  const pills = [...block.querySelectorAll(".cell-cite")];
  const previous = pills[pills.indexOf(el) - 1];
  if (previous) range.setStartAfter(previous);
  range.setEndBefore(el);
  return range.toString();
}
