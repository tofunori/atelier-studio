import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import {
  AssistantUiInteraction,
  isAssistantUiInteractionResumePayload,
  type AssistantUiInteractionResumePayload,
} from "./AssistantUiInteraction";

afterEach(cleanup);

function part(
  overrides: Partial<ToolCallMessagePartProps> = {},
): ToolCallMessagePartProps {
  return {
    type: "tool-call",
    toolCallId: "request-1",
    toolName: "ask_user",
    args: {},
    argsText: "ask_user",
    status: { type: "requires-action", reason: "interrupt" },
    addResult: vi.fn(),
    resume: vi.fn(),
    respondToApproval: vi.fn(async () => undefined),
    ...overrides,
  } as ToolCallMessagePartProps;
}

describe("AssistantUiInteraction", () => {
  it("uses the official ApprovalCard for canonical approval options and keeps ids opaque", () => {
    const respondToApproval = vi.fn(async () => undefined);
    render(
      <AssistantUiInteraction
        {...part({
          approval: {
            id: "approval-1",
            prompt: "Autoriser cette commande ?",
            options: [
              { id: "opaque-once", kind: "allow-once", label: "Une fois" },
              { id: "opaque-always", kind: "allow-always", label: "Toujours" },
              { id: "opaque-deny", kind: "reject-once", label: "Refuser" },
            ],
          },
          interrupt: undefined,
          respondToApproval,
        })}
      />,
    );

    expect(document.querySelector('[data-slot="approval-card"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(respondToApproval).toHaveBeenCalledWith({ optionId: "opaque-once" });
  });

  it("delegates custom approval options to native ToolFallback instead of inventing ids", () => {
    const respondToApproval = vi.fn(async () => undefined);
    render(
      <AssistantUiInteraction
        {...part({
          approval: {
            id: "approval-custom",
            prompt: "Choisir",
            options: [{ id: "opaque-choice", kind: "_atelier", label: "Choix" }],
          },
          respondToApproval,
        })}
      />,
    );

    expect(document.querySelector('[data-slot="approval-card"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="tool-fallback-approval"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choix" }));
    expect(respondToApproval).toHaveBeenCalledWith({
      optionId: "opaque-choice",
      approved: true,
    });
  });

  it("keeps a boolean approval on the native fallback instead of showing fake Always allow", () => {
    const respondToApproval = vi.fn(async () => undefined);
    render(
      <AssistantUiInteraction
        {...part({
          approval: { id: "approval-boolean", prompt: "Autoriser ?" },
          respondToApproval,
        })}
      />,
    );

    expect(document.querySelector('[data-slot="approval-card"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(respondToApproval).toHaveBeenCalledWith({ approved: true });
  });

  it("renders multi-field user input with secret and opaque option values, then resumes through the host seam", async () => {
    const resume = vi.fn();
    const event = {
      kind: "interaction" as const,
      requestId: "question-1",
      interactionType: "user_input" as const,
      title: "Paramètres",
      detail: "Choisis une région et donne le jeton.",
      fields: [
        {
          id: "region",
          question: "Région",
          options: [{ label: "Ouest", value: "opaque-west" }, { label: "Est", value: "opaque-east" }],
          allowOther: true,
        },
        { id: "token", question: "Jeton", secret: true },
      ],
      state: "pending" as const,
    };
    render(
      <AssistantUiInteraction
        {...part({
          toolCallId: "question-1",
          interrupt: { type: "human", payload: event },
          approval: undefined,
          resume,
        })}
      />,
    );

    expect(document.querySelector('[data-slot="elicitation-form"]')).toBeInTheDocument();
    const region = screen.getByRole("combobox", { name: "Région" });
    const token = screen.getByLabelText("Jeton");
    expect(token).toHaveAttribute("type", "password");
    fireEvent.click(region);
    const east = await screen.findByRole("option", { name: "Est" });
    fireEvent.pointerDown(east);
    fireEvent.pointerUp(east);
    fireEvent.click(east);
    fireEvent.change(token, { target: { value: "secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(resume).toHaveBeenCalledWith({
      requestId: "question-1",
      response: { answers: { region: "opaque-east", token: "secret-value" } },
    } satisfies AssistantUiInteractionResumePayload));
  });

  it("uses the MCP accept/decline wire shape and keeps the URL field native", () => {
    const resume = vi.fn();
    const event = {
      kind: "interaction" as const,
      requestId: "elicitation-1",
      interactionType: "mcp_elicitation" as const,
      title: "MCP needs a callback URL",
      urlDomain: "example.test",
      fields: [{ id: "callback", question: "Callback URL" }],
      state: "pending" as const,
    };
    render(
      <AssistantUiInteraction
        {...part({
          toolCallId: "elicitation-1",
          interrupt: { type: "human", payload: event },
          approval: undefined,
          resume,
        })}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Callback URL" });
    expect(input).toHaveAttribute("type", "url");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(resume).toHaveBeenCalledWith({
      requestId: "elicitation-1",
      response: { action: "decline" },
    } satisfies AssistantUiInteractionResumePayload);
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  it("blocks Send on a required field and announces the error before resuming", () => {
    const resume = vi.fn();
    const event = {
      kind: "interaction" as const,
      requestId: "required-1",
      interactionType: "user_input" as const,
      title: "Required input",
      fields: [{ id: "name", question: "Name", required: true }],
      state: "pending" as const,
    };
    render(
      <AssistantUiInteraction
        {...part({
          toolCallId: "required-1",
          interrupt: { type: "human", payload: event },
          approval: undefined,
          resume,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(resume).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("required");
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(resume).toHaveBeenCalledWith({
      requestId: "required-1",
      response: { answers: { name: "Ada" } },
    });
  });

  it("rejects malformed and stale resume envelopes when a pending event snapshot is supplied", () => {
    const pending = [{
      kind: "interaction" as const,
      requestId: "pending-1",
      interactionType: "user_input" as const,
      title: "Question",
      state: "pending" as const,
    }];
    expect(isAssistantUiInteractionResumePayload({
      requestId: "pending-1",
      response: { answers: { answer: "yes" } },
    }, pending)).toBe(true);
    expect(isAssistantUiInteractionResumePayload({
      requestId: "pending-1",
      response: { answers: { answer: 42 } },
    }, pending)).toBe(false);
    expect(isAssistantUiInteractionResumePayload({
      requestId: "pending-1",
      response: { answers: { answer: "yes" } },
    }, [
      ...pending,
      ...pending.map((event) => ({ ...event, state: "answered" as const })),
    ])).toBe(false);
    expect(isAssistantUiInteractionResumePayload({
      requestId: "pending-1",
      response: { answers: { answer: "yes" } },
    }, [
      ...pending,
      ...pending.map((event) => ({ ...event, state: "expired" as const })),
    ])).toBe(false);
  });
});
