// Codage qualitatif (façon NVivo) dans le panneau Annotations : l'arbre des
// codes avec leurs effectifs, et la vue d'un code (mémo, passages groupés par
// article, propositions de Claude à garder ou refuser). Le livre de codes vit
// dans codebook.json à côté du store des annotations (crate atelier-codebook) ;
// routes du serveur galerie : GET/POST /codebook et POST /pdfannot-codes.
import { useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { Button, IconButton, RowButton } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { annotCiteRef, annotQuoteText, type PdfAnnot } from "./AnnotationsPanel";
import { codeFamily, codePassages, type Code, type Passage } from "../lib/codes";

export type { Code } from "../lib/codes";

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const ICON = {
  back: <path d="M10 3L5.5 8 10 13" />,
  more: <><circle cx="3.5" cy="8" r=".9" /><circle cx="8" cy="8" r=".9" /><circle cx="12.5" cy="8" r=".9" /></>,
  plus: <path d="M8 3v10M3 8h10" />,
  open: <path d="M6 3H3.5v9.5H13V10M9 3h4v4M13 3 7.5 8.5" />,
  chat: <path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z" />,
  check: <path d="m3.5 8.5 3 3 6-7" />,
  cross: <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />,
};
function Icon({ d }: { d: keyof typeof ICON }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[d]}</svg>
  );
}

