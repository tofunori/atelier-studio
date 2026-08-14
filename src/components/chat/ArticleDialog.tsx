// Import d'article (plan 053) : PDF → conversion MinerU → fiche vérifiable →
// page gbrain. Le dialogue est monté GLOBALEMENT (AppOverlays) et ne détient
// pas les imports : ils vivent dans lib/articleImports, en PLURIEL. On peut
// donc en déposer un pendant qu'un autre convertit, et un échec ne bloque
// jamais le suivant.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { t } from "../../lib/i18n";
import { wsSend } from "../../lib/wsBus";
import {
  articleImportSnapshot, backgroundArticleDialog, closeArticleDialog,
  dismissArticleImport, fileName, focusedJob, openArticleDialog,
  startArticleImport, subscribeArticleImport,
  type ArticleDuplicate, type ArticleJob,
} from "../../lib/articleImports";
import { showError, showSuccess } from "../ui/toast";
import { Dialog, DialogContent, DialogTitle } from "../shadcn/dialog";
import { Input } from "../shadcn/input";
import { Button } from "../ui/Button";
import { RowButton } from "../ui/RowButton";

export type ArticleMeta = {
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
};

export type ArticleWritten = {
  slug?: string;
  updated?: boolean;
  ragdoc?: { ok?: boolean; message?: string } | null;
};

const EMPTY_META: ArticleMeta = { title: "", authors: "", year: "", journal: "", doi: "" };

// Le corps converti est plus parlant que le front-matter (déjà à l'écran sous
// forme de champs) : on retire l'en-tête YAML de l'aperçu.
export function stripFrontMatter(preview: string) {
  const text = String(preview ?? "");
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? text : text.slice(end + 5).replace(/^\n+/, "");
}

export function duplicateReason(why?: string) {
  return t(why === "doi" ? "article.dup-doi" : "article.dup-title");
}

