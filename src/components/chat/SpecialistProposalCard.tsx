import { useState } from "react";
import { t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";
import { Tick } from "./toolPresentation";
import { Button, IconButton } from "../ui";

type ProposalEvent = Extract<AgentEvent, { kind: "specialist_proposal" }>;
type Decision = "kept" | "dismissed";

/** Décision par carte, propre à cet appareil : la fiche gardée vit, elle,
 *  dans les réglages (partagés avec le backend). */
const DECISIONS_KEY = "atelier-studio.specialistProposals";

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

/** Carte posée par l'agent (`propose_specialist`, plan
 *  specialistes-2026-10-18) : rien n'est enregistré avant le clic, comme les
 *  codes proposés du livre de codes. */
export function SpecialistProposalCard({ event }: { event: ProposalEvent }) {
  const p = event.proposal;
  const [decision, setDecision] = useState<Decision | null>(() => lireDecision(event.id));
  const lignes = p.instructions.split(/\r?\n/);
  const repliable = p.instructions.length > 600 || lignes.length > 8;
  const [ouvert, setOuvert] = useState(!repliable);
  const instructions = ouvert || !repliable ? p.instructions : lignes.slice(0, 6).join("\n");

  const decider = (action: "garder" | "modifier" | "ecarter") => {
    const suite: Decision = action === "ecarter" ? "dismissed" : "kept";
    if (action !== "ecarter") {
      window.dispatchEvent(new CustomEvent("specialiste-proposition", { detail: { action, proposal: p, proposalId: event.id } }));
    }
    ecrireDecision(event.id, suite);
    setDecision(suite);
  };

  return (
    <section className="specialist-proposal" data-testid="specialist-proposal-card">
      <header className="specialist-proposal-head">
        <span className="specialist-proposal-badge">{t("specialiste.proposal-badge")}</span>
        <span className="specialist-proposal-title">
          {p.nom}
          {p.nomCourt && <span className="specialist-proposal-court">@{p.nomCourt}</span>}
        </span>
        {repliable ? (
          <IconButton className="specialist-proposal-expand" aria-expanded={ouvert}
            label={ouvert ? t("plan.collapse") : t("plan.expand")} onClick={() => setOuvert((v) => !v)}>
            <Tick open={ouvert} />
          </IconButton>
        ) : null}
      </header>
      <div className="specialist-proposal-body">
        {p.replaceId && <p className="specialist-proposal-meta">{t("specialiste.replaces", { nom: p.nomCourt || p.nom })}</p>}
        {p.role && <p className="specialist-proposal-role">{p.role}</p>}
        {p.instructions && (
          <div className="specialist-proposal-field">
            <span className="specialist-proposal-label">{t("specialiste.instructions")}</span>
            <div className={`specialist-proposal-instructions${!ouvert && repliable ? " is-preview" : ""}`}>{instructions}</div>
          </div>
        )}
        {p.skills.length > 0 && (
          <div className="specialist-proposal-field">
            <span className="specialist-proposal-label">{t("specialiste.skills")}</span>
            <span className="specialist-proposal-list">{p.skills.join(", ")}</span>
          </div>
        )}
        {p.connecteurs.length > 0 && (
          <div className="specialist-proposal-field">
            <span className="specialist-proposal-label">{t("specialiste.connectors")}</span>
            <span className="specialist-proposal-list">{p.connecteurs.join(", ")}</span>
          </div>
        )}
      </div>
      <footer className="specialist-proposal-actions">
        {decision ? (
          <span className="specialist-proposal-status" role="status">
            {decision === "kept" ? t("specialiste.kept") : t("specialiste.dismissed")}
          </span>
        ) : (
          <>
            <Button variant="primary" onClick={() => decider("garder")}>{t("specialiste.keep")}</Button>
            <Button variant="secondary" onClick={() => decider("modifier")}>{t("specialiste.edit-in-settings")}</Button>
            <Button variant="ghost" onClick={() => decider("ecarter")}>{t("specialiste.dismiss")}</Button>
          </>
        )}
      </footer>
    </section>
  );
}
