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
  notify?(message: string): void;
  window?: Window;
};

const DONE_MS = 1400;

export function installChatAttach(options: ChatAttachOptions): void {
  const button = options.button;
  if (!button) return;
  const win = options.window || window;
  const path = options.path;
  if (!path) { button.hidden = true; return; }
  const name = path.split("/").pop() || path;
  const title = button.getAttribute("title") || "Ajouter au chat";
  let timer = 0;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    options.postToHost({
      type: "atelier-add-to-chat",
      path,
      name,
      text: `${path}\nFichier joint depuis l'éditeur — lis-le (outil Read) avant de répondre.`,
    });
    options.notify?.(`${name} ajouté au chat`);
    // Accusé visuel sur le bouton lui-même : l'app n'accuse pas réception de
    // ce message, donc ne jamais prétendre plus que « envoyé ».
    button.classList.add("is-done");
    button.setAttribute("title", "Ajouté au chat");
    win.clearTimeout(timer);
    timer = win.setTimeout(() => {
      button.classList.remove("is-done");
      button.setAttribute("title", title);
    }, DONE_MS);
  });
}
