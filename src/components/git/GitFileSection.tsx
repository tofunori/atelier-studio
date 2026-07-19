import { MinusIcon, PlusIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../shadcn/collapsible";
import { Button } from "../ui/Button";
import { RowButton } from "../ui/RowButton";
import { GitFileRow } from "./GitFileRow";
import type { GitFile, GitGroup, SelectedFile } from "./types";

export function GitFileSection({
  group,
  files,
  open,
  selected,
  onOpenChange,
  onSelect,
  onUpdateStage,
  onRevert,
  onIgnore,
}: {
  group: GitGroup;
  files: GitFile[];
  open: boolean;
  selected: SelectedFile | null;
  onOpenChange: () => void;
  onSelect: (file: GitFile) => void;
  onUpdateStage: (paths: string[]) => void;
  onRevert: (path: string) => void;
  onIgnore: (pattern: string) => void;
}) {
  if (!files.length && group !== "changes") return null;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="git-group">
      <div className="git-group-head">
        <CollapsibleTrigger
          disabled={!files.length}
          render={<RowButton className="git-group-h" />}
        >
          <span className="chev" aria-hidden>{open ? "▾" : "▸"}</span>
          <span>{t(`git.group-${group}` as any)}</span>
          <span className="git-group-n">{files.length}</span>
        </CollapsibleTrigger>
        {!!files.length && (
          <Button variant="ghost" className="git-group-action" onClick={() => onUpdateStage(files.map((file) => file.path))}>
            {group === "staged" ? <MinusIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            {group === "staged" ? t("git.unstage-all") : t("git.stage-all")}
          </Button>
        )}
      </div>
      <CollapsibleContent>
        {files.map((file) => (
          <GitFileRow
            key={file.path}
            file={file}
            group={group}
            selected={selected?.path === file.path && selected.group === group}
            onSelect={() => onSelect(file)}
            onUpdateStage={() => onUpdateStage([file.path])}
            onRevert={() => onRevert(file.path)}
            onIgnore={onIgnore}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
