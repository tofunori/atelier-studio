import type {StudioEditor} from "../../core/editor_contract";

interface StatusEditor extends StudioEditor {
  clearGutter(gutter: string): void;
}

interface RuffDiagnostic {
  row?: number;
  code?: string;
  message?: string;
}

interface RuffResponse {
  available?: boolean;
  diagnostics?: RuffDiagnostic[];
}

export interface FloatingMenuPosition {
  left: number;
  top: number;
}

export interface StudioStatusBarOptions {
  extension: string;
  mode: string | Record<string, unknown> | null;
  path: string;
  getEditor(): StatusEditor | null;
  applyWrap(value: string): void;
  rewrapAll?(): number;
  /** Compilation immédiate quand on bascule « Compile: auto » — réaligne
   * synctex sans attendre la prochaine sauvegarde. */
  autoCompile?(): void;
  revealLine(editor: StatusEditor, line: number): void;
  document?: Document;
  window?: Window;
  storage?: Pick<Storage, "getItem" | "setItem">;
  requestLint?(path: string): Promise<RuffResponse>;
  nowLabel?(): string;
}

export interface StudioStatusBarController {
  notifySaved(): void;
  refreshWrap(): void;
  refreshAutoRewrap(): void;
  runLint(): Promise<void>;
  destroy(): void;
}

const PRESET_WRAP_COLUMNS = new Set(["50", "60", "70", "80", "90", "100", "120"]);

export function isAutoRewrapEnabled(storage: Pick<Storage, "getItem">): boolean {
  // Physical rewrap mutates the source and therefore stays opt-in. Its state is
  // now visible in the status bar instead of being hidden in the More menu.
  return storage.getItem("texAutoRewrap") === "1";
}

/** Compilation automatique débouncée après sauvegarde et après rechargement
 * agent. Sans elle, le PDF et son synctex datent de la dernière compilation
 * manuelle : chaque clic PDF↔source « tombe à côté » d'autant de lignes que
 * les agents en ont déplacé depuis. */
export function isAutoCompileEnabled(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem("texAutoCompile") === "1";
}

/** Clés serveur des réglages (piège connu n°1 : le `localStorage` du WebView
 * ne survit pas au redémarrage de l'app, donc il ne peut pas être la source de
 * vérité). Le cache local reste, mais l'état vient du serveur au démarrage. */
const AUTO_REWRAP_STATE_KEY = "texAutoRewrap";
const AUTO_COMPILE_STATE_KEY = "texAutoCompile";

/** Charge un réglage booléen depuis `/state` et amorce le cache local. Un
 * échec est sans conséquence : on garde ce que le cache contient. */
async function hydrateServerPref(
  storage: Pick<Storage, "getItem" | "setItem">,
  fetchImpl: typeof fetch,
  key: string,
): Promise<boolean> {
  try {
    const response = await fetchImpl("/state");
    const state = await response.json() as Record<string, unknown>;
    const value = state?.[key];
    if (value === true || value === false) {
      storage.setItem(key, value ? "1" : "0");
      return value;
    }
  } catch { /* serveur muet : le cache local fait foi */ }
  return storage.getItem(key) === "1";
}

/** Persiste un réglage booléen côté serveur, en fusionnant pour ne pas
 * écraser le reste de l'état de la galerie. */
async function persistServerPref(
  enabled: boolean,
  fetchImpl: typeof fetch,
  key: string,
): Promise<void> {
  try {
    const current = await fetchImpl("/state")
      .then((response) => response.json() as Promise<Record<string, unknown>>)
      .catch(() => ({}));
    const next = {...(current && typeof current === "object" ? current : {}), [key]: enabled};
    await fetchImpl("/state", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(next),
    });
  } catch { /* le réglage reste actif pour la session en cours */ }
}

export const hydrateAutoRewrap = (
  storage: Pick<Storage, "getItem" | "setItem">,
  fetchImpl: typeof fetch,
): Promise<boolean> => hydrateServerPref(storage, fetchImpl, AUTO_REWRAP_STATE_KEY);

export const persistAutoRewrap = (
  enabled: boolean,
  fetchImpl: typeof fetch,
): Promise<void> => persistServerPref(enabled, fetchImpl, AUTO_REWRAP_STATE_KEY);

