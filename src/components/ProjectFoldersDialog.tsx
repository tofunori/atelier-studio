import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, Folder, Plus, Trash2 } from "lucide-react";
import { LazyDialog } from "./ui/LazyDialog";
import { Button, IconButton } from "./ui";
import { Input } from "./shadcn/input";
import { Checkbox, CheckboxIndicator } from "./shadcn/checkbox";
import { Field, FieldGroup, FieldLabel } from "./shadcn/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select";
import { normalizeProjectFolders, type ProjectFolders, type ProjectFolder } from "../lib/projectFolders";
import { t } from "../lib/i18n";
import "./ProjectFolders.css";

function GalleryVisibility({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <Field orientation="horizontal"><Checkbox checked={checked} onCheckedChange={onChange}><CheckboxIndicator><Check size={12}/></CheckboxIndicator></Checkbox><FieldLabel>{t("project.folders-show")}</FieldLabel></Field>;
}

export default function ProjectFoldersDialog({ root, value, onChange, onClose, locked = false }: {
  root: string; locked?: boolean; value?: ProjectFolders; onChange: (value: ProjectFolders) => void; onClose: () => void;
}) {
  const config = normalizeProjectFolders(root, value);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (path: string, patch: Partial<ProjectFolder>) => onChange({ ...config, folders: config.folders.map(f => f.path === path ? { ...f, ...patch } : f) });
  async function add() {
    if (locked) return;
    setBusy(true); setError("");
    try {
      const selected = await open({ directory: true, multiple: false, title: t("project.folders-add") });
      if (typeof selected !== "string") return;
      const next = normalizeProjectFolders(root, { ...config, folders: [...config.folders, { path: selected, name: selected.split("/").pop() || selected, access: "read", gallery: true }] });
      if (next.folders.length === config.folders.length) { setError(t("project.folders-duplicate")); return; }
      onChange(next);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <LazyDialog open title={t("project.folders-dialog-title")} closeLabel={t("action.close")} onOpenChange={v => { if (!v) onClose(); }} className="project-folders-dialog">
    <div className="project-folders-heading"><h3>{t("project.folders-main")}</h3></div>
    <div className="project-folder-row"><Folder size={20} /><div className="project-folder-content"><strong>{root.split("/").pop() || root}</strong><code title={root}>{root}</code><GalleryVisibility checked={config.mainGallery} onChange={mainGallery => onChange({ ...config, mainGallery })}/></div></div>
    <div className="project-folders-heading"><h3>{t("project.folders-associated")}</h3><Button variant="secondary" disabled={busy || locked} onClick={() => void add()}><Plus data-icon="inline-start" />{t("project.folders-add")}</Button></div>
    <div className="project-folders-list">{config.folders.map(f => <div className="project-folder-row" key={f.path}><Folder size={20}/><FieldGroup className="project-folder-content"><Field><FieldLabel className="tw:sr-only">{t("project.folders-name")}</FieldLabel><Input value={f.name} onChange={e => update(f.path, { name: e.target.value })}/></Field><code title={f.path}>{f.path}</code><div className="project-folder-options"><GalleryVisibility checked={f.gallery} onChange={gallery => update(f.path, { gallery })}/><Field className="project-folder-access"><FieldLabel>{t("project.folders-access")}</FieldLabel><Select disabled={locked} value={f.access} onValueChange={access => { if (access === "read" || access === "write") update(f.path, { access }); }}><SelectTrigger size="sm"><SelectValue>{f.access === "write" ? t("project.folders-write") : t("project.folders-read")}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="read">{t("project.folders-read")}</SelectItem><SelectItem value="write">{t("project.folders-write")}</SelectItem></SelectGroup></SelectContent></Select></Field></div></FieldGroup><IconButton disabled={locked} label={t("project.folders-remove")} onClick={() => onChange({ ...config, folders: config.folders.filter(x => x.path !== f.path) })}><Trash2 size={14}/></IconButton></div>)}{!config.folders.length && <p className="project-folders-muted">{t("project.folders-empty")}</p>}</div>
    {locked && <p role="status" className="project-folders-muted">{t("project.folders-running")}</p>}
    {error && <p role="alert">{error}</p>}<details className="project-folders-help"><summary>{t("project.folders-help")}</summary><p className="project-folders-note">{t("project.folders-note")}</p><p className="project-folders-muted">{t("project.folders-permissions-note")}</p></details>
  </LazyDialog>;
}
