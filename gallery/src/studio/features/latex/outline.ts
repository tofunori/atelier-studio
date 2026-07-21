import type {StudioEditor} from "../../core/editor_contract";

export interface LatexOutlineOptions {
  getEditor(): StudioEditor | null;
  element: HTMLElement;
  button: HTMLElement;
  revealLine(editor: StudioEditor, line: number): void;
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
    const pattern = /^\s*\\(section|subsection|subsubsection)\*?\{([^{}]*)\}/;
    editor.getValue().split("\n").forEach((line, index) => {
      const match = pattern.exec(line);
      if (!match) return;
      const levels: Record<string, number> = {section: 1, subsection: 2, subsubsection: 3};
      items.push({level: levels[match[1] || ""] || 1, title: match[2] || "", line: index});
    });
    const cursorLine = editor.getCursor().line;
    let active = -1;
    items.forEach((item, index) => { if (item.line <= cursorLine) active = index; });
    options.element.innerHTML = '<div class="oh">Plan</div>' + (items.length
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