export const hydrateAutoCompile = (
  storage: Pick<Storage, "getItem" | "setItem">,
  fetchImpl: typeof fetch,
): Promise<boolean> => hydrateServerPref(storage, fetchImpl, AUTO_COMPILE_STATE_KEY);

export const persistAutoCompile = (
  enabled: boolean,
  fetchImpl: typeof fetch,
): Promise<void> => persistServerPref(enabled, fetchImpl, AUTO_COMPILE_STATE_KEY);

export function floatingMenuPosition(
  anchor: Pick<DOMRect, "left" | "top" | "bottom">,
  menu: {width: number; height: number},
  viewport: {width: number; height: number},
  gap = 6,
  margin = 8,
): FloatingMenuPosition {
  const below = viewport.height - anchor.bottom - margin;
  const above = anchor.top - margin;
  const preferredTop = below >= menu.height || below >= above
    ? anchor.bottom + gap
    : anchor.top - menu.height - gap;
  return {
    left: Math.max(margin, Math.min(anchor.left, viewport.width - menu.width - margin)),
    top: Math.max(margin, Math.min(preferredTop, viewport.height - menu.height - margin)),
  };
}

function modeLabel(mode: StudioStatusBarOptions["mode"], extension: string): string {
  const key = typeof mode === "string" ? mode : "javascript";
  return ({
    stex: "LaTeX",
    python: "Python",
    r: "R",
    markdown: "Markdown",
    julia: "Julia",
    shell: "Shell",
  } as Record<string, string>)[key] || extension.toUpperCase();
}