export default function CodesView(p: {
  origin: string | null;
  lib: Record<string, PdfAnnot[]> | null;
  codes: Code[] | null;
  /** Relire store et livre de codes après une écriture. */
  reload: () => void;
  onOpenAnnot: (rel: string, annotId: string) => void;
  onQuote: (text: string) => void;
  /** Code ouvert (vue d'un code) — l'hôte élargit le panneau. */
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const { origin, lib, codes, openId, setOpenId } = p;
  const [search, setSearch] = useState("");
  // Saisie en ligne : nouveau code (parent null = racine) ou renommage.
  const [draft, setDraft] = useState<{ mode: "new" | "rename"; id: string | null; value: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function post(path: string, body: unknown) {
    if (!origin) return null;
    setError(null);
    try {
      const r = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);
      return j;
    } catch (e) {
      setError(String((e as Error)?.message || e));
      return null;
    } finally {
      p.reload();
    }
  }

  function commitDraft() {
    const d = draft;
    setDraft(null);
    const name = d?.value.trim();
    if (!d || !name) return;
    if (d.mode === "new") void post("/codebook", { op: "create", name, parent: d.id });
    else if (d.id) void post("/codebook", { op: "update", id: d.id, name });
  }

  const stats = useMemo(() => {
    const out = new Map<string, { passages: number; articles: number; pending: number }>();
    if (!codes || !lib) return out;
    for (const c of codes) {
      const { kept, pending } = codePassages(lib, codeFamily(codes, c.id));
      out.set(c.id, {
        passages: kept.length,
        articles: new Set(kept.map((x) => x.rel)).size,
        pending: pending.length,
      });
    }
    return out;
  }, [codes, lib]);

  if (codes === null) return <div className="annots-empty">{t("common.loading")}</div>;
  const open = openId ? codes.find((c) => c.id === openId) : undefined;
  if (open && lib) {
    return (
      <CodeDetail
        code={open}
        codes={codes}
        lib={lib}
        onBack={() => setOpenId(null)}
        onMemo={(memo) => void post("/codebook", { op: "update", id: open.id, memo })}
        onChange={(rel, a, change) => void post("/pdfannot-codes", { rel, id: String(a.id), ...change })}
        onOpenAnnot={p.onOpenAnnot}
        onQuote={p.onQuote}
        copied={copied}
        onCopied={() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}
        error={error}
      />
    );
  }

  const needle = fold(search.trim());
  const shown = needle ? codes.filter((c) => fold(c.path).includes(needle)) : codes;
  const draftInput = (depth: number) => draft && (
    <input
      className="codes-input"
      style={{ marginLeft: 8 + depth * 12 }}
      autoFocus
      aria-label={draft.mode === "new" ? t("codes.new") : t("codes.rename")}
      placeholder={draft.mode === "new" ? t("codes.new-placeholder") : undefined}
      value={draft.value}
      onChange={(e) => setDraft({ ...draft, value: e.target.value })}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDraft(null); }
      }}
    />
  );

  return (
    <>
      <div className="codes-tools">
        <input
          className="annots-search codes-search"
          placeholder={t("codes.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <IconButton size="s" label={t("codes.new")} title={t("codes.new")}
          onClick={() => setDraft({ mode: "new", id: null, value: "" })}>
          <Icon d="plus" />
        </IconButton>
      </div>
      <div className="annots-list codes-list">
        {error && <div className="annots-empty codes-error">{error}</div>}
        {draft?.mode === "new" && draft.id === null && draftInput(0)}
        {!codes.length && !draft && <div className="annots-empty">{t("codes.empty")}</div>}
        {codes.length > 0 && !shown.length && <div className="annots-empty">{t("annots.empty-filter")}</div>}
        {shown.map((c) => {
          const s = stats.get(c.id) ?? { passages: 0, articles: 0, pending: 0 };
          const depth = needle ? 0 : c.depth;
          return (
            <div key={c.id}>
              {draft?.mode === "rename" && draft.id === c.id ? draftInput(depth) : (
                <div className="codes-row" style={{ paddingLeft: depth * 12 }}>
                  <RowButton className="codes-open" title={c.memo ? `${c.path}\n${c.memo}` : c.path}
                    onClick={() => setOpenId(c.id)}>
                    <span className="codes-name">{needle ? c.path : c.name}</span>
                    {s.pending > 0 && (
                      <span className="codes-pending" title={`${s.pending} ${t("codes.pending-title")}`}>
                        {t("codes.pending", { n: s.pending })}
                      </span>
                    )}
                    <span className="codes-count">
                      {t("codes.count", { n: s.passages, m: s.articles })}
                    </span>
                  </RowButton>
                  <LazyDropdownMenu
                    open={menuFor === c.id}
                    onOpenChange={(o) => setMenuFor(o ? c.id : null)}
                    label={t("codes.actions")}
                    align="end"
                    items={[
                      { key: "rename", label: t("codes.rename"), onSelect: () => setDraft({ mode: "rename", id: c.id, value: c.name }) },
                      { key: "child", label: t("codes.new-child"), onSelect: () => setDraft({ mode: "new", id: c.id, value: "" }) },
                      { key: "delete", label: t("codes.delete"), destructive: true, separatorBefore: true, onSelect: () => setConfirmDelete(c.id) },
                    ]}
                    trigger={(
                      <IconButton size="s" className="codes-more" label={t("codes.actions")} title={t("codes.actions")}>
                        <Icon d="more" />
                      </IconButton>
                    )}
                  />
                </div>
              )}
              {confirmDelete === c.id && (
                <div className="codes-confirm" role="alert">
                  <span>{t("codes.delete-confirm", { name: c.name, n: s.passages })}</span>
                  <span className="annots-spacer" />
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button>
                  <Button variant="danger" size="sm" onClick={() => {
                    setConfirmDelete(null);
                    void post("/codebook", { op: "delete", id: c.id });
                  }}>{t("codes.delete")}</Button>
                </div>
              )}
              {draft?.mode === "new" && draft.id === c.id && draftInput(depth + 1)}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Vue d'un code : mémo, propositions de Claude, passages par article. */
function CodeDetail(p: {
  code: Code;
  codes: Code[];
  lib: Record<string, PdfAnnot[]>;
  onBack: () => void;
  onMemo: (memo: string) => void;
  onChange: (rel: string, a: PdfAnnot, change: { remove?: string[]; keep?: string[]; reject?: string[] }) => void;
  onOpenAnnot: (rel: string, annotId: string) => void;
  onQuote: (text: string) => void;
  copied: boolean;
  onCopied: () => void;
  error: string | null;
}) {
  const { code, codes } = p;
  const family = useMemo(() => codeFamily(codes, code.id), [codes, code.id]);
  const { kept, pending } = useMemo(() => codePassages(p.lib, family), [p.lib, family]);
  const [memo, setMemo] = useState(code.memo ?? "");
  const [memoFor, setMemoFor] = useState(code.id);
  if (memoFor !== code.id) { setMemoFor(code.id); setMemo(code.memo ?? ""); }
  const articles = new Set(kept.map((x) => x.rel)).size;
  const parent = code.path.includes(" › ") ? code.path.slice(0, code.path.lastIndexOf(" › ")) : "";
  const nameOf = (id: string) => codes.find((c) => c.id === id)?.name ?? "";

  const groups: { rel: string; rows: Passage[] }[] = [];
  for (const x of kept) {
    const last = groups[groups.length - 1];
    if (last && last.rel === x.rel) last.rows.push(x);
    else groups.push({ rel: x.rel, rows: [x] });
  }

  function sendAll() {
    const head = t("codes.chat-head", { path: code.path, n: kept.length });
    p.onQuote([head, ...kept.map((x) => annotQuoteText(x.rel, x.a))].join("\n\n"));
  }
  function copyAll() {
    const lines = kept.map(({ rel, a }) => {
      const quote = (a.text ?? "").replace(/\s+/g, " ").trim();
      return `« ${quote} » (${annotCiteRef(rel)}, p. ${a.page})`;
    });
    navigator.clipboard?.writeText([code.path, "", ...lines].join("\n")).then(p.onCopied).catch(() => {});
  }

  const row = (x: Passage, isPending: boolean) => {
    const text = (x.a.text ?? "").replace(/\s+/g, " ").trim();
    const sub = x.ids.filter((id) => id !== code.id).map(nameOf).filter(Boolean);
    return (
      <div key={`${x.rel}:${x.a.id}:${isPending ? "p" : "k"}`} className={`codes-passage${isPending ? " is-pending" : ""}`}>
        <RowButton className="annots-open" title={t("annots.open")} onClick={() => p.onOpenAnnot(x.rel, String(x.a.id))}>
          <span className="annots-quote">
            <span className="annots-oq">«&thinsp;</span>{text || "…"}<span className="annots-oq">&thinsp;»</span>
          </span>
          {x.a.memo && <span className="annots-memo">{x.a.memo}</span>}
        </RowButton>
        <div className="annots-foot">
          <span className="annots-page">
            {isPending ? `${annotCiteRef(x.rel)}, ` : ""}p. {x.a.page}
          </span>
          {sub.map((name) => <span key={name} className="codes-sub">{name}</span>)}
          <span className="annots-spacer" />
          {!isPending && (
            <>
              <IconButton size="s" className="annots-act" label={t("annots.to-chat")} title={t("annots.to-chat")}
                onClick={() => p.onQuote(annotQuoteText(x.rel, x.a))}>
                <Icon d="chat" />
              </IconButton>
              <IconButton size="s" className="annots-act danger" label={t("codes.uncode")} title={t("codes.uncode")}
                onClick={() => p.onChange(x.rel, x.a, { remove: x.ids })}>
                <Icon d="cross" />
              </IconButton>
            </>
          )}
        </div>
        {isPending && (
          <div className="codes-decide">
            <Button variant="ghost" size="xs" onClick={() => p.onChange(x.rel, x.a, { reject: x.ids })}>
              <Icon d="cross" />{t("codes.reject")}
            </Button>
            <Button variant="secondary" size="xs" onClick={() => p.onChange(x.rel, x.a, { keep: x.ids })}>
              <Icon d="check" />{t("codes.keep")}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="codes-detail">
      <div className="codes-detail-head">
        <IconButton size="s" label={t("codes.back")} title={t("codes.back")} onClick={p.onBack}>
          <Icon d="back" />
        </IconButton>
        <div className="codes-detail-title">
          {parent && <span className="codes-detail-parent">{parent} ›</span>}
          <span className="codes-detail-name">{code.name}</span>
        </div>
      </div>
      <div className="annots-list codes-detail-body">
        <div className="codes-detail-meta">
          {t("codes.count-long", { n: kept.length, m: articles })}
        </div>
        <textarea
          className="annots-memo-edit codes-memo"
          aria-label={t("codes.memo")}
          placeholder={t("codes.memo-placeholder")}
          rows={2}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => { if (memo !== (code.memo ?? "")) p.onMemo(memo); }}
        />
        <div className="codes-detail-actions">
          <Button variant="ghost" size="sm" disabled={!kept.length} onClick={sendAll}>
            <Icon d="chat" />{t("codes.send-all")}
          </Button>
          <Button variant="ghost" size="sm" disabled={!kept.length} onClick={copyAll}>
            {p.copied ? <Icon d="check" /> : null}{t("codes.copy-all")}
          </Button>
        </div>
        {p.error && <div className="annots-empty codes-error">{p.error}</div>}
        {pending.length > 0 && (
          <section className="codes-section">
            <div className="codes-section-head">{t("codes.pending-head", { n: pending.length })}</div>
            {pending.map((x) => row(x, true))}
          </section>
        )}
        {!kept.length && !pending.length && <div className="annots-empty">{t("codes.no-passage")}</div>}
        {groups.map((g) => (
          <section key={g.rel} className="codes-section">
            <div className="codes-section-head">
              <span className="codes-section-title" title={g.rel}>{annotCiteRef(g.rel)}</span>
              <span className="annots-art-count">{g.rows.length}</span>
            </div>
            {g.rows.map((x) => row(x, false))}
          </section>
        ))}
      </div>
    </div>
  );
}
