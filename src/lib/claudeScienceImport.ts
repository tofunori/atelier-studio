/** Requêtes ws de Réglages › Spécialistes : les spécialistes de Claude
 *  Science (`importClaudeScience`, lecture seule de sa base côté Rust) et
 *  les serveurs MCP du Mac (`listMcpServers`). Les réponses reviennent par
 *  un événement fenêtre (sidecarRelays). */
import { t } from "./i18n";
import type { SpecialisteClaudeScience } from "./specialistes";

const SOCKET_OPEN = 1;
const EVENT_IMPORT = "claude-science-import";

export type ReponseImport = { requestId?: string; ok?: boolean; error?: string; specialistes?: SpecialisteClaudeScience[] };

type CleEchec = "specialistes.import-offline" | "specialistes.import-timeout";

function demander<R extends { requestId?: string }>(
  ws: WebSocket | null, type: string, evenement: string, echec: (cle: CleEchec) => R, delai: number,
): Promise<R> {
  if (!ws || ws.readyState !== SOCKET_OPEN) return Promise.resolve(echec("specialistes.import-offline"));
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = (r: R) => {
      window.clearTimeout(timer);
      window.removeEventListener(evenement, onEvent);
      resolve(r);
    };
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as R | undefined;
      if (detail?.requestId === requestId) finish(detail);
    };
    const timer = window.setTimeout(() => finish(echec("specialistes.import-timeout")), delai);
    window.addEventListener(evenement, onEvent);
    try { ws.send(JSON.stringify({ type, requestId })); }
    catch { finish(echec("specialistes.import-offline")); }
  });
}

export function importerDepuisClaudeScience(ws: WebSocket | null): Promise<ReponseImport> {
  return demander<ReponseImport>(ws, "importClaudeScience", EVENT_IMPORT,
    (cle) => ({ ok: false, error: t(cle), specialistes: [] }), 30_000);
}

export type McpDuMac = { nom: string; sources: string[] };
type ReponseMcp = { requestId?: string; serveurs?: McpDuMac[] };

/** Serveurs MCP du Mac ; `null` si le backend ne répond pas (on ne
 *  signale alors aucun connecteur comme absent). */
export async function listerMcpDuMac(ws: WebSocket | null): Promise<McpDuMac[] | null> {
  const r = await demander<ReponseMcp & { echec?: boolean }>(ws, "listMcpServers", "mcp-servers", () => ({ echec: true }), 10_000);
  return r.echec ? null : (r.serveurs ?? []);
}
