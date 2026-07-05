import { invoke } from "@tauri-apps/api/core";

type SidecarInfo = { port: number; token?: string };

export type AgentEvent =
  | { kind: "user"; text: string; imageUrl?: string; label?: string; ts?: number }
  | { kind: "text"; text: string; ts?: number }
  | { kind: "tool"; name: string }
  | {
      kind: "done";
      ok: boolean;
      result: string;
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
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
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
  model?: string;
  effort?: string;
  permissionMode?: string;
  mode?: "steer" | "queue";
};

export function sendPrompt(ws: WebSocket, t: SendOptions) {
  ws.send(JSON.stringify({ type: "send", ...t }));
}

export function requestCatalog(ws: WebSocket, projectRoot: string) {
  ws.send(JSON.stringify({ type: "listCommands", projectRoot }));
  ws.send(JSON.stringify({ type: "listFiles", projectRoot }));
}

export type Command = { name: string; source: string };
