import { useState } from "react";
import { t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";
import { nomDeProjet } from "../../lib/memoire";
import { Button } from "../ui";

type ProposalEvent = Extract<AgentEvent, { kind: "memory_proposal" }>;
type Decision = "kept" | "dismissed";

/** Décision par carte, propre à cet appareil : le souvenir gardé vit, lui,
 *  dans la mémoire du backend. */
const DECISIONS_KEY = "atelier-studio.memoryProposals";

function lireDecision(id: string): Decision | null {
  try {
    const store = JSON.parse(localStorage.getItem(DECISIONS_KEY) ?? "{}");
    return store[id] === "kept" || store[id] === "dismissed" ? store[id] : null;
  } catch {
    return null;
  }
}

function ecrireDecision(id: string, decision: Decision) {
  try {
    const store = JSON.parse(localStorage.getItem(DECISIONS_KEY) ?? "{}");
    store[id] = decision;
    localStorage.setItem(DECISIONS_KEY, JSON.stringify(store));
  } catch {}
}

export type DetailPropositionMemoire = {
  proposal: ProposalEvent["proposal"];
  origin: ProposalEvent["origin"];
  threadId?: string;
  /** Rappelé par l'app quand le backend a répondu. */
  done: (ok: boolean, error?: string) => void;
};

/** Carte posée par l'agent (`propose_memory`) ou par l'extraction de fin de
 *  tour : rien n'est enregistré avant « Garder ». */
export function MemoryProposalCard({ event, threadId }: { event: ProposalEvent; threadId?: string }) {
  const p = event.proposal;
  const [decision, setDecision] = useState<Decision | null>(() => lireDecision(event.id));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const garder = () => {
    setEnCours(true);
    setErreur(null);
    const detail: DetailPropositionMemoire = {
      proposal: p,
      origin: event.origin,
      threadId,
      done: (ok, error) => {
        setEnCours(false);
        if (!ok) { setErreur(error ?? t("memoire.error")); return; }
        ecrireDecision(event.id, "kept");
        setDecision("kept");
      },
    };
    window.dispatchEvent(new CustomEvent("memoire-proposition", { detail }));
  };
  const ecarter = () => {
    ecrireDecision(event.id, "dismissed");
    setDecision("dismissed");
  };

  return (
    <section className="specialist-proposal memory-proposal" data-testid="memory-proposal-card">
      <header className="specialist-proposal-head">
        <span className="specialist-proposal-badge">
          {event.origin === "extraction" ? t("memoire.proposal-badge-extraction") : t("memoire.proposal-badge")}
        </span>
        <span className="specialist-proposal-title memory-proposal-projet">{nomDeProjet(p.projectRoot)}</span>
      </header>
      <div className="specialist-proposal-body">
        <p className="specialist-proposal-role">{p.text}</p>
        {p.replacedText && (
          <div className="specialist-proposal-field">
            <span className="specialist-proposal-label">{t("memoire.replaces")}</span>
            <span className="specialist-proposal-list memory-proposal-ancien">{p.replacedText}</span>
          </div>
        )}
        {erreur && <p className="memory-proposal-erreur" role="alert">{erreur}</p>}
      </div>
      <footer className="specialist-proposal-actions">
        {decision ? (
          <span className="specialist-proposal-status" role="status">
            {decision === "kept" ? t("memoire.kept") : t("memoire.dismissed")}
          </span>
        ) : (
          <>
            <Button variant="primary" loading={enCours} onClick={garder}>{t("memoire.keep")}</Button>
            <Button variant="ghost" disabled={enCours} onClick={ecarter}>{t("memoire.dismiss")}</Button>
          </>
        )}
      </footer>
    </section>
  );
}
