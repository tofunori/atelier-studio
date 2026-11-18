// Client WebSocket, types et assainissement HTML/SVG des cahiers Jupyter (.ipynb).
import { wsSend } from "./wsBus";

export type CellKind = "code" | "markdown" | "raw";

export type UiOutput =
  | { kind: "stream"; name: string; text: string }
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
    }
  | { kind: "error"; ename: string; evalue: string; traceback: string };

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
  state: "off" | "starting" | "idle" | "busy" | "error";
  kernelId?: string | null;
  displayName?: string | null;
  language?: string | null;
  backend?: "zmq_kernelspec" | "atelier_python_fallback" | null;
  pid?: number | null;
  rssBytes?: number | null;
  busyCellId?: string | null;
  message?: string | null;
};

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
  | { event: "variablesUpdated"; path: string; variables: LiveVariable[] };

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

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const ko = 1024;
  const mo = ko * 1024;
  const go = mo * 1024;
  if (bytes >= go) return `${(bytes / go).toFixed(1).replace(".", ",")} Go`;
  if (bytes >= mo) return `${(bytes / mo).toFixed(1).replace(".", ",")} Mo`;
  if (bytes >= ko) return `${Math.round(bytes / ko)} Ko`;
  return `${bytes} o`;
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
): string {
  const label = part === "code" ? `${notebookName} · [${cellIndex}]` : `${notebookName} · Out[${cellIndex}]`;
  return `Extrait de \`${label}\` :\n\`\`\`\n${text.trim()}\n\`\`\`\n`;
}
