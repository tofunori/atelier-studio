// Construction du contexte photographié dans une fiche « Surlignés » (lot 2) :
// ~280 caractères du message contenant le passage sélectionné, centrés sur ce
// passage. Fonction pure, sans DOM — testée depuis sidecar/highlights.test.mjs.

const CONTEXT_TARGET = 280;

export function buildHighlightContext(messageText: string, selection: string): string {
  const msg = messageText ?? "";
  const sel = (selection ?? "").trim();
  if (!msg || !sel) return "";
  const idx = msg.indexOf(sel);
  if (idx < 0) return "";
  if (msg.length <= CONTEXT_TARGET) return msg.trim();

  const selEnd = idx + sel.length;
  const pad = Math.max(0, CONTEXT_TARGET - sel.length);
  const padStart = Math.floor(pad / 2);
  const padEnd = pad - padStart;
  let start = idx - padStart;
  let end = selEnd + padEnd;
  // fenêtre qui déborde un bord : reporter le surplus sur l'autre bord plutôt
  // que de simplement clamper (garde une fenêtre de taille ~constante)
  if (start < 0) {
    end = Math.min(msg.length, end - start);
    start = 0;
  }
  if (end > msg.length) {
    start = Math.max(0, start - (end - msg.length));
    end = msg.length;
  }
  const prefix = start > 0 ? "…" : "";
  const suffix = end < msg.length ? "…" : "";
  return (prefix + msg.slice(start, end).trim() + suffix).trim();
}
