// « Proposer » de l'éditeur Word (2026-11-12) : la demande part au chat comme
// pièce jointe .docx (replyPrompt de gallery/src/browser/docx_studio.ts). La
// carte du message envoyé (variante C « Citation ») en garde l'essentiel : à
// qui l'on répond, où, et son commentaire.
// Même enveloppe pour « Vérifier dans le chat » sur son propre commentaire
// (checkPrompt, 2026-11-13) : `check` est vrai, l'auteur est « moi ».
export type DocxReplyAsk = { author: string; comment: string; where?: string; check?: boolean };

/** Lit l'enveloppe de replyPrompt ou de checkPrompt ; `null` pour toute
 *  autre pièce jointe. */
export function docxReplyAsk(text: string): DocxReplyAsk | null {
  const m = /^[^\n]+\.docx \(commentaire c\d+(?:, ([^)]*))?\) — (.+?) sur « [\s\S]*? » : ([\s\S]*?)(?=\n {2}↳ |\n\n(?:Propose-moi |Vérifie mon commentaire ))/.exec(text);
  if (!m) return null;
  const paragraph = m[1] ? /^[a-z]*p(\d+)$/.exec(m[1].trim()) : null;
  // Les réponses du fil s'intercalent avant la consigne : la chercher plus loin.
  const check = /\n\nVérifie mon commentaire [^\n]*$/.test(text);
  return {
    ...(check ? { check: true } : {}),
    author: m[2].trim(),
    comment: m[3].trim(),
    ...(paragraph ? { where: `¶ ${paragraph[1]}` } : {}),
  };
}
