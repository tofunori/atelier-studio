import { useState } from "react";
import "./ProjectFolderMenu.css";
import { ChevronDown, Folder } from "lucide-react";
import { Button } from "./ui/Button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from "./shadcn/dropdown-menu";

export type FolderMenuState = { folders: { path: string; name: string }[]; selected: string; label: string; manageLabel: string };
export function ProjectFolderMenu({ state, onSelect, onManage }: { state: FolderMenuState; onSelect: (path: string) => void; onManage: () => void }) {
  const [open, setOpen] = useState(false);
  return <DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger render={<Button variant="ghost" size="sm" data-project-folder-menu aria-label={state.label} title={(state.folders.find(f => f.path === state.selected)?.name || state.label)} style={{ maxWidth: 180, minWidth: 0 }}><Folder aria-hidden="true"/><ChevronDown aria-hidden="true" size={12} /></Button>} />
    <DropdownMenuContent align="start" className="project-folder-menu"><DropdownMenuGroup>{state.folders.map(f => <DropdownMenuCheckboxItem key={f.path} checked={state.selected === f.path} onClick={() => { setOpen(false); onSelect(f.path); }}>{f.name}</DropdownMenuCheckboxItem>)}</DropdownMenuGroup><DropdownMenuSeparator/><DropdownMenuGroup><DropdownMenuItem onClick={() => { setOpen(false); requestAnimationFrame(onManage); }}>{state.manageLabel}…</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
  </DropdownMenu>;
}
