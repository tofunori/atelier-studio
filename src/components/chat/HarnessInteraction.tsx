// HarnessInteraction (plan 025, step 5) : carte compacte pour l'événement
// interactif générique du sidecar — request_user_input, MCP elicitation
// (formulaire ou URL) ; les approbations passent par ApprovalCard (lazy). Même patron visuel que la carte
// permission (.perm-card) ; la réponse part par CustomEvent "interaction-answer"
// (App l'envoie en WS `interactionResponse`).
//
// Sécurité (contrat AGENT_HARNESS_CONTRACT.md) :
//  - champ secret → input type=password ; la valeur circule UNIQUEMENT dans la
//    réponse, jamais dans le DOM après envoi ni dans answerSummary ;
//  - mode URL : on affiche seulement le domaine et on émet accept/decline —
//    JAMAIS de window.open ici, le sidecar/l'OS gère l'ouverture.
import { lazy, Suspense, useEffect, useState } from "react";
import type { AgentEvent, InteractionResponse } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { sendInteractionAnswer } from "./interactionAnswer";
import { Input } from "../shadcn/input";
import { Field, FieldLabel, FieldTitle } from "../shadcn/field";
import { Button, RowButton } from "../ui";

// Carte d'approbation (variante C compacte) : chunk à part, budget d'entrée plein.
const ApprovalCard = lazy(() => import("./ApprovalCard"));

export type InteractionEvent = Extract<AgentEvent, { kind: "interaction" }>;

/** Sentinelle locale du choix « Autre » — jamais envoyée telle quelle. */
const OTHER = "__other__";

/** « (Recommended) » que Claude colle au libellé : retiré du texte, rendu en
 *  pastille. La valeur RENVOYÉE reste le libellé d'origine. */
const RECOMMENDED = /\s*\((?:recommended|recommandée?)\)\s*$/i;
const splitRecommended = (label: string) => {
  const clean = label.replace(RECOMMENDED, "");
  return { label: clean || label, recommended: clean !== label };
};

/** Titres posés par le serveur (en français) : traduits dans la langue de l'app. */
const SERVER_TITLES: Record<string, Parameters<typeof t>[0]> = {
  "Claude a des questions": "interaction.title-claude-questions",
  "Claude a une question": "interaction.title-claude-question",
  "L'agent a besoin d'une réponse": "interaction.title-agent-answer",
};

/** answerSummary « En-tête: réponse · En-tête: réponse » → paires, sinon null. */
const summaryPairs = (summary: string) => {
  const pairs = summary.split(" · ").map((part) => {
    const at = part.indexOf(": ");
    return at > 0 ? { k: part.slice(0, at), v: part.slice(at + 2).replace(RECOMMENDED, "") } : null;
  });
  return pairs.every(Boolean) ? (pairs as { k: string; v: string }[]) : null;
};

const CheckIcon = () => (
  <svg className="int-choice-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 8.4 6.6 11.4 12.5 4.8" />
  </svg>
);

type CardProps = { event: InteractionEvent; threadId: string | null };

export function HarnessInteraction(props: CardProps) {
  return props.event.interactionType === "approval"
    ? <Suspense fallback={<div className="int-card appr" />}><ApprovalCard {...props} /></Suspense>
    : <InteractionCard {...props} />;
}

