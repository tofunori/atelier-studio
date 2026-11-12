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
import "./ChatReview.css";

import { CircleCheckIcon, FileIcon, FolderIcon, PenLineIcon, TriangleAlertIcon } from "lucide-react";
import type { ChatReviewRef } from "../../lib/reviewSession";

/** Mots retirés et ajoutés entre deux phrases (plus longue sous-suite commune). */
export function wordDiff(before: string, after: string): Array<[" " | "-" | "+", string]> {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 250_000) return [["-", before], ["+", after]];
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: Array<[" " | "-" | "+", string]> = [];
  const push = (op: " " | "-" | "+", text: string) => {
    const last = out[out.length - 1];
    if (last && last[0] === op) last[1] += text; else out.push([op, text]);
  };
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push(" ", a[i]!); i += 1; j += 1; }
    else if (i < a.length && (j >= b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) { push("-", a[i]!); i += 1; }
    else { push("+", b[j]!); j += 1; }
  }
  return out;
}

/** Une de ses retouches passée en revue dans le chat (lot 2) : sa phrase,
 *  mots retirés barrés en rouge, ajoutés sur fond vert. */
function EditCard({ review, path, first, where }: { review: ChatReviewRef; path?: string; first: string; where: string }) {
  const flat = (text?: string) => (text || "").replace(/\s+/g, " ").trim();
  const ready = review.ready === true;
  return (
    <div className="review-card" title={path}>
      <div className="review-card-head">
        <PenLineIcon size={12} aria-hidden="true" className="review-card-ic" />
        {first}
        <span className="review-card-meta">{where}</span>
      </div>
      <div className="review-card-edit">
        {wordDiff(flat(review.quote), flat(review.comment)).map(([op, text], index) =>
          op === "-" ? <del key={index}>{text}</del> : op === "+" ? <ins key={index}>{text}</ins> : <span key={index}>{text}</span>)}
      </div>
      <div className={ready ? "review-card-likely" : "review-card-changed"}>
        {ready ? <CircleCheckIcon size={12} aria-hidden="true" /> : <TriangleAlertIcon size={12} aria-hidden="true" />}
        {t(ready ? "chat.review-edit-ready" : "chat.review-edit-changed")}
      </div>
    </div>
  );
}

/** Commentaire d'un relecteur passé en revue dans le chat (2026-11-12) :
 *  qui, où, son commentaire, ce qu'il commentait et le passage aujourd'hui. */
function ReviewCard({ review, path }: { review: ChatReviewRef; path?: string }) {
  const first = review.author.trim().split(/\s+/)[0] || t("chat.review-reviewer");
  const flat = (text?: string) => (text || "").replace(/\s+/g, " ").trim();
  const quote = flat(review.quote);
  const now = flat(review.now);
  const clip = (text: string) => (text.length > 320 ? `${text.slice(0, 319)}…` : text);
  const where = [t("chat.review-position", { n: review.n, total: review.total }),
    review.line ? t("chat.review-line", { n: review.line }) : null].filter(Boolean).join(" · ");
  if (review.edit) return <EditCard review={review} path={path} first={first} where={where} />;
  return (
    <div className="review-card" title={path}>
      <div className="review-card-head">
        <span className="review-card-ring">{review.n}</span>
        {first}
        <span className="review-card-meta">{where}</span>
      </div>
      <div className="review-card-comment">{review.comment}</div>
      {(quote || now) && (
        <div className="review-card-quote">
          {quote && quote !== now && <><span>{t("chat.review-was")}</span><code>{clip(quote)}</code></>}
          {now && <><span>{t("chat.review-now")}</span><code>{clip(now)}</code></>}
        </div>
      )}
      {review.likely && (
        <div className="review-card-likely"><CircleCheckIcon size={12} aria-hidden="true" />{t("chat.review-likely")}</div>
      )}
    </div>
  );
}
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
        if (ref.kind === "review" && ref.review) {
          return <ReviewCard key={`review:${ref.path ?? ""}:${ref.review.n}`} review={ref.review} path={ref.path} />;
        }
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
