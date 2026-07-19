import { useEffect, useState } from "react";
import { ArrowDownToLineIcon, ArrowUpFromLineIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { BranchIcon, LedgerIcon, RefreshIcon } from "../icons";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { LazyDropdownMenu } from "../ui/LazyDropdownMenu";
import type { GitSurfaceController } from "./useGitSurfaceController";

export function GitToolbar({
  controller,
  activeThreadId,
  onUndo,
}: {
  controller: GitSurfaceController;
  activeThreadId: string | null;
  onUndo: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [undoArmed, setUndoArmed] = useState(false);
  const { mode, status, stagedCount, filesByGroup, files, syncBusy } = controller;

  useEffect(() => {
    if (!menuOpen) setUndoArmed(false);
  }, [menuOpen]);

  return (
    <div className="git-head">
      <div className="git-title">
        {mode === "git" ? <BranchIcon size={14} /> : <LedgerIcon />}
        <span>{mode === "git" ? (status?.branch ?? t("git.branch-fallback")) : t("git.journal")}</span>
        {mode === "git" && (
          <span className="git-muted">
            {t("git.workspace-summary", {
              staged: stagedCount,
              changes: filesByGroup.changes.length,
              untracked: filesByGroup.untracked.length,
            })}
          </span>
        )}
      </div>
      <span className="git-head-spacer" />
      {mode === "git" && status && (
        <span className="git-sync-ctl">
          <Button
            variant="ghost"
            className="git-sync-btn"
            loading={syncBusy === "pull"}
            disabled={syncBusy != null}
            onClick={() => controller.sync("pull")}
          >
            <ArrowDownToLineIcon data-icon="inline-start" />
            {t("git.pull-short")}{status.behind ? ` ${status.behind}` : ""}
          </Button>
          <Button
            variant="ghost"
            className="git-sync-btn"
            loading={syncBusy === "push"}
            disabled={syncBusy != null || !status.ahead}
            onClick={() => controller.sync("push")}
          >
            <ArrowUpFromLineIcon data-icon="inline-start" />
            {t("git.push-short")}{status.ahead ? ` ${status.ahead}` : ""}
          </Button>
        </span>
      )}
      <span className="git-headmenu-wrap">
        <LazyDropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          align="end"
          label={t("project.actions")}
          trigger={
            <IconButton size="s" className="ghost git-icon-btn" title={t("project.actions")} label={t("project.actions")} aria-haspopup="menu">
              ⋯
            </IconButton>
          }
          items={[
            {
              key: "toggle-mode",
              label: (
                <>
                  {mode === "git" ? <LedgerIcon /> : <BranchIcon size={14} />}
                  <span>{mode === "git" ? t("git.open-journal") : t("git.open-changes")}</span>
                </>
              ),
              onSelect: () => controller.setMode(mode === "git" ? "journal" : "git"),
            },
            {
              key: "refresh",
              label: <><RefreshIcon /><span>{t("action.refresh")}</span></>,
              onSelect: () => (mode === "git" ? controller.refreshGit() : controller.refreshLedger()),
            },
            {
              key: "undo",
              label: <span>{undoArmed ? t("action.confirm-undo") : t("action.undo-agent-turn")}</span>,
              destructive: undoArmed,
              disabled: !activeThreadId || files.length === 0,
              keepOpen: !undoArmed,
              onSelect: () => {
                if (!activeThreadId) return;
                if (!undoArmed) {
                  setUndoArmed(true);
                  return;
                }
                setUndoArmed(false);
                onUndo();
              },
            },
          ]}
        />
      </span>
    </div>
  );
}
