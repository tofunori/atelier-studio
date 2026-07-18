// Surface « Connaissances » (plan 050 P1/P3) : la table de travail de la
// base — même panneau que le popover du composer (KbPickerPanel) en layout
// large, mêmes actions (hook partagé), synchrone par construction via
// lib/kbSources — plus la section « Pages gbrain » (recherche du corpus NAS,
// épinglage à la carte, re-sync).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import {
  kbSourcesSnapshot,
  requestKbSources,
  subscribeKbSources,
  type KbBinding,
  type KbSource,
} from "../lib/kbSources";
import { KbPickerPanel, type GbrainResult } from "./chat/KbPicker";
import { useKbActions } from "./chat/kbActions";
import { Dialog, DialogContent, DialogTitle } from "./shadcn/dialog";
import { Input } from "./shadcn/input";
import { Button } from "./ui/Button";

type PageDraft = {
  id: string;
  slug: string;
  exists: boolean;
  title: string;
  preview: string;
  writing: boolean;
};

export default function KnowledgeSurface(p: {
  binding: KbBinding | null;
  threadTitle: string;
  visible: boolean;
}) {
  const sources = useSyncExternalStore(subscribeKbSources, kbSourcesSnapshot);
  const noopBinding = useMemo<KbBinding>(
    () => ({ attached: [], fullContent: [], onChange: () => {} }),
    [],
  );
  const binding = p.binding ?? noopBinding;
  const visibleRef = useRef(p.visible);
  visibleRef.current = p.visible;
  const actions = useKbActions(binding, () => visibleRef.current);

  const [gbrainQuery, setGbrainQuery] = useState("");
  const [gbrainResults, setGbrainResults] = useState<GbrainResult[]>([]);
  const [gbrainError, setGbrainError] = useState<string | null>(null);
  const [gbrainSearching, setGbrainSearching] = useState(false);
  const [gbrainSearched, setGbrainSearched] = useState(false);
  // Page directe (P4) : dialogue slug/aperçu ; l'écriture n'a lieu qu'au clic.
  const [pageDraft, setPageDraft] = useState<PageDraft | null>(null);
  const [pageWritten, setPageWritten] = useState<{ slug: string; updated: boolean } | null>(null);
  // destination de la zone d'ajout : « gbrain » enchaîne l'aperçu de page
  // directe après l'épinglage local (URL et notes seulement)
  const [destination, setDestination] = useState<"local" | "gbrain">("local");
  const promoteNextRef = useRef(0);

  useEffect(() => {
    if (p.visible) requestKbSources();
  }, [p.visible]);

  useEffect(() => {
    const onPreview = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { id?: string; slug?: string; exists?: boolean; title?: string; preview?: string }
        | undefined;
      if (!detail?.id || !visibleRef.current) return;
      setPageDraft({
        id: detail.id,
        slug: detail.slug ?? "",
        exists: Boolean(detail.exists),
        title: detail.title ?? "",
        preview: detail.preview ?? "",
        writing: false,
      });
    };
    const onWritten = (e: Event) => {
      const detail = (e as CustomEvent).detail as { slug?: string; updated?: boolean } | undefined;
      setPageDraft(null);
      if (detail?.slug) setPageWritten({ slug: detail.slug, updated: Boolean(detail.updated) });
    };
    window.addEventListener("kb-page-preview", onPreview);
    window.addEventListener("kb-page-written", onWritten);
    return () => {
      window.removeEventListener("kb-page-preview", onPreview);
      window.removeEventListener("kb-page-written", onWritten);
    };
  }, []);

  useEffect(() => {
    if (!pageWritten) return;
    const timer = setTimeout(() => setPageWritten(null), 3500);
    return () => clearTimeout(timer);
  }, [pageWritten]);

  // destination « → gbrain » : après un épinglage réussi initié ici,
  // enchaîner l'aperçu de page directe
  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { ok?: boolean; source?: KbSource }
        | undefined;
      if (!detail?.ok || !detail.source?.id) return;
      if (promoteNextRef.current <= 0) return;
      promoteNextRef.current -= 1;
      wsSend({ type: "kbPromotePage", id: detail.source.id });
    };
    window.addEventListener("kb-source-added", onAdded);
    return () => window.removeEventListener("kb-source-added", onAdded);
  }, []);

  function requestPage(id: string) {
    actions.setError(null);
    wsSend({ type: "kbPromotePage", id });
  }

  function confirmPageWrite() {
    if (!pageDraft || pageDraft.writing) return;
    setPageDraft({ ...pageDraft, writing: true });
    wsSend({ type: "kbPromotePage", id: pageDraft.id, slug: pageDraft.slug.trim(), write: true });
  }

  useEffect(() => {
    const onResults = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { query?: string; results?: GbrainResult[]; error?: string | null }
        | undefined;
      setGbrainSearching(false);
      setGbrainSearched(true);
      setGbrainResults(Array.isArray(detail?.results) ? detail.results : []);
      setGbrainError(detail?.error ?? null);
    };
    window.addEventListener("kb-gbrain-results", onResults);
    return () => window.removeEventListener("kb-gbrain-results", onResults);
  }, []);

  function searchGbrain() {
    const query = gbrainQuery.trim();
    if (!query) return;
    setGbrainSearching(true);
    setGbrainError(null);
    if (!wsSend({ type: "gbrainSearch", query, limit: 12 })) {
      setGbrainSearching(false);
      setGbrainError(t("kb.error-generic"));
    }
  }

  return (
    <div className="ksurface">
      <KbPickerPanel
        layout="surface"
        threadTitle={p.threadTitle}
        sources={sources}
        attached={binding.attached}
        fullContent={binding.fullContent}
        error={actions.error}
        promoted={actions.promoted}
        onToggle={actions.toggle}
        onToggleFull={actions.toggleFull}
        onRemoveSource={actions.removeSource}
        onPromote={actions.promote}
        onAddFiles={() => { void actions.addFiles(); }}
        onAddFolder={() => { void actions.addFolder(); }}
        onAddUrl={(url) => {
          if (destination === "gbrain") promoteNextRef.current += 1;
          actions.addUrl(url);
        }}
        onAddNote={(title, text) => {
          if (destination === "gbrain") promoteNextRef.current += 1;
          actions.addNote(title, text);
        }}
        onResync={actions.addGbrain}
        onPromotePage={requestPage}
        destination={{ value: destination, onChange: setDestination }}
        gbrain={{
          query: gbrainQuery,
          results: gbrainResults,
          error: gbrainError,
          searching: gbrainSearching,
          searched: gbrainSearched,
          onQueryChange: setGbrainQuery,
          onSearch: searchGbrain,
          onPin: actions.addGbrain,
        }}
      />
      {pageWritten && (
        <div className="kb-page-toast">
          {t(pageWritten.updated ? "kb.page-updated" : "kb.page-written", { slug: pageWritten.slug })}
        </div>
      )}
      <Dialog open={pageDraft !== null} onOpenChange={(open) => { if (!open) setPageDraft(null); }}>
        {pageDraft && (
          <DialogContent className="kb-page-dialog" aria-label={t("kb.page-direct")}>
            <DialogTitle className="kb-page-title">{t("kb.page-direct")}</DialogTitle>
            <div className="kb-page-source">{pageDraft.title}</div>
            <label className="kb-page-slug-label" htmlFor="kb-page-slug">{t("kb.page-slug")}</label>
            <Input
              id="kb-page-slug"
              value={pageDraft.slug}
              onChange={(e) => setPageDraft({ ...pageDraft, slug: e.target.value })}
            />
            {pageDraft.exists && <div className="kb-error">{t("kb.page-exists")}</div>}
            {actions.error && <div className="kb-error">{actions.error}</div>}
            <pre className="kb-page-preview">{pageDraft.preview}</pre>
            <div className="kb-note-actions">
              <Button type="button" variant="ghost" className="ghost" onClick={() => setPageDraft(null)}>
                {t("action.cancel")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="ghost kb-page-confirm"
                disabled={pageDraft.writing || !pageDraft.slug.trim()}
                onClick={confirmPageWrite}
              >
                {pageDraft.writing
                  ? t("kb.page-writing")
                  : t(pageDraft.exists ? "kb.page-update" : "kb.page-write")}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
