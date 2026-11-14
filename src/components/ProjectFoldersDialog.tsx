import { useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, Plus, Trash2 } from "lucide-react";
import { LazyDialog } from "./ui/LazyDialog";
import { Button, EmptyState, IconButton, InlineNotice, Select } from "./ui";
import { Input } from "./shadcn/input";
import { Checkbox, CheckboxIndicator } from "./shadcn/checkbox";
import { Field, FieldGroup, FieldLabel } from "./shadcn/field";
import { normalizeProjectFolders, type ProjectFolders, type ProjectFolder } from "../lib/projectFolders";
import type { ProjectDue } from "../lib/projectsHome";
import { t } from "../lib/i18n";
import "./ProjectFolders.css";

function GalleryVisibility({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <Field orientation="horizontal"><Checkbox checked={checked} onCheckedChange={onChange}><CheckboxIndicator /></Checkbox><FieldLabel>{t("project.folders-show")}</FieldLabel></Field>;
}

function FolderAccess({ folder, locked, onChange }: { folder: ProjectFolder; locked: boolean; onChange: (access: "read" | "write") => void }) {
  const portal = useRef<HTMLElement | null>(null);
  return <Field ref={element => { portal.current = element?.closest<HTMLElement>('[data-slot="dialog-viewport"]') ?? element; }} className="project-folder-access">
    <FieldLabel>{t("project.folders-access")}</FieldLabel>
    <Select
      compact
      disabled={locked}
      title={`${t("project.folders-access")} — ${folder.name}`}
      value={folder.access}
      onChange={access => {
        if (access === "read" || access === "write") onChange(access);
      }}
      portalContainer={portal}
      alignItemWithTrigger={false}
      options={[
        { value: "read", label: t("project.folders-read") },
        { value: "write", label: t("project.folders-write") },
      ]}
    />
  </Field>;
}

/** Ce que montre la carte du projet sur l'écran d'ouverture : nom, revue et échéance. */
type ProjectCardMeta = { name?: string; journal?: string; due?: ProjectDue };

/** Nom d'affichage du projet (2026-11-14) : le dossier sur le disque ne change pas. */
function ProjectNameField({ root, card, onChange }: { root: string; card?: ProjectCardMeta; onChange: (patch: ProjectCardMeta) => void }) {
  return <FieldGroup className="project-card-fields project-name-field">
    <Field orientation="horizontal"><FieldLabel htmlFor="project-name">{t("projects.name")}</FieldLabel>
      <Input id="project-name" value={card?.name ?? ""} placeholder={root.split("/").filter(Boolean).pop() || root}
        onChange={e => onChange({ name: e.target.value || undefined })} /></Field>
    <p className="project-folders-muted project-name-hint">{t("projects.name-hint")}</p>
  </FieldGroup>;
}

function ProjectCardFields({ card, onChange }: { card?: ProjectCardMeta; onChange: (patch: ProjectCardMeta) => void }) {
  const due = card?.due;
  const setDue = (patch: Partial<ProjectDue>) => {
    const next = { date: due?.date ?? "", label: due?.label, ...patch };
    onChange({ due: next.date ? { date: next.date, ...(next.label?.trim() ? { label: next.label } : {}) } : undefined });
  };
  return <FieldGroup className="project-card-fields">
    <Field orientation="horizontal"><FieldLabel htmlFor="project-journal">{t("projects.journal")}</FieldLabel>
      <Input id="project-journal" value={card?.journal ?? ""} placeholder={t("projects.journal-placeholder")}
        onChange={e => onChange({ journal: e.target.value || undefined })} /></Field>
    <div className="project-due-row">
      <Field orientation="horizontal"><FieldLabel htmlFor="project-due">{t("projects.due")}</FieldLabel>
        <Input id="project-due" type="date" value={due?.date ?? ""} onChange={e => setDue({ date: e.target.value })} /></Field>
      <Input aria-label={t("projects.due-label")} value={due?.label ?? ""} placeholder={t("projects.due-label-placeholder")}
        disabled={!due?.date} onChange={e => setDue({ label: e.target.value })} />
    </div>
  </FieldGroup>;
}

export default function ProjectFoldersDialog({ root, value, onChange, onClose, locked = false, card, onCardChange }: {
  root: string; locked?: boolean; value?: ProjectFolders; onChange: (value: ProjectFolders) => void; onClose: () => void;
  card?: ProjectCardMeta; onCardChange?: (patch: ProjectCardMeta) => void;
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
    {onCardChange && <><ProjectNameField root={root} card={card} onChange={onCardChange} />
    <div className="project-folders-heading"><h3>{t("projects.card-heading")}</h3></div>
    <ProjectCardFields card={card} onChange={onCardChange} /></>}
    <div className="project-folders-heading"><h3>{t("project.folders-main")}</h3></div>
    <div className="project-folder-row"><Folder size={20} /><div className="project-folder-content"><strong>{root.split("/").pop() || root}</strong><code title={root}>{root}</code><GalleryVisibility checked={config.mainGallery} onChange={mainGallery => onChange({ ...config, mainGallery })}/></div></div>
    <div className="project-folders-heading"><h3>{t("project.folders-associated")}</h3><Button variant="secondary" disabled={busy || locked} onClick={() => void add()}><Plus data-icon="inline-start" />{t("project.folders-add")}</Button></div>
    <div className="project-folders-list">{config.folders.map(f => <div className="project-folder-row" key={f.path}><Folder size={20}/><FieldGroup className="project-folder-content"><Field><FieldLabel className="tw:sr-only">{t("project.folders-name")}</FieldLabel><Input value={f.name} onChange={e => update(f.path, { name: e.target.value })}/></Field><code title={f.path}>{f.path}</code><div className="project-folder-options"><GalleryVisibility checked={f.gallery} onChange={gallery => update(f.path, { gallery })}/><FolderAccess folder={f} locked={locked} onChange={access => update(f.path, { access })}/></div></FieldGroup><IconButton disabled={locked} label={t("project.folders-remove")} onClick={() => onChange({ ...config, folders: config.folders.filter(x => x.path !== f.path) })}><Trash2 size={14}/></IconButton></div>)}{!config.folders.length && <EmptyState className="ui-empty--inline" title={t("project.folders-empty")} />}</div>
    {locked && <p role="status" className="project-folders-muted">{t("project.folders-running")}</p>}
    {error && <InlineNotice tone="error">{error}</InlineNotice>}<details className="ui-details project-folders-help"><summary>{t("project.folders-help")}</summary><p className="project-folders-note">{t("project.folders-note")}</p><p className="project-folders-muted">{t("project.folders-permissions-note")}</p></details>
  </LazyDialog>;
}