function InteractionCard({ event: e, threadId }: CardProps) {
  // fige la carte dès l'envoi (optimiste, avant l'état final ré-émis par le
  // sidecar) : pas de double envoi, et toute valeur secrète quitte le DOM
  const [sent, setSent] = useState(false);
  // fieldId → label d'option choisi, OTHER, ou texte tapé (champ libre)
  const [values, setValues] = useState<Record<string, string>>({});
  // fieldId → texte libre du choix « Autre »
  const [others, setOthers] = useState<Record<string, string>>({});
  // fieldId → options cochées (question à choix multiples)
  const [checked, setChecked] = useState<Record<string, string[]>>({});

  // question affichée : une seule à la fois, onglets quand il y en a plusieurs
  const [step, setStep] = useState(0);

  const final = sent || e.state !== "pending";
  const fields = e.fields ?? [];
  const urlMode = e.interactionType === "mcp_elicitation" && !!e.urlDomain && fields.length === 0;
  // formulaire (questions de l'agent, MCP) : carte sobre, une question à la fois
  const form = fields.length > 0;
  const stepped = form && fields.length > 1;
  const current = form ? fields[Math.min(step, fields.length - 1)] : undefined;
  const last = step >= fields.length - 1;
  const title = (e.interactionType === "user_input" && SERVER_TITLES[e.title]) ? t(SERVER_TITLES[e.title]) : e.title;

  const answer = (response: InteractionResponse) => {
    sendInteractionAnswer(e, threadId, response);
    setSent(true);
  };
  const collect = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      if (f.multiSelect) {
        const picked = (checked[f.id] ?? []).map((v) => v === OTHER ? (others[f.id] ?? "").trim() : v);
        out[f.id] = picked.filter(Boolean).join(", ");
        continue;
      }
      const v = values[f.id] ?? "";
      out[f.id] = v === OTHER ? (others[f.id] ?? "") : v;
    }
    return out;
  };
  const toggle = (fieldId: string, value: string) => setChecked((current) => {
    const list = current[fieldId] ?? [];
    return { ...current, [fieldId]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
  });
  type QField = NonNullable<InteractionEvent["fields"]>[number];
  const rowsOf = (f: QField) => f.options?.length
    ? [...f.options.map((o) => ({ value: o.value ?? o.label, label: o.label, description: o.description })),
      ...(f.allowOther ? [{ value: OTHER, label: t("interaction.other"), description: undefined }] : [])]
    : [];
  const isPicked = (f: QField, value: string) =>
    f.multiSelect ? (checked[f.id] ?? []).includes(value) : values[f.id] === value;
  const pick = (f: QField, value: string) => {
    if (f.multiSelect) toggle(f.id, value);
    else setValues((v) => ({ ...v, [f.id]: value }));
  };
  const submitForm = () => answer(e.interactionType === "user_input"
    ? { answers: collect() }
    : { action: "accept", content: collect() });
  const cancelForm = () => answer(e.interactionType === "user_input" ? { answers: {} } : { action: "decline" });
  const advance = () => (last ? submitForm() : setStep(step + 1));
  // Clavier (comme le terminal) : 1–n choisit dans la question affichée,
  // Entrée passe à la suivante puis envoie. Seule la DERNIÈRE carte en
  // attente écoute ; jamais pendant la frappe dans un champ.
  useEffect(() => {
    if (final || !form || !current) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, select, button, [contenteditable=true]")) return;
      const pendingCards = [...document.querySelectorAll<HTMLElement>('.int-card[data-form-pending="true"]')];
      if (pendingCards[pendingCards.length - 1]?.dataset.requestId !== e.requestId) return;
      if (event.key === "Enter") {
        event.preventDefault();
        advance();
        return;
      }
      const row = rowsOf(current)[Number.parseInt(event.key, 10) - 1];
      if (!row) return;
      event.preventDefault();
      pick(current, row.value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const verdict =
    e.state === "declined" ? t("interaction.declined")
    : e.state === "expired" ? t("interaction.expired")
    : (e.answerSummary || t("interaction.answered"));

  if (form && final) {
    // Repli en une ligne : l'en-tête et les réponses gardées, rien d'éditable.
    const summary = e.state === "answered" && e.answerSummary ? e.answerSummary : "";
    const pairs = summary ? summaryPairs(summary) : null;
    return (
      <div className="perm-card int-card int-card--form answered" data-request-id={e.requestId}>
        <div className="int-answered" role="status">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6.2" />
            {e.state === "declined" || e.state === "expired"
              ? <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
              : <path d="M5.4 8.2 7.2 10l3.4-3.8" />}
          </svg>
          <span className="int-answered-title">
            {t(e.state === "declined" ? "interaction.declined-title" : e.state === "expired" ? "interaction.expired-title" : "interaction.answered-title")}
          </span>
          {pairs ? pairs.map((pair, index) => (
            <span key={index} className="int-answered-pair"><span className="int-answered-key">{pair.k}</span>{pair.v}</span>
          )) : summary ? <span className="int-answered-pair">{summary.replace(RECOMMENDED, "")}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`perm-card int-card${form ? " int-card--form" : ""}${final ? " answered" : ""}`}
      data-form-pending={!final && form ? "true" : undefined}
      data-request-id={e.requestId}
    >
      <div className="perm-head">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <path d="M6.4 6.2c.2-1 1-1.6 1.9-1.5 1 .1 1.7.9 1.6 1.8-.1 1.1-1.6 1.2-1.8 2.3" />
          <path d="M8 11.3h.01" />
        </svg>
        <span className="int-title">{title}</span>
        {stepped ? (
          <span className="int-steps" role="tablist" aria-label={t("interaction.questions")}>
            {fields.map((f, index) => (
              <RowButton
                key={f.id}
                role="tab"
                aria-selected={index === step}
                className={`int-step${index === step ? " is-current" : ""}`}
                onClick={() => setStep(index)}
              >
                {f.header || String(index + 1)}
              </RowButton>
            ))}
          </span>
        ) : form && e.interactionType === "user_input" ? null : (
          <span className="int-type">{t(`interaction.type-${e.interactionType}` as Parameters<typeof t>[0])}</span>
        )}
      </div>
      {e.forTitle ? <div className="int-for">{t("interaction.for-linked", { title: e.forTitle })}</div> : null}
      {e.detail ? <div className="int-detail">{e.detail}</div> : null}
      {e.reason && !final ? <div className="int-reason">{e.reason}</div> : null}
      {urlMode ? <div className="int-domain">{t("interaction.url-ask", { domain: e.urlDomain })}</div> : null}
      {!final && current ? (() => {
        const f = current;
        const qid = `int-q-${e.requestId}-${f.id}`;
        const inputId = `int-input-${e.requestId}-${f.id}`;
        const rows = rowsOf(f);
        return (
          <Field key={f.id} className="int-field">
            {f.header && !stepped ? <FieldTitle className="int-field-header">{f.header}</FieldTitle> : null}
            {rows.length ? (
              <>
                <FieldTitle className="int-q" id={qid}>{f.question}</FieldTitle>
                <div className="int-choices" role={f.multiSelect ? "group" : "radiogroup"} aria-labelledby={qid}>
                  {rows.map((o, index) => {
                    const on = isPicked(f, o.value);
                    const shown = o.value === OTHER ? { label: o.label, recommended: false } : splitRecommended(o.label);
                    return (
                      <RowButton
                        key={o.value}
                        className={`int-choice${on ? " is-selected" : ""}${o.value === OTHER ? " is-other" : ""}`}
                        role={f.multiSelect ? "checkbox" : "radio"}
                        aria-checked={on}
                        aria-label={shown.label}
                        onClick={() => pick(f, o.value)}
                      >
                        <kbd aria-hidden="true">{index + 1}</kbd>
                        <span className="int-choice-body">
                          <span className="int-choice-label">
                            {o.value === OTHER ? t("interaction.other-row") : shown.label}
                            {shown.recommended ? <span className="int-rec">{t("interaction.recommended")}</span> : null}
                          </span>
                          {o.description ? <span className="int-choice-desc">{o.description}</span> : null}
                        </span>
                        {on ? <CheckIcon /> : null}
                      </RowButton>
                    );
                  })}
                  {isPicked(f, OTHER) ? (
                    <Input
                      autoFocus
                      className="int-input int-other-input"
                      type={f.secret ? "password" : "text"}
                      value={others[f.id] ?? ""}
                      placeholder={t("interaction.other-placeholder")}
                      aria-label={t("interaction.other-placeholder")}
                      onChange={(ev) => setOthers((v) => ({ ...v, [f.id]: ev.target.value }))}
                      onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); advance(); } }}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <FieldLabel className="int-q" id={qid} htmlFor={inputId}>{f.question}</FieldLabel>
                <Input
                  id={inputId}
                  className="int-input"
                  type={f.secret ? "password" : "text"}
                  value={values[f.id] ?? ""}
                  placeholder={t("interaction.answer-placeholder")}
                  aria-labelledby={qid}
                  onChange={(ev) => setValues((v) => ({ ...v, [f.id]: ev.target.value }))}
                  onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); advance(); } }}
                />
              </>
            )}
          </Field>
        );
      })() : null}
      {form ? (
        <div className="int-foot">
          {stepped ? <span className="int-progress">{`${step + 1} / ${fields.length}`}</span> : null}
          <Button variant="ghost" className="perm-deny" onClick={cancelForm}>{t("interaction.cancel")}</Button>
          <Button variant="primary" className="perm-allow" onClick={advance}>
            {last ? t("interaction.submit") : t("interaction.next")}
          </Button>
        </div>
      ) : final ? (
        <div className="perm-verdict" role="status">{verdict}</div>
      ) : (
        <div className="perm-actions">
          {e.interactionType === "user_input" ? (
            // user_input sans champ (cas limite) : envoyer une réponse vide
            <>
              <Button variant="primary" className="perm-allow" onClick={() => answer({ answers: {} })}>{t("interaction.submit")}</Button>
              <Button variant="secondary" className="perm-deny" onClick={() => answer({ answers: {} })}>{t("interaction.cancel")}</Button>
            </>
          ) : urlMode ? (
            <>
              {/* « Ouvrir » n'ouvre RIEN ici : accept part au sidecar, qui gère */}
              <Button variant="primary" className="perm-allow" onClick={() => answer({ action: "accept" })}>{t("interaction.open")}</Button>
              <Button variant="secondary" className="perm-deny" onClick={() => answer({ action: "decline" })}>{t("interaction.deny")}</Button>
            </>
          ) : (
            <>
              <Button variant="primary" className="perm-allow" onClick={() => answer({ action: "accept" })}>
                {t("interaction.submit")}
              </Button>
              <Button variant="secondary" className="perm-deny" onClick={() => answer({ action: "decline" })}>{t("interaction.cancel")}</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
