import { useEffect, useState } from "react";
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  CheckIcon,
  ChevronDownIcon,
  GitMergeIcon,
  HistoryIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { t } from "../../lib/i18n";
import { BranchIcon, LedgerIcon, RefreshIcon } from "../icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../shadcn/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../shadcn/dialog";
import { Field, FieldGroup, FieldLabel } from "../shadcn/field";
import { Input } from "../shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../shadcn/popover";
import { ScrollArea } from "../shadcn/scroll-area";
import { Separator } from "../shadcn/separator";
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
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [branchDraft, setBranchDraft] = useState("");
  const [deleteBranchOpen, setDeleteBranchOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState("");
  const [mergeBranchOpen, setMergeBranchOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [undoArmed, setUndoArmed] = useState(false);
  const { mode, status, stagedCount, filesByGroup, files, syncBusy } = controller;
  const currentBranch = status?.branch ?? t("git.branch-fallback");
  const branches = [...new Set(status?.branches?.length ? status.branches : [currentBranch])]
    .sort((left, right) => {
      if (left === currentBranch) return -1;
      if (right === currentBranch) return 1;
      if (left === "main") return -1;
      if (right === "main") return 1;
      return left.localeCompare(right);
    });
  const branchListHeight = Math.min(Math.max(branches.length * 32, 32), 420);

  useEffect(() => {
    if (!menuOpen) setUndoArmed(false);
  }, [menuOpen]);

  return (
    <div className="git-head">
      <div className="git-title">
        {mode === "git" ? (
          <Popover open={branchMenuOpen} onOpenChange={setBranchMenuOpen}>
            <PopoverTrigger render={
              <Button
                variant="ghost"
                className="git-branch-btn"
                aria-label={t("git.switch-branch", { branch: currentBranch })}
                aria-haspopup="menu"
              >
                <BranchIcon size={14} />
                <span>{currentBranch}</span>
                <ChevronDownIcon className="git-branch-chevron" />
              </Button>
            } />
            <PopoverContent plain align="start" sideOffset={5} className="git-branch-popover">
              <PopoverHeader className="git-branch-popover-head">
                <PopoverTitle>{t("git.branches")}</PopoverTitle>
                <PopoverDescription>
                  {files.length > 0 ? t("git.branch-clean-required") : t("git.branch-actions-help")}
                </PopoverDescription>
              </PopoverHeader>
              <Button
                variant="ghost"
                className="git-branch-create"
                disabled={syncBusy != null}
                onClick={() => {
                  setBranchMenuOpen(false);
                  setBranchDraft("");
                  setCreateBranchOpen(true);
                }}
              >
                <PlusIcon data-icon="inline-start" />
                {t("git.create-branch")}
              </Button>
              <Separator />
              <ScrollArea className="git-branch-scroll" style={{ height: branchListHeight }}>
                <div className="git-branch-list">
                  {branches.map((branch) => {
                    const isCurrent = branch === currentBranch;
                    const switchDisabled = isCurrent || files.length > 0 || syncBusy != null;
                    const mergeLabel = t("git.merge-branch-into", { branch, current: currentBranch });
                    const deleteLabel = t("git.delete-branch-named", { branch });
                    return (
                      <div key={branch} className="git-branch-row">
                        <Button
                          variant="ghost"
                          className="git-branch-row-main"
                          aria-current={isCurrent ? "true" : undefined}
                          disabled={switchDisabled}
                          onClick={() => {
                            controller.switchBranch(branch);
                            setBranchMenuOpen(false);
                          }}
                        >
                          <CheckIcon className={isCurrent ? "" : "git-branch-check-hidden"} />
                          <span>{branch}</span>
                        </Button>
                        {!isCurrent && (
                          <span className="git-branch-row-actions">
                            <IconButton
                              size="s"
                              className="git-branch-row-action git-branch-merge"
                              label={mergeLabel}
                              title={files.length > 0 ? t("git.branch-clean-required") : mergeLabel}
                              disabled={files.length > 0 || syncBusy != null}
                              onClick={() => {
                                setBranchMenuOpen(false);
                                setMergeTarget(branch);
                                setMergeBranchOpen(true);
                              }}
                            >
                              <GitMergeIcon />
                            </IconButton>
                            <IconButton
                              size="s"
                              className="git-branch-row-action git-branch-delete"
                              label={deleteLabel}
                              title={deleteLabel}
                              disabled={syncBusy != null}
                              onClick={() => {
                                setBranchMenuOpen(false);
                                setDeleteTarget(branch);
                                setDeleteBranchOpen(true);
                              }}
                            >
                              <Trash2Icon />
                            </IconButton>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        ) : controller.mode === "commits" ? (
          <><HistoryIcon /><span>{t("git.commits")}</span></>
        ) : (
          <><LedgerIcon /><span>{t("git.activity")}</span></>
        )}
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
      <span className="git-view-switcher">
        <Button variant="ghost" className={`git-history-btn${mode === "git" ? " is-active" : ""}`} aria-label={t("git.open-changes")} onClick={() => controller.setMode("git")}>
          <BranchIcon size={14} /><span className="git-history-label">{t("git.open-changes")}</span>
        </Button>
        <Button variant="ghost" className={`git-history-btn${mode === "commits" ? " is-active" : ""}`} aria-label={t("git.commits")} onClick={() => controller.setMode("commits")}>
          <HistoryIcon data-icon="inline-start" /><span className="git-history-label">{t("git.commits")}</span>
        </Button>
        <Button variant="ghost" className={`git-history-btn${mode === "journal" ? " is-active" : ""}`} aria-label={t("git.activity")} onClick={() => controller.setMode("journal")}>
          <LedgerIcon /><span className="git-history-label">{t("git.activity")}</span>
        </Button>
      </span>
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
              key: "refresh",
              label: <><RefreshIcon /><span>{t("action.refresh")}</span></>,
              onSelect: () => (mode === "git" ? controller.refreshGit() : mode === "commits" ? controller.refreshCommits(false) : controller.refreshLedger()),
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

      <Dialog open={createBranchOpen} onOpenChange={setCreateBranchOpen}>
        <DialogContent closeLabel={t("action.close")}>
          <DialogHeader>
            <DialogTitle>{t("git.create-branch-title")}</DialogTitle>
            <DialogDescription>{t("git.create-branch-help")}</DialogDescription>
          </DialogHeader>
          <form
            className="tw:flex tw:flex-col tw:gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!branchDraft.trim()) return;
              controller.createBranch(branchDraft);
              setCreateBranchOpen(false);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="git-new-branch">{t("git.branch-name")}</FieldLabel>
                <Input
                  id="git-new-branch"
                  autoFocus
                  value={branchDraft}
                  onChange={(event) => setBranchDraft(event.target.value)}
                  placeholder={t("git.branch-name-placeholder")}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateBranchOpen(false)}>
                {t("action.cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={!branchDraft.trim() || syncBusy != null}>
                {t("git.create-branch-title")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteBranchOpen} onOpenChange={setDeleteBranchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("git.delete-branch-title", { branch: deleteTarget })}</AlertDialogTitle>
            <AlertDialogDescription>{t("git.delete-branch-help")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!deleteTarget || syncBusy != null}
              onClick={() => {
                controller.deleteBranch(deleteTarget);
                setDeleteBranchOpen(false);
              }}
            >
              {t("git.delete-branch-action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={mergeBranchOpen} onOpenChange={setMergeBranchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("git.merge-branch-title", { branch: mergeTarget, current: currentBranch })}</AlertDialogTitle>
            <AlertDialogDescription>{t("git.merge-branch-help", { branch: mergeTarget, current: currentBranch })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!mergeTarget || files.length > 0 || syncBusy != null}
              onClick={() => {
                controller.mergeBranch(mergeTarget);
                setMergeBranchOpen(false);
              }}
            >
              {t("git.merge-branch")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
