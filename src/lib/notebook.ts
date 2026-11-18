// Client WebSocket, types et assainissement HTML/SVG des cahiers Jupyter (.ipynb).
import { wsSend } from "./wsBus";

export type CellKind = "code" | "markdown" | "raw";

export type UiOutput =
  /** `omittedLines` : lignes du début non envoyées à l'écran (le fichier garde tout). */
  | { kind: "stream"; name: string; text: string; omittedLines?: number }
  | {
      kind: "data";
      executionCount?: number | null;
      textPlain?: string | null;
      textHtml?: string | null;
      textMarkdown?: string | null;
      textLatex?: string | null;
      imageSvg?: string | null;
      imagePng?: string | null;
      imageJpeg?: string | null;
      applicationJson?: unknown;
      displayId?: string | null;
      /** Formats trop lourds pour l'écran, gardés dans le fichier. */
      omitted?: OmittedMime[];
    }
  | { kind: "error"; ename: string; evalue: string; traceback: string };

export type OmittedMime = { mime: string; bytes: number };

export type UiCell = {
  index: number;
  id: string;
  cellType: CellKind;
  source: string;
  executionCount?: number | null;
  title?: string | null;
  outputs: UiOutput[];
};

export type DiffLine = {
  kind: "same" | "add" | "del";
  text: string;
};

export type DownstreamConsumer = {
  symbol: string;
  usedInCells: number[];
};

export type EditDiagnostics = {
  redundantImports: string[];
  brokenDownstreamSymbols: DownstreamConsumer[];
};

export type CellProposal = {
  id: string;
  kind: "edit" | "insertAfter" | "delete";
  targetCellId: string;
  cellType: CellKind;
  originalSource: string;
  proposedSource: string;
  purpose: string;
  author: string;
  createdAt: string;
  addedLines: number;
  removedLines: number;
  diffLines: DiffLine[];
  diagnostics: EditDiagnostics;
  upstreamSummary: string;
  downstreamSummary: string;
};

export type DiscoveredKernel = {
  id: string;
  name: string;
  displayName: string;
  language: string;
  source: string;
  backend: "zmq_kernelspec" | "atelier_python_fallback";
};

export type LiveVariable = {
  name: string;
  type: string;
  shape: string;
  sizeBytes: number;
  preview: string;
};

export type NotebookKernelStatus = {
  /** `dead` : le noyau s'est arrêté tout seul (plantage, mémoire épuisée). */
  state: "off" | "starting" | "idle" | "busy" | "error" | "dead";
  kernelId?: string | null;
  displayName?: string | null;
  language?: string | null;
  backend?: "zmq_kernelspec" | "atelier_python_fallback" | null;
  pid?: number | null;
  rssBytes?: number | null;
  busyCellId?: string | null;
  message?: string | null;
  exitCode?: number | null;
  exitSignal?: number | null;
};

export type InputRequest = { cellId: string; prompt: string; password: boolean };

export type NotebookSnapshot = {
  path: string;
  revision: string;
  unsaved: boolean;
  language: string;
  preferredKernelspec?: string | null;
  cells: UiCell[];
  proposals: CellProposal[];
  status: NotebookKernelStatus;
  variables: LiveVariable[];
  /** Le fichier a changé sur le disque alors que l'onglet a des changements non enregistrés. */
  diskChanged?: boolean;
  /** Copie de secours plus récente que le fichier (session précédente interrompue). */
  recovery?: { savedAtMs: number } | null;
  /** Le code attend une réponse à `input()`. */
  pendingInput?: InputRequest | null;
};

export type CellDiffEntry = {
  cellId: string;
  index?: number | null;
  baseIndex?: number | null;
  cellType: CellKind;
  title?: string | null;
  status: "modified" | "added" | "removed";
  addedLines: number;
  removedLines: number;
  outputsChanged: boolean;
  lines: DiffLine[];
};

