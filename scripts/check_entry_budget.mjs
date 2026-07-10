// Garde-fou budget d'entrée (plan 022) — à lancer APRÈS `npx vite build`.
// Échoue si l'entrée ré-embarque un module sorti du chemin critique
// (xterm, katex, remark-math) ou dépasse le budget de taille.
// Usage : node scripts/check_entry_budget.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ASSETS = join(process.cwd(), "dist", "assets");
const BUDGET_KB = 950; // entrée mesurée 864 KB min (2026-07-10) + marge

const entries = readdirSync(ASSETS).filter((f) => /^index-.*\.js$/.test(f));
// l'entrée est le plus gros des chunks index-* (les petits sont des sous-chunks)
const entry = entries
  .map((f) => ({ f, size: statSync(join(ASSETS, f)).size }))
  .sort((a, b) => b.size - a.size)[0];
if (!entry) { console.error("check_entry_budget: aucun index-*.js dans dist/assets"); process.exit(1); }

const kb = Math.round(entry.size / 1024);
const src = readFileSync(join(ASSETS, entry.f), "utf8");
const errors = [];
// signatures de modules qui doivent rester en chunks lazy/idle
for (const [name, sig] of [
  ["xterm", "xterm"],
  ["katex", "katex-version"],
  ["remark-math", "math-inline"],
]) {
  if (src.includes(sig)) errors.push(`${name} est revenu dans l'entrée (${entry.f})`);
}
if (kb > BUDGET_KB) errors.push(`entrée ${entry.f} = ${kb} KB > budget ${BUDGET_KB} KB`);

if (errors.length) { errors.forEach((e) => console.error(`✗ ${e}`)); process.exit(1); }
console.log(`✓ entrée ${entry.f} = ${kb} KB ≤ ${BUDGET_KB} KB, sans xterm/katex/remark-math`);
