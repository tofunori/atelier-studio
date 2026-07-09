import { refreshSidecarInfo } from "./sidecarInfo";

export type AgentEvent =
  | { kind: "user"; text: string; imageUrl?: string; label?: string; pastes?: { name: string; text: string }[]; ts?: number }
  | { kind: "text"; text: string; ts?: number }
  | { kind: "delta"; text: string; ts?: number }
  | { kind: "thinking_delta"; text: string; ts?: number }
  | { kind: "thinking"; text: string; ts?: number }
  | { kind: "thinking_live"; text: string; ts?: number }
  | { kind: "permission"; requestId: string; toolName: string; input?: Record<string, unknown>; answered: boolean | null; ts?: number }
  | { kind: "stream_set"; text: string; ts?: number }
  | { kind: "streaming"; text: string; ts?: number }
  | { kind: "started"; ts?: number }
  | { kind: "heartbeat"; elapsedMs?: number; ts?: number }
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
  | { kind: "edit"; projectRoot?: string | null; files: { path: string; add: number | null; del: number | null }[]; ts?: number }
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
      ts?: number;
    }
  | { kind: "usage"; usage: { context: number | null; output: number | null; cost: number | null; turns: number | null }; ts?: number }
  | { kind: "todos"; items: { text: string; completed: boolean }[]; ts?: number }
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
      usage?: { context: number; output: number; cost: number | null; turns: number | null };
      ts?: number;
    }
  | { kind: "error"; message: string };

export type Thread = {
  id: string;
  projectRoot: string;
  title: string;
  provider: string;
  sessionId: string | null;
  status: "idle" | "running" | "done";
  updatedAt: string;
};

type Handler = (msg: any) => void;

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
  ws.send(JSON.stringify({ type: "listThreads" }));
  ws.send(JSON.stringify({ type: "providerStatus" }));
  // reconnexion auto : sidecar tué/crashé → sidecar_port respawn + nouveau WS.
  // Tout est neutralisé par l'abort : onclose détaché, timers annulés.
  ws.onclose = () => {
    if (signal?.aborted) return;
    onDisconnect?.();
    const retry = () => {
      if (signal?.aborted) return;
      connectSidecar(onMessage, onReconnect, onDisconnect, signal)
        .then((next) => onReconnect?.(next))
        .catch(() => {
          if (signal?.aborted) return;
          retryTimer = setTimeout(retry, 3000);
        });
    };
    retryTimer = setTimeout(retry, 1000);
  };
  return ws;
}

export type SendOptions = {
  threadId: string;
  projectRoot: string;
  provider: string;
  prompt: string;
  inputs?: ({ type: "text"; text: string } | { type: "local_image"; path: string })[];
  imagePath?: string;
  attachments?: { path?: string; imagePath?: string }[];
  model?: string;
  effort?: string;
  permissionMode?: string;
  mode?: "steer" | "queue";
  webSearch?: boolean;
  additionalDirectories?: string[];
  autoReview?: { enabled: boolean; provider: string; model: string; effort: string; trigger: string; autofix?: boolean };
};

export function sendPrompt(ws: WebSocket, t: SendOptions) {
  ws.send(JSON.stringify({ type: "send", ...t }));
}

export function requestCatalog(ws: WebSocket, projectRoot: string) {
  ws.send(JSON.stringify({ type: "listCommands", projectRoot }));
  ws.send(JSON.stringify({ type: "listFiles", projectRoot }));
}

export type Command = { name: string; source: string };
