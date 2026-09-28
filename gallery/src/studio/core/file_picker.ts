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
  const append = (label: string, className: string, activate: () => void): HTMLButtonElement => {
    const item = doc.createElement("button");
    item.type = "button";
    item.innerHTML = label;
    item.className = className;
    // Les deux coquilles historiques stylent leurs rangées div : ce bouton
    // conserve leur métrique tout en apportant Entrée/Espace nativement.
    item.style.cssText = "display:flex;gap:8px;width:100%;padding:7px 14px;border:0;background:transparent;color:inherit;text-align:left;font:var(--fs-body,13px) var(--ui-font);cursor:pointer";
    item.onfocus = () => { item.style.background = "var(--surface-hover,var(--border))"; };
    item.onblur = () => { item.style.background = "transparent"; };
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
        recent.forEach((path) => append(`&#128337; ${escapeHtml(path.split("/").pop() || path)}`
          + ` <span style="color:var(--muted);font-size:var(--fs-label,11px)">${escapeHtml(path.replace(/^\/Users\/[^/]+\/Documents\//, "").replace(/\/[^/]*$/, ""))}</span>`,
        "", () => open(path)));
        const separator = doc.createElement("div");
        separator.setAttribute("role", "separator");
        separator.style.cssText = "border-bottom:1px solid var(--border);margin:4px 0;padding:0;height:1px";
        options.list.appendChild(separator);
      }
      if (payload.parent) append("&#8617; ..", "d", () => { void show(payload.parent); });
      payload.items.filter((item) => item.dir).forEach((item) =>
        append(`&#128193; ${escapeHtml(item.name)}`, "d", () => { void show(`${payload.path}/${item.name}`); }));
      payload.items.filter((item) => !item.dir && editable.test(item.name)).forEach((item) =>
        append(escapeHtml(item.name), "", () => open(`${payload.path}/${item.name}`)));
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
