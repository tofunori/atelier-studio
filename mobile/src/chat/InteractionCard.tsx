/**
 * Generic interaction card (plan 025 / 034 H).
 * Double submit forbidden; secrets leave the DOM after send; terminal state from server wins.
 */
import { useState } from "react";
import type { InteractionPayload, InteractionResponse } from "./interactionTypes.ts";
import { haptic } from "../native/haptics.ts";

const OTHER = "__other__";

type Props = {
  threadId: string;
  payload: InteractionPayload;
  /** True if client already submitted (optimistic). */
  locallySubmitted?: boolean;
  onRespond: (requestId: string, response: InteractionResponse, clientRequestId: string) => Promise<void>;
};

function newId(): string {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function InteractionCard(p: Props) {
  const e = p.payload;
  const [sent, setSent] = useState(!!p.locallySubmitted);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const final = sent || e.state !== "pending" || busy;
  const fields = e.fields ?? [];
  const urlMode =
    e.interactionType === "mcp_elicitation" && !!e.urlDomain && fields.length === 0;

  const answer = async (response: InteractionResponse) => {
    if (final || busy) return; // anti double-submit
    setBusy(true);
    setError(null);
    const clientRequestId = newId();
    try {
      await p.onRespond(e.requestId, response, clientRequestId);
      setSent(true);
      // wipe secrets from state
      setValues({});
      setOthers({});
      await haptic("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      await haptic("warning");
      return;
    }
    setBusy(false);
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
    e.state === "declined"
      ? "Refusé"
      : e.state === "expired"
        ? "Expiré"
        : e.answerSummary || "Répondu";

  return (
    <div
      className={`int-card ${final ? "answered" : ""}`}
      data-request={e.requestId}
      data-state={e.state}
    >
      <div className="int-head">
        <span className="int-title">{e.title}</span>
        <span className="int-type">{e.interactionType}</span>
      </div>
      {e.detail ? <div className="int-detail">{e.detail}</div> : null}
      {urlMode ? (
        <div className="int-detail">Autoriser le domaine « {e.urlDomain} » ?</div>
      ) : null}

      {!final &&
        fields.map((f) => {
          const qid = `int-q-${e.requestId}-${f.id}`;
          return (
            <div key={f.id} className="int-field">
              {f.header ? <div className="int-field-header">{f.header}</div> : null}
              <div className="int-q" id={qid}>
                {f.question}
              </div>
              {f.options?.length ? (
                <div role="radiogroup" aria-labelledby={qid} className="int-opts">
                  {f.options.map((o) => (
                    <label key={o.label} className="int-opt">
                      <input
                        type="radio"
                        name={`${e.requestId}:${f.id}`}
                        checked={values[f.id] === o.label}
                        disabled={final}
                        onChange={() => setValues((v) => ({ ...v, [f.id]: o.label }))}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                  {f.allowOther ? (
                    <>
                      <label className="int-opt">
                        <input
                          type="radio"
                          name={`${e.requestId}:${f.id}`}
                          checked={values[f.id] === OTHER}
                          disabled={final}
                          onChange={() => setValues((v) => ({ ...v, [f.id]: OTHER }))}
                        />
                        <span>Autre</span>
                      </label>
                      {values[f.id] === OTHER ? (
                        <input
                          className="int-input"
                          type={f.secret ? "password" : "text"}
                          value={others[f.id] ?? ""}
                          disabled={final}
                          autoComplete="off"
                          onChange={(ev) =>
                            setOthers((v) => ({ ...v, [f.id]: ev.target.value }))
                          }
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
                  disabled={final}
                  autoComplete="off"
                  aria-labelledby={qid}
                  onChange={(ev) => setValues((v) => ({ ...v, [f.id]: ev.target.value }))}
                />
              )}
            </div>
          );
        })}

      {error && (
        <div role="alert" style={{ color: "var(--status-error)", fontSize: "var(--fs-s)" }}>
          {error}
        </div>
      )}

      {final ? (
        <div className="int-verdict">{verdict}</div>
      ) : e.interactionType === "approval" || urlMode ? (
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void answer(
                urlMode ? { action: "accept" } : { allow: true },
              )
            }
          >
            Autoriser
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() =>
              void answer(
                urlMode ? { action: "decline" } : { allow: false },
              )
            }
          >
            Refuser
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void answer({ answers: collect() })}
        >
          Envoyer
        </button>
      )}
    </div>
  );
}
