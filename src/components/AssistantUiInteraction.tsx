"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  ToolApprovalOption,
  ToolApprovalResponse,
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { CheckIcon } from "lucide-react";
import type { AgentEvent, InteractionResponse } from "@/lib/ws";
import { cn } from "@/lib/utils";
import { Input } from "@/components/assistant-ui/primitives/input";
import { ApprovalCard } from "@/components/assistant-ui/elements/approval-card";
import {
  ElicitationForm,
  type ElicitationField,
  type ElicitationOption,
} from "@/components/assistant-ui/elements/elicitation-form";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { Checkbox, CheckboxIndicator } from "@/components/shadcn/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";

type InteractionEvent = Extract<AgentEvent, { kind: "interaction" }>;
type InteractionField = NonNullable<InteractionEvent["fields"]>[number] & {
  required?: boolean;
  inputType?: "text" | "url" | "email" | "password";
  placeholder?: string;
};

export type AssistantUiInteractionAnswer = {
  requestId: string;
  response: InteractionResponse;
};

/**
 * Envelope passed to assistant-ui's `resume` callback. The host's
 * `onResumeToolCall` forwards this exact `{requestId,response}` pair to the
 * Atelier interaction-answer transport; the renderer never dispatches a WS
 * event itself.
 */
export type AssistantUiInteractionResumePayload = AssistantUiInteractionAnswer;

export const isAssistantUiInteractionPayload = (
  value: unknown,
): value is InteractionEvent => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.kind === "interaction"
    && typeof item.requestId === "string"
    && (item.interactionType === "approval"
      || item.interactionType === "user_input"
      || item.interactionType === "mcp_elicitation")
    && typeof item.title === "string"
    && (item.state === "pending"
      || item.state === "answered"
      || item.state === "declined"
      || item.state === "expired");
};

export function assistantUiInteractionResumePayload(
  event: Pick<InteractionEvent, "requestId" | "interactionType">,
  answers: Record<string, string>,
  accepted: boolean,
): AssistantUiInteractionResumePayload {
  if (!accepted) {
    return {
      requestId: event.requestId,
      response: event.interactionType === "mcp_elicitation"
        ? { action: "decline" }
        : { answers: {} },
    };
  }
  return {
    requestId: event.requestId,
    response: event.interactionType === "mcp_elicitation"
      ? { action: "accept", content: { ...answers } }
      : { answers: { ...answers } },
  };
}

type ResumeResponseRecord = Record<string, unknown>;

function isStringRecord(value: unknown): value is Record<string, string> {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(
      (item) => typeof item === "string",
    );
}

function isInteractionResponse(value: unknown): value is InteractionResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as ResumeResponseRecord;
  if (typeof response.allow === "boolean") {
    return (response.scope === undefined
      || response.scope === "once"
      || response.scope === "session")
      && (response.cancelTurn === undefined || typeof response.cancelTurn === "boolean");
  }
  if (typeof response.optionId === "string") {
    return response.cancelTurn === undefined || typeof response.cancelTurn === "boolean";
  }
  if ("answers" in response) return isStringRecord(response.answers);
  if (response.action === "accept" || response.action === "decline") {
    return response.content === undefined || isStringRecord(response.content);
  }
  return false;
}

function interactionResponseKind(response: InteractionResponse): "allow" | "option" | "answers" | "action" {
  if ("allow" in response) return "allow";
  if ("optionId" in response) return "option";
  if ("answers" in response) return "answers";
  return "action";
}

/**
 * Runtime guard for the opaque payload sent through assistant-ui's
 * `resume` seam. When an event snapshot is supplied, a payload is accepted
 * only while the matching Atelier request is still pending. This keeps a
 * stale renderer callback from answering a newer request that reused a
 * tool-call id.
 */
export function isAssistantUiInteractionResumePayload(
  value: unknown,
  events?: readonly AgentEvent[],
): value is AssistantUiInteractionResumePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (typeof payload.requestId !== "string" || !isInteractionResponse(payload.response)) return false;
  if (!events) return true;
  // A replay can retain the original pending row followed by an answered or
  // expired update. The last matching row is authoritative; an older pending
  // row must never reopen the request.
  type ResumeRequestEvent =
    | Extract<AgentEvent, { kind: "interaction" }>
    | Extract<AgentEvent, { kind: "permission" }>;
  let latest: ResumeRequestEvent | undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      (event.kind === "interaction" || event.kind === "permission")
      && event.requestId === payload.requestId
    ) {
      latest = event;
      break;
    }
  }
  if (!latest) return false;
  if (latest.kind === "interaction") {
    if (latest.state !== "pending") return false;
    const kind = interactionResponseKind(payload.response);
    return latest.interactionType === "mcp_elicitation"
      ? kind === "action"
      : latest.interactionType === "user_input"
        ? kind === "answers"
        : kind === "allow" || kind === "option" || kind === "answers";
  }
  return latest.answered == null
    && (interactionResponseKind(payload.response) === "allow"
      || interactionResponseKind(payload.response) === "option");
}

