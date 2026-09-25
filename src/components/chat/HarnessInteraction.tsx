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
import { lazy, Suspense, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check } from "lucide-react";
import type { AgentEvent, InteractionChoice, InteractionResponse } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { Input } from "../shadcn/input";
import { RadioGroup, RadioGroupItem } from "../shadcn/radio-group";
import { Checkbox, CheckboxIndicator } from "../shadcn/checkbox";
import { Field, FieldLabel, FieldTitle } from "../shadcn/field";
import { Button, RowButton } from "../ui";

const AtelierDiffView = lazy(() => import("../AtelierDiffView"));

export type InteractionEvent = Extract<AgentEvent, { kind: "interaction" }>;

/** Sentinelle locale du choix « Autre » — jamais envoyée telle quelle. */
const OTHER = "__other__";

const isReject = (c: InteractionChoice) => c.kind === "reject_once" || c.kind === "reject_always";

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
  // fieldId → options cochées (question à choix multiples)
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  // consigne jointe à un refus (« dire à l'agent quoi faire à la place »)
  const [feedback, setFeedback] = useState("");

  const final = sent || e.state !== "pending";
  const fields = e.fields ?? [];
  const urlMode = e.interactionType === "mcp_elicitation" && !!e.urlDomain && fields.length === 0;

  const answer = (response: InteractionResponse) => {
    window.dispatchEvent(new CustomEvent("interaction-answer", {
      detail: { threadId, requestId: e.requestId, response },
    }));
    setSent(true);
  };
  // Choix dynamique : optionId OPAQUE ; un refus emporte la consigne tapée,
  // un choix d'arrêt le signale (App interrompt alors le tour).
  const choose = (c: InteractionChoice) => {
    const message = e.feedback && isReject(c) ? feedback.trim() : "";
    answer({
      optionId: c.optionId,
      ...(c.cancelTurn ? { cancelTurn: true } : {}),
      ...(message ? { message } : {}),
    });
  };
  useEffect(() => {
    if (final || e.interactionType !== "approval") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, select, [contenteditable=true]")) return;
      const pendingCards = [...document.querySelectorAll<HTMLElement>('.int-card[data-approval-pending="true"]')];
      if (pendingCards[pendingCards.length - 1]?.dataset.requestId !== e.requestId) return;
      // Choix dynamiques (Kimi) : la touche n sélectionne le n-ième optionId,
      // renvoyé OPAQUE — jamais réinterprété en allow/deny.
      if (e.choices?.length) {
        const index = Number.parseInt(event.key, 10) - 1;
        const choice = Number.isInteger(index) ? e.choices[index] : undefined;
        if (!choice) return;
        event.preventDefault();
        choose(choice);
        return;
      }
      const response =
        event.key === "1" ? { allow: true, scope: "once" as const }
        : event.key === "2" ? { allow: true, scope: "session" as const }
        : event.key === "3" ? { allow: false, scope: "once" as const }
        : event.key === "4" ? { allow: false, scope: "once" as const, cancelTurn: true }
        : null;
      if (!response) return;
      event.preventDefault();
      answer(response);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [e.interactionType, final, feedback]);
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
  const firstReject = e.choices?.find(isReject);

  const verdict =
    e.state === "declined" ? t("interaction.declined")
    : e.state === "expired" ? t("interaction.expired")
    : (e.answerSummary || t("interaction.answered"));

  return (
    <div
      className={`perm-card int-card ${final ? "answered" : ""}`}
      data-approval-pending={!final && e.interactionType === "approval" ? "true" : undefined}
      data-request-id={e.requestId}
    >
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
      {e.reason && !final ? <div className="int-reason">{e.reason}</div> : null}
      {e.markdown ? (
        <div className={`int-plan${final ? " is-final" : ""}`}>
          <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{e.markdown}</ReactMarkdown>
        </div>
      ) : null}
      {e.preview && !final ? (
        <div className="int-preview">
          <Suspense fallback={<span className="muted">{t("common.loading")}</span>}>
            <AtelierDiffView before={e.preview.oldText} after={e.preview.newText} path={e.preview.path} compact />
          </Suspense>
        </div>
      ) : null}
      {urlMode ? <div className="int-domain">{t("interaction.url-ask", { domain: e.urlDomain })}</div> : null}
      {!final && fields.map((f) => {
        const qid = `int-q-${e.requestId}-${f.id}`;
        const inputId = `int-input-${e.requestId}-${f.id}`;
        return (
          <Field key={f.id} className="int-field">
            {f.header ? <FieldTitle className="int-field-header">{f.header}</FieldTitle> : null}
            {f.options?.length && f.multiSelect ? (
              <>
                <FieldTitle className="int-q" id={qid}>{f.question}</FieldTitle>
                <div className="int-opts" role="group" aria-labelledby={qid}>
                  {[...f.options.map((o) => ({ value: o.value ?? o.label, label: o.label, description: o.description })),
                    ...(f.allowOther ? [{ value: OTHER, label: t("interaction.other"), description: undefined }] : [])]
                    .map((o) => (
                      <label key={o.value} className="int-opt">
                        <Checkbox
                          checked={(checked[f.id] ?? []).includes(o.value)}
                          aria-label={o.label}
                          onCheckedChange={() => toggle(f.id, o.value)}
                        >
                          <CheckboxIndicator><Check size={12} strokeWidth={1.5} /></CheckboxIndicator>
                        </Checkbox>
                        <span>{o.label}</span>
                        {o.description ? <span className="int-opt-desc">{o.description}</span> : null}
                      </label>
                    ))}
                  {(checked[f.id] ?? []).includes(OTHER) ? (
                    <Input
                      className="int-input"
                      value={others[f.id] ?? ""}
                      placeholder={t("interaction.other-placeholder")}
                      aria-label={t("interaction.other-placeholder")}
                      onChange={(ev) => setOthers((v) => ({ ...v, [f.id]: ev.target.value }))}
                    />
                  ) : null}
                </div>
              </>
            ) : f.options?.length ? (
              <>
                <FieldTitle className="int-q" id={qid}>{f.question}</FieldTitle>
                <RadioGroup
                  aria-labelledby={qid}
                  className="int-opts"
                  value={values[f.id] ?? ""}
                  onValueChange={(value) => setValues((v) => ({ ...v, [f.id]: value }))}
                >
                  {f.options.map((o, index) => {
                    // value opaque (Kimi) : affichée jamais, renvoyée toujours.
                    const optionValue = o.value ?? o.label;
                    return (
                      <div
                        key={optionValue}
                        className="int-opt"
                        onClick={() => setValues((v) => ({ ...v, [f.id]: optionValue }))}
                      >
                        <RadioGroupItem value={optionValue} aria-labelledby={`${qid}-option-${index}`} />
                        <span id={`${qid}-option-${index}`}>{o.label}</span>
                        {o.description ? <span className="int-opt-desc">{o.description}</span> : null}
                      </div>
                    );
                  })}
                  {f.allowOther ? (
                    <>
                      <div
                        className="int-opt"
                        onClick={() => setValues((v) => ({ ...v, [f.id]: OTHER }))}
                      >
                        <RadioGroupItem value={OTHER} aria-labelledby={`${qid}-other`} />
                        <span id={`${qid}-other`}>{t("interaction.other")}</span>
                      </div>
                      {values[f.id] === OTHER ? (
                        <Input
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
                </RadioGroup>
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
                />
              </>
            )}
          </Field>
        );
      })}
      {!final && e.feedback && e.choices?.length ? (
        <Input
          className="int-input int-feedback"
          value={feedback}
          placeholder={t("interaction.feedback-placeholder")}
          aria-label={t("interaction.feedback-placeholder")}
          onChange={(ev) => setFeedback(ev.target.value)}
          onKeyDown={(ev) => {
            // Entrée = refuser avec cette consigne, comme dans le terminal.
            if (ev.key === "Enter" && feedback.trim() && firstReject) {
              ev.preventDefault();
              choose(firstReject);
            }
          }}
        />
      ) : null}
      {final ? (
        <div className="perm-verdict" role="status">{verdict}</div>
      ) : (
        <div className="perm-actions">
          {e.interactionType === "approval" && e.choices?.length ? (
            // Choix dynamiques (Kimi, Claude) : ordre EXACT du provider, libellés tels
            // quels, réponse = optionId opaque. Les kinds reject_* prennent le
            // style danger ; le premier allow_* est l'action primaire.
            <div className="approval-decisions">
              {e.choices.map((c, index) => {
                const reject = c.kind === "reject_once" || c.kind === "reject_always";
                const primary = !reject && index === 0;
                return (
                  <RowButton
                    key={c.optionId}
                    className={`approval-decision${primary ? " primary" : ""}${reject ? " danger" : ""}`}
                    aria-label={c.label}
                    onClick={() => choose(c)}
                  >
                    <kbd>{index + 1}</kbd>
                    <span>
                      <b>{c.label}</b>
                      {c.description ? <small>{c.description}</small> : null}
                    </span>
                  </RowButton>
                );
              })}
            </div>
          ) : e.interactionType === "approval" ? (
            <div className="approval-decisions">
              <RowButton className="approval-decision primary" aria-label={t("interaction.allow-once")} onClick={() => answer({ allow: true, scope: "once" })}>
                <kbd>1</kbd><span><b>{t("interaction.allow-once")}</b><small>{t("interaction.allow-once-desc")}</small></span>
              </RowButton>
              <RowButton className="approval-decision" aria-label={t("interaction.allow-session")} onClick={() => answer({ allow: true, scope: "session" })}>
                <kbd>2</kbd><span><b>{t("interaction.allow-session")}</b><small>{t("interaction.allow-session-desc")}</small></span>
              </RowButton>
              <RowButton className="approval-decision" aria-label={t("interaction.deny")} onClick={() => answer({ allow: false, scope: "once" })}>
                <kbd>3</kbd><span><b>{t("interaction.deny")}</b><small>{t("interaction.deny-desc")}</small></span>
              </RowButton>
              <RowButton className="approval-decision danger" aria-label={t("interaction.cancel-turn")} onClick={() => answer({ allow: false, scope: "once", cancelTurn: true })}>
                <kbd>4</kbd><span><b>{t("interaction.cancel-turn")}</b><small>{t("interaction.cancel-turn-desc")}</small></span>
              </RowButton>
            </div>
          ) : e.interactionType === "user_input" ? (
            <>
              <Button variant="primary" className="perm-allow" onClick={() => answer({ answers: collect() })}>{t("interaction.submit")}</Button>
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
              <Button
                variant="primary"
                className="perm-allow"
                onClick={() => answer(fields.length ? { action: "accept", content: collect() } : { action: "accept" })}
              >
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
