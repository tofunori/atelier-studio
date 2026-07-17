// Picker de la base de connaissances (plan 049 T3) : depuis la barre du
// composer, attacher des sources épinglées à la conversation courante
// (kbSourceIds/kbFullContent persistés par thread), épingler fichier/PDF/URL/
// note, retirer une source de la base. La bibliothèque est globale ; l'attache
// est par conversation — portée « ce message » et Zotero viendront ensuite.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { t } from "../../lib/i18n";
import {
  kbSourcesLoaded,
  kbSourcesSnapshot,
  onOpenKbPicker,
  openKbPicker,
  requestKbSources,
  subscribeKbSources,
  type KbBinding,
  type KbSource,
} from "../../lib/kbSources";
import { useKbActions } from "./kbActions";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/popover";
import { Input } from "../shadcn/input";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";

// ré-export : les consommateurs historiques importent le type depuis ce module
export type { KbBinding } from "../../lib/kbSources";

const GROUP_LABELS: Record<string, Parameters<typeof t>[0]> = {
  file: "kb.group-files",
  folder: "kb.group-folders",
  pdf: "kb.group-pdf",
  web: "kb.group-web",
  youtube: "kb.group-youtube",
  note: "kb.group-notes",
};
const GROUP_ORDER = ["file", "folder", "pdf", "web", "youtube", "note"];

function fmtChars(chars: number): string {
  if (!Number.isFinite(chars) || chars <= 0) return "";
  return chars < 1000 ? String(chars) : `${Math.round(chars / 1000)}k`;
}

function KindIcon({ kind, size = 13 }: { kind: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.3,
  } as const;
  if (kind === "pdf") {
    return (
      <svg {...common}>
        <path d="M4 1.8h6l3 3v9.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z" />
        <path d="M10 1.8v3h3M5.5 9h5M5.5 11.5h3.5" />
      </svg>
    );
  }
  if (kind === "web") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" />
        <path d="M1.8 8h12.4M8 1.8a10 10 0 0 1 0 12.4M8 1.8a10 10 0 0 0 0 12.4" />
      </svg>
    );
  }
  if (kind === "note") {
    return (
      <svg {...common}>
        <path d="M3.5 2.5h9a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
        <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
      </svg>
    );
  }
  if (kind === "folder") {
    return (
      <svg {...common}>
        <path d="M1.8 4.6c0-.7.6-1.3 1.3-1.3h3l1.5 1.5h5.6c.7 0 1.3.6 1.3 1.3v6c0 .7-.6 1.3-1.3 1.3H3.1c-.7 0-1.3-.6-1.3-1.3v-7.5z" />
      </svg>
    );
  }
  if (kind === "youtube") {
    return (
      <svg {...common}>
        <rect x="1.8" y="3.2" width="12.4" height="9.6" rx="2" />
        <path d="m6.6 6 3.4 2-3.4 2V6z" />
      </svg>
    );
  }
  if (kind === "gbrain") {
    return (
      <svg {...common}>
        <circle cx="3.5" cy="8" r="1.7" />
        <circle cx="12" cy="3.8" r="1.7" />
        <circle cx="12" cy="12.2" r="1.7" />
        <path d="m5 7.2 5.5-2.7M5 8.8l5.5 2.7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 1.8h6l3 3v9.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z" />
      <path d="M10 1.8v3h3" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M3.2 12.9V4.1c0-.9.7-1.6 1.6-1.6h8v9.4H4.8c-.9 0-1.6.7-1.6 1s.7 1.6 1.6 1.6h8v-2.6" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M6.5 2.5h-4v4M9.5 13.5h4v-4M13.5 6.5v-4h-4M2.5 9.5v4h4" />
    </svg>
  );
}

/** Panneau interne — pur vis-à-vis du réseau, testable sans popover/portal.
 * layout "popover" (défaut) : groupes par type, compact.
 * layout "surface" (plan 050) : Attachées à la conversation d'abord, puis la
 * bibliothèque (non attachées) groupée par type — même rangées, mêmes actions. */
