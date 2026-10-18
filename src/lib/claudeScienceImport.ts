/** Demande au backend les spécialistes de Claude Science (message ws
 *  `importClaudeScience`, lecture seule de sa base côté Rust) ; la réponse
 *  revient par l'événement fenêtre `claude-science-import` (sidecarRelays). */
import { t } from "./i18n";
import type { SpecialisteClaudeScience } from "./specialistes";

const SOCKET_OPEN = 1;
const EVENT_IMPORT = "claude-science-import";

export type ReponseImport = { requestId?: string; ok?: boolean; error?: string; specialistes?: SpecialisteClaudeScience[] };

export function importerDepuisClaudeScience(ws: WebSocket | null): Promise<ReponseImport> {
  if (!ws || ws.readyState !== SOCKET_OPEN) return Promise.resolve({ ok: false, error: t("specialistes.import-offline") });
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = (r: ReponseImport) => {
      window.clearTimeout(timer);
      window.removeEventListener(EVENT_IMPORT, onEvent);
      resolve(r);
    };
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as ReponseImport | undefined;
      if (detail?.requestId === requestId) finish(detail);
    };
    const timer = window.setTimeout(() => finish({ ok: false, error: t("specialistes.import-timeout") }), 30_000);
    window.addEventListener(EVENT_IMPORT, onEvent);
    try { ws.send(JSON.stringify({ type: "importClaudeScience", requestId })); }
    catch { finish({ ok: false, error: t("specialistes.import-offline") }); }
  });
}
