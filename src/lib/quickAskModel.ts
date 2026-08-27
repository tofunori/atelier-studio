// Le Quick Ask suit le modèle du fil actif.
//
// Il gardait sinon un défaut codé en dur (grok-4.6) persisté dans
// `atelier-studio.qaSelection` : on travaillait avec GLM 5.3 Flash dans le
// chat et la question de côté partait chez Grok, sans qu'aucun écran ne le
// dise. Le choix du chat vit sous la clé écrite par Chat.tsx — on la relit à
// l'ouverture, le seul moment où ça compte.
export type QaSelection = { provider: string; model: string; effort: string };

export function threadModelKey(threadId: string | null): string | null {
  return threadId ? "atelier-studio.modelSel.thread:" + threadId : null;
}

/** Le choix modèle/effort du fil, tel que le chat l'a enregistré. */
export function chatSelection(raw: string | null): QaSelection | null {
  let parsed: Record<string, unknown> | null;
  try {
    parsed = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const byProvider = parsed.byProvider as Record<string, { model?: string; effort?: string }> | undefined;
  if (byProvider && typeof byProvider === "object") {
    const provider = typeof parsed.activeProvider === "string" ? parsed.activeProvider : "";
    const entry = provider ? byProvider[provider] : undefined;
    if (!entry?.model) return null;
    return { provider, model: entry.model, effort: entry.effort ?? "" };
  }
  // Ancien objet plat, même migration que le chat (Chat.tsx).
  const flat = parsed as { provider?: string; model?: string; effort?: string };
  if (!flat.provider || !flat.model) return null;
  return { provider: flat.provider, model: flat.model, effort: flat.effort ?? "" };
}
