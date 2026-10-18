// Noyau Python persistant du fil (chantier 5) : cellules et état, tenus à jour
// par les messages du runtime (`kernelCells` en réponse, `kernelCell` et
// `kernelStatus` poussés sur le bus).
import { useEffect, useState } from "react";
import { wsSend } from "./wsBus";
import { t } from "./i18n";

export type KernelCell = {
  id: number;
  threadId: string;
  turnId?: string | null;
  startedAt: string;
  durationMs?: number;
  /** `running` tant que la cellule tourne, puis `ok` ou `error`. */
  status: "running" | "ok" | "error";
  code: string;
  stdout?: string;
  stderr?: string;
  result?: string | null;
  error?: { ename?: string; evalue?: string; traceback?: string } | null;
  filesRead?: string[];
  filesWritten?: string[];
  /** PNG des figures matplotlib laissées ouvertes par la cellule. */
  figures?: string[];
  env?: string;
  pythonVersion?: string;
};

export type KernelStatus = {
  running: boolean;
  kernel?: { pid: number; pythonVersion: string; env: { name: string }; cwd: string; startedAt: string };
  busyCell?: number | null;
  idleSeconds?: number | null;
};

/** Providers qui reçoivent le serveur MCP d'Atelier, donc l'outil du noyau. */
export const KERNEL_PROVIDERS = ["claude", "codex", "kimi", "grok", "opencode"];

/** Fusionne une cellule reçue (début ou fin) dans la liste, triée par numéro. */
export function mergeCell(cells: KernelCell[], cell: KernelCell): KernelCell[] {
  const others = cells.filter((c) => c.id !== cell.id);
  return [...others, cell].sort((a, b) => a.id - b.id);
}

export function useKernelCells(threadId: string | null, open: boolean) {
  const [cells, setCells] = useState<KernelCell[]>([]);
  const [status, setStatus] = useState<KernelStatus | null>(null);
  useEffect(() => {
    setCells([]);
    setStatus(null);
    if (!threadId || !open) return;
    const requestId = `kc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onCells = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.requestId !== requestId || d.threadId !== threadId) return;
      setCells(Array.isArray(d.cells) ? d.cells : []);
      setStatus(d.status ?? null);
    };
    const onCell = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.threadId !== threadId || !d.cell) return;
      setCells((current) => mergeCell(current, d.cell as KernelCell));
      if (d.phase === "started") {
        setStatus((s) => ({ ...(s ?? { running: true }), running: true, busyCell: d.cell.id }));
      } else {
        setStatus((s) => (s ? { ...s, busyCell: null } : s));
      }
    };
    const onStatus = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.threadId === threadId) setStatus(d.status ?? null);
    };
    window.addEventListener("kernel-cells", onCells);
    window.addEventListener("kernel-cell", onCell);
    window.addEventListener("kernel-status", onStatus);
    wsSend({ type: "kernelCells", threadId, requestId });
    return () => {
      window.removeEventListener("kernel-cells", onCells);
      window.removeEventListener("kernel-cell", onCell);
      window.removeEventListener("kernel-status", onStatus);
    };
  }, [threadId, open]);
  return { cells, status };
}

export function stopKernel(threadId: string) {
  wsSend({ type: "kernelStop", threadId });
}

export type KernelVariable = { name: string; type: string; shape?: number[]; dtype?: string; len?: number; repr?: string };
export type KernelEnv = { name: string; source: string; prefix: string };

/** Commande de la surface Noyau (`kernelCommand`), résolue par sa réponse. */
export function kernelCommand<T = unknown>(
  threadId: string,
  op: "variables" | "interrupt" | "restart" | "envs" | "link",
  args: Record<string, unknown> = {},
  timeoutMs = 60_000,
): Promise<T> {
  const requestId = `kcmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<T>((resolve, reject) => {
    const done = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.requestId !== requestId) return;
      cleanup();
      if (d.error) reject(new Error(String(d.error)));
      else resolve(d.result as T);
    };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeoutMs);
    const cleanup = () => { window.clearTimeout(timer); window.removeEventListener("kernel-command", done); };
    window.addEventListener("kernel-command", done);
    if (!wsSend({ type: "kernelCommand", threadId, op, requestId, ...args })) {
      cleanup();
      reject(new Error("offline"));
    }
  });
}

/** Cellule d'une figure captée par le noyau (`…/kernel/figures/<fil>/cellule-N-k.png`). */
export function figureCell(path: string): number | null {
  const m = /\/kernel\/figures\/[0-9a-f]{32}\/cellule-(\d+)-\d+\.png$/u.exec(path);
  return m ? Number(m[1]) : null;
}

/** Taille lisible d'une variable : forme, longueur ou rien. */
export function variableSize(v: KernelVariable): string {
  if (v.shape) return `(${v.shape.join(", ")})${v.dtype ? ` ${v.dtype}` : ""}`;
  if (v.len != null) return t("kernel.items", { n: v.len });
  return "";
}

/** Dernier segment d'un chemin, pour une liste lisible. */
export function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/** Texte envoyé au chat pour une sélection : d'où elle vient, puis le passage. */
export function selectionContext(cell: number, part: "code" | "output", text: string, lines?: [number, number]): string {
  const source = t("kernel.selection-source", { n: cell });
  if (part === "code" && lines) {
    const span = lines[0] === lines[1] ? `L${lines[0]}` : `L${lines[0]}-${lines[1]}`;
    return `${source} (${span}) : « ${text} »`;
  }
  return `${source}, ${t("kernel.selection-output")}\n« ${text} »`;
}
