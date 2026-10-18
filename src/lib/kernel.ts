// Noyau Python persistant du fil (chantier 5) : cellules et état, tenus à jour
// par les messages du runtime (`kernelCells` en réponse, `kernelCell` et
// `kernelStatus` poussés sur le bus).
import { useEffect, useState } from "react";
import { wsSend } from "./wsBus";

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

/** Dernier segment d'un chemin, pour une liste lisible. */
export function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}
