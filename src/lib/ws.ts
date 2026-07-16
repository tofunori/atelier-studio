import { refreshSidecarInfo } from "./sidecarInfo";

/** Metadata harnais (plan 025, schema v1) portée par tout événement sidecar durable. */
export type HarnessEventMeta = {
  schemaVersion: 1;
  eventId: string;
  provider: string;
  threadId: string;
  turnId: string;
  messageId?: string;
  itemId?: string;
  nativeThreadId?: string;
  nativeTurnId?: string;
  sequence: number;
  ts: number;
  durable: boolean;
  origin: "provider" | "atelier" | "legacy-import";
};

/** Metadata provisoire d'un événement optimiste local — remplacée par l'ack sidecar. */
export type ProvisionalEventMeta = { provisional: true; messageId: string };

// meta par intersection : une seule déclaration pour toutes les branches de l'union
type AgentEventBody =
  | { kind: "user"; text: string; imageUrl?: string; label?: string; pastes?: { name: string; text: string }[]; ts?: number }
  | { kind: "text"; text: string; ts?: number }
  | { kind: "delta"; text: string; ts?: number }
  | { kind: "thinking_delta"; text: string; ts?: number }
  | { kind: "thinking"; text: string; ts?: number }
  | { kind: "thinking_live"; text: string; ts?: number }
  | { kind: "permission"; requestId: string; toolName: string; input?: Record<string, unknown>; answered: boolean | null; ts?: number }
  | {
      // événement interactif générique (plan 025, step 5) : approvals Codex,
      // request_user_input, MCP elicitation — mises à jour ré-émises avec le
      // MÊME requestId (state answered/declined/expired). answerSummary ne
      // contient JAMAIS de valeur secrète (contrat AGENT_HARNESS_CONTRACT.md).
      kind: "interaction";
      requestId: string;
      interactionType: "approval" | "user_input" | "mcp_elicitation";
      title: string;
      detail?: string;
      urlDomain?: string;
      // approbation à choix dynamiques (Kimi, plan 046) : optionId OPAQUE,
      // rendu dans l'ordre reçu, renvoyé tel quel via { optionId }.
      choices?: InteractionChoice[];
      fields?: {
        id: string;
        question: string;
        header?: string;
        // value : identifiant opaque renvoyé à la place du label (plan 046)
        options?: { label: string; description?: string; value?: string }[];
        allowOther?: boolean;
        secret?: boolean;
      }[];
      state: "pending" | "answered" | "declined" | "expired";
      answerSummary?: string;
      ts?: number;
    }
  | { kind: "stream_set"; text: string; ts?: number }
  | { kind: "streaming"; text: string; ts?: number }
  | { kind: "started"; ts?: number }
  /** tokens : sortie cumulée du tour (ticker « Ns · Nk tokens ») — éphémère, jamais journalisé */
  | { kind: "heartbeat"; elapsedMs?: number; tokens?: number; ts?: number }
  | {
      kind: "activity";
      id: string;
      phase?: "thinking" | "command" | "search" | "edit" | "tool" | "todo";
      title: string;
      detail?: string;
      status?: "running" | "completed" | "failed";
      steps?: { title: string; detail?: string; status?: "running" | "completed" | "failed"; phase?: string; ts?: number }[];
      ts?: number;
    }
  | { kind: "tool"; name: string; detail?: string }
  | {
      kind: "edit";
      projectRoot?: string | null;
      baseSha?: string | null;
      /** oldText/newText : avant/après fournis par le provider (input du tool
       * Edit, contenu d'un Write de fichier nouveau) — diff immédiat sans git */
      files: { path: string; add: number | null; del: number | null; oldText?: string; newText?: string }[];
      ts?: number;
    }
  | {
      kind: "tool_update";
      id: string;
      name: string;
      output: string;
      status?: string;
      exitCode?: number;
      detail?: string;
      input?: unknown;
      source?: string | null;
      /** sortie tronquée à 64 KiB par le provider (longueur originale dans outputLength) */
      truncated?: boolean;
      outputLength?: number;
      durationMs?: number;
      /** Activité multi-agent native Codex. Ces champs restent structurés afin
       * que le transcript puisse grouper les agents et suivre leur état. */
      agentActivity?: {
        tool: string;
        senderThreadId?: string | null;
        receiverThreadIds: string[];
        agentsStates: Record<string, { status: string; message?: string | null }>;
        prompt?: string | null;
        model?: string | null;
        reasoningEffort?: string | null;
        agentThreadId?: string | null;
        agentPath?: string | null;
        activityKind?: "started" | "interacted" | "interrupted" | string;
      };
      ts?: number;
    }
  | { kind: "usage"; usage: { context: number | null; output: number | null; cost: number | null; turns: number | null }; ts?: number }
  /** active : l'item en cours (TodoWrite in_progress) — rendu accentué */
  | { kind: "todos"; items: { text: string; completed: boolean; active?: boolean }[]; ts?: number }
  | {
      kind: "proposed_plan";
      planId: string;
      markdown: string;
      provider?: string;
      source?: "plan-mode" | string;
      fileName?: string;
      ts?: number;
    }
  | {
      kind: "goal";
      cleared?: boolean;
      goal: {
        objective: string;
        status: "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete";
        tokenBudget: number | null;
        tokensUsed: number;
        timeUsedSeconds: number;
      } | null;
      ts?: number;
    }
  | {
      kind: "done";
      ok: boolean;
      result: string;
      projectRoot?: string;
      filesChanged?: string[];
      checkpoint?: { snapshotSha: string; filesChanged: string[] };
      usage?: { context: number; output: number; cost: number | null; turns: number | null };
      ts?: number;
    }
  | { kind: "error"; message: string };

