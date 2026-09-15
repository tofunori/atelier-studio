export const CHAT_SEALS = [
  { id: "square", label: "Carré découpé" },
  { id: "disk", label: "Disque fendu" },
  { id: "diamond", label: "Losange évidé" },
  { id: "tiles", label: "Quatre cases" },
] as const;
export type ChatSealId = typeof CHAT_SEALS[number]["id"];

export function chatSealFor(id: string, choices?: Record<string, string>): ChatSealId {
  const chosen = choices?.[id];
  if (CHAT_SEALS.some(seal => seal.id === chosen)) return chosen as ChatSealId;
  // Stable across sorting, project switches and reloads.
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CHAT_SEALS[hash % CHAT_SEALS.length].id;
}

export function ChatSeal({ seal }: { seal: ChatSealId }) {
  return <svg className="chat-seal" data-seal={seal} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {seal === "square" && <path d="M3 3h10v8h8v10H3z" />}
    {seal === "disk" && <g transform="rotate(35 12 12)"><path d="M10.5 2.1a10 10 0 0 0 0 19.8zM13.5 2.1a10 10 0 0 1 0 19.8z" /></g>}
    {seal === "diamond" && <path fillRule="evenodd" d="M12 1 23 12 12 23 1 12zM12 12v5h5v-5z" />}
    {seal === "tiles" && <><path d="M3 4h7v7H3zM14 2h7v7h-7zM3 14h7v7H3zM13 13h7v7h-7z" /></>}
  </svg>;
}
