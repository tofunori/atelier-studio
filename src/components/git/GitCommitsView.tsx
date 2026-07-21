import { lazy, Suspense, useMemo, useState } from "react";
import { Columns2Icon, GitBranchIcon, RefreshCwIcon, RotateCcwIcon, Rows3Icon, SearchIcon, Undo2Icon } from "lucide-react";
import { t } from "../../lib/i18n";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../shadcn/alert-dialog";
import { Badge } from "../shadcn/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../shadcn/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../shadcn/empty";
import { Field, FieldGroup, FieldLabel } from "../shadcn/field";
import { Input } from "../shadcn/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../shadcn/input-group";
import { ScrollArea } from "../shadcn/scroll-area";
import { Skeleton } from "../shadcn/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../shadcn/toggle-group";
import { Button } from "../ui/Button";
import { RowButton } from "../ui/RowButton";
import { SegmentedControl } from "../ui/SegmentedControl";
import { buildCommitGraph, CommitGraph } from "./commitGraph";
import { diffClass } from "./gitSurfaceModel";
import type { GitSurfaceController } from "./useGitSurfaceController";

const AtelierDiffView = lazy(() => import("../AtelierDiffView"));

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function HistoricDiff({ diff }: { diff: string }) {
  if (!diff) return <div className="git-historic-diff-empty">{t("git.diff-empty")}</div>;
  return (
    <ScrollArea className="git-historic-diff">
      <pre className="git-diff git-historic-diff-content" aria-label={t("git.diff-pane")}>
        {diff.split("\n").map((line, index) => (
          <span key={`${index}-${line}`} className={diffClass(line)}>{line || " "}</span>
        ))}
      </pre>
    </ScrollArea>
  );
}

function CommitFileDiff({
  controller,
  onRestore,
}: {
  controller: GitSurfaceController;
  onRestore: (path: string) => void;
}) {
  const file = controller.selectedCommitFile;
  let body;
  if (controller.commitDiffLoading) {
    body = <div className="git-history-diff-loading"><Skeleton className="tw:h-4 tw:w-2/5" /><Skeleton className="tw:h-4 tw:w-4/5" /><Skeleton className="tw:h-4 tw:w-3/5" /></div>;
  } else if (controller.commitDiffContents?.binary) {
    body = <div className="git-historic-diff-empty">{t("git.binary-changed")}</div>;
  } else if (file && controller.commitDiffContents) {
    body = (
      <Suspense fallback={<div className="git-history-diff-loading"><Skeleton className="tw:h-4 tw:w-3/5" /></div>}>
        <AtelierDiffView
          before={controller.commitDiffContents.before}
          after={controller.commitDiffContents.after}
          path={file.path}
          layout={controller.splitView ? "split" : "unified"}
        />
      </Suspense>
    );
  } else {
    body = <HistoricDiff diff={controller.commitDetails?.diff ?? ""} />;
  }

  return (
    <div className="git-history-diff-pane">
      <div className="git-history-diff-head">
        <span className="git-diff-path">{file?.path ?? t("git.diff-pane")}</span>
        {file && (
          <Button className="git-history-restore" variant="ghost" onClick={() => onRestore(file.path)}>
            <RotateCcwIcon data-icon="inline-start" />{t("git.restore-file")}
          </Button>
        )}
        <SegmentedControl
          className="git-history-layout"
          label={t("git.diff-view")}
          value={controller.splitView ? "split" : "unified"}
          onChange={(value) => controller.setSplitView(value === "split")}
          options={[
            { value: "unified", label: <Rows3Icon aria-hidden="true" />, ariaLabel: t("git.unified"), title: t("git.unified") },
            { value: "split", label: <Columns2Icon aria-hidden="true" />, ariaLabel: t("git.split"), title: t("git.split") },
          ]}
        />
      </div>
      <div className="git-history-diff-body">{body}</div>
    </div>
  );
}

