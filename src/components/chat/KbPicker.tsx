// Picker de la base de connaissances (plan 049 T3) : depuis la barre du
// composer, attacher des sources épinglées à la conversation courante
// (kbSourceIds/kbFullContent persistés par thread), épingler fichier/PDF/URL/
// note, retirer une source de la base. La bibliothèque est globale ; l'attache
// est par conversation — portée « ce message » et Zotero viendront ensuite.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { t } from "../../lib/i18n";
import { wsSend } from "../../lib/wsBus";
import {
  kbSourcesLoaded,
  kbSourcesSnapshot,
  requestKbSources,
  subscribeKbSources,
  type KbSource,
} from "../../lib/kbSources";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/popover";
import { Input } from "../shadcn/input";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";

export type KbBinding = {
  attached: string[];
  fullContent: string[];
  onChange: (next: { kbSourceIds: string[]; kbFullContent: string[] }) => void;
};

const GROUP_LABELS: Record<string, Parameters<typeof t>[0]> = {
  file: "kb.group-files",
  pdf: "kb.group-pdf",
  web: "kb.group-web",
  note: "kb.group-notes",
};
const GROUP_ORDER = ["file", "pdf", "web", "note"];

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

/** Panneau interne — pur vis-à-vis du réseau, testable sans popover/portal. */
export function KbPickerPanel(p: {
  sources: KbSource[];
  attached: string[];
  fullContent: string[];
  error: string | null;
  onToggle: (id: string) => void;
  onToggleFull: (id: string) => void;
  onRemoveSource: (id: string) => void;
  onAddFiles: () => void;
  onAddUrl: (url: string) => void;
  onAddNote: (title: string, text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [url, setUrl] = useState("");

  const filtered = p.sources.filter((source) =>
    !query.trim() || source.title.toLowerCase().includes(query.trim().toLowerCase()));
  const kinds = [
    ...GROUP_ORDER.filter((kind) => filtered.some((source) => source.kind === kind)),
    ...[...new Set(filtered.map((source) => source.kind))].filter((kind) => !GROUP_ORDER.includes(kind)),
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

  return (
    <div className="kb-panel">
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
        {filtered.length === 0 && <div className="kb-empty">{t("kb.empty")}</div>}
        {kinds.map((kind) => (
          <div key={kind}>
            <div className="kb-group">{GROUP_LABELS[kind] ? t(GROUP_LABELS[kind]) : kind}</div>
            {filtered.filter((source) => source.kind === kind).map((source) => {
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
            })}
          </div>
        ))}
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
  const [error, setError] = useState<string | null>(null);
  const sources = useSyncExternalStore(subscribeKbSources, kbSourcesSnapshot);
  const openRef = useRef(pickerOpen);
  openRef.current = pickerOpen;
  const bindingRef = useRef(binding);
  bindingRef.current = binding;

  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { ok?: boolean; message?: string; source?: KbSource }
        | undefined;
      if (!detail?.ok) {
        if (openRef.current) setError(detail?.message ?? t("kb.error-generic"));
        return;
      }
      // épinglage initié depuis le picker ouvert → attacher directement
      const id = detail.source?.id;
      const current = bindingRef.current;
      if (openRef.current && id && !current.attached.includes(id)) {
        current.onChange({
          kbSourceIds: [...current.attached, id],
          kbFullContent: current.fullContent,
        });
      }
    };
    window.addEventListener("kb-source-added", onAdded);
    return () => window.removeEventListener("kb-source-added", onAdded);
  }, []);

  function toggle(id: string) {
    const on = binding.attached.includes(id);
    binding.onChange({
      kbSourceIds: on ? binding.attached.filter((x) => x !== id) : [...binding.attached, id],
      kbFullContent: on ? binding.fullContent.filter((x) => x !== id) : binding.fullContent,
    });
  }

  function toggleFull(id: string) {
    const full = binding.fullContent.includes(id);
    binding.onChange({
      kbSourceIds: binding.attached.includes(id) ? binding.attached : [...binding.attached, id],
      kbFullContent: full ? binding.fullContent.filter((x) => x !== id) : [...binding.fullContent, id],
    });
  }

  function removeSource(id: string) {
    wsSend({ type: "kbRemove", id });
    if (binding.attached.includes(id) || binding.fullContent.includes(id)) {
      binding.onChange({
        kbSourceIds: binding.attached.filter((x) => x !== id),
        kbFullContent: binding.fullContent.filter((x) => x !== id),
      });
    }
  }

  async function addFiles() {
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: "Sources", extensions: ["md", "tex", "txt", "pdf"] }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    for (const path of paths) {
      const kind = String(path).toLowerCase().endsWith(".pdf") ? "pdf" : "file";
      wsSend({ type: "kbAdd", kind, origin: path });
    }
  }

  return (
    <Popover
      open={pickerOpen}
      onOpenChange={(next) => {
        setPickerOpen(next);
        if (next) {
          setError(null);
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
            error={error}
            onToggle={toggle}
            onToggleFull={toggleFull}
            onRemoveSource={removeSource}
            onAddFiles={() => { void addFiles(); }}
            onAddUrl={(url) => wsSend({ type: "kbAdd", kind: "web", origin: url })}
            onAddNote={(title, text) => wsSend({ type: "kbAdd", kind: "note", title, text })}
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
  return (
    <div className="kb-chips">
      {p.attached.map((id) => {
        const source = sources.find((entry) => entry.id === id);
        return (
          <span key={id} className="chip kb-chip" title={source?.origin ?? source?.title ?? id}>
            <KindIcon kind={source?.kind ?? "file"} size={11} />
            <span className="chip-label">{source?.title ?? id}</span>
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
      })}
    </div>
  );
}
