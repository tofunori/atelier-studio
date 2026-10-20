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
  /** Phrase de but écrite par l'agent (titre de la cellule). */
  purpose?: string | null;
  /** `user` : modifiée et relancée depuis le panneau. */
  author?: string | null;
  fromCell?: number | null;
  /** Cellule reprise d'un autre fil du même projet. */
  resumedFrom?: { threadId: string; title: string; cell: number } | null;
  /** Début du message qui a fait naître le tour. */
  turnPrompt?: string | null;
  /** Démarrage du noyau qui a exécuté la cellule. */
  session?: string | null;
  prints?: FilePrint[];
  imports?: string[];
  lineage?: Lineage | null;
  replay?: ReplayMark | null;
  /** Fichiers lus qui ont changé depuis la cellule. */
  stale?: Staleness[];
  fromDiff?: { removed: string[]; added: string[]; changed: number } | null;
};

export type FilePrint = { path: string; size: number; mtimeMs: number; sha256?: string };
export type Staleness = { path: string; state: "modified" | "missing"; mtimeMs?: number };
export type Lineage = { created?: string[]; modified?: string[]; deleted?: string[]; uses?: { name: string; cell?: number }[] };
export type ReplayMark = { at: string; status: "same" | "files" | "differs" | "error" | "skipped"; detail?: string };
export type ChainCheck = { checked: number; brokenAt?: number };
export type ReplaySummary = {
  total: number; same: number; files: number; differs: number; error: number; skipped: number;
  adopted: boolean; cancelled: boolean;
};
/** Rejouer à neuf : avancement en cours, puis résumé ou erreur. */
export type ReplayState =
  | { state: "running"; done: number; total: number; cell?: number | null }
  | { state: "done"; summary?: ReplaySummary; error?: string };

/** Reprise des cellules d'un autre fil : avancement, puis bilan. */
export type ResumeState = {
  state: "running" | "done"; fromThread: string; done: number; total: number; cell?: number | null; error?: string | null;
};
/** Autre fil du même projet qui a des cellules. */
export type ProjectThread = {
  threadId: string; title: string; cells: number; ok: number; lastAt: string; lastPurpose?: string | null;
};

export type KernelStatus = {
  running: boolean;
  kernel?: { pid: number; pythonVersion: string; env: { name: string }; cwd: string; startedAt: string };
  busyCell?: number | null;
  idleSeconds?: number | null;
  /** Paquets chargés dans le noyau, avec leur version dans l'env. */
  packages?: { name: string; version: string }[];
  packagesTotal?: number;
  envSha256?: string;
};

/** Providers qui reçoivent le serveur MCP d'Atelier, donc l'outil du noyau. */
export const KERNEL_PROVIDERS = ["claude", "codex", "kimi", "grok", "opencode"];

/** Fusionne une cellule reçue (début ou fin) dans la liste, triée par numéro. */
export function mergeCell(cells: KernelCell[], cell: KernelCell): KernelCell[] {
  const others = cells.filter((c) => c.id !== cell.id);
  return [...others, cell].sort((a, b) => a.id - b.id);
}

/** Sortie en direct d'une cellule en cours : seuls stdout et stderr changent. */
export function mergeProgress(cells: KernelCell[], part: Pick<KernelCell, "id" | "stdout" | "stderr">): KernelCell[] {
  return cells.map((c) => (c.id === part.id && c.status === "running" ? { ...c, stdout: part.stdout, stderr: part.stderr } : c));
}

export function useKernelCells(threadId: string | null, open: boolean) {
  const [cells, setCells] = useState<KernelCell[]>([]);
  const [status, setStatus] = useState<KernelStatus | null>(null);
  const [chain, setChain] = useState<ChainCheck | null>(null);
  const [replay, setReplay] = useState<ReplayState | null>(null);
  const [resume, setResume] = useState<ResumeState | null>(null);
  useEffect(() => {
    setCells([]);
    setStatus(null);
    setChain(null);
    setReplay(null);
    setResume(null);
    if (!threadId || !open) return;
    const requestId = `kc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onCells = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.requestId !== requestId || d.threadId !== threadId) return;
      setCells(Array.isArray(d.cells) ? d.cells : []);
      setStatus(d.status ?? null);
      setChain(d.chain ?? null);
    };
    const onCell = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.threadId !== threadId || !d.cell) return;
      if (d.phase === "progress") {
        setCells((current) => mergeProgress(current, d.cell));
        return;
      }
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
    const onReplay = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.threadId !== threadId) return;
      setReplay(d.state === "running"
        ? { state: "running", done: d.done ?? 0, total: d.total ?? 0, cell: d.cell }
        : { state: "done", summary: d.summary, error: d.error });
    };
    const onResume = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.threadId !== threadId) return;
      setResume({ state: d.state === "done" ? "done" : "running", fromThread: d.fromThread, done: d.done ?? 0,
        total: d.total ?? 0, cell: d.cell, error: d.error });
    };
    window.addEventListener("kernel-cells", onCells);
    window.addEventListener("kernel-cell", onCell);
    window.addEventListener("kernel-status", onStatus);
    window.addEventListener("kernel-replay", onReplay);
    window.addEventListener("kernel-resume", onResume);
    wsSend({ type: "kernelCells", threadId, requestId });
    return () => {
      window.removeEventListener("kernel-cells", onCells);
      window.removeEventListener("kernel-cell", onCell);
      window.removeEventListener("kernel-status", onStatus);
      window.removeEventListener("kernel-replay", onReplay);
      window.removeEventListener("kernel-resume", onResume);
    };
  }, [threadId, open]);
  return { cells, status, chain, replay, setReplay, resume };
}

export function stopKernel(threadId: string) {
  wsSend({ type: "kernelStop", threadId });
}

export type KernelVariable = {
  name: string; type: string; shape?: number[]; dtype?: string; len?: number; repr?: string;
  /** Cellule qui a créé la variable, puis l'a modifiée en dernier. */
  origin?: { created?: number; modified?: number };
};
export type KernelEnv = { name: string; source: string; prefix: string };

/** Commande de la surface Noyau (`kernelCommand`), résolue par sa réponse. */
export function kernelCommand<T = unknown>(
  threadId: string,
  op: "variables" | "interrupt" | "restart" | "envs" | "link" | "verify" | "rerun" | "replay" | "cancelReplay" | "export"
    | "projectThreads" | "resume",
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

let pendingFocus: number | null = null;

/** Ouvre la surface Noyau sur une cellule (depuis le chat). */
export function openKernelCell(cell: number) {
  pendingFocus = cell;
  window.dispatchEvent(new CustomEvent("kernel-panel-open"));
  window.dispatchEvent(new CustomEvent("kernel-cell-focus", { detail: { cell } }));
}

/** Cellule demandée avant que la surface soit montée ; lue une fois. */
export function takePendingFocus(): number | null {
  const cell = pendingFocus;
  pendingFocus = null;
  return cell;
}
