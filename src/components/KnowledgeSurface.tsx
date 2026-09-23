import RagdocWorkspace from "./RagdocWorkspace";
// Surface « Connaissances » (plan 050 P1/P3) : la table de travail de la
// base — même panneau que le popover du composer (KbPickerPanel) en layout
// large, mêmes actions (hook partagé), synchrone par construction via
// lib/kbSources — plus la section « Documents Ragdoc » (recherche du corpus NAS,
// épinglage à la carte, re-sync).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { consumeRagdocPromotion } from "../lib/ragdocPromotion";
import { openArticleDialog } from "../lib/articleImports";
import { t } from "../lib/i18n";
import { wsSend, wsReady } from "../lib/wsBus";
import {
  kbArchivedSnapshot,
  kbCollectionsSnapshot,
  kbSourcesSnapshot,
  kbSourcesLoaded,
  requestKbSources,
  subscribeKbSources,
  type KbBinding,
  type KbSource,
} from "../lib/kbSources";
import { type ArticleRow, type GbrainResult } from "./chat/KbPicker";
import KbSurface from "./chat/KbSurface";
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
  paneControls?: ReactNode;
  galleryUrl?: string;
}) {
  const sources = useSyncExternalStore(subscribeKbSources, kbSourcesSnapshot);
  const sourcesLoaded = useSyncExternalStore(subscribeKbSources, kbSourcesLoaded);
  const [sourcesStatus, setSourcesStatus] = useState<string | null>("Chargement des sources…");
  const [corpusStatus, setCorpusStatus] = useState<string | null>("Chargement des articles…");
  const archived = useSyncExternalStore(subscribeKbSources, kbArchivedSnapshot);
  // Les dossiers existaient dans le registre depuis le plan 051 ; la surface
  // ne les recevait simplement pas — c'est ce qui les rendait invisibles.
  const collections = useSyncExternalStore(subscribeKbSources, kbCollectionsSnapshot);
  const noopBinding = useMemo<KbBinding>(
    () => ({ attached: [], fullContent: [], onChange: () => {} }),
    [],
  );
  const binding = p.binding ?? noopBinding;
  const visibleRef = useRef(p.visible);
  visibleRef.current = p.visible;
  // plan 052 C : la chip-collection active absorbe les nouveaux épinglages
  const activeCollRef = useRef<string | null>(null);
  const actions = useKbActions(binding, () => visibleRef.current, {
    activeCollection: () => activeCollRef.current,
  });

  // Articles du corpus (plan 053) : rafraîchis à l'ouverture de la surface et
  // après chaque écriture — en mode automatique, rien d'autre ne les annonce.
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const searchQueryRef = useRef("");
  const [gbrainQuery, setGbrainQuery] = useState("");
  const [gbrainResults, setGbrainResults] = useState<GbrainResult[]>([]);
  const [gbrainError, setGbrainError] = useState<string | null>(null);
  const [gbrainSearching, setGbrainSearching] = useState(false);
  const [gbrainSearched, setGbrainSearched] = useState(false);
  // Page directe (P4) : dialogue slug/aperçu ; l'écriture n'a lieu qu'au clic.
  const [pageDraft, setPageDraft] = useState<PageDraft | null>(null);
  const [pageWritten, setPageWritten] = useState<{ slug: string; updated: boolean; extra?: string } | null>(null);
  const promoteNextRef = useRef(0);
  // Import d'article (plan 053) : le dialogue est monté globalement
  // (AppOverlays) et l'état de conversion vit dans lib/articleImports — fermer
  // la surface pendant une conversion ne l'interrompt pas.

  useEffect(() => {
    if (!p.visible) return;
    let sent = false;
    const request = () => {
      if (sent) return;
      if (!wsReady()) {setCorpusStatus("Articles indisponibles — reconnexion en cours."); setSourcesStatus("Sources indisponibles — reconnexion en cours."); return;}
      setSourcesStatus("Chargement des sources…");
      requestKbSources();
      sent = wsSend({type: "articleList", limit: 100, offset: 0});
      setCorpusStatus(sent ? "Chargement des articles…" : "Connexion indisponible.");
    };
    request();
    const retry = setInterval(request, 2000);
    const timeout = setTimeout(() => {clearInterval(retry); setSourcesStatus("Les sources ne répondent pas. Rouvre ce volet pour réessayer."); setCorpusStatus(value => value ? "Les articles ne répondent pas. Rouvre ce volet pour réessayer." : null);}, 15000);
    return () => {clearInterval(retry); clearTimeout(timeout);};
  }, [p.visible]);

  useEffect(() => {
    const onListed = (e: Event) => {
      const detail = (e as CustomEvent).detail as { articles?: ArticleRow[]; error?: string; offset?: number; nextOffset?: number | null; total?: number } | undefined;
      setCorpusStatus(detail?.error || (detail?.nextOffset != null ? `Chargement de la bibliothèque… ${detail.nextOffset}/${detail.total ?? "…"}` : null));
      const incoming = Array.isArray(detail?.articles) ? detail.articles : [];
      setArticles(previous => detail?.offset ? [...previous, ...incoming.filter(item => !previous.some(old => old.slug === item.slug))] : incoming);
      if (!detail?.error && detail?.nextOffset != null) wsSend({type:"articleList", limit:100, offset:detail.nextOffset});
    };
    const onWritten = () => {
      if (visibleRef.current) wsSend({ type: "articleList", limit: 100 });
    };
    window.addEventListener("article-listed", onListed);
    window.addEventListener("article-written", onWritten);
    return () => {
      window.removeEventListener("article-listed", onListed);
      window.removeEventListener("article-written", onWritten);
    };
  }, []);

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

  // destination « → Ragdoc » : après un épinglage réussi initié ici,
  // enchaîner l'aperçu de page directe
  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { ok?: boolean; source?: KbSource }
        | undefined;
      if (!detail?.ok || !detail.source?.id) return;
      if (promoteNextRef.current <= 0) return;
      promoteNextRef.current -= 1;
      wsSend({ type: "kbRagdocPromote", id: detail.source.id });
    };
    window.addEventListener("kb-source-added", onAdded);
    return () => window.removeEventListener("kb-source-added", onAdded);
  }, []);

  useEffect(() => {
    if (actions.error) setPageDraft(draft => draft ? {...draft, writing:false} : null);
  }, [actions.error]);

  useEffect(() => {
    const showPending = () => {
      if (!visibleRef.current) return;
      const id = consumeRagdocPromotion();
      if (id) wsSend({type:"kbRagdocPromote",id});
    };
    if (p.visible) showPending();
    window.addEventListener("kb-request-ragdoc-promotion", showPending);
    return () => window.removeEventListener("kb-request-ragdoc-promotion", showPending);
  }, [p.visible]);

  function requestPage(id: string) {
    actions.setError(null);
    wsSend({ type: "kbRagdocPromote", id });
  }

  function confirmPageWrite() {
    if (!pageDraft || pageDraft.writing) return;
    setPageDraft({ ...pageDraft, writing: true });
    wsSend({ type: "kbRagdocPromote", id: pageDraft.id, slug: pageDraft.slug.trim(), write: true });
  }

  useEffect(() => {
    const onResults = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { query?: string; results?: GbrainResult[]; error?: string | null }
        | undefined;
      if (detail?.query !== searchQueryRef.current) return;
      setGbrainSearching(false);
      setGbrainSearched(true);
      setGbrainResults(Array.isArray(detail?.results) ? detail.results : []);
      setGbrainError(detail?.error ?? null);
    };
    window.addEventListener("kb-ragdoc-results", onResults);
    return () => window.removeEventListener("kb-ragdoc-results", onResults);
  }, []);

  function searchGbrain(submitted?: string) {
    const query = (submitted ?? gbrainQuery).trim();
    if (!query) return;
    searchQueryRef.current = query;
    setGbrainSearching(true);
    setGbrainError(null);
    if (!wsSend({ type: "ragdocSearch", query, limit: 12 })) {
      setGbrainSearching(false);
      setGbrainError(t("kb.error-generic"));
    }
  }

  return (
    <div className="ksurface">
      <KbSurface
        threadTitle={p.threadTitle}
        sources={sources}
        attached={binding.attached}
        fullContent={binding.fullContent}
        articles={articles}
        corpusStatus={corpusStatus}
        ragdocWorkspace={<RagdocWorkspace articles={articles} corpusStatus={corpusStatus} galleryUrl={p.galleryUrl}
          onRead={slug=>window.dispatchEvent(new CustomEvent("kb-open-ragdoc-passage",{detail:{slug}}))}
          search={{query:gbrainQuery,results:gbrainResults,error:gbrainError,searching:gbrainSearching,searched:gbrainSearched,onQueryChange:setGbrainQuery,onSearch:searchGbrain,onPin:actions.addRagdoc}} />}

        sourcesStatus={!sourcesLoaded ? sourcesStatus : null}
        error={actions.error}
        onDismissError={() => actions.setError(null)}
        onToggle={actions.toggle}
        onToggleFull={actions.toggleFull}
        onRemoveSources={actions.removeMany}
        onPromote={requestPage}
        onPromotePage={requestPage}
        onResync={actions.addRagdoc}
        onArchive={(ids, off) => (off
          ? ids.forEach((id) => actions.archiveSource(id, true))
          : actions.archiveMany(ids))}
        archived={archived}
        collections={collections}
        onCreateCollection={actions.createCollection}
        onTag={(ids, slug, off) => (off
          ? ids.forEach((id) => actions.tagSource(id, slug, true))
          : actions.tagMany(ids, slug))}
        onAddFiles={() => { void actions.addFiles(); }}
        onAddFolder={() => { void actions.addFolder(); }}
        onAddNote={(title, text) => actions.addNote(title, text)}
        onAddUrl={(url) => actions.addUrl(url)}
        onBatchAttach={actions.attachMany}
        onAddArticle={() => { actions.setError(null); openArticleDialog(); }}
        gbrain={{
          query: gbrainQuery,
          results: gbrainResults,
          error: gbrainError,
          searching: gbrainSearching,
          searched: gbrainSearched,
          onQueryChange: setGbrainQuery,
          onSearch: searchGbrain,
          onPin: actions.addRagdoc,
        }}
        headerEnd={p.paneControls}
      />
      {pageWritten && (
        <div className="kb-page-toast">
          {t(pageWritten.updated ? "kb.page-updated" : "kb.page-written", { slug: pageWritten.slug })}
          {pageWritten.extra}
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
              readOnly
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