export function KbPickerPanel(p: {
  sources: KbSource[];
  attached: string[];
  fullContent: string[];
  error: string | null;
  onToggle: (id: string) => void;
  onToggleFull: (id: string) => void;
  onRemoveSource: (id: string) => void;
  onPromote: (id: string) => void;
  promoted: string | null;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onAddUrl: (url: string) => void;
  onAddNote: (title: string, text: string) => void;
  layout?: "popover" | "surface";
  threadTitle?: string;
}) {
  const [query, setQuery] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [url, setUrl] = useState("");
  const surface = p.layout === "surface";

  const filtered = p.sources.filter((source) =>
    !query.trim() || source.title.toLowerCase().includes(query.trim().toLowerCase()));
  const attachedSources = surface
    ? p.attached
        .filter((id) => id !== "gbrain")
        .map((id) => filtered.find((source) => source.id === id))
        .filter((source): source is KbSource => Boolean(source))
    : [];
  const librarySources = surface
    ? filtered.filter((source) => !p.attached.includes(source.id))
    : filtered;
  const kinds = [
    ...GROUP_ORDER.filter((kind) => librarySources.some((source) => source.kind === kind)),
    ...[...new Set(librarySources.map((source) => source.kind))].filter((kind) => !GROUP_ORDER.includes(kind)),
  ];

  function submitUrl() {
    const value = url.trim();
    if (!value) return;
    p.onAddUrl(value);
    setUrl("");
  }

  function submitNote() {
    if (!noteTitle.trim() || !noteText.trim()) return;
    p.onAddNote(noteTitle.trim(), noteText.trim());
    setNoteTitle("");
    setNoteText("");
    setNoteOpen(false);
  }

  const renderRow = (source: KbSource) => {
    const on = p.attached.includes(source.id);
    const full = p.fullContent.includes(source.id);
    return (
      <div key={source.id} className={`kb-row ${on ? "on" : ""}`}>
        <RowButton
          className="kb-row-main"
          title={source.origin ?? source.title}
          onClick={() => p.onToggle(source.id)}
        >
          <span className={`kb-check ${on ? "on" : ""}`} aria-hidden />
          <span className="kb-kind"><KindIcon kind={source.kind} /></span>
          <span className="kb-name">{source.title}</span>
          <span className="kb-meta">{fmtChars(source.chars)}</span>
        </RowButton>
        <span className="kb-row-actions">
          <IconButton
            size="s"
            className={`ghost ${p.promoted === source.id ? "on" : ""}`}
            label={t("kb.promote")}
            title={p.promoted === source.id ? t("kb.promoted") : t("kb.promote")}
            onClick={() => p.onPromote(source.id)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M8 12.5V4M4.5 7.5 8 4l3.5 3.5" />
              <path d="M3 14h10" />
            </svg>
          </IconButton>
          <IconButton
            size="s"
            className={`ghost kb-full ${full ? "on" : ""}`}
            label={t("kb.full-content")}
            title={full ? t("kb.full-content-on") : t("kb.full-content")}
            onClick={() => p.onToggleFull(source.id)}
          >
            <ExpandIcon />
          </IconButton>
          <IconButton
            size="s"
            className="ghost"
            label={t("kb.remove-source")}
            title={t("kb.remove-source")}
            onClick={() => p.onRemoveSource(source.id)}
          >
            ×
          </IconButton>
        </span>
      </div>
    );
  };

  return (
    <div className={`kb-panel ${surface ? "kb-panel-surface" : ""}`}>
      <div className="kb-head">
        <span className="kb-title">{t("kb.title")}</span>
        <Input
          className="kb-search"
          placeholder={t("kb.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="kb-actions">
        <Button type="button" variant="ghost" className="ghost kb-action" onClick={p.onAddFiles}>
          {t("kb.add-file")}
        </Button>
        <Button type="button" variant="ghost" className="ghost kb-action" onClick={p.onAddFolder}>
          {t("kb.add-folder")}
        </Button>
        <Button type="button" variant="ghost" className="ghost kb-action" onClick={() => setNoteOpen((v) => !v)}>
          {t("kb.add-note")}
        </Button>
        <Input
          className="kb-url"
          placeholder={t("kb.url-placeholder")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitUrl();
            }
          }}
        />
      </div>
      {noteOpen && (
        <div className="kb-note-form">
          <Input
            autoFocus
            placeholder={t("kb.note-title")}
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
          />
          <textarea
            className="kb-note-text"
            placeholder={t("kb.note-text")}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
          />
          <div className="kb-note-actions">
            <Button type="button" variant="ghost" className="ghost" onClick={() => setNoteOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="button" variant="ghost" className="ghost" onClick={submitNote}>
              {t("kb.note-save")}
            </Button>
          </div>
        </div>
      )}
      {p.error && <div className="kb-error">{p.error}</div>}
      <div className="kb-list">
        {surface && (
          <div>
            <div className="kb-group">
              {t("kb.panel-attached", {
                title: p.threadTitle?.trim() || t("app.new-chat-title"),
                n: p.attached.length,
              })}
            </div>
            {attachedSources.map(renderRow)}
            {attachedSources.length === 0 && !p.attached.includes("gbrain") && (
              <div className="kb-empty">{t("kb.panel-attached-empty")}</div>
            )}
          </div>
        )}
        {surface && filtered.length > 0 && (
          <div className="kb-group kb-group-section">{t("kb.panel-library")}</div>
        )}
        {!surface && filtered.length === 0 && <div className="kb-empty">{t("kb.empty")}</div>}
        {kinds.map((kind) => (
          <div key={kind}>
            <div className="kb-group">{GROUP_LABELS[kind] ? t(GROUP_LABELS[kind]) : kind}</div>
            {librarySources.filter((source) => source.kind === kind).map(renderRow)}
          </div>
        ))}
        <div>
          <div className="kb-group">{t("kb.group-corpus")}</div>
          <div className={`kb-row ${p.attached.includes("gbrain") ? "on" : ""}`}>
            <RowButton
              className="kb-row-main"
              title={t("kb.gbrain-title")}
              onClick={() => p.onToggle("gbrain")}
            >
              <span className={`kb-check ${p.attached.includes("gbrain") ? "on" : ""}`} aria-hidden />
              <span className="kb-kind"><KindIcon kind="gbrain" /></span>
              <span className="kb-name">{t("kb.gbrain-title")}</span>
              <span className="kb-meta">{t("kb.gbrain-meta")}</span>
            </RowButton>
          </div>
        </div>
      </div>
      <div className="kb-foot">
        <span>{t("kb.attached-count").replace("{n}", String(p.attached.length))}</span>
        <span className="kb-scope">{t("kb.scope-conversation")}</span>
      </div>
    </div>
  );
}

export function KbPicker({ binding }: { binding: KbBinding }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sources = useSyncExternalStore(subscribeKbSources, kbSourcesSnapshot);
  const openRef = useRef(pickerOpen);
  openRef.current = pickerOpen;
  // toute la logique d'actions vit dans le hook partagé avec la surface
  // Connaissances (plan 050) — le popover n'est qu'une coquille
  const actions = useKbActions(binding, () => openRef.current);
  // ouverture externe (pilule agrégée)
  useEffect(() => onOpenKbPicker(() => {
    actions.setError(null);
    requestKbSources();
    setPickerOpen(true);
  }), []);
  return (
    <Popover
      open={pickerOpen}
      onOpenChange={(next) => {
        setPickerOpen(next);
        if (next) {
          actions.setError(null);
          requestKbSources();
        }
      }}
    >
      <PopoverTrigger
        render={
          <IconButton
            size="s"
            className="ghost kb-trigger"
            label={t("kb.open")}
            title={t("kb.open")}
          >
            <BookIcon />
            {binding.attached.length > 0 && (
              <span className="kb-badge">{binding.attached.length}</span>
            )}
          </IconButton>
        }
      />
      {pickerOpen && (
        <PopoverContent plain side="top" align="start" sideOffset={8} className="kb-pop">
          <KbPickerPanel
            sources={sources}
            attached={binding.attached}
            fullContent={binding.fullContent}
            error={actions.error}
            onToggle={actions.toggle}
            onToggleFull={actions.toggleFull}
            onRemoveSource={actions.removeSource}
            onPromote={actions.promote}
            promoted={actions.promoted}
            onAddFiles={() => { void actions.addFiles(); }}
            onAddFolder={() => { void actions.addFolder(); }}
            onAddUrl={actions.addUrl}
            onAddNote={actions.addNote}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

/** Pilules des sources attachées, au-dessus du champ (à côté du ContextShelf). */
export function KbChips(p: {
  attached: string[];
  fullContent: string[];
  onDetach: (id: string) => void;
}) {
  const sources = useSyncExternalStore(subscribeKbSources, kbSourcesSnapshot);
  useEffect(() => {
    if (p.attached.length && !kbSourcesLoaded()) requestKbSources();
  }, [p.attached.length]);
  if (!p.attached.length) return null;
  const chipFor = (id: string) => {
    const source = sources.find((entry) => entry.id === id);
    const isGbrain = id === "gbrain";
    const label = isGbrain ? t("kb.gbrain-title") : source?.title ?? id;
    return (
      <span key={id} className="chip kb-chip" title={source?.origin ?? label}>
        <KindIcon kind={isGbrain ? "gbrain" : source?.kind ?? "file"} size={11} />
        <span className="chip-label">{label}</span>
        {p.fullContent.includes(id) && (
          <span className="kb-chip-full">{t("kb.chip-full")}</span>
        )}
        <IconButton
          size="s"
          className="ghost"
          label={t("kb.detach")}
          title={t("kb.detach")}
          onClick={() => p.onDetach(id)}
        >
          ×
        </IconButton>
      </span>
    );
  };
  // TOUJOURS une pilule agrégée (décision Thierry : même comportement quel
  // que soit le nombre) qui ouvre le picker, le gestionnaire — 30 PDF ne font
  // jamais 30 pilules. gbrain garde sa pilule propre.
  const regular = p.attached.filter((id) => id !== "gbrain");
  const preview = regular
    .slice(0, 2)
    .map((id) => sources.find((entry) => entry.id === id)?.title ?? id)
    .join(", ");
  return (
    <div className="kb-chips">
      {regular.length > 0 && (
        <RowButton
          className="chip kb-chip kb-chip-agg"
          title={t("kb.chips-open")}
          onClick={openKbPicker}
        >
          <BookIcon />
          <span className="chip-label">
            {regular.length === 1
              ? t("kb.chips-aggregate-one")
              : t("kb.chips-aggregate", { n: regular.length })}
          </span>
          <span className="kb-chip-preview">{preview}{regular.length > 2 ? "…" : ""}</span>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </RowButton>
      )}
      {p.attached.includes("gbrain") && chipFor("gbrain")}
    </div>
  );
}
