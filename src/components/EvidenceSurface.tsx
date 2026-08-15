// Surface Preuves (plan Preuves, tâche 7) — panneau par projet où vivent les
// passages épinglés (tâches 5+6, PassageCard), groupés par phrase de
// manuscrit appuyée (`pin.supports.text`) : un groupe par phrase distincte,
// trié par ajout desc (groupe touché le plus récemment en premier) ; les
// épingles sans ancrage (`supports` absent) forment toujours le DERNIER
// groupe, « Sans ancrage ». Chaque rangée reprend le contrat de PassageCard :
// clic → ouvre la source (PDF Zotero à la page citée, ou lecteur gbrain
// défilé/surligné) ; icône → retire l'épingle (unpinPassage) ; bouton →
// copie une citation prête à coller (\autocite{key} pour Zotero, citation
// brute pour gbrain).
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import {
  evidencePinsSnapshot,
  requestEvidencePins,
  subscribeEvidencePins,
  type EvidencePin,
} from "../lib/evidencePins";
import { openGbrainPassage, openZoteroPassage } from "./chat/md";
import { Button, EmptyState, IconButton, RowButton, SurfaceHeader } from "./ui";
import { showSuccess } from "./ui/toast";

type EvidenceGroup = { key: string | null; pins: EvidencePin[] };

/** Groupe les épingles par phrase appuyée (`supports.text`, `null` = « Sans
 * ancrage ») puis trie : groupes ancrés d'abord (ajout le plus récent — max
 * `ts` du groupe — en tête), « Sans ancrage » toujours en dernier quel que
 * soit son ancienneté. Rangées internes également triées par ajout desc. */
function groupPins(pins: EvidencePin[]): EvidenceGroup[] {
  const byKey = new Map<string | null, EvidencePin[]>();
  for (const pin of pins) {
    const key = pin.supports?.text ?? null;
    const list = byKey.get(key);
    if (list) list.push(pin);
    else byKey.set(key, [pin]);
  }
  const groups: EvidenceGroup[] = [...byKey.entries()].map(([key, groupPins]) => ({
    key,
    pins: [...groupPins].sort((a, b) => b.ts - a.ts),
  }));
  groups.sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return b.pins[0].ts - a.pins[0].ts;
  });
  return groups;
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.6 2.6h2.8l-.4 4.2 2.4 2.4H4.6l2.4-2.4z" />
      <path d="M8 9.2v4.2" />
    </svg>
  );
}

function openPin(pin: EvidencePin) {
  if (pin.source === "gbrain") {
    if (!pin.gbrainSlug) return;
    openGbrainPassage({ kind: "gbrain", slug: pin.gbrainSlug, quote: pin.quote });
    return;
  }
  openZoteroPassage({
    kind: "zotero",
    key: pin.zoteroKey,
    pdfKey: pin.pdfKey,
    pdfFile: pin.pdfFile,
    page: pin.page,
    quote: pin.quote,
  });
}

function copyCitation(pin: EvidencePin) {
  const text = pin.source === "zotero" ? `\\autocite{${pin.zoteroKey}}` : pin.quote;
  void navigator.clipboard.writeText(text).then(() => {
    void showSuccess(t("action.copied"));
  });
}

function EvidenceRow({ pin, onUnpin }: { pin: EvidencePin; onUnpin: (pin: EvidencePin) => void }) {
  const isGbrain = pin.source === "gbrain";
  const meta = isGbrain ? pin.citeLabel : `${pin.citeLabel} · p. ${pin.page}`;
  return (
    <div className="evidence-row">
      <RowButton className="evidence-row-main" onClick={() => openPin(pin)}>
        <span className="evidence-row-quote">{pin.quote}</span>
        <span className="evidence-row-meta">{meta}</span>
      </RowButton>
      <Button
        variant="ghost"
        size="sm"
        className="evidence-copy"
        onClick={() => copyCitation(pin)}
      >
        {t(isGbrain ? "preuves.copy-quote" : "preuves.copy-cite")}
      </Button>
      <IconButton
        className="evidence-unpin"
        label={t("passage.unpin")}
        onClick={() => onUnpin(pin)}
      >
        <PinIcon />
      </IconButton>
    </div>
  );
}

export default function EvidenceSurface({ projectRoot }: { projectRoot: string | null }) {
  const store = useSyncExternalStore(subscribeEvidencePins, evidencePinsSnapshot);
  const groups = useMemo(() => groupPins(store.pins), [store.pins]);

  // Redemande à l'ouverture de la surface — défensif : App.tsx redemande déjà
  // au changement de projet actif (tâche 7), mais la surface peut monter sur
  // un projet déjà actif (WS pas encore prêt à ce moment-là, ou navigation
  // directe vers Preuves) sans qu'aucun changement de dépendance ne se
  // reproduise ailleurs.
  useEffect(() => {
    if (projectRoot) requestEvidencePins(projectRoot);
  }, [projectRoot]);

  function unpin(pin: EvidencePin) {
    if (!projectRoot) return;
    wsSend({ type: "unpinPassage", projectRoot, pinId: pin.id });
  }

  return (
    <div className="evidence-surface">
      <SurfaceHeader title={t("atelier.preuves")} />
      <div className="evidence-body">
        {groups.length === 0 && <EmptyState title={t("preuves.empty")} />}
        {groups.map((group) => (
          <div key={group.key ?? "sans-ancrage"} className="evidence-group" data-testid="evidence-group">
            <div className="evidence-group-title">
              <span className="evidence-group-quote">{group.key ?? t("preuves.sans-ancrage")}</span>
              {group.key !== null && group.pins[0].supports && (
                <span className="evidence-group-loc">
                  {group.pins[0].supports.file} · {group.pins[0].supports.lines}
                </span>
              )}
            </div>
            {group.pins.map((pin) => (
              <EvidenceRow key={pin.id} pin={pin} onUnpin={unpin} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
