// Panneau « Noyau Python » du fil (chantier 5) : les cellules exécutées par
// l'agent dans le noyau persistant, avec leurs sorties et les fichiers lus et
// écrits. Même coque que le panneau d'un agent lié (AgentDetailPanel).
import { ChevronLeftIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { baseName, stopKernel, useKernelCells, type KernelCell, type KernelStatus } from "../../lib/kernel";
import { ScrollArea } from "../shadcn/scroll-area";
import { Separator } from "../shadcn/separator";
import { Button } from "../ui";

function duration(ms?: number): string {
  if (ms == null) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function kernelStateLabel(enabled: boolean, status: KernelStatus | null): string {
  if (!enabled) return t("kernel.state-off");
  if (status?.busyCell != null) return t("kernel.state-busy", { n: status.busyCell });
  if (status?.running) return t("kernel.state-on");
  return t("kernel.state-idle");
}

function Files({ label, files }: { label: string; files?: string[] }) {
  if (!files?.length) return null;
  return (
    <div className="kernel-files">
      <span className="kernel-files-label">{label}</span>
      {files.map((f) => <span key={f} className="kernel-file" title={f}>{baseName(f)}</span>)}
    </div>
  );
}

export function KernelCellView({ cell }: { cell: KernelCell }) {
  const state = cell.status === "running" ? t("kernel.running") : cell.status === "error" ? t("kernel.error") : duration(cell.durationMs);
  const error = cell.error
    ? (cell.error.traceback?.trim() || `${cell.error.ename ?? ""}: ${cell.error.evalue ?? ""}`)
    : "";
  return (
    <article className="kernel-cell" data-status={cell.status} data-testid="kernel-cell">
      <div className="kernel-cell-head">
        <span className="kernel-cell-num">[{cell.id}]</span>
        <span>{clock(cell.startedAt)}</span>
        <span className="kernel-cell-state">{state}</span>
      </div>
      <pre className="kernel-code">{cell.code}</pre>
      {cell.stdout ? <pre className="kernel-out">{cell.stdout}</pre> : null}
      {cell.stderr?.trim() && cell.status !== "error" ? <pre className="kernel-out kernel-stderr">{cell.stderr}</pre> : null}
      {cell.result ? <pre className="kernel-out">{cell.result}</pre> : null}
      {error ? <pre className="kernel-out kernel-error">{error}</pre> : null}
      <Files label={t("kernel.written")} files={cell.filesWritten} />
      <Files label={t("kernel.read")} files={cell.filesRead} />
    </article>
  );
}

export function KernelPanel({ threadId, enabled, onClose }: {
  threadId: string;
  enabled: boolean;
  onClose: () => void;
}) {
  const { cells, status } = useKernelCells(threadId, true);
  const ordered = [...cells].reverse();
  const kernel = status?.running ? status.kernel : undefined;
  return (
    <aside className="agent-detail-panel kernel-panel" aria-label={t("kernel.panel-title")}>
      <header className="agent-detail-header">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("action.close")}><ChevronLeftIcon /></Button>
        <span className="agent-detail-title">{t("kernel.panel-title")}</span>
        <span className="agent-detail-status" role="status">{kernelStateLabel(enabled, status)}</span>
      </header>
      <Separator />
      {kernel ? (
        <div className="kernel-meta">
          <span className="kernel-meta-text" title={kernel.cwd}>{kernel.env.name} · Python {kernel.pythonVersion}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => stopKernel(threadId)}>{t("kernel.stop")}</Button>
        </div>
      ) : null}
      <ScrollArea className="agent-detail-scroll">
        <div className="kernel-cells">
          {ordered.length
            ? ordered.map((cell) => <KernelCellView key={cell.id} cell={cell} />)
            : <p className="agent-detail-empty">{t(enabled ? "kernel.empty" : "kernel.empty-off")}</p>}
        </div>
      </ScrollArea>
    </aside>
  );
}
