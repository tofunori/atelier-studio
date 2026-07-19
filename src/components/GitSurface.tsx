import { Separator } from "./shadcn/separator";
import { GitChangesPane } from "./git/GitChangesPane";
import { GitCommitComposer } from "./git/GitCommitComposer";
import { GitDiffPane, GitMobileDiffSheet } from "./git/GitDiffPane";
import { GitJournalView } from "./git/GitJournalView";
import { GitToolbar } from "./git/GitToolbar";
import { useGitSurfaceController } from "./git/useGitSurfaceController";

export default function GitSurface({
  ws,
  projectRoot,
  activeThreadId,
}: {
  ws: WebSocket | null;
  projectRoot: string;
  activeThreadId: string | null;
}) {
  const controller = useGitSurfaceController({ ws, projectRoot });

  function send(message: Record<string, unknown>, scoped = true) {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(scoped ? { ...message, projectRoot } : message));
  }

  return (
    <div className="git-surface">
      <GitToolbar
        controller={controller}
        activeThreadId={activeThreadId}
        onUndo={() => activeThreadId && send({ type: "gitUndoLastTurn", threadId: activeThreadId }, false)}
      />
      {controller.mode === "git" ? (
        <>
          <div className="git-workspace">
            <GitChangesPane controller={controller} onSend={send} />
            <GitDiffPane controller={controller} />
          </div>
          <GitMobileDiffSheet controller={controller} />
          <Separator />
          <GitCommitComposer controller={controller} />
        </>
      ) : (
        <GitJournalView controller={controller} />
      )}
    </div>
  );
}
