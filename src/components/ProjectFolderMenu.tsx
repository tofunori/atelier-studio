import { useState } from "react";
import "./ProjectFolderMenu.css";
import { ChevronDown, Folder } from "lucide-react";
import { Button } from "./ui/Button";
import { DropdownMenuSurface } from "./ui/DropdownMenuSurface";

export type FolderMenuState = { folders: { path: string; name: string }[]; selected: string; label: string; manageLabel: string };
export function ProjectFolderMenu({ state, onSelect, onManage }: { state: FolderMenuState; onSelect: (path: string) => void; onManage: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenuSurface
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="project-folder-menu"
      label={state.label}
      trigger={(
        <Button
          variant="ghost"
          size="sm"
          data-project-folder-menu
          aria-label={state.label}
          title={state.folders.find((f) => f.path === state.selected)?.name || state.label}
          style={{ maxWidth: 180, minWidth: 0 }}
        >
          <Folder aria-hidden="true" />
          <ChevronDown aria-hidden="true" size={12} />
        </Button>
      )}
      items={[
        ...state.folders.map((folder) => ({
          key: folder.path,
          label: folder.name,
          checked: state.selected === folder.path,
          onSelect: () => {
            setOpen(false);
            onSelect(folder.path);
          },
        })),
        {
          key: "manage",
          separatorBefore: true,
          label: `${state.manageLabel}…`,
          onSelect: () => {
            setOpen(false);
            requestAnimationFrame(onManage);
          },
        },
      ]}
    />
  );
}