function normalizeAnswers(
  event: InteractionEvent,
  answers: Record<string, string>,
): Record<string, string> {
  const allowOther = new Set(
    (event.fields ?? []).filter((field) => field.allowOther).map((field) => field.id),
  );
  return Object.fromEntries(Object.entries(answers).map(([id, value]) => [
    id,
    allowOther.has(id) && value.startsWith("__other__:")
      ? value.slice("__other__:".length)
      : value,
  ]));
}

function optionForField(option: NonNullable<InteractionField["options"]>[number]): ElicitationOption {
  return { label: option.label, ...(option.value !== undefined ? { value: option.value } : {}) };
}

function fieldInputType(field: InteractionField, event: InteractionEvent): ElicitationField["inputType"] {
  if (field.inputType) return field.inputType;
  if (field.secret) return "password";
  if (event.urlDomain) return "url";
  return undefined;
}

function normalizedFields(event: InteractionEvent): ElicitationField[] {
  return (event.fields ?? []).map((rawField) => {
    const field = rawField as InteractionField;
    return {
    name: field.id,
    label: field.header ?? field.question,
    value: "",
    kind: field.options?.length ? "choice" : "text",
    ...(field.options?.length
      ? { options: field.options.map(optionForField) }
      : {}),
    ...(field.required !== undefined ? { required: field.required } : {}),
    ...(fieldInputType(field, event) ? { inputType: fieldInputType(field, event) } : {}),
    };
  });
}

function knownApprovalOptions(options: readonly ToolApprovalOption[] | undefined) {
  const allowOnce = options?.find((option) => option.kind === "allow-once");
  const allowAlways = options?.find((option) => option.kind === "allow-always");
  const deny = options?.find((option) => option.kind === "reject-once" || option.kind === "reject-always");
  const unknown = options?.some((option) =>
    option.kind !== "allow-once"
    && option.kind !== "allow-always"
    && option.kind !== "reject-once"
    && option.kind !== "reject-always",
  ) ?? false;
  return { allowOnce, allowAlways, deny, unknown };
}

function approvalState(
  approval: NonNullable<ToolCallMessagePartProps["approval"]>,
  status: ToolCallMessagePartProps["status"],
): "request" | "running" | "done" | "denied" {
  if (approval.approved === false || approval.resolution != null) return "denied";
  if (approval.approved === true) {
    if (status?.type === "running") return "running";
    if (status?.type === "complete") return "done";
    if (status?.type === "incomplete") return "denied";
    return "running";
  }
  return "request";
}

function ApprovalInteraction({
  approval,
  status,
  toolName,
  argsText,
  respondToApproval,
}: Pick<ToolCallMessagePartProps, "approval" | "status" | "toolName" | "argsText" | "respondToApproval">) {
  if (!approval) return null;
  const options = knownApprovalOptions(approval.options);
  // The official ApprovalCard has three fixed actions. Dynamic/custom option
  // ids belong to ToolFallback, which renders every declared option and keeps
  // the opaque id intact.
  if (
    options.unknown
    || approval.options?.length !== 3
    || !options.allowOnce
    || !options.allowAlways
    || !options.deny
  ) {
    return null;
  }
  const send = (response: ToolApprovalResponse) => {
    void respondToApproval(response);
  };
  const state = approvalState(approval, status);
  return (
    <ApprovalCard
      state={state}
      command={argsText || toolName}
      title={approval.prompt || toolName}
      subtitle={toolName}
      onAllowOnce={state === "request" ? () => send(options.allowOnce ? { optionId: options.allowOnce.id } : { approved: true }) : undefined}
      onAlwaysAllow={state === "request" ? () => send(options.allowAlways ? { optionId: options.allowAlways.id } : { approved: true }) : undefined}
      onDeny={state === "request" ? () => send(options.deny ? { optionId: options.deny.id } : { approved: false }) : undefined}
    />
  );
}