export type AgentEvent = AgentEventBody & { meta?: HarnessEventMeta | ProvisionalEventMeta };

/** Choix d'approbation dynamique (Kimi, plan 046) : l'optionId fait
 * l'aller-retour OPAQUE — l'UI affiche `label`, renvoie `optionId` tel quel. */
export type InteractionChoice = {
  optionId: string;
  label: string;
  description?: string;
  kind?: "allow_once" | "allow_always" | "reject_once" | "reject_always";
};

/** Réponse frontend à un événement interaction — envoyée UNIQUEMENT dans le
 * message WS `interactionResponse` (les valeurs secret n'existent nulle part
 * ailleurs : ni AgentEvent, ni journal, ni logs). */
export type InteractionResponse =
  | { allow: boolean; scope?: "once" | "session"; cancelTurn?: boolean }
  | { optionId: string; cancelTurn?: boolean }
  | { answers: Record<string, string> }
  | { action: "accept" | "decline"; content?: Record<string, string> };

/** Bulle user telle qu'archivée par le sidecar : le texte réellement tapé et
 * des attachments structurés (chemins, noms, nombres de lignes) — jamais de
 * data URL ni de contexte injecté (handoff, textes de pièces jointes). */
export type UserDisplayEvent = {
  kind: "user";
  text: string;
  ts?: number;
  label?: string;
  pastes?: { name: string; lines: number }[];
  imagePaths?: string[];
};

export type Thread = {
  id: string;
  projectRoot: string;
  title: string;
  provider: string;
  sessionId: string | null;
  status: "idle" | "running" | "done";
  updatedAt: string;
  handoff?: {
    sourceThreadId: string;
    sourceProvider: string;
    targetProvider: string;
  };
};

type Handler = (msg: any) => void;

const CLIENT_INSTANCE_KEY = "atelier-studio.client-instance-id";
let clientInstanceId: string | null = null;

/** Identité éphémère stable de cette fenêtre, conservée pendant les reconnexions
 * mais distincte des autres fenêtres Atelier. */
