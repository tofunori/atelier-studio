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
} from "../lib/kbSources";
import { KbPickerPanel, type GbrainResult } from "./chat/KbPicker";
import { useKbActions } from "./chat/kbActions";

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

  useEffect(() => {
    if (p.visible) requestKbSources();
  }, [p.visible]);

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
        onAddUrl={actions.addUrl}
        onAddNote={actions.addNote}
        onResync={actions.addGbrain}
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
    </div>
  );
}
