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
  const box = options.list.parentElement || options.picker;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Ouvrir un fichier");
  box.tabIndex = -1;
  options.openButton?.setAttribute("aria-haspopup", "dialog");
  let returnFocus: HTMLElement | null = null;
  let request = 0;
  const hide = (): void => {
    if (!options.picker.classList.contains("show")) return;
    request += 1;
    options.picker.classList.remove("show");
    options.openButton?.setAttribute("aria-expanded", "false");
    if (returnFocus?.isConnected) returnFocus.focus();
  };
  const open = (target: string): void => {
    win.location.href = `/.fig_thumbs/${studioPageForPath(target)}?path=${encodeURIComponent(target)}`;
  };
  // EDIT-08 : icônes SVG monochromes (16 px de colonne) au lieu des emojis.
  const svg = (d: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    up: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v6"/>'),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  };
  const row = (icon: string, name: string, sub = ""): string =>
    `<span class="pk-ic">${icon}</span><span class="pk-name">${escapeHtml(name)}</span>${sub ? `<span class="pk-sub">${escapeHtml(sub)}</span>` : ""}`;
  const append = (label: string, className: string, activate: () => void): HTMLButtonElement => {
    const item = doc.createElement("button");
    item.type = "button";
    item.innerHTML = label;
    item.className = className ? `pk-row ${className}` : "pk-row";
    item.onclick = activate;
    options.list.appendChild(item);
    return item;
  };
  const show = async (directory = ""): Promise<void> => {
    if (!options.picker.classList.contains("show")) returnFocus = doc.activeElement as HTMLElement | null;
    const current = ++request;
    options.picker.classList.add("show");
    options.openButton?.setAttribute("aria-expanded", "true");
    options.pathLabel.textContent = "Chargement…";
    options.list.replaceChildren();
    box.setAttribute("aria-busy", "true");
    box.focus();
    const fallbackDirectory = options.currentPath ? options.currentPath.replace(/\/[^/]*$/, "") : "";
    try {
      const response = await win.fetch(`/ls?dir=${encodeURIComponent(directory || fallbackDirectory)}`);
      const payload = await response.json() as FilePickerResponse;
      if (current !== request) return;
      if (!response.ok || payload.error || !Array.isArray(payload.items)) throw new Error(payload.error || "Liste indisponible");
      options.pathLabel.textContent = payload.path.replace(/^\/Users\/[^/]+/, "~");
      const recent = recentStudioFiles(storage).filter((path) => path !== options.currentPath);
      if (recent.length) {
        recent.forEach((path) => append(row(ICONS.clock, path.split("/").pop() || path,
          path.replace(/^\/Users\/[^/]+\/Documents\//, "").replace(/\/[^/]*$/, "")), "", () => open(path)));
        const separator = doc.createElement("div");
        separator.setAttribute("role", "separator");
        separator.className = "pk-sep";
        options.list.appendChild(separator);
      }
      if (payload.parent) append(row(ICONS.up, "Dossier parent"), "d", () => { void show(payload.parent); });
      payload.items.filter((item) => item.dir).forEach((item) =>
        append(row(ICONS.folder, item.name), "d", () => { void show(`${payload.path}/${item.name}`); }));
      payload.items.filter((item) => !item.dir && editable.test(item.name)).forEach((item) =>
        append(row(ICONS.file, item.name), "", () => open(`${payload.path}/${item.name}`)));
      if (!options.list.children.length) options.pathLabel.textContent += " — Aucun fichier compatible";
    } catch (error) {
      if (current !== request) return;
      options.pathLabel.textContent = `Impossible de charger les fichiers : ${error instanceof Error ? error.message : String(error)}`;
      append("Réessayer", "", () => { void show(directory); });
    } finally {
      if (current === request) {
        box.removeAttribute("aria-busy");
        (options.list.querySelector("button") || box).focus();
      }
    }
  };
  options.picker.onclick = (event) => {
    if (event.target === options.picker) hide();
  };
  doc.addEventListener("keydown", (event) => {
    if (!options.picker.classList.contains("show")) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation(); hide(); return;
    }
    const buttons = Array.from(options.list.querySelectorAll<HTMLButtonElement>("button"));
    const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === "Tab" && (!buttons.length || (event.shiftKey ? index <= 0 : index === buttons.length - 1))) {
      event.preventDefault();
      (buttons[event.shiftKey ? buttons.length - 1 : 0] || box).focus();
    }
  }, true);
  if (options.openButton) options.openButton.onclick = () => { options.openButton?.focus(); void show(); };
  return {show, hide, open};
}
