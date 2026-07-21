export interface FilePickerItem {
  name: string;
  dir: boolean;
}

export interface FilePickerResponse {
  path: string;
  parent?: string;
  items: FilePickerItem[];
  error?: string;
}

export interface StudioFilePickerOptions {
  currentPath: string | null;
  picker: HTMLElement;
  pathLabel: HTMLElement;
  list: HTMLElement;
  openButton?: HTMLElement | null;
  editable?: RegExp;
  document?: Document;
  window?: Window;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export interface StudioFilePicker {
  show(directory?: string): Promise<void>;
  hide(): void;
  open(target: string): void;
}

const DEFAULT_EDITABLE = /\.(tex|sty|bib|py|r|R|md|jl|sh|bash|txt|csv|json|yaml|yml|toml)$/;

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
  })[character] || character);
}

export function recentStudioFiles(storage: Pick<Storage, "getItem">): string[] {
  try {
    const value = JSON.parse(storage.getItem("studioRecents") || "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentStudioFile(path: string, storage: Pick<Storage, "getItem" | "setItem">): void {
  const recent = recentStudioFiles(storage).filter((item) => item !== path);
  recent.unshift(path);
  storage.setItem("studioRecents", JSON.stringify(recent.slice(0, 10)));
}

export function studioPageForPath(path: string): "latex_studio.html" | "code_editor.html" {
  return path.endsWith(".tex") ? "latex_studio.html" : "code_editor.html";
}

export function createStudioFilePicker(options: StudioFilePickerOptions): StudioFilePicker {
  const doc = options.document || document;
  const win = options.window || window;
  const storage = options.storage || win.localStorage;
  const editable = options.editable || DEFAULT_EDITABLE;
  const hide = (): void => { options.picker.classList.remove("show"); };
  const open = (target: string): void => {
    win.location.href = `/.fig_thumbs/${studioPageForPath(target)}?path=${encodeURIComponent(target)}`;
  };
  const show = async (directory = ""): Promise<void> => {
    const fallbackDirectory = options.currentPath ? options.currentPath.replace(/\/[^/]*$/, "") : "";
    const response = await win.fetch(`/ls?dir=${encodeURIComponent(directory || fallbackDirectory)}`);
    const payload = await response.json() as FilePickerResponse;
    if (payload.error) return;
    options.picker.classList.add("show");
    options.pathLabel.textContent = payload.path.replace(/^\/Users\/[^/]+/, "~");
    options.list.innerHTML = "";
    const append = (label: string, className: string, activate: () => void): void => {
      const item = doc.createElement("div");
      item.innerHTML = label;
      item.className = className;
      item.onclick = activate;
      options.list.appendChild(item);
    };
    const recent = recentStudioFiles(storage).filter((path) => path !== options.currentPath);
    if (recent.length) {
      recent.forEach((path) => append(`&#128337; ${escapeHtml(path.split("/").pop() || path)}`
        + ` <span style="color:var(--muted);font-size:11px">${escapeHtml(path.replace(/^\/Users\/[^/]+\/Documents\//, "").replace(/\/[^/]*$/, ""))}</span>`,
      "", () => open(path)));
      const separator = doc.createElement("div");
      separator.style.cssText = "border-bottom:1px solid var(--border);margin:4px 0;padding:0;height:1px;cursor:default";
      options.list.appendChild(separator);
    }
    if (payload.parent) append("&#8617; ..", "d", () => { void show(payload.parent); });
    payload.items.filter((item) => item.dir).forEach((item) =>
      append(`&#128193; ${escapeHtml(item.name)}`, "d", () => { void show(`${payload.path}/${item.name}`); }));
    payload.items.filter((item) => !item.dir && editable.test(item.name)).forEach((item) =>
      append(escapeHtml(item.name), "", () => open(`${payload.path}/${item.name}`)));
  };
  options.picker.onclick = (event) => {
    if (event.target === options.picker) hide();
  };
  doc.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
  if (options.openButton) options.openButton.onclick = () => { void show(); };
  return {show, hide, open};
}
