import { useEffect, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";
import { LazyDropdownMenu, type LazyDropdownMenuItem } from "../ui/LazyDropdownMenu";
import { isLowSignalFile, shortStatus } from "./gitSurfaceModel";
import type { GitFile, GitGroup } from "./types";

export function GitFileRow({
  file,
  group,
  selected,
  onSelect,
  onUpdateStage,
  onRevert,
  onIgnore,
}: {
  file: GitFile;
  group: GitGroup;
  selected: boolean;
  onSelect: () => void;
  onUpdateStage: () => void;
  onRevert: () => void;
  onIgnore: (pattern: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [restoreArmed, setRestoreArmed] = useState(false);
  const status = shortStatus(file);
  const directory = file.path.includes("/") ? `${file.path.split("/")[0]}/` : null;
  const slash = file.path.lastIndexOf("/");
  const name = slash >= 0 ? file.path.slice(slash + 1) : file.path;
  const parent = slash >= 0 ? file.path.slice(0, slash + 1) : "";

  useEffect(() => {
    if (!menuOpen) setRestoreArmed(false);
  }, [menuOpen]);

  return (
    <div className={`git-file ${selected ? "selected" : ""} ${isLowSignalFile(file.path) ? "dim" : ""}`}>
      <div className="git-file-line">
        <RowButton className="git-file-row" onClick={onSelect} aria-pressed={selected}>
          <span className={`git-status s-${status.replace("U", "untracked")}`}>{status}</span>
          <span className="git-path" title={file.path}>
            <span className="git-path-name">{name}</span>
            {parent && <span className="git-path-dir">{parent}</span>}
          </span>
          <span className="git-stats">
            {file.status === "?" ? t("git.new-file") : (
              <>
                {file.add != null && <em className="plus">+{file.add}</em>}
                {file.del != null && file.del > 0 && <em className="minus">−{file.del}</em>}
              </>
            )}
          </span>
        </RowButton>
        <IconButton
          size="s"
          className="git-row-stage"
          label={group === "staged"
            ? t("git.unstage-file", { path: file.path })
            : t("git.stage-file", { path: file.path })}
          onClick={onUpdateStage}
        >
          {group === "staged" ? <MinusIcon /> : <PlusIcon />}
        </IconButton>
        <span className="git-file-menu-wrap">
          <LazyDropdownMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            align="end"
            label={t("project.actions")}
            trigger={
              <IconButton size="s" className="git-file-menu git-icon-btn" label={t("project.actions")} aria-haspopup="menu">
                ⋯
              </IconButton>
            }
            items={[
              {
                key: "restore",
                label: <span>{restoreArmed ? t("action.confirm") : t("action.restore")}</span>,
                destructive: restoreArmed,
                keepOpen: !restoreArmed,
                onSelect: () => {
                  if (!restoreArmed) {
                    setRestoreArmed(true);
                    return;
                  }
                  setRestoreArmed(false);
                  onRevert();
                },
              },
              {
                key: "ignore-file",
                label: <span>{t("git.ignore-file")}</span>,
                onSelect: () => onIgnore(file.path),
              },
              ...(directory ? ([{
                key: "ignore-dir",
                label: <span>{t("git.ignore-dir", { dir: directory })}</span>,
                onSelect: () => onIgnore(directory),
              }] as LazyDropdownMenuItem[]) : []),
            ]}
          />
        </span>
      </div>
    </div>
  );
}
