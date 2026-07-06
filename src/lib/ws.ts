import { invoke } from "@tauri-apps/api/core";

type SidecarInfo = { port: number; token?: string };

export type AgentEvent =
  | { kind: "user"; text: string; imageUrl?: string; label?: string; ts?: number }
  | { kind: "text"; text: string; ts?: number }
  | { kind: "delta"; text: string; ts?: number }
  | { kind: "thinking_delta"; text: string; ts?: number }
  | { kind: "thinking"; text: string; ts?: number }
  | { kind: "thinking_live"; text: string; ts?: number }
  | { kind: "permission"; requestId: string; toolName: string; input?: Record<string, unknown>; answered: boolean | null; ts?: number }
  | { kind: "stream_set"; text: string; ts?: number }
  | { kind: "streaming"; text: string; ts?: number }
  | { kind: "started"; ts?: number }
  | { kind: "tool"; name: string; detail?: string }
  | { kind: "tool_update"; id: string; name: string; output: string; status?: string; exitCode?: number; ts?: number }
  | { kind: "todos"; items: { text: string; completed: boolean }[]; ts?: number }
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
  provider: "claude" | "codex";
  sessionId: string | null;
  status: "idle" | "running" | "done";
  updatedAt: string;
};

type Handler = (msg: any) => void;

export async function connectSidecar(
  onMessage: Handler,
  onReconnect?: (ws: WebSocket) => void,
  onDisconnect?: () => void,
): Promise<WebSocket> {
  const { port, token } = await invoke<SidecarInfo>("sidecar_port");
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const ws = new WebSocket(`ws://127.0.0.1:${port}${q}`);
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
  });
  ws.send(JSON.stringify({ type: "listThreads" }));
  // reconnexion auto : sidecar tué/crashé → sidecar_port respawn + nouveau WS
  ws.onclose = () => {
    onDisconnect?.();
    const retry = () => {
      connectSidecar(onMessage, onReconnect, onDisconnect)
        .then((next) => onReconnect?.(next))
        .catch(() => setTimeout(retry, 3000));
    };
    setTimeout(retry, 1000);
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