export function createStudioStatusBar(options: StudioStatusBarOptions): StudioStatusBarController | null {
  const doc = options.document || document;
  const win = options.window || window;
  const storage = options.storage || win.localStorage;
  const sbMode = doc.getElementById("sbMode");
  if (!sbMode) return null;
  const sbWrap = doc.getElementById("sbWrap") as HTMLElement;
  const sbRewrap = doc.getElementById("sbRewrap") as HTMLElement | null;
  const sbAutoCompile = doc.getElementById("sbAutoCompile") as HTMLElement | null;
  const sbSaved = doc.getElementById("sbSaved") as HTMLElement;
  const sbLint = doc.getElementById("sbLint") as HTMLElement;
  const lintPane = doc.getElementById("lintPane") as HTMLElement;
  const morePop = doc.getElementById("morePop") as HTMLElement;
  const moreBtn = doc.getElementById("moreBtn") as HTMLElement;
  const wrapMenu = doc.getElementById("wrapMenu") as HTMLElement;
  const wrapMenuInput = doc.getElementById("wrapMenuInput") as HTMLInputElement;
  const disposers: Array<() => void> = [];
  const listen = <K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
  ): void => {
    target.addEventListener(type, handler as EventListener);
    disposers.push(() => target.removeEventListener(type, handler as EventListener));
  };
  sbMode.textContent = modeLabel(options.mode, options.extension);

  const wrapLabel = (): string => {
    const value = storage.getItem("cmWrap") || "win";
    return `Wrap: ${value === "win" ? "window" : value}`;
  };
  const refreshWrap = (): void => {
    const label = wrapLabel();
    sbWrap.textContent = label;
    const menuValue = doc.getElementById("moreWrapVal");
    if (menuValue) menuValue.textContent = label.replace("Wrap: ", "");
    const current = storage.getItem("cmWrap") || "win";
    wrapMenu.querySelectorAll<HTMLElement>(".wm-it").forEach((item) => {
      item.classList.toggle("on", item.dataset.wrap === current);
    });
  };
  const setWrap = (value: string): void => {
    const select = doc.getElementById("wrapSel") as HTMLSelectElement | null;
    if (select?.querySelector(`option[value="${CSS.escape(value)}"]`)) {
      select.value = value;
      select.onchange?.(new Event("change"));
    } else options.applyWrap(value);
    refreshWrap();
  };
  const closeWrapMenu = (): void => { wrapMenu.style.display = "none"; };
  const openWrapMenu = (): void => {
    const anchor = sbWrap.getBoundingClientRect();
    wrapMenu.style.display = "block";
    wrapMenu.style.visibility = "hidden";
    wrapMenu.style.top = "auto";
    wrapMenu.style.bottom = "auto";
    const position = floatingMenuPosition(anchor, {
      width: wrapMenu.offsetWidth,
      height: wrapMenu.offsetHeight,
    }, {width: win.innerWidth, height: win.innerHeight});
    wrapMenu.style.left = `${position.left}px`;
    wrapMenu.style.top = `${position.top}px`;
    wrapMenu.style.visibility = "visible";
    const current = storage.getItem("cmWrap") || "";
    wrapMenuInput.value = /^\d+$/.test(current) && !PRESET_WRAP_COLUMNS.has(current) ? current : "";
  };
  sbWrap.onclick = (event) => {
    event.stopPropagation();
    if (wrapMenu.style.display === "block") closeWrapMenu();
    else openWrapMenu();
  };
  wrapMenu.onclick = (event) => {
    event.stopPropagation();
    const value = (event.target as Element | null)?.closest<HTMLElement>(".wm-it")?.dataset.wrap;
    if (value) {
      setWrap(value);
      closeWrapMenu();
    }
  };
  const commitCustomWrap = (): void => {
    const value = Number.parseInt(wrapMenuInput.value, 10);
    if (value > 0) {
      setWrap(String(value));
      closeWrapMenu();
    }
  };
  wrapMenuInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") commitCustomWrap();
    else if (event.key === "Escape") closeWrapMenu();
  });
  wrapMenuInput.addEventListener("click", (event) => event.stopPropagation());
  listen(doc, "click", closeWrapMenu);

  const refreshAutoRewrap = (): void => {
    const enabled = isAutoRewrapEnabled(storage);
    const label = doc.getElementById("moreAutoRw");
    if (label) label.textContent = enabled ? "activé" : "désactivé";
    doc.getElementById("rewrapAllBtn")?.classList.toggle("auto", enabled);
    if (sbRewrap) {
      sbRewrap.textContent = enabled ? "Rewrap: auto" : "Rewrap: off";
      sbRewrap.classList.toggle("on", enabled);
    }
  };
  const toggleAutoRewrap = (): void => {
    const enabled = isAutoRewrapEnabled(storage);
    storage.setItem("texAutoRewrap", enabled ? "0" : "1");
    void persistAutoRewrap(!enabled, fetch);
    if (!enabled) {
      options.rewrapAll?.();
      options.getEditor()?.focus();
    }
    refreshAutoRewrap();
  };
  if (sbRewrap) {
    sbRewrap.style.display = options.extension === "tex" ? "" : "none";
    sbRewrap.onclick = (event) => {
      event.stopPropagation();
      toggleAutoRewrap();
    };
  }
  const refreshAutoCompile = (): void => {
    if (!sbAutoCompile) return;
    const enabled = isAutoCompileEnabled(storage);
    sbAutoCompile.textContent = enabled ? "Compile: auto" : "Compile: off";
    sbAutoCompile.classList.toggle("on", enabled);
  };
  if (sbAutoCompile) {
    sbAutoCompile.style.display = options.extension === "tex" ? "" : "none";
    sbAutoCompile.onclick = (event) => {
      event.stopPropagation();
      const enabled = isAutoCompileEnabled(storage);
      storage.setItem("texAutoCompile", enabled ? "0" : "1");
      void persistAutoCompile(!enabled, fetch);
      refreshAutoCompile();
      // Bascule vers auto : compiler tout de suite pour réaligner synctex sans
      // attendre la prochaine sauvegarde.
      if (!enabled) options.autoCompile?.();
    };
  }
  moreBtn.onclick = (event) => {
    event.stopPropagation();
    morePop.style.display = morePop.style.display === "none" ? "block" : "none";
    refreshWrap();
    refreshAutoRewrap();
  };
  listen(doc, "click", () => { morePop.style.display = "none"; });
  morePop.onclick = (event) => {
    event.stopPropagation();
    const action = (event.target as Element | null)?.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (action === "save") doc.getElementById("saveBtn")?.click();
    if (action === "open") doc.getElementById("openFile")?.click();
    if (action === "rewrap") doc.getElementById("rewrapBtn")?.click();
    if (action === "rewrapall") {
      options.rewrapAll?.();
      options.getEditor()?.focus();
    }
    if (action === "autorewrap") {
      toggleAutoRewrap();
      return;
    }
    if (action === "outline") doc.getElementById("outlineBtn")?.click();
    if (action === "find") doc.getElementById("findBtn")?.click();
    if (action === "read") doc.getElementById("readBtn")?.click();
    if (action === "help") doc.getElementById("helpBtn")?.click();
    if (action === "wrap") {
      sbWrap.click();
      return;
    }
    if (action !== "wrap") morePop.style.display = "none";
  };
  const findButton = doc.getElementById("findBtn");
  if (findButton) findButton.onclick = () => options.getEditor()?.execCommand("findPersistent");
  const rewrapAllButton = doc.getElementById("rewrapAllBtn");
  if (rewrapAllButton) rewrapAllButton.onclick = () => {
    options.rewrapAll?.();
    options.getEditor()?.focus();
  };

  const header = doc.querySelector<HTMLElement>("header");
  let resizeObserver: ResizeObserver | null = null;
  let fitTimer: number | null = null;
  const ResizeObserverConstructor = (win as Window & {ResizeObserver?: typeof ResizeObserver}).ResizeObserver;
  if (header && ResizeObserverConstructor) {
    const fit = (): void => {
      header.classList.remove("tight");
      if (header.scrollWidth > header.clientWidth + 1) header.classList.add("tight");
    };
    const kick = (): void => {
      if (fitTimer !== null) win.clearTimeout(fitTimer);
      fitTimer = win.setTimeout(fit, 50);
    };
    const observer = new ResizeObserverConstructor(kick);
    observer.observe(header);
    resizeObserver = observer;
    fit();
  }

  let lintMarks: Array<{clear?(): void}> = [];
  const requestLint = options.requestLint || (async (targetPath: string): Promise<RuffResponse> => {
    const response = await win.fetch(`/lint?path=${encodeURIComponent(targetPath)}`);
    return response.json() as Promise<RuffResponse>;
  });
  const runLint = async (): Promise<void> => {
    const editor = options.getEditor();
    if (options.extension !== "py" || !editor) return;
    try {
      const result = await requestLint(options.path);
      lintMarks.forEach((marker) => marker.clear?.());
      lintMarks = [];
      editor.clearGutter("CodeMirror-linenumbers");
      if (!result.available) {
        sbLint.style.display = "none";
        return;
      }
      const diagnostics = result.diagnostics || [];
      sbLint.style.display = "inline";
      sbLint.className = diagnostics.length ? "err" : "ok";
      sbLint.textContent = diagnostics.length ? `✗ ${diagnostics.length} ruff` : "✓ ruff";
      lintPane.replaceChildren();
      for (const diagnostic of diagnostics) {
        const line = Math.max(0, (diagnostic.row || 1) - 1);
        const code = diagnostic.code || "";
        const message = diagnostic.message || "";
        lintMarks.push(editor.markText({line, ch: 0}, {line, ch: editor.getLine(line)?.length ?? 0}, {
          className: "cm-lint-line",
          title: `${code} ${message}`,
        }));
        const row = doc.createElement("div");
        const location = doc.createElement("span");
        location.className = "lc";
        location.textContent = String(diagnostic.row || 1);
        row.append(location, `${code} ${message}`);
        row.onclick = () => options.revealLine(editor, line);
        lintPane.appendChild(row);
      }
      if (!diagnostics.length) lintPane.style.display = "none";
    } catch {
      // Ruff is optional. Keep editor/save usable when the helper is unavailable.
    }
  };
  sbLint.onclick = () => {
    lintPane.style.display = lintPane.style.display === "none" ? "block" : "none";
  };
  const initialLintTimer = win.setTimeout(() => { void runLint(); }, 800);
  const notifySaved = (): void => {
    sbSaved.textContent = `sauvegardé ${options.nowLabel?.() || new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    void runLint();
  };

  refreshWrap();
  refreshAutoRewrap();
  refreshAutoCompile();
  // Les réglages vivent côté serveur : sans cette hydratation, chaque
  // redémarrage de l'app les remettait à zéro et l'automatisme cessait en
  // silence.
  void hydrateAutoRewrap(storage, fetch).then(refreshAutoRewrap);
  void hydrateAutoCompile(storage, fetch).then(refreshAutoCompile);
  return {
    notifySaved,
    refreshWrap,
    refreshAutoRewrap,
    runLint,
    destroy: () => {
      disposers.splice(0).forEach((dispose) => dispose());
      resizeObserver?.disconnect();
      if (fitTimer !== null) win.clearTimeout(fitTimer);
      win.clearTimeout(initialLintTimer);
      lintMarks.forEach((marker) => marker.clear?.());
      lintMarks = [];
    },
  };
}
