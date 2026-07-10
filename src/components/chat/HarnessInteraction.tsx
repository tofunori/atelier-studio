// HarnessInteraction (plan 025, step 5) : carte compacte pour l'événement
// interactif générique du sidecar — approvals Codex, request_user_input,
// MCP elicitation (formulaire ou URL). Même patron visuel que la carte
// permission (.perm-card) ; la réponse part par CustomEvent "interaction-answer"
// (App l'envoie en WS `interactionResponse`).
//
// Sécurité (contrat AGENT_HARNESS_CONTRACT.md) :
//  - champ secret → input type=password ; la valeur circule UNIQUEMENT dans la
//    réponse, jamais dans le DOM après envoi ni dans answerSummary ;
//  - mode URL : on affiche seulement le domaine et on émet accept/decline —
//    JAMAIS de window.open ici, le sidecar/l'OS gère l'ouverture.
import { useState } from "react";
import type { AgentEvent, InteractionResponse } from "../../lib/ws";
import { t } from "../../lib/i18n";

export type InteractionEvent = Extract<AgentEvent, { kind: "interaction" }>;

/** Sentinelle locale du choix « Autre » — jamais envoyée telle quelle. */
const OTHER = "__other__";

export function HarnessInteraction({ event: e, threadId }: {
  event: InteractionEvent;
  threadId: string | null;
}) {
  // fige la carte dès l'envoi (optimiste, avant l'état final ré-émis par le
  // sidecar) : pas de double envoi, et toute valeur secrète quitte le DOM
  const [sent, setSent] = useState(false);
  // fieldId → label d'option choisi, OTHER, ou texte tapé (champ libre)
  const [values, setValues] = useState<Record<string, string>>({});
  // fieldId → texte libre du choix « Autre »
  const [others, setOthers] = useState<Record<string, string>>({});

  const final = sent || e.state !== "pending";
  const fields = e.fields ?? [];
  const urlMode = e.interactionType === "mcp_elicitation" && !!e.urlDomain && fields.length === 0;

  const answer = (response: InteractionResponse) => {
    window.dispatchEvent(new CustomEvent("interaction-answer", {
      detail: { threadId, requestId: e.requestId, response },
    }));
    setSent(true);
  };
  const collect = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.id] ?? "";
      out[f.id] = v === OTHER ? (others[f.id] ?? "") : v;
    }
    return out;
  };

  const verdict =
    e.state === "declined" ? t("interaction.declined")
    : e.state === "expired" ? t("interaction.expired")
    : (e.answerSummary || t("interaction.answered"));

  return (
    <div className={`perm-card int-card ${final ? "answered" : ""}`}>
      <div className="perm-head">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <path d="M6.4 6.2c.2-1 1-1.6 1.9-1.5 1 .1 1.7.9 1.6 1.8-.1 1.1-1.6 1.2-1.8 2.3" />
          <path d="M8 11.3h.01" />
        </svg>
        <span className="int-title">{e.title}</span>
        <span className="int-type">{t(`interaction.type-${e.interactionType}` as Parameters<typeof t>[0])}</span>
      </div>
      {e.detail ? <div className="int-detail">{e.detail}</div> : null}
      {urlMode ? <div className="int-domain">{t("interaction.url-ask", { domain: e.urlDomain })}</div> : null}
      {!final && fields.map((f) => {
        const qid = `int-q-${e.requestId}-${f.id}`;
        return (
          <div key={f.id} className="int-field">
            {f.header ? <div className="int-field-header">{f.header}</div> : null}
            <div className="int-q" id={qid}>{f.question}</div>
            {f.options?.length ? (
              <div role="radiogroup" aria-labelledby={qid} className="int-opts">
                {f.options.map((o) => (
                  <label key={o.label} className="int-opt">
                    <input
                      type="radio"
                      name={`${e.requestId}:${f.id}`}
                      checked={values[f.id] === o.label}
                      onChange={() => setValues((v) => ({ ...v, [f.id]: o.label }))}
                    />
                    <span>{o.label}</span>
                    {o.description ? <span className="int-opt-desc">{o.description}</span> : null}
                  </label>
                ))}
                {f.allowOther ? (
                  <>
                    <label className="int-opt">
                      <input
                        type="radio"
                        name={`${e.requestId}:${f.id}`}
                        checked={values[f.id] === OTHER}
                        onChange={() => setValues((v) => ({ ...v, [f.id]: OTHER }))}
                      />
                      <span>{t("interaction.other")}</span>
                    </label>
                    {values[f.id] === OTHER ? (
                      <input
                        className="int-input"
                        type={f.secret ? "password" : "text"}
                        value={others[f.id] ?? ""}
                        placeholder={t("interaction.other-placeholder")}
                        aria-label={t("interaction.other")}
                        onChange={(ev) => setOthers((v) => ({ ...v, [f.id]: ev.target.value }))}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : (
              <input
                className="int-input"
                type={f.secret ? "password" : "text"}
                value={values[f.id] ?? ""}
                placeholder={t("interaction.answer-placeholder")}
                aria-labelledby={qid}
                onChange={(ev) => setValues((v) => ({ ...v, [f.id]: ev.target.value }))}
              />
            )}
          </div>
        );
      })}
      {final ? (
        <div className="perm-verdict">{verdict}</div>
      ) : (
        <div className="perm-actions">
          {e.interactionType === "approval" ? (
            <>
              <button className="perm-allow" onClick={() => answer({ allow: true })}>{t("interaction.allow-once")}</button>
              <button className="perm-deny" onClick={() => answer({ allow: false })}>{t("interaction.deny")}</button>
            </>
          ) : e.interactionType === "user_input" ? (
            <>
              <button className="perm-allow" onClick={() => answer({ answers: collect() })}>{t("interaction.submit")}</button>
              <button className="perm-deny" onClick={() => answer({ answers: {} })}>{t("interaction.cancel")}</button>
            </>
          ) : urlMode ? (
            <>
              {/* « Ouvrir » n'ouvre RIEN ici : accept part au sidecar, qui gère */}
              <button className="perm-allow" onClick={() => answer({ action: "accept" })}>{t("interaction.open")}</button>
              <button className="perm-deny" onClick={() => answer({ action: "decline" })}>{t("interaction.deny")}</button>
            </>
          ) : (
            <>
              <button
                className="perm-allow"
                onClick={() => answer(fields.length ? { action: "accept", content: collect() } : { action: "accept" })}
              >
                {t("interaction.submit")}
              </button>
              <button className="perm-deny" onClick={() => answer({ action: "decline" })}>{t("interaction.cancel")}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
