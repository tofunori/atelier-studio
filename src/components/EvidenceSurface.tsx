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
//
// Une épingle gbrain/Ragdoc dont l'intégration n'est pas configurée (Réglages →
// Intégrations) reste lisible et copiable, mais ne s'ouvre plus : l'ouvrir
// demanderait la page à un serveur qu'Atelier ne connaît pas.
import { useMemo, useSyncExternalStore } from "react";
import { t } from "../lib/i18n";
import { useIntegrations, type IntegrationsEffective } from "../lib/integrations";
import { wsSend } from "../lib/wsBus";
import { evidencePinsSnapshot, subscribeEvidencePins, type EvidencePin } from "../lib/evidencePins";
import { openGbrainPassage, openRagdocPassage, openZoteroPassage } from "./chat/md";
import { CopyIcon } from "./icons";
import { EmptyState, IconButton, RowButton, SurfaceHeader } from "./ui";
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
  if (pin.source === "ragdoc") {
    if (pin.gbrainSlug) openRagdocPassage({kind:"ragdoc",slug:pin.gbrainSlug,quote:pin.quote,...(pin.page > 0 ? {page:pin.page} : {})});
    return;
  }
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
    section: "",
  });
}

function copyCitation(pin: EvidencePin) {
  const text = pin.source === "zotero" ? `\\autocite{${pin.zoteroKey}}` : pin.quote;
  void navigator.clipboard.writeText(text).then(() => {
    void showSuccess(t("action.copied"));
  });
}

/** Raison pour laquelle une épingle ne peut pas s'ouvrir, sinon null. */
function pinUnavailable(pin: EvidencePin, integrations: IntegrationsEffective): string | null {
  if (pin.source === "ragdoc" && !integrations.ragdoc) return t("kb.ragdoc-off");
  if (pin.source === "gbrain" && integrations.gbrain === null) return t("kb.gbrain-off");
  return null;
}

function EvidenceRow({ pin, onUnpin, unavailable }: {
  pin: EvidencePin;
  onUnpin: (pin: EvidencePin) => void;
  unavailable: string | null;
}) {
  const isGbrain = pin.source !== "zotero";
  const hasQuote = Boolean(pin.quote.trim());
  return (
    <div className="evidence-row">
      <RowButton
        className="evidence-row-main"
        disabled={Boolean(unavailable)}
        title={unavailable ?? undefined}
        onClick={() => openPin(pin)}
      >
        <span className={hasQuote ? "evidence-row-quote" : "evidence-row-quote is-absent"}>
          {hasQuote ? pin.quote : t("preuves.open-source", { source: pin.citeLabel })}
        </span>
        <span className="evidence-row-meta">
          <span
            className={isGbrain ? "evidence-meta-kind is-gbrain" : "evidence-meta-kind"}
            aria-hidden="true"
          />
          <span className="evidence-meta-src">{pin.citeLabel}</span>
          {pin.source !== "gbrain" && pin.page > 0 && <span className="evidence-meta-page">p. {pin.page}</span>}
        </span>
      </RowButton>
      <span className="evidence-actions">
        <IconButton
          className="evidence-copy"
          label={t(isGbrain ? "preuves.copy-quote" : "preuves.copy-cite")}
          onClick={() => copyCitation(pin)}
        >
          <CopyIcon size={12} />
        </IconButton>
        <IconButton
          className="evidence-unpin"
          label={t("passage.unpin")}
          onClick={() => onUnpin(pin)}
        >
          <PinIcon />
        </IconButton>
      </span>
    </div>
  );
}

export default function EvidenceSurface({ projectRoot }: { projectRoot: string | null }) {
  const store = useSyncExternalStore(subscribeEvidencePins, evidencePinsSnapshot);
  const integrations = useIntegrations().effective;
  const groups = useMemo(() => groupPins(store.pins), [store.pins]);

  // Pas de requestEvidencePins ici (fix revue T7) : AtelierPane est monté
  // avec `key={activeProject}` — un changement de projet le remonte EN
  // ENTIER, donc un effet de montage ici tirerait un `listPins` en plus de
  // celui déjà déclenché par App.tsx sur ce même changement (double-fetch
  // constaté en revue). Seul App.tsx (câblage sur activeProject/wsReady)
  // redemande les épingles ; ce composant ne fait que lire le store déjà
  // tenu à jour par le flux `evidencePins` (push WS) + ce câblage.
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
              {group.key !== null && group.pins[0].supports
                && (group.pins[0].supports.file || group.pins[0].supports.lines) && (
                <span className="evidence-group-loc">
                  {[group.pins[0].supports.file, group.pins[0].supports.lines].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
            {group.pins.map((pin) => (
              <EvidenceRow key={pin.id} pin={pin} onUnpin={unpin} unavailable={pinUnavailable(pin, integrations)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
