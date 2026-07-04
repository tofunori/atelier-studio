import { invoke } from "@tauri-apps/api/core";

export type AgentEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "done"; ok: boolean; result: string }
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

export async function connectSidecar(onMessage: Handler): Promise<WebSocket> {
  const port = await invoke<number>("sidecar_port");
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.send(JSON.stringify({ type: "listThreads" }));
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
};

export function sendPrompt(ws: WebSocket, t: SendOptions) {
  ws.send(JSON.stringify({ type: "send", ...t }));
}
