// Cartes « article » des pièces jointes d'un message envoyé (variante B,
// choisie par Thierry le 2026-11-02). Une carte par fichier, HORS de la
// bulle : un carreau au type du fichier (PDF, TEX, CSV…), le titre de
// l'article quand il est connu (Zotero, sinon métadonnées du PDF), sinon le
// nom du fichier ; dessous, la revue, l'année et les pages — ou le type, la
// taille et les pages. Clic : ouvrir le fichier dans Atelier.
// Chargé à la demande (budget d'entrée JS) : turns.tsx le monte en lazy.
import type { ChatFileRef } from "../../lib/ws";
import { getResolvedLanguage, t } from "../../lib/i18n";
import { formatFileSize, useFileCards, type FileCardMeta } from "../../lib/chatFileCards";
import { RowButton } from "../ui";

import { FileIcon, FolderIcon } from "lucide-react";
/** Ancien message (sans `files`) : « nom (lines X) » redevient une carte. */
function fromLabel(label: string): ChatFileRef {
  const m = /^(.*?) \(lines ([^)]+)\)$/.exec(label);
  return m ? { name: m[1], lines: m[2] } : { name: label };
}

function typeTag(ref: ChatFileRef): string | null {
  if (ref.kind === "zotero") return "PDF";
  if (ref.kind === "folder" || ref.name.endsWith("/")) return null;
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(ref.name)?.[1];
  return ext ? ext.toUpperCase().slice(0, 4) : null;
}

function Glyph({ folder }: { folder: boolean }) {
  return folder ? (
    <FolderIcon size={14} />
  ) : (
    <FileIcon size={14} />
  );
}

function cardText(ref: ChatFileRef, meta: FileCardMeta | null, tag: string | null) {
  const lang = getResolvedLanguage();
  const title = meta?.title || ref.title;
  const pages = meta?.pages ? t("chat.file-pages", { n: meta.pages }) : null;
  const lines = ref.lines && ref.kind !== "folder" ? `L. ${ref.lines}` : ref.lines ?? null;
  if (meta?.missing) {
    return { title: title || ref.name, parts: [t("chat.file-missing")] };
  }
  if (title) {
    const journal = meta?.journal || ref.journal;
    const year = meta?.year || ref.year;
    const parts = [journal, year, pages, lines].filter(Boolean) as string[];
    return { title, parts: parts.length ? parts : [tag ?? "", ref.name].filter(Boolean) };
  }
  const size = meta?.size != null ? formatFileSize(meta.size, lang) : null;
  return { title: ref.name, parts: [tag, size, pages, lines].filter(Boolean) as string[] };
}

export function ChatFileCards({ items }: { items: (ChatFileRef | string)[] }) {
  const refs = items.map((item) => (typeof item === "string" ? fromLabel(item) : item));
  const cardFor = useFileCards(refs.flatMap((ref) => (ref.path ? [ref.path] : [])));
  const seen = new Map<string, number>();
  return (
    <div className="user-file-attachments">
      {refs.map((ref) => {
        const meta = cardFor(ref.path);
        const tag = typeTag(ref);
        const folder = ref.kind === "folder" || ref.name.endsWith("/");
        const text = cardText(ref, meta, tag);
        const body = (
          <>
            <span className="file-card-tile" aria-hidden="true">
              <Glyph folder={folder} />
              {tag && <span className="file-card-tag">{tag}</span>}
            </span>
            <span className="file-card-text">
              <span className="file-card-title">{text.title}</span>
              {text.parts.length > 0 && (
                <span className="file-card-meta">
                  {text.parts.map((part, i) => (
                    <span key={part}>{i > 0 && <span className="file-card-dot">·</span>}{part}</span>
                  ))}
                </span>
              )}
            </span>
          </>
        );
        const tip = ref.path ?? ref.name;
        // clé stable par pièce ; un vieux libellé répété reçoit un rang
        const base = `${ref.kind ?? ""}:${ref.path ?? ref.name}:${ref.lines ?? ""}`;
        const rank = seen.get(base) ?? 0;
        seen.set(base, rank + 1);
        const key = rank ? `${base}#${rank}` : base;
        return ref.path && !folder && !meta?.missing ? (
          <RowButton
            key={key}
            className="user-file-attachment file-card is-openable"
            title={tip}
            aria-label={t("action.open-file", { ref: text.title })}
            onClick={() => window.dispatchEvent(new CustomEvent("chat-open-file", {
              detail: { rel: ref.path, line: null },
            }))}
          >
            {body}
          </RowButton>
        ) : (
          <span key={key} className="user-file-attachment file-card" title={tip}>{body}</span>
        );
      })}
    </div>
  );
}
