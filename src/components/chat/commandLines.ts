// Découpe d'une commande shell pour la carte d'approbation (ApprovalCard).

/** Coupe une commande shell aux « ; », « && », « || » et retours de premier
 *  niveau — jamais dans une chaîne ni dans $( … ). */
export function commandLines(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = "";
  let depth = 0;
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && quote !== "'" && i + 1 < command.length) cur += command[++i];
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "\\" && i + 1 < command.length) { cur += ch + command[++i]; continue; }
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === ";" || ch === "\n")) { push(); continue; }
    else if (depth === 0 && (ch === "&" || ch === "|") && command[i + 1] === ch) {
      cur = `${cur.trimEnd()} ${ch}${ch}`;
      i++;
      push();
      continue;
    }
    cur += ch;
  }
  push();
  return out;
}
