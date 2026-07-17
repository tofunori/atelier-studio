// Surface « Connaissances » (plan 050 P1) : la table de travail de la base —
// même panneau que le popover du composer (KbPickerPanel) en layout large,
// mêmes actions (hook partagé), synchrone par construction via lib/kbSources.
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  kbSourcesSnapshot,
  requestKbSources,
  subscribeKbSources,
  type KbBinding,
} from "../lib/kbSources";
import { KbPickerPanel } from "./chat/KbPicker";
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

  useEffect(() => {
    if (p.visible) requestKbSources();
  }, [p.visible]);

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
      />
    </div>
  );
}
