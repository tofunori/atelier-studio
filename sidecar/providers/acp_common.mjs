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

// --- Mapping tool_call/tool_call_update ACP standard (plan 046) -------------
// Extraits d'opencode.mjs à l'identique, paramétrés par `source` : Kimi ne
// porte pas source:"opencode". opencode.mjs délègue ici avec "opencode".

/** Statut d'un tool_call_update — pas de statut explicite ⇒ la présence d'un
 * contenu signale la fin. */
export function acpToolStatus(update) {
  const raw = update?.status;
  if (raw) {
    const s = String(raw).toLowerCase();
    if (s.includes("fail") || s.includes("error") || s.includes("reject")) return "failed";
    if (s.includes("complet") || s.includes("done") || s.includes("success")) return "completed";
    if (s.includes("progress") || s.includes("pending")) return "running";
    return s;
  }
  return (update?.content ?? []).length ? "completed" : "running";
}

/** Concatène le contenu d'un tool call en string (diff → "# path\nnewText"). */
export function acpToolOutput(update) {
  const parts = [];
  for (const c of update?.content ?? []) {
    if (c?.type === "diff") {
      const label = c.path ? `# ${c.path}` : "# fichier";
      parts.push(`${label}\n${String(c.newText ?? "")}`);
    } else if (c?.type === "text" && c.text) {
      parts.push(String(c.text));
    } else if (typeof c?.content?.text === "string") {
      parts.push(c.content.text);
    }
  }
  return parts.join("\n\n");
}

/** Mémoire par toolCallId : une update de suivi sans title/rawInput ne doit
 * pas dégrader la carte déjà affichée. */
export function rememberAcpToolMeta(toolMetaCache, toolCallId, patch) {
  if (!toolMetaCache || !toolCallId) return;
  const prev = toolMetaCache.get(toolCallId) ?? {};
  const next = { ...prev };
  if (patch.name && patch.name !== "tool") next.name = patch.name;
  if (patch.detail) next.detail = patch.detail;
  if (patch.input != null) next.input = patch.input;
  toolMetaCache.set(toolCallId, next);
}

/** `tool_call` → event tool_update `running`. `output` string REQUIS (front). */
export function acpToolCall(update, toolMetaCache, source) {
  const title = update?.title || undefined;
  const kind = update?.kind || undefined;
  const name = title || kind || "tool";
  const ev = {
    kind: "tool_update",
    id: update?.toolCallId,
    name,
    status: "running",
    detail: kind && kind !== name ? kind : undefined,
    output: "",
    input: update?.rawInput ?? null,
    source,
  };
  rememberAcpToolMeta(toolMetaCache, update?.toolCallId, ev);
  return ev;
}

/** `tool_call_update` → event tool_update (statut/output, méta reprise). */
export function acpToolCallUpdate(update, toolMetaCache, source) {
  const cached = toolMetaCache?.get(update?.toolCallId);
  const title = update?.title || undefined;
  const kind = update?.kind || undefined;
  const name = title || cached?.name || kind || "tool";
  const ev = {
    kind: "tool_update",
    id: update?.toolCallId,
    name,
    status: acpToolStatus(update),
    detail: (kind && kind !== name ? kind : undefined) || cached?.detail || undefined,
    output: acpToolOutput(update),
    input: update?.rawInput ?? cached?.input ?? null,
    source,
  };
  rememberAcpToolMeta(toolMetaCache, update?.toolCallId, ev);
  return ev;
}

/** Contenus diff → events `edit`, dédupliqués (toolCallId:path:len). `files`
 * seulement, jamais de snippets (piège redaction journal). */
export function acpEdits(update, seenEdits) {
  const files = [];
  for (const c of update?.content ?? []) {
    if (c?.type !== "diff" || !c.path) continue;
    const key = `${update.toolCallId}:${c.path}:${String(c.newText ?? "").length}`;
    if (seenEdits) {
      if (seenEdits.has(key)) continue;
      seenEdits.add(key);
    }
    files.push(String(c.path));
  }
  return files.length ? [{ kind: "edit", files }] : [];
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
