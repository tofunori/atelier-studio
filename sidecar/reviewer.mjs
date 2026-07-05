import { buildReviewPrompt } from "./reviewer_prompt.mjs";

// Auto-review : vérification INDÉPENDANTE d'une réponse d'agent contre le
// record d'exécution (Run Ledger + diffs). Run one-shot, session neuve,
// idéalement d'une autre famille de modèle que l'exécutant (cross-provider).

/** Extrait le premier objet JSON parsable d'un texte (tolérant markdown). */
export function extractVerdict(text) {
  const raw = String(text ?? "");
  const start = raw.indexOf("{");
  if (start < 0) return { verdict: "unparseable", issues: [], raw: raw.slice(0, 400) };
  // tenter chaque fin possible depuis la plus longue (JSON imbriqué)
  for (let end = raw.lastIndexOf("}"); end > start; end = raw.lastIndexOf("}", end - 1)) {
    try {
      const j = JSON.parse(raw.slice(start, end + 1));
      if (j && (j.verdict === "ok" || j.verdict === "issues")) {
        return {
          verdict: j.verdict,
          issues: Array.isArray(j.issues)
            ? j.issues.slice(0, 10).map((i) => ({
                claim: String(i?.claim ?? "").slice(0, 300),
                problem: String(i?.problem ?? "").slice(0, 400),
                severity: i?.severity === "high" ? "high" : "low",
              }))
            : [],
        };
      }
    } catch {}
  }
  return { verdict: "unparseable", issues: [], raw: raw.slice(0, 400) };
}

/**
 * Lance la vérification. Ne jette jamais : retourne toujours un verdict.
 * cfg = { provider, model, effort } — le reviewer (défaut codex/gpt-5.5/high).
 */
export async function reviewTurn({ entry, responseText, diffs, cfg, providers }) {
  const provider = providers?.[cfg?.provider ?? "codex"];
  if (!provider?.run) return { verdict: "unavailable", issues: [] };
  const prompt = buildReviewPrompt(entry, responseText, diffs);
  let lastText = "";
  try {
    await provider.run({
      threadId: null,
      cwd: process.env.HOME,
      prompt,
      sessionId: null, // session NEUVE : le reviewer ne voit que le dossier qu'on lui donne
      model: cfg?.model || "gpt-5.5",
      effort: cfg?.effort || "high",
      permissionMode: "default",
      onEvent: (e) => {
        if (e.kind === "text") lastText = e.text;
        if (e.kind === "stream_set") lastText = e.text;
      },
    });
  } catch (e) {
    return { verdict: "error", issues: [], error: String(e?.message ?? e) };
  }
  return extractVerdict(lastText);
}
