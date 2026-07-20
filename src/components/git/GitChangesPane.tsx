import { GitCommitIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../shadcn/empty";
import { ScrollArea } from "../shadcn/scroll-area";
import { GIT_GROUPS } from "./gitSurfaceModel";
import { GitFileSection } from "./GitFileSection";
import type { GitSurfaceController } from "./useGitSurfaceController";

export function GitChangesPane({
  controller,
  onSend,
  onFileSelected,
}: {
  controller: GitSurfaceController;
  onSend: (message: Record<string, unknown>) => void;
  onFileSelected?: () => void;
}) {
  const { files, filesByGroup, selected, closedGroups } = controller;

  return (
    <ScrollArea className="git-files">
      {files.length === 0 ? (
        <Empty className="git-files-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon"><GitCommitIcon /></EmptyMedia>
            <EmptyTitle>{t("git.empty")}</EmptyTitle>
            <EmptyDescription>{t("git.clean-help")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : GIT_GROUPS.map((group) => (
        <GitFileSection
          key={group}
          group={group}
          files={filesByGroup[group]}
          open={filesByGroup[group].length > 0 && !closedGroups.has(group)}
          selected={selected}
          onOpenChange={() => controller.toggleGroup(group)}
          onSelect={(file) => {
            controller.selectFile(file.path, group);
            onFileSelected?.();
          }}
          onUpdateStage={(paths) => controller.updateStage(group, paths)}
          onRevert={(path) => onSend({ type: "gitRevertFile", path })}
          onIgnore={(pattern) => onSend({ type: "gitIgnore", pattern })}
        />
      ))}
    </ScrollArea>
  );
}
