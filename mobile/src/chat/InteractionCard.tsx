/**
 * Generic interaction card (plan 025 / 034 H).
 * Double submit forbidden; secrets leave the DOM after send; terminal state from server wins.
 */
import { useState } from "react";
import type { InteractionPayload, InteractionResponse } from "./interactionTypes.ts";
import { haptic } from "../native/haptics.ts";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

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
    <Card
      size="sm"
      data-request={e.requestId}
      data-state={e.state}
    >
      <CardHeader>
        <CardTitle>{e.title}</CardTitle>
        <Badge variant="outline">{e.interactionType}</Badge>
        {(e.detail || urlMode) && (
          <CardDescription>
            {e.detail || `Autoriser le domaine « ${e.urlDomain} » ?`}
          </CardDescription>
        )}
      </CardHeader>

      {!final && fields.length > 0 && (
        <CardContent>
          <FieldGroup>
            {fields.map((f) => {
          const qid = `int-q-${e.requestId}-${f.id}`;
          return (
                <Field key={f.id} data-disabled={final || undefined}>
                  {f.header && <FieldDescription>{f.header}</FieldDescription>}
                  <FieldTitle id={qid}>{f.question}</FieldTitle>
              {f.options?.length ? (
                    <RadioGroup
                      aria-labelledby={qid}
                      value={values[f.id] ?? ""}
                      disabled={final}
                      onValueChange={(value) => setValues((current) => ({ ...current, [f.id]: value }))}
                    >
                  {f.options.map((o) => (
                        <Field orientation="horizontal" key={o.label} data-disabled={final || undefined}>
                          <RadioGroupItem id={`${qid}-${o.label}`} value={o.label} disabled={final} />
                          <FieldLabel htmlFor={`${qid}-${o.label}`}>{o.label}</FieldLabel>
                        </Field>
                  ))}
                  {f.allowOther ? (
                    <>
                          <Field orientation="horizontal" data-disabled={final || undefined}>
                            <RadioGroupItem id={`${qid}-other`} value={OTHER} disabled={final} />
                            <FieldLabel htmlFor={`${qid}-other`}>Autre</FieldLabel>
                          </Field>
                      {values[f.id] === OTHER ? (
                            <Input
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
                    </RadioGroup>
              ) : (
                    <Input
                  type={f.secret ? "password" : "text"}
                  value={values[f.id] ?? ""}
                  disabled={final}
                  autoComplete="off"
                  aria-labelledby={qid}
                  onChange={(ev) => setValues((v) => ({ ...v, [f.id]: ev.target.value }))}
                />
              )}
                </Field>
          );
            })}
          </FieldGroup>
        </CardContent>
      )}

      {error && (
        <CardContent><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></CardContent>
      )}

      {final ? (
        <CardFooter><Badge variant="secondary">{verdict}</Badge></CardFooter>
      ) : e.interactionType === "approval" || urlMode ? (
        <CardFooter className="gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void answer(
                urlMode ? { action: "accept" } : { allow: true },
              )
            }
          >
            {busy && <Spinner data-icon="inline-start" />}
            Autoriser
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void answer(
                urlMode ? { action: "decline" } : { allow: false },
              )
            }
          >
            Refuser
          </Button>
        </CardFooter>
      ) : (
        <CardFooter>
          <Button
          type="button"
          disabled={busy}
          onClick={() => void answer({ answers: collect() })}
        >
            {busy && <Spinner data-icon="inline-start" />}
          Envoyer
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
