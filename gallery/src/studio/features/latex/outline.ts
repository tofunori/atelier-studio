import type {StudioEditor} from "../../core/editor_contract";

export interface LatexOutlineOptions {
  getEditor(): StudioEditor | null;
  element: HTMLElement;
  button: HTMLElement;
  revealLine(editor: StudioEditor, line: number): void;
  /** Signets posés en vue Lecture, dans l'ordre du document. Le plan est déjà
   *  l'endroit d'où l'on saute dans le fichier : les marques s'y rangent en
   *  tête plutôt que d'ouvrir un panneau de plus. `line` nulle = ancrage perdu
   *  après réécriture, la rangée s'affiche éteinte et ne saute nulle part. */
  bookmarks?(): ReadonlyArray<{id: string; label: string; line: number | null}>;
  document?: Document;
}

export interface LatexOutlineController {
  build(): void;
  toggle(force?: boolean): void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"})[character] || character);
}

export function createLatexOutlineController(options: LatexOutlineOptions): LatexOutlineController {
  const doc = options.document || document;
  const build = (): void => {
    const editor = options.getEditor();
    if (!editor) return;
    const items: Array<{level: number; title: string; line: number}> = [];
    // Tous les niveaux de sectionnement de LaTeX, pas seulement les trois du
    // milieu : un mémoire à \chapter ou une annexe à \paragraph avaient un
    // plan vide alors que le document en est plein.
    const pattern = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{([^{}]*)\}/;
    editor.getValue().split("\n").forEach((line, index) => {
      const match = pattern.exec(line);
      if (!match) return;
      const levels: Record<string, number> = {
        part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3,
        paragraph: 3, subparagraph: 3,
      };
      items.push({level: levels[match[1] || ""] || 1, title: match[2] || "", line: index});
    });
    const cursorLine = editor.getCursor().line;
    let active = -1;
    items.forEach((item, index) => { if (item.line <= cursorLine) active = index; });
    const marks = options.bookmarks?.() || [];
    const marksHtml = marks.length
      ? '<div class="oh">Signets</div>' + marks.map((mark) => (mark.line === null
        ? `<div class="oi om dead" title="Ancrage perdu — paragraphe réécrit">${escapeHtml(mark.label)}</div>`
        : `<button class="oi om" data-l="${mark.line}">${escapeHtml(mark.label)}</button>`)).join("")
      : "";
    options.element.innerHTML = marksHtml + '<div class="oh">Plan</div>' + (items.length
      ? items.map((item, index) => `<button class="oi l${item.level}${index === active ? " on" : ""}" data-l="${item.line}">${escapeHtml(item.title)}</button>`).join("")
      : '<div class="oi" style="cursor:default">aucune section</div>');
  };
  const toggle = (force?: boolean): void => {
    const open = force ?? !options.element.classList.contains("open");
    options.element.classList.toggle("open", open);
    if (open) build();
  };
  options.element.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>(".oi[data-l]");
    const editor = options.getEditor();
    if (!button || !editor) return;
    options.revealLine(editor, Number.parseInt(button.dataset.l || "0", 10));
    toggle(false);
  });
  options.button.onclick = () => toggle();
  doc.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o") {
      event.preventDefault();
      toggle();
    }
    if (event.key === "Escape") toggle(false);
  });
  doc.addEventListener("mousedown", (event) => {
    const target = event.target as Element | null;
    if (options.element.classList.contains("open") && target && !options.element.contains(target)
      && target !== options.button && !target.closest("#outlineBtn")) toggle(false);
  });
  return {build, toggle};
}