export type NotebookPushEvent =
  | { event: "kernelStatus"; path: string; status: NotebookKernelStatus }
  | { event: "cellUpdated"; path: string; cell: UiCell; running: boolean }
  | { event: "proposalsUpdated"; path: string; proposals: CellProposal[]; revision: string }
  | { event: "variablesUpdated"; path: string; variables: LiveVariable[] }
  | { event: "runFailed"; path: string; message: string }
  | ({ event: "inputRequested"; path: string } & InputRequest)
  | { event: "inputCleared"; path: string }
  | { event: "diskChanged"; path: string; changed: boolean }
  | { event: "snapshotReplaced"; path: string; snapshot: NotebookSnapshot };

/** Applique un événement poussé par le moteur à l'état de l'onglet (pur, testé). */
export function applyNotebookEvent(prev: NotebookSnapshot, ev: NotebookPushEvent): NotebookSnapshot {
  switch (ev.event) {
    case "kernelStatus":
      return { ...prev, status: ev.status };
    case "cellUpdated":
      return { ...prev, cells: prev.cells.map((c) => (c.id === ev.cell.id ? ev.cell : c)), unsaved: true };
    case "proposalsUpdated":
      return { ...prev, proposals: ev.proposals, revision: ev.revision };
    case "variablesUpdated":
      return { ...prev, variables: ev.variables };
    case "inputRequested":
      return { ...prev, pendingInput: { cellId: ev.cellId, prompt: ev.prompt, password: ev.password } };
    case "inputCleared":
      return prev.pendingInput ? { ...prev, pendingInput: null } : prev;
    case "diskChanged":
      return { ...prev, diskChanged: ev.changed };
    case "snapshotReplaced":
      return ev.snapshot;
    default:
      return prev;
  }
}

/** Arrêt du noyau : code de sortie lisible, et piste « mémoire » pour SIGKILL (9). */
export function kernelExitDetail(status: Pick<NotebookKernelStatus, "exitCode" | "exitSignal">): {
  code: string | null;
  likelyOom: boolean;
} {
  if (status.exitSignal != null) {
    return { code: `signal ${status.exitSignal}`, likelyOom: status.exitSignal === 9 };
  }
  if (status.exitCode != null) return { code: `code ${status.exitCode}`, likelyOom: false };
  return { code: null, likelyOom: false };
}

let nextReqSeq = 1;

export function notebookCommand<T = Record<string, unknown>>(
  op: string,
  params: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<T> {
  const requestId = `nb-${Date.now()}-${nextReqSeq++}`;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener("notebook-command", onReply);
      reject(new Error("Délai dépassé sur le cahier Jupyter"));
    }, timeoutMs);

    function onReply(ev: Event) {
      const msg = (ev as CustomEvent).detail;
      if (!msg || msg.requestId !== requestId) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("notebook-command", onReply);
      if (msg.error) {
        const errText = typeof msg.error === "string" ? msg.error : (msg.error.message ?? "Erreur cahier");
        reject(new Error(errText));
      } else {
        resolve((msg.data ?? msg) as T);
      }
    }

    window.addEventListener("notebook-command", onReply);
    if (!wsSend({ type: "notebookCommand", requestId, op, ...params })) {
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("notebook-command", onReply);
      reject(new Error("Serveur Atelier hors ligne"));
    }
  });
}

export function notebookInterrupt(path: string, projectRoot?: string): Promise<void> {
  const requestId = `nb-int-${Date.now()}-${nextReqSeq++}`;
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("notebook-command", onReply);
      resolve();
    }, 5_000);
    function onReply(ev: Event) {
      const msg = (ev as CustomEvent).detail;
      if (!msg || msg.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("notebook-command", onReply);
      if (msg.error) reject(new Error(String(msg.error)));
      else resolve();
    }
    window.addEventListener("notebook-command", onReply);
    if (!wsSend({ type: "notebookInterrupt", requestId, path, projectRoot })) {
      window.clearTimeout(timer);
      window.removeEventListener("notebook-command", onReply);
      reject(new Error("Serveur Atelier hors ligne"));
    }
  });
}

