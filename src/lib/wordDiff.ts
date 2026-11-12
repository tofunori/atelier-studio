/** Mots retirés et ajoutés entre deux phrases (plus longue sous-suite commune). */
export function wordDiff(before: string, after: string): Array<[" " | "-" | "+", string]> {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 250_000) return [["-", before], ["+", after]];
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: Array<[" " | "-" | "+", string]> = [];
  const push = (op: " " | "-" | "+", text: string) => {
    const last = out[out.length - 1];
    if (last && last[0] === op) last[1] += text; else out.push([op, text]);
  };
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push(" ", a[i]!); i += 1; j += 1; }
    else if (i < a.length && (j >= b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) { push("-", a[i]!); i += 1; }
    else { push("+", b[j]!); j += 1; }
  }
  return out;
}
