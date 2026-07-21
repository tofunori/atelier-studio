import type {StudioEditor} from "./editor_contract";

export interface StudioCommandOptions {
  getEditor(): StudioEditor | null;
  save?(): unknown;
  escape?(): void;
  compile?(): unknown;
  sync?(): unknown;
  toggleMode?(): unknown;
  selectAll?: boolean;
  canSave?(editor: StudioEditor): boolean;
  document?: Document;
}

export function installStudioCommands(options: StudioCommandOptions): () => void {
  const doc = options.document || document;
  const handler = (event: KeyboardEvent): void => {
    const editor = options.getEditor();
    if (event.key === "Escape") {
      options.escape?.();
      return;
    }
    const command = event.metaKey || event.ctrlKey;
    if (!command) return;
    const key = event.key.toLowerCase();
    if (options.selectAll && key === "a" && !event.shiftKey && !event.altKey && editor) {
      event.preventDefault();
      editor.execCommand("selectAll");
      editor.focus();
    } else if (key === "s" && editor && options.save && (options.canSave?.(editor) ?? true)) {
      event.preventDefault();
      void options.save();
    } else if (key === "b" && editor && options.compile) {
      event.preventDefault();
      void options.compile();
    } else if (key === "j" && editor && options.sync) {
      event.preventDefault();
      void options.sync();
    } else if (key === "e" && options.toggleMode) {
      event.preventDefault();
      void options.toggleMode();
    }
  };
  doc.addEventListener("keydown", handler);
  return () => doc.removeEventListener("keydown", handler);
}
