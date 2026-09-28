/**
 * « Ajouter au chat » depuis la barre d'outils d'un éditeur (LaTeX, code).
 *
 * Le fichier ouvert est le contexte le plus demandé du chat, et il fallait
 * jusqu'ici passer par la galerie ou par le menu de l'onglet (Thierry
 * 2026-09-10). Même canal que la galerie : `atelier-add-to-chat` avec le
 * chemin absolu, pour que l'agent lise la version du DISQUE plutôt qu'une
 * copie collée qui aurait vieilli.
 */
export type ChatAttachOptions = {
  button: HTMLElement | null;
  /** Chemin absolu du fichier ouvert ; sans lui, le bouton reste masqué. */
  path: string | null;
  postToHost(payload: Record<string, unknown>): void;
  /** Message furtif de la barre d'état, quand la surface en a une. */
  notify?(message: string, kind: "success" | "error"): void;
  window?: Window;
};

const DONE_MS = 1400;

/** Même accusé que la galerie, y compris pour les pièces jointes PDF. */
export function requestChatAttachment(options: {
  window?: Window;
  postToHost(payload: Record<string, unknown>): void;
  payload: Record<string, unknown>;
  /** Reuse for a manual retry of the same logical insertion after a lost ACK. */
  requestId?: string;
  timeoutMs?: number;
}): Promise<void> {
  const win = options.window || window;
  const requestId = options.requestId || win.crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = {...options.payload, requestId};
  return new Promise((resolve, reject) => {
    let timer = 0;
    let attempt = 0;
    let finished = false;
    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      win.clearTimeout(timer);
      win.removeEventListener("message", receive);
      if (error) reject(error); else resolve();
    };
    const receive = (event: MessageEvent): void => {
      const data = event.data;
      if (event.source !== win.top || data?.type !== "atelier-add-to-chat-ack" || data.requestId !== requestId) return;
      let nonce = (win as Window & {__atelierNonce?: string}).__atelierNonce || "";
      try { nonce ||= win.sessionStorage.getItem("atelier_nonce") || ""; } catch { /* WKWebView sans stockage */ }
      if (!nonce || data.nonce !== nonce) return;
      if (data.ok === true) finish();
      else if (data.ok === false) finish(new Error(typeof data.error === "string" ? data.error : "Ajout refusé"));
    };
    const send = (): void => {
      attempt += 1;
      try { options.postToHost(payload); } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      if (finished) return;
      timer = win.setTimeout(() => {
        if (attempt < 3) send();
        else finish(new Error("Ajout non confirmé — réessayer"));
      }, (options.timeoutMs ?? 900) * attempt);
    };
    win.addEventListener("message", receive);
    send();
  });
}

export function installChatAttach(options: ChatAttachOptions): void {
  const button = options.button;
  if (!button) return;
  const win = options.window || window;
  const path = options.path;
  if (!path) { button.hidden = true; return; }
  const name = path.split("/").pop() || path;
  const title = button.getAttribute("title") || "Ajouter au chat";
  let timer = 0;
  let pending = false;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    if (pending || button.hasAttribute("disabled")) return;
    pending = true;
    win.clearTimeout(timer);
    button.classList.remove("is-done");
    button.setAttribute("disabled", "");
    button.setAttribute("aria-busy", "true");
    button.setAttribute("title", "Ajout au chat en cours…");
    try {
      await requestChatAttachment({window: win, postToHost: options.postToHost, payload: {
        type: "atelier-add-to-chat", path, name,
        text: `${path}\nFichier joint depuis l'éditeur — lis-le (outil Read) avant de répondre.`,
      }});
      options.notify?.(`${name} ajouté au chat`, "success");
      button.classList.add("is-done");
      button.setAttribute("title", "Ajouté au chat");
      timer = win.setTimeout(() => {
        button.classList.remove("is-done");
        button.setAttribute("title", title);
      }, DONE_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      button.setAttribute("title", message);
      options.notify?.(message, "error");
    } finally {
      pending = false;
      button.removeAttribute("disabled");
      button.removeAttribute("aria-busy");
    }
  });
}