function ElicitationInteraction({
  event,
  resume,
}: {
  event: InteractionEvent;
  resume: (payload: unknown) => void;
}) {
  const fields = useMemo(() => normalizedFields(event), [event]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<"accepted" | "declined" | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const update = (name: string, value: string) => {
    setAnswers((current) => ({ ...current, [name]: value }));
    setValidationError((current) => current?.startsWith(`${name}:`) ? null : current);
  };
  const submit = (accepted: boolean) => {
    if (accepted) {
      const missing = (event.fields ?? []).find((field) => {
        const required = (field as InteractionField).required === true;
        if (!required) return false;
        const value = answers[field.id] ?? "";
        return value.trim() === ""
          || (value.startsWith("__other__:") && value.slice("__other__:".length).trim() === "");
      });
      if (missing) {
        setValidationError(`${missing.id}: This field is required.`);
        return;
      }
    }
    setSubmitted(accepted ? "accepted" : "declined");
    setValidationError(null);
    resume(assistantUiInteractionResumePayload(event, normalizeAnswers(event, answers), accepted));
  };
  const state = submitted ?? (event.state === "answered"
    ? "accepted"
    : event.state === "declined" || event.state === "expired"
      ? "declined"
      : "request");
  return (
    <ElicitationForm
      server={event.urlDomain ?? event.interactionType}
      message={event.detail ? `${event.title}\n${event.detail}` : event.title}
      fields={fields.map((field) => ({ ...field, value: answers[field.name] ?? field.value }))}
      state={state}
      onFieldChange={update}
      onAccept={() => submit(true)}
      onDecline={() => submit(false)}
      renderField={(field) => (
        <InteractionFieldInput
          field={field}
          source={event.fields?.find((item) => item.id === field.name)}
          value={answers[field.name] ?? ""}
          onChange={(value) => update(field.name, value)}
          invalid={validationError?.startsWith(`${field.name}:`) ?? false}
        />
      )}
      validationError={validationError?.split(": ").slice(1).join(": ")}
      data-interaction-id={event.requestId}
      aria-busy={state === "request" ? undefined : true}
    />
  );
}

function InteractionFieldInput({
  field,
  source,
  value,
  onChange,
  invalid,
}: {
  field: ElicitationField;
  source?: InteractionField;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}): ReactNode {
  if (field.kind === "choice") {
    const other = source?.allowOther === true;
    const selected = other && value.startsWith("__other__:") ? "__other__" : value;
    const otherValue = other && value.startsWith("__other__:")
      ? value.slice("__other__:".length)
      : "";
    return (
      <div className="tw:flex tw:flex-col tw:gap-1.5">
        <Select
          value={selected}
          onValueChange={(next) => {
            if (typeof next !== "string") return;
            onChange(next === "__other__" ? "__other__:" : next);
          }}
        >
          <SelectTrigger size="sm" aria-label={field.label} aria-invalid={invalid || undefined}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => {
              const optionValue = typeof option === "string" ? option : option.value ?? option.label;
              const label = typeof option === "string" ? option : option.label;
              return <SelectItem key={optionValue} value={optionValue}>{label}</SelectItem>;
            })}
            {other && <SelectItem value="__other__">Other</SelectItem>}
          </SelectContent>
        </Select>
        {selected === "__other__" && (
          <Input
            type="text"
            aria-label={`${field.label} (other)`}
            aria-invalid={invalid || undefined}
            value={otherValue}
            onChange={(event) => onChange(`__other__:${event.currentTarget.value}`)}
            className="tw:bg-foreground/[0.04] tw:text-foreground/80 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-xs tw:outline-none"
          />
        )}
      </div>
    );
  }
  if (field.kind === "toggle") {
    return (
      <label className="tw:flex tw:items-center tw:gap-2 tw:text-xs">
        <Checkbox
          aria-label={field.label}
          aria-invalid={invalid || undefined}
          checked={value === "true"}
          onCheckedChange={(checked) => onChange(String(checked === true))}
        >
          <CheckboxIndicator>
            <CheckIcon className="tw:size-3" />
          </CheckboxIndicator>
        </Checkbox>
        <span className="tw:text-foreground/55">{value === "true" ? "On" : "Off"}</span>
      </label>
    );
  }
  return (
    <Input
      type={field.inputType ?? "text"}
      aria-label={field.label}
      aria-invalid={invalid || undefined}
      value={value}
      placeholder={field.placeholder}
      required={field.required}
      onChange={(event) => onChange(event.currentTarget.value)}
      className={cn("tw:bg-foreground/[0.04] tw:text-foreground/80 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-xs tw:outline-none")}
    />
  );
}

/**
 * Thin official-element renderer for Atelier's interaction tool calls.
 * Unsupported/custom approval options deliberately fall back to the native
 * assistant-ui ToolFallback instead of being collapsed into Allow/Deny.
 */
export const AssistantUiInteraction: ToolCallMessagePartComponent = (props) => {
  if (props.approval) {
    const options = knownApprovalOptions(props.approval.options);
    const supported = !options.unknown
      && props.approval.options?.length === 3
      && !!options.allowOnce
      && !!options.allowAlways
      && !!options.deny;
    if (supported) return <ApprovalInteraction {...props} />;
    return <ToolFallback {...props} />;
  }
  const payload = props.interrupt?.payload;
  if (props.interrupt && isAssistantUiInteractionPayload(payload)) {
    if (payload.interactionType === "user_input" || payload.interactionType === "mcp_elicitation") {
    return <ElicitationInteraction event={payload} resume={props.resume} />;
    }
  }
  return <ToolFallback {...props} />;
};