export function getClientInstanceId(): string {
  if (clientInstanceId) return clientInstanceId;
  try { clientInstanceId = sessionStorage.getItem(CLIENT_INSTANCE_KEY); } catch { /* webview restreinte */ }
  if (!clientInstanceId) {
    clientInstanceId = crypto.randomUUID();
    try { sessionStorage.setItem(CLIENT_INSTANCE_KEY, clientInstanceId); } catch { /* mémoire seulement */ }
  }
  return clientInstanceId;
}

function abortError() {
  return new DOMException("connexion sidecar annulée", "AbortError");
}

export async function connectSidecar(
  onMessage: Handler,
  onReconnect?: (ws: WebSocket) => void,
  onDisconnect?: () => void,
  signal?: AbortSignal,
): Promise<WebSocket> {
  if (signal?.aborted) throw abortError();
  // chaque (re)connexion rafraîchit la SidecarInfo partagée : les clients HTTP
  // (write-through ui.json) suivent automatiquement le nouveau port/token
  const { port, token } = await refreshSidecarInfo();
  if (signal?.aborted) throw abortError();
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const ws = new WebSocket(`ws://127.0.0.1:${port}${q}`);
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const onAbort = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    ws.onclose = null;
    try { ws.close(); } catch { /* déjà fermée */ }
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(String(e.data)));
    } catch (error) {
      console.warn("sidecar: message non JSON ignoré", e.data, error);
    }
  };
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
    signal?.addEventListener("abort", () => rej(abortError()), { once: true });
  });
  if (signal?.aborted) throw abortError();
  ws.send(JSON.stringify({ type: "clientHello", clientInstanceId: getClientInstanceId() }));
  ws.send(JSON.stringify({ type: "listThreads" }));
  ws.send(JSON.stringify({ type: "providerStatus" }));
  // reconnexion auto : sidecar tué/crashé → sidecar_port respawn + nouveau WS.
  // Backoff exponentiel : marteler sidecar_port pendant qu'un spawn+health est
  // déjà en cours empile des sidecars rivaux qui s'entre-tuent via sidecar.pid.
  // Une connexion réussie installe un nouveau onclose → le délai repart à 1 s.
  // Tout est neutralisé par l'abort : onclose détaché, timers annulés.
  ws.onclose = () => {
    if (signal?.aborted) return;
    onDisconnect?.();
    let delay = 1000;
    const retry = () => {
      if (signal?.aborted) return;
      connectSidecar(onMessage, onReconnect, onDisconnect, signal)
        .then((next) => onReconnect?.(next))
        .catch(() => {
          if (signal?.aborted) return;
          delay = Math.min(delay * 2, 30000);
          retryTimer = setTimeout(retry, delay);
        });
    };
    retryTimer = setTimeout(retry, delay);
  };
  return ws;
}

export type SendOptions = {
  threadId: string;
  projectRoot: string;
  provider: string;
  prompt: string;
  inputs?: (
    | { type: "text"; text: string }
    | { type: "local_image"; path: string }
    | { type: "skill"; name: string; path: string }
    | { type: "mention"; name: string; path: string }
  )[];
  imagePath?: string;
  attachments?: { path?: string; imagePath?: string }[];
  model?: string;
  effort?: string;
  permissionMode?: string;
  mode?: "steer" | "queue";
  clientMessageId?: string;
  displayEvent?: UserDisplayEvent;
  webSearch?: boolean;
  additionalDirectories?: string[];
  autoReview?: { enabled: boolean; provider: string; model: string; effort: string; trigger: string; autofix?: boolean };
  /** Nouveau fil atomiquement dérivé de cette source lors d'un changement de provider. */
  handoffFromThreadId?: string;
};

export function sendPrompt(ws: WebSocket, t: SendOptions) {
  ws.send(JSON.stringify({ type: "send", ...t }));
}

export function requestCatalog(ws: WebSocket, projectRoot: string) {
  ws.send(JSON.stringify({ type: "listCommands", projectRoot }));
  ws.send(JSON.stringify({ type: "listFiles", projectRoot }));
  ws.send(JSON.stringify({ type: "listPlugins", projectRoot }));
}

export type Command = { name: string; source: string };
