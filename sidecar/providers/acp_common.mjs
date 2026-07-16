// Helpers ACP purs, partagés entre providers (grok, opencode — plan 045).
// Extraits de grok.mjs à l'identique ; grok.mjs les ré-exporte pour ses
// importeurs historiques. Aucune dépendance, aucun état module.

/** Découpe un buffer réseau en messages JSON-RPC ACP complets (une ligne =
 * un message, pas de Content-Length) ; renvoie les objets parsés (lignes
 * invalides ignorées, jamais fatal) et le reliquat à reporter au prochain
 * appel. */
export function parseAcpLines(chunk, carry = "") {
  const text = carry + chunk;
  const lines = text.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const messages = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      // ligne corrompue : ignorée silencieusement (pas de crash du provider)
    }
  }
  return { messages, rest };
}

/** Réponse JSON-RPC "method not found" à renvoyer pour toute requête entrante
 * inattendue du serveur — jamais de silence (un serveur qui attend une réponse
 * bloque le tour indéfiniment, vérifié en sonde grok 2026-07-08). */
export function acpMethodNotFoundResponse(id, method) {
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

/** Émetteur bufferisé d'un tour — maintient l'ADJACENCE bloc live → bloc
 * final exigée par le reducer du front (App.tsx : la bulle `streaming`/
 * `thinking_live` n'est remplacée par son bloc final `text`/`thinking` que si
 * elle est le DERNIER event de la liste). Tout event intercalé (tool, edit,
 * hook…) entre des deltas et leur bloc final laisserait une bulle orpheline
 * (caret clignotant à jamais) + un texte dupliqué — observé en réel
 * 2026-07-08 avec les hooks de fin de tour. Règle : avant d'émettre quoi que
 * ce soit d'autre que le delta du buffer actif, flusher le(s) buffer(s). */
export function makeTurnEmitter(onEvent) {
  let messageBuffer = "";
  let thoughtBuffer = "";
  const flushThinking = () => {
    if (!thoughtBuffer) return;
    onEvent({ kind: "thinking", text: thoughtBuffer });
    thoughtBuffer = "";
  };
  const flushText = () => {
    if (!messageBuffer) return;
    onEvent({ kind: "text", text: messageBuffer });
    messageBuffer = "";
  };
  const flush = () => { flushThinking(); flushText(); };
  const emit = (ev) => {
    if (ev.kind === "thinking_delta") { flushText(); thoughtBuffer += ev.text; onEvent(ev); return; }
    if (ev.kind === "delta") { flushThinking(); messageBuffer += ev.text; onEvent(ev); return; }
    flush();
    onEvent(ev);
  };
  return { emit, flush };
}
