// Bloc <atelier-kb> (plan 049 T4) : composition PURE du bloc injecté au send
// et strip symétrique. Le format est un CONTRAT de parité octet-pour-octet
// avec rust/crates/atelier-runtime/src/kb_block.rs — toute modification ici
// doit être répliquée là-bas (test de parité kb_block_parity_node).
const BLOCK = /\n*<atelier-kb\b[^>]*>[\s\S]*?<\/atelier-kb>\s*/gi;

// Sources ≤ KB_INLINE_MAX (ou forcées) : texte intégral ; au-delà : fiche.
export const KB_INLINE_MAX = 8000;
// Plein contenu forcé : plafond dur (en scalaires Unicode, comme Rust chars()).
export const KB_FORCED_MAX = 100_000;

function fmtChars(chars) {
  const n = Number(chars) || 0;
  return n < 1000 ? `${n} car.` : `${Math.round(n / 1000)}k car.`;
}

function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Un texte source contenant le fermant casserait le strip : échappé en
// conservant une casse fixe (identique côté Rust).
function sanitizeBody(text) {
  return String(text ?? "").replace(/<\/atelier-kb/gi, "<\\/atelier-kb");
}

function capScalars(text, max) {
  const scalars = Array.from(String(text ?? ""));
  if (scalars.length <= max) return String(text ?? "");
  return `${scalars.slice(0, max).join("")}\n[…tronqué]`;
}

/**
 * Compose le bloc à partir d'entrées préparées :
 *   { id, title, kind, chars, inline: bool, text?: string }
 * (text requis quand inline). `gbrain` = la source réservée est attachée.
 * Retourne le prompt inchangé si rien à injecter.
 */
export function withKbBlock(prompt, { toolPath, entries = [], gbrain = false } = {}) {
  const base = String(prompt ?? "");
  const valid = entries.filter((entry) => entry && entry.id);
  if (!valid.length && !gbrain) return base;

  let block = "<atelier-kb>\nSources attachées par l'utilisateur (base de connaissances Atelier).\n\n";
  for (const entry of valid) {
    if (!entry.inline) continue;
    block += `[kb:${entry.id}] ${oneLine(entry.title)} — ${entry.kind}, ${fmtChars(entry.chars)} — texte intégral :\n`;
    block += `${sanitizeBody(capScalars(entry.text, KB_FORCED_MAX))}\n\n`;
  }
  let fiches = 0;
  for (const entry of valid) {
    if (entry.inline) continue;
    fiches += 1;
    block += `[kb:${entry.id}] ${oneLine(entry.title)} — ${entry.kind}, ${fmtChars(entry.chars)} — fiche.\n`;
  }
  if (fiches) {
    block += `\nPour un passage précis d'une source en fiche, appelle le terminal exactement :\n`;
    block += `${JSON.stringify(String(toolPath ?? "atelier-kb"))} search --id <id> --query "<question>" --limit 5\n`;
    block += `Lis le JSON (stdout) : chaque passage porte quote, location et cite. Reproduis la quote exactement et termine chaque citation par son champ cite. N'invente jamais un passage.\n\n`;
  }
  if (gbrain) {
    block += `[kb:gbrain] Corpus thèse (gbrain) — outil NAS.\n`;
    block += `Pour la littérature de thèse (glaciologie, albédo, feux), appelle : gbrain query "<question>" et cite les pages retournées. Si le NAS est injoignable, dis-le et continue avec les autres sources.\n\n`;
  }
  block += `Règle : toute affirmation tirée d'une source attachée est citée [kb:<id> · page/fichier/mm:ss]. N'invente jamais un passage.\n</atelier-kb>`;
  return `${base}\n\n${block}`;
}

export function stripKbBlock(prompt) {
  return String(prompt ?? "").replace(BLOCK, "").trimEnd();
}