function JobIcon({ phase }: { phase: ArticleJob["phase"] }) {
  if (phase === "converting") {
    return (
      <svg className="kb-article-spin" viewBox="0 0 24 24" width="12" height="12" fill="none"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
    );
  }
  if (phase === "error") {
    return (
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

export default function ArticleDialog() {
  const shared = useSyncExternalStore(subscribeArticleImport, articleImportSnapshot);
  const [meta, setMeta] = useState<ArticleMeta>(EMPTY_META);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [ragdoc, setRagdoc] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const writeRef = useRef("");
  const writtenJobRef = useRef("");
  const loadedRef = useRef("");

  const job = focusedJob(shared);
  const imported = job?.imported ?? null;
  const converting = shared.jobs.filter((entry) => entry.phase === "converting");
  const duplicates: ArticleDuplicate[] = useMemo(
    () => (Array.isArray(imported?.duplicates) ? imported.duplicates : []),
    [imported],
  );
  const body = useMemo(() => stripFrontMatter(String(imported?.preview ?? "")), [imported]);
  const exists = imported?.exists === true;
  const converter = String(imported?.converter ?? "");
  const showReview = job?.phase === "ready" && Boolean(imported);

  // La fiche se charge une fois par import : les corrections de Thierry ne
  // doivent pas être écrasées par un re-rendu, ni fuiter d'une fiche à l'autre.
  useEffect(() => {
    if (!showReview || !imported || !job || loadedRef.current === job.requestId) return;
    loadedRef.current = job.requestId;
    setMeta({
      title: String(imported.meta?.title ?? ""),
      authors: String(imported.meta?.authors ?? ""),
      year: imported.meta?.year ? String(imported.meta.year) : "",
      journal: String(imported.meta?.journal ?? ""),
      doi: String(imported.meta?.doi ?? ""),
    });
    setSlug(String(imported.slug ?? ""));
    setSlugTouched(false);
    setRagdoc(false);
    setWriting(false);
    setError(null);
  }, [showReview, imported, job]);

  // Compteur réel (le backend ne sait pas où en est la conversion cloud) —
  // recalculé depuis startedAt pour survivre à une fermeture du dialogue.
  useEffect(() => {
    if (!shared.open || converting.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [shared.open, converting.length]);

  useEffect(() => {
    const onWritten = (e: Event) => {
      const detail = (e as CustomEvent).detail as (ArticleWritten & { requestId?: string | null }) | undefined;
      if (!detail || !writeRef.current || detail.requestId !== writeRef.current) return;
      writeRef.current = "";
      setWriting(false);
      const rag = detail.ragdoc;
      void showSuccess(
        t(detail.updated ? "kb.page-updated" : "kb.page-written", { slug: detail.slug ?? "" })
        + (rag ? (rag.ok ? t("article.ragdoc-ok") : t("article.ragdoc-failed", { message: rag.message ?? "" })) : ""),
      );
      if (writtenJobRef.current) dismissArticleImport(writtenJobRef.current);
      writtenJobRef.current = "";
    };
    const onError = (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId?: string | null; message?: string } | undefined;
      if (!detail || !writeRef.current || detail.requestId !== writeRef.current) return;
      writeRef.current = "";
      setWriting(false);
      setError(detail.message ?? t("kb.error-generic"));
    };
    window.addEventListener("article-written", onWritten);
    window.addEventListener("article-error", onError);
    return () => {
      window.removeEventListener("article-written", onWritten);
      window.removeEventListener("article-error", onError);
    };
  }, []);

  async function pick() {
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!picked) return;
    for (const path of Array.isArray(picked) ? picked : [picked]) startArticleImport(String(path));
  }

  function write() {
    if (!job) return;
    const requestId = `artw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    writeRef.current = requestId;
    writtenJobRef.current = job.requestId;
    setError(null);
    setWriting(true);
    const sent = wsSend({
      type: "articleWrite",
      requestId,
      draftId: imported?.draftId ?? "",
      slug: slug.trim(),
      path: job.path,
      converter,
      ragdoc,
      meta: { ...meta, year: meta.year.trim() ? Number(meta.year) : null },
    });
    if (!sent) {
      writeRef.current = "";
      writtenJobRef.current = "";
      setWriting(false);
      setError(t("kb.error-generic"));
    }
  }

  function pinOnly() {
    if (!job) return;
    if (!wsSend({ type: "kbAdd", kind: "pdf", origin: job.path })) {
      void showError(t("kb.error-generic"));
      return;
    }
    dismissArticleImport(job.requestId);
  }

  function retry() {
    if (!job) return;
    const { path } = job;
    dismissArticleImport(job.requestId);
    startArticleImport(path);
  }

  const elapsed = (entry: ArticleJob) => Math.max(0, Math.round((now - entry.startedAt) / 1000));
  const message = error ?? (job?.phase === "error" ? job.message : null);

  const field = (key: keyof ArticleMeta, label: string, wide = false) => (
    <div className={`kb-article-field${wide ? " wide" : ""}`}>
      <label className="kb-article-label" htmlFor={`kb-article-${key}`}>{label}</label>
      <Input
        id={`kb-article-${key}`}
        value={meta[key]}
        onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
      />
    </div>
  );

  const addMore = (
    <Button type="button" variant="ghost" className="ghost kb-article-more" onClick={() => { void pick(); }}>
      {t("article.add-more")}
    </Button>
  );

  return (
    <Dialog open={shared.open} onOpenChange={(open) => { if (!open) backgroundArticleDialog(); }}>
      <DialogContent className="kb-article-dialog" aria-label={t("article.title")}>
        <DialogTitle className="kb-page-title">
          {showReview ? t("article.converted") : t("article.title")}
        </DialogTitle>

        {/* Barre des imports : chacun reste atteignable, quel que soit son sort */}
        {shared.jobs.length > 1 && (
          <div className="kb-article-jobs" role="tablist" aria-label={t("article.jobs-label")}>
            {shared.jobs.map((entry) => (
              <RowButton
                key={entry.requestId}
                role="tab"
                aria-selected={entry.requestId === job?.requestId}
                className={`kb-article-job ${entry.phase}${entry.requestId === job?.requestId ? " on" : ""}`}
                title={entry.path}
                onClick={() => openArticleDialog(entry.requestId)}
              >
                <JobIcon phase={entry.phase} />
                <span className="kb-article-job-name">{fileName(entry.path)}</span>
                {entry.phase === "converting" && (
                  <span className="kb-article-job-time">{elapsed(entry)} s</span>
                )}
              </RowButton>
            ))}
          </div>
        )}

        {!job && (
          <>
            <div className="kb-article-drop">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 15V4" /><path d="M8 8l4-4 4 4" />
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
              <Button type="button" variant="ghost" className="ghost" onClick={() => { void pick(); }}>
                {t("article.pick")}
              </Button>
              <div className="kb-article-hint">{t("article.pick-hint")}</div>
            </div>
            <div className="kb-note-actions">
              <Button type="button" variant="ghost" className="ghost" onClick={closeArticleDialog}>
                {t("action.cancel")}
              </Button>
            </div>
          </>
        )}

        {job?.phase === "converting" && (
          <>
            <div className="kb-page-source">{fileName(job.path)}</div>
            <div className="kb-article-progress"><i /></div>
            <div className="kb-article-hint">{t("article.converting", { s: elapsed(job) })}</div>
            <div className="kb-article-hint">{t("article.background-hint")}</div>
            <div className="kb-note-actions">
              <Button
                type="button" variant="ghost" className="ghost"
                onClick={() => dismissArticleImport(job.requestId)}
              >
                {t("article.abandon")}
              </Button>
              {addMore}
              <Button type="button" variant="ghost" className="ghost kb-page-confirm" onClick={backgroundArticleDialog}>
                {t("article.background")}
              </Button>
            </div>
          </>
        )}

        {job?.phase === "error" && (
          <>
            <div className="kb-page-source">{fileName(job.path)}</div>
            {message && <div className="kb-error">{message}</div>}
            <div className="kb-note-actions">
              <Button
                type="button" variant="ghost" className="ghost"
                onClick={() => dismissArticleImport(job.requestId)}
              >
                {t("article.dismiss")}
              </Button>
              {addMore}
              <Button type="button" variant="ghost" className="ghost kb-page-confirm" onClick={retry}>
                {t("article.retry")}
              </Button>
            </div>
          </>
        )}

        {showReview && job && (
          <>
            <div className="kb-page-source">
              {t("article.source", { file: fileName(job.path), n: Number(imported?.chars ?? 0) })}
            </div>
            <div className="kb-article-grid">
              {field("title", t("article.meta-title"), true)}
              {field("authors", t("article.meta-authors"))}
              {field("year", t("article.meta-year"))}
              {field("journal", t("article.meta-journal"))}
              {field("doi", t("article.meta-doi"))}
              <div className="kb-article-field wide">
                <label className="kb-article-label" htmlFor="kb-article-slug">{t("article.slug")}</label>
                <Input
                  id="kb-article-slug"
                  className="kb-article-slug"
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                />
              </div>
            </div>

            {duplicates.length > 0 && (
              <div className="kb-article-dups">
                <div className="kb-article-warn">{t("article.dup-title-head", { n: duplicates.length })}</div>
                {duplicates.map((dup) => (
                  <div className="kb-article-dup" key={dup.slug}>
                    <span className="kb-article-dup-slug">{dup.slug}</span>
                    <span className="kb-article-hint">{duplicateReason(dup.why)}</span>
                    <RowButton
                      className="kb-article-dup-use"
                      title={t("article.dup-use-title", { slug: dup.slug })}
                      onClick={() => { setSlug(dup.slug); setSlugTouched(true); }}
                    >
                      {t("article.dup-use")}
                    </RowButton>
                  </div>
                ))}
              </div>
            )}

            {exists && !slugTouched && <div className="kb-article-warn">{t("article.exists")}</div>}
            {imported?.warning && <div className="kb-article-warn">{imported.warning}</div>}
            {converter === "local" && !imported?.warning && (
              <div className="kb-article-warn">{t("article.converter-local")}</div>
            )}
            {message && <div className="kb-error">{message}</div>}

            <div className="kb-article-label">{t("article.preview")}</div>
            <pre className="kb-page-preview">{body}</pre>

            <RowButton
              className={`kb-article-check${ragdoc ? " on" : ""}`}
              role="checkbox"
              aria-checked={ragdoc}
              onClick={() => setRagdoc((v) => !v)}
            >
              <span className="kb-article-box" aria-hidden="true" />
              {t("article.ragdoc")}
              <span className="kb-article-hint">{t("article.ragdoc-hint")}</span>
            </RowButton>

            <div className="kb-note-actions">
              <Button
                type="button" variant="ghost" className="ghost"
                onClick={() => dismissArticleImport(job.requestId)}
              >
                {t("article.dismiss")}
              </Button>
              {addMore}
              <Button
                type="button"
                variant="ghost"
                className="ghost"
                disabled={writing}
                onClick={pinOnly}
              >
                {t("article.pin-only")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="ghost kb-page-confirm"
                disabled={writing || !slug.trim() || !imported?.draftId}
                onClick={write}
              >
                {writing
                  ? t("kb.page-writing")
                  : t(exists && !slugTouched ? "article.replace" : "article.write")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
