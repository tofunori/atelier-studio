// Accès au WebSocket sidecar TOUJOURS à jour (les props capturent des sockets
// périmés après reconnexion — source de terminaux/browsers morts).
let current: WebSocket | null = null;

export function setWs(ws: WebSocket | null) {
  current = ws;
}

export function wsReady(): boolean {
  return current?.readyState === 1;
}

export function wsSend(obj: unknown): boolean {
  if (current?.readyState === 1) {
    current.send(JSON.stringify(obj));
    return true;
  }
  return false;
}