export function formatBytes(bytes?: number | null, lang: "fr" | "en" = "fr"): string {
  if (!bytes || bytes <= 0) return "";
  const ko = 1024;
  const mo = ko * 1024;
  const go = mo * 1024;
  const [b, k, m, g] = lang === "en" ? ["B", "KB", "MB", "GB"] : ["o", "Ko", "Mo", "Go"];
  const dec = (n: number) => (lang === "en" ? n.toFixed(1) : n.toFixed(1).replace(".", ","));
  if (bytes >= go) return `${dec(bytes / go)} ${g}`;
  if (bytes >= mo) return `${dec(bytes / mo)} ${m}`;
  if (bytes >= ko) return `${Math.round(bytes / ko)} ${k}`;
  return `${bytes} ${b}`;
}

/** Extrait le chemin `.ipynb` d'une URL d'onglet `ipynb_studio.html?path=…`. */
export function notebookPathFromTabUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const page = parsed.pathname.split("/").pop() ?? "";
    if (page !== "ipynb_studio.html") return null;
    const raw = parsed.searchParams.get("path")?.trim() ?? "";
    return raw || null;
  } catch {
    return null;
  }
}

const FORBIDDEN_TAGS = new Set([
  "script", "iframe", "frame", "frameset", "object", "embed", "applet",
  "meta", "link", "base", "form", "input", "button", "textarea", "select",
]);

/** Assainit le HTML de sortie d'un cahier (`DataFrame`, `arviz.Summary`, `xarray`)
 *  en retirant tout élément actif, feuille `<style>` globale et attribut `on*` / `javascript:`. */
export function sanitizeNotebookHtml(rawHtml: string): string {
  if (!rawHtml || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  // Pandas/Polars injectent parfois un bloc `<style>` générique `.dataframe ...` qui casse le thème : on le retire.
  for (const styleEl of [...doc.querySelectorAll("style")]) {
    styleEl.remove();
  }
  const cleanNode = (root: ParentNode) => {
    for (const el of [...root.querySelectorAll("*")]) {
      const tag = el.tagName.toLowerCase();
      if (FORBIDDEN_TAGS.has(tag)) {
        el.remove();
        continue;
      }
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim().toLowerCase();
        if (
          name.startsWith("on") ||
          name === "srcdoc" ||
          name === "style" ||
          ((name === "href" || name === "src" || name === "xlink:href") &&
            (val.startsWith("javascript:") || val.startsWith("vbscript:") || val.startsWith("data:text/html")))
        ) {
          el.removeAttribute(attr.name);
        }
      }
    }
  };
  cleanNode(doc.body);
  return doc.body.innerHTML;
}

/** Assainit un SVG produit par `matplotlib` / `Cartopy` avant injection. */
export function sanitizeNotebookSvg(rawSvg: string): string {
  if (!rawSvg || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(rawSvg, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return "";
  for (const el of [...svg.querySelectorAll("*")]) {
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "foreignobject" || tag === "iframe") {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (
        name.startsWith("on") ||
        ((name === "href" || name === "xlink:href") && val.startsWith("javascript:"))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return svg.outerHTML;
}

export function formatNotebookSelectionCitation(
  notebookName: string,
  cellIndex: number,
  part: "code" | "output",
  text: string,
  lines?: [number, number],
): string {
  // Même forme que les autres éditeurs (« chemin (L3-5) : « … » ») : le chat
  // en fait la même capsule, nom du cahier et cellule, puis les lignes.
  const label = part === "code" ? `${notebookName} [${cellIndex}]` : `${notebookName} Out[${cellIndex}]`;
  const body = text.trim();
  const [from, to] = lines ?? [1, Math.max(1, body.split("\n").length)];
  const range = from === to ? `L${from}` : `L${from}-${to}`;
  return `${label} (${range}) : « ${body} »`;
}