export function GitCommitsView({ controller }: { controller: GitSurfaceController }) {
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [revertOpen, setRevertOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState("mixed");
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const details = controller.commitDetails;
  const graphRows = useMemo(() => buildCommitGraph(controller.commits), [controller.commits]);

  return (
    <div className="git-commits-view">
      <div className="git-commits-tools">
        <InputGroup className="git-commits-search">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput value={controller.commitQuery} onChange={(event) => controller.setCommitQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && controller.refreshCommits(false)} placeholder={t("git.commits-search")}
            aria-label={t("git.commits-search")} />
        </InputGroup>
        <SegmentedControl
          className="git-commits-scope"
          label={t("git.commits-scope")}
          value={controller.allRefs ? "all" : "current"}
          onChange={(value) => controller.setAllRefs(value === "all")}
          options={[
            { value: "current", label: t("git.current-branch") },
            { value: "all", label: t("git.all-branches") },
          ]}
        />
        <Button className="git-commits-fetch" variant="ghost" onClick={() => controller.historyAction("gitFetch")}
          loading={controller.historyBusy === "gitFetch"} disabled={controller.historyBusy != null}>
          <RefreshCwIcon data-icon="inline-start" />{t("git.fetch")}
        </Button>
      </div>
      <div className="git-commits-layout">
        <ScrollArea className="git-commit-list">
          {controller.commits.length === 0 && !controller.commitsLoading ? (
            <Empty><EmptyHeader><EmptyMedia variant="icon"><GitBranchIcon /></EmptyMedia><EmptyTitle>{t("git.commits-empty")}</EmptyTitle><EmptyDescription>{t("git.commits-empty-help")}</EmptyDescription></EmptyHeader></Empty>
          ) : controller.commits.map((commit, index) => (
            <RowButton key={commit.sha} className={`git-commit-row${details?.sha === commit.sha ? " is-active" : ""}`} onClick={() => controller.selectCommit(commit.sha)}>
              <CommitGraph row={graphRows[index]} merge={commit.parents.length > 1} />
              <span className="git-commit-row-main"><strong>{commit.subject}</strong><small>{commit.author} · {dateLabel(commit.authoredAt)}</small></span>
              <code>{commit.shortSha}</code>
              {commit.decorations.slice(0, 2).map((ref) => <Badge key={ref} variant="secondary">{ref}</Badge>)}
            </RowButton>
          ))}
          {controller.commitsHasMore && <Button variant="ghost" onClick={() => controller.refreshCommits(true)} disabled={controller.commitsLoading}>{t("action.load-more")}</Button>}
        </ScrollArea>
        <section className="git-commit-detail">
          {!details ? <Empty><EmptyHeader><EmptyTitle>{t("git.select-commit")}</EmptyTitle><EmptyDescription>{t("git.select-commit-help")}</EmptyDescription></EmptyHeader></Empty> : <>
            <header><div><h3>{details.subject}</h3><p>{details.author} &lt;{details.authorEmail}&gt; · {dateLabel(details.authoredAt)}</p><code>{details.sha}</code></div>
              <div className="git-commit-detail-actions">
                <Button className="git-history-action" variant="ghost" onClick={() => { setBranchName(""); setBranchOpen(true); }}><GitBranchIcon data-icon="inline-start" />{t("git.branch-from-commit")}</Button>
                {details.isHead && !details.isPublished && <Button className="git-history-action" variant="ghost" onClick={() => setUndoOpen(true)}><Undo2Icon data-icon="inline-start" />{t("git.undo-commit")}</Button>}
                <Button className="git-history-action" variant="ghost" onClick={() => setRevertOpen(true)} disabled={details.parents.length > 1}><RotateCcwIcon data-icon="inline-start" />{t("git.revert-commit")}</Button>
                <Button className="git-history-action git-history-action-advanced" variant="ghost" onClick={() => setResetOpen(true)}>{t("git.reset-advanced")}</Button>
              </div></header>
            {details.body && details.body !== details.subject && <p className="git-commit-body">{details.body}</p>}
            <div className="git-commit-files">{details.files.map((file) => <RowButton key={`${file.status}:${file.path}`}
              className={controller.selectedCommitFile?.path === file.path ? "is-active" : ""}
              aria-pressed={controller.selectedCommitFile?.path === file.path}
              onClick={() => controller.selectCommitFile(file)}><Badge variant="outline">{file.status}</Badge><span>{file.path}</span></RowButton>)}</div>
            <CommitFileDiff controller={controller} onRestore={setRestorePath} />
          </>}
        </section>
      </div>

      <Dialog open={branchOpen} onOpenChange={setBranchOpen}><DialogContent closeLabel={t("action.close")}><DialogHeader><DialogTitle>{t("git.branch-from-commit")}</DialogTitle><DialogDescription>{details?.shortSha}</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="git-history-branch">{t("git.branch-name")}</FieldLabel><Input id="git-history-branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} /></Field></FieldGroup><DialogFooter><Button variant="secondary" onClick={() => setBranchOpen(false)}>{t("action.cancel")}</Button><Button variant="primary" disabled={!branchName.trim()} onClick={() => { controller.historyAction("gitCreateBranchAt", { sha: details?.sha, branch: branchName.trim() }); setBranchOpen(false); }}>{t("git.create-branch-title")}</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("git.revert-confirm")}</AlertDialogTitle><AlertDialogDescription>{t("git.revert-help")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => controller.historyAction("gitRevertCommit", { sha: details?.sha })}>{t("git.revert-commit")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("git.undo-commit-confirm")}</AlertDialogTitle><AlertDialogDescription>{t("git.undo-commit-help")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => controller.historyAction("gitUndoCommit")}>{t("git.undo-commit")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("git.reset-confirm")}</AlertDialogTitle><AlertDialogDescription>{t("git.reset-help")}</AlertDialogDescription></AlertDialogHeader><ToggleGroup value={[resetMode]} onValueChange={(value) => value[0] && setResetMode(value[0])}><ToggleGroupItem value="soft">Soft</ToggleGroupItem><ToggleGroupItem value="mixed">Mixed</ToggleGroupItem><ToggleGroupItem value="hard">Hard</ToggleGroupItem></ToggleGroup><AlertDialogFooter><AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel><AlertDialogAction variant={resetMode === "hard" ? "destructive" : "default"} onClick={() => controller.historyAction("gitResetToCommit", { sha: details?.sha, mode: resetMode })}>{t("git.reset-advanced")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={restorePath != null} onOpenChange={(open) => !open && setRestorePath(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("git.restore-file-title")}</AlertDialogTitle><AlertDialogDescription>{restorePath}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => { controller.historyAction("gitRestoreFileFromCommit", { sha: details?.sha, path: restorePath }); setRestorePath(null); }}>{t("git.restore-file")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
