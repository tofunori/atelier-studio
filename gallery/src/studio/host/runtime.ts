export interface StudioRuntimeOptions {
  tokenFetch?: boolean;
  hostBridge?: boolean;
  latexDisplayPolicy?: boolean;
  legacyTheme?: "orange" | "blue";
}

type HostPayload = Record<string, unknown>;

declare global {
  interface Window {
    __tokq?: string;
    __atelierNonce?: string;
    __atelierPost?: (payload: HostPayload) => void;
    __atelierTokenFetchInstalled?: boolean;
    __atelierHostBridgeInstalled?: boolean;
  }
}

function searchParam(win: Window, name: string): string | null {
  try {
    return new URLSearchParams(win.location.search).get(name);
  } catch {
    return null;
  }
}

export function installTokenFetch(win: Window = window): void {
  const token = searchParam(win, "token");
  win.__tokq = token ? `&token=${encodeURIComponent(token)}` : "";
  if (!token || win.__atelierTokenFetchInstalled) return;

  const originalFetch = win.fetch.bind(win);
  win.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let nextInput = input;
    try {
      const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const url = new URL(raw, win.location.href);
      if (url.origin === win.location.origin && !url.searchParams.has("token")) {
        url.searchParams.set("token", token);
        if (typeof input === "string") nextInput = `${url.pathname}${url.search}${url.hash}`;
        else if (input instanceof URL) nextInput = url;
        else nextInput = new Request(url, input);
      }
    } catch {
      // Preserve the browser's original fetch error and semantics.
    }
    return originalFetch(nextInput, init);
  };
  win.__atelierTokenFetchInstalled = true;
}

function readNonce(win: Window): string {
  try {
    const match = win.location.hash.match(/atelier_nonce=([\w-]+)/);
    if (match?.[1]) {
      win.sessionStorage.setItem("atelier_nonce", match[1]);
      return match[1];
    }
    return win.sessionStorage.getItem("atelier_nonce") || "";
  } catch {
    return "";
  }
}

export function installHostBridge(win: Window = window): void {
  const nonce = readNonce(win);
  if (nonce) win.__atelierNonce = nonce;
  if (win.__atelierHostBridgeInstalled) return;

  win.__atelierPost = (payload: HostPayload): void => {
    const currentNonce = win.__atelierNonce || readNonce(win);
    try {
      win.top?.postMessage({...payload, nonce: currentNonce}, "*");
    } catch {
      // The host bridge is optional when the page runs standalone.
    }
  };
  win.__atelierHostBridgeInstalled = true;
}

export function applyLatexDisplayPolicy(win: Window = window): void {
  try {
    const pdfMode = searchParam(win, "mode") === "pdf";
    if (!pdfMode && win.localStorage.getItem("texPdfVisible") !== "1") {
      win.document.documentElement.classList.add("tex-editor-only");
    }
  } catch {
    // Storage can be unavailable in hardened WebViews; the default CSS remains safe.
  }
}

const LEGACY_THEMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Encre: {bg: "#1a1917", card: "#232220", card2: "#121110", txt: "#e8e5db", muted: "#948f85", accent: "#cc785c", border: "#332f2a"},
  Profond: {bg: "#1e1d1b", card: "#292724", card2: "#161513", txt: "#ece9e1", muted: "#9a968c", accent: "#d97757", border: "#37342e"},
  Charbon: {bg: "#211f1c", card: "#2b2926", card2: "#1a1815", txt: "#eae7de", muted: "#9d988d", accent: "#e08a63", border: "#38352f"},
  "Neutre chaud": {bg: "#1c1c1a", card: "#272623", card2: "#151513", txt: "#e9e7df", muted: "#98958c", accent: "#d97757", border: "#34322d"},
  "Très foncé": {bg: "#171614", card: "#201f1c", card2: "#100f0d", txt: "#e6e3d9", muted: "#8f8b81", accent: "#d97757", border: "#2e2b26"},
  Codex: {bg: "#282c34", card: "#2f343f", card2: "#21252b", txt: "#abb2bf", muted: "#7f848e", accent: "#4d78cc", border: "#3e4451"},
  Dracula: {bg: "#282a36", card: "#343746", card2: "#21222c", txt: "#f8f8f2", muted: "#9aa0b3", accent: "#bd93f9", border: "#44475a"},
  Nord: {bg: "#2e3440", card: "#3b4252", card2: "#272c36", txt: "#e5e9f0", muted: "#9aa3b2", accent: "#88c0d0", border: "#434c5e"},
};

export function applyLegacyStoredTheme(
  variant: "orange" | "blue",
  win: Window = window,
): void {
  let name = "Default";
  try { name = win.localStorage.getItem("figTheme") || "Default"; } catch { /* use defaults */ }
  const theme = name === "Default"
    ? {bg: "#202024", card: "#27272a", card2: "#1f1f23", txt: "#dbdfe5", muted: "#a1a1aa", accent: variant === "orange" ? "#e8823a" : "#5b9dff", border: "#3f3f46"}
    : LEGACY_THEMES[name];
  if (!theme) return;
  for (const [key, value] of Object.entries(theme)) win.document.documentElement.style.setProperty(`--${key}`, value);
}

export function bootstrap(options: StudioRuntimeOptions = {}): void {
  if (options.tokenFetch !== false) installTokenFetch();
  if (options.hostBridge) installHostBridge();
  if (options.latexDisplayPolicy) applyLatexDisplayPolicy();
  if (options.legacyTheme) applyLegacyStoredTheme(options.legacyTheme);
}
