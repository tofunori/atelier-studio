import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { AgentEvent } from "../lib/ws";
import type { QueuedTurn } from "../lib/chatDraftStore";
import AssistantUiChat, { type AssistantUiChatProps } from "./AssistantUiChat";
import { renderUi, resetTestState } from "../test/render";
import { t } from "../lib/i18n";

vi.mock("../lib/dictation", () => ({ supportsDictation: () => false }));
vi.mock("../lib/chat/assistantUiDictation", () => ({ atelierDictationAdapter: undefined }));
vi.mock("./chat/WidgetFrame", () => ({
  WidgetFrame: ({
    event,
    threadId,
  }: {
    event: { id: string; title: string; height: number };
    threadId: string | null;
  }) => (
    <div data-testid="host-widget-frame" data-widget-id={event.id} data-thread-id={threadId ?? ""}>
      {event.title}
    </div>
  ),
}));

function props(overrides: Partial<AssistantUiChatProps> = {}): AssistantUiChatProps {
  return {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: "one",
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [], defaults: { defaultProvider: "codex", defaultModel: { codex: "test-model" }, defaultEffort: { codex: "high" }, defaultPermissionMode: "plan" },
    pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(), disabled: false, onSubmit: vi.fn(),
    ...overrides,
  };
}

beforeEach(resetTestState);
afterEach(cleanup);

describe("assistant-ui host bridge", () => {
  it("mounts the official conversation map and directs a tick to its message viewport", async () => {
    const p = props({ events: [
      { kind: "user", text: "Premier échange" }, { kind: "text", text: "Première réponse" }, { kind: "done", ok: true, result: "" },
      { kind: "user", text: "Deuxième échange" }, { kind: "text", text: "Deuxième réponse" }, { kind: "done", ok: true, result: "" },
    ] });
    const { container } = renderUi(<AssistantUiChat {...p} />);
    const viewport = container.querySelector('[data-slot="aui_thread-viewport"]') as HTMLElement;
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo;
    expect(container.querySelectorAll('[data-slot="conversation-map-tick"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Premier échange" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: expect.any(Number), behavior: "smooth" });
  });

  it("anchors the thread at the bottom like the legacy chat (no top-anchor reserve under the last turn)", async () => {
    const p = props({ events: [
      // Tour en cours (pas de `done`) : c'est là qu'assistant-ui active
      // l'ancrage en haut (getActiveTopAnchorTurn exige isRunning).
      { kind: "user", text: "Question" }, { kind: "text", text: "Réponse en cours" },
    ], workingSince: Date.now() });
    const { container } = renderUi(<AssistantUiChat {...p} />);
    const viewport = container.querySelector('[data-slot="aui_thread-viewport"]') as HTMLElement;
    expect(viewport).not.toBeNull();
    // turnAnchor="top" fait insérer par assistant-ui un espaceur de la hauteur
    // du viewport sous le dernier tour (mountTopAnchorReserve) : le fil finit
    // au tiers de l'écran, un grand vide le sépare du composeur et le suivi
    // automatique du streaming est désactivé. Atelier suit le bas du fil.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(container.querySelector("[data-aui-top-anchor-reserve]")).toBeNull();
    expect(container.querySelector("[data-aui-top-anchor-user], [data-aui-top-anchor-target]")).toBeNull();
  });

  it("renders signal-only thinking through native reasoning without a duplicate loading dot or sentinel", async () => {
    const p = props({ events: [{ kind: "user", text: "Question" },
      { kind: "tool", name: "__thinking" }, { kind: "thinking_progress", count: 3 }], workingSince: 1 });
    const { container, rerender } = renderUi(<AssistantUiChat {...p} />);
    await waitFor(() => expect(container.querySelectorAll('[data-slot="reasoning-root"]')).toHaveLength(1));
    expect(container.textContent).not.toContain("__thinking");
    expect(container.querySelector('[data-slot="aui_assistant-message-indicator"]')).toBeNull();
    expect(container.querySelector('[data-slot="reasoning-trigger-label"]')?.className).toContain("shimmer");
    rerender(<AssistantUiChat {...p} events={[...p.events, { kind: "text", text: "Réponse finale" }, { kind: "done", ok: true, result: "" }]} workingSince={null} />);
    await waitFor(() => expect(screen.getByText("Réponse finale")).toBeInTheDocument());
    expect(container.querySelector('[data-slot="reasoning-root"]')).toBeNull();
  });

  it("keeps the project home out of a selected empty conversation", async () => {
    const home = { model: { state: "no-project" as const }, actions: {
      onNewChat: vi.fn(), onOpenProject: vi.fn(), onResume: vi.fn(), onOpenArtefact: vi.fn(),
      onOpenGallery: vi.fn(), onOpenPalette: vi.fn(), onResumeSession: vi.fn(),
    } };
    const p = props({ home });
    const { rerender } = renderUi(<AssistantUiChat {...p} />);
    expect(screen.queryByRole("heading", { name: t("home.no-project-title") })).toBeNull();
    rerender(<AssistantUiChat {...p} threadId={null} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: t("home.no-project-title") })).toBeInTheDocument());
  });
  it("prefills widget suggestions only in their source thread without sending", () => {
    const p = props({ draftText: "Mon brouillon" });
    renderUi(<AssistantUiChat {...p} />);
    fireEvent(window, new CustomEvent("chat-compose-append", { detail: { threadId: "other", text: "Autre fil" } }));
    expect((screen.getByLabelText("Message input") as HTMLTextAreaElement).value).toBe("Mon brouillon");
    fireEvent(window, new CustomEvent("chat-compose-append", { detail: { threadId: "one", text: "Suggestion du widget" } }));
    expect((screen.getByLabelText("Message input") as HTMLTextAreaElement).value).toBe("Mon brouillon\nSuggestion du widget");
    expect(p.onSubmit).not.toHaveBeenCalled();
  });
  it("passes the host thread id to the official data widget bridge", async () => {
    const p = props({
      events: [{ kind: "widget", id: "widget-7", title: "Preview", height: 240 } as AgentEvent],
      threadId: "thread-9",
    });
    renderUi(<AssistantUiChat {...p} />);
    await waitFor(() => expect(screen.getByTestId("host-widget-frame")).toBeInTheDocument());
    expect(screen.getByTestId("host-widget-frame")).toHaveAttribute("data-widget-id", "widget-7");
    expect(screen.getByTestId("host-widget-frame")).toHaveAttribute("data-thread-id", "thread-9");
  });

  it("uses official composer to submit the saved model and only its attachment snapshot", async () => {
    const attachment = { name: "notes.tex", path: "/project/notes.tex", text: "native file context", lines: null, kind: "file" as const };
    const p = props({ attachments: [attachment] });
    renderUi(<AssistantUiChat {...p} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Document attachment" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Message input"), { target: { value: "Vérifie le texte" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(p.onSubmit).toHaveBeenCalledTimes(1));
    expect(p.onSubmit).toHaveBeenCalledWith("Vérifie le texte", "codex", "test-model", "high", "plan", "queue", false, [attachment]);
    expect(p.onPasteText).not.toHaveBeenCalled();
    expect(p.onPasteImage).not.toHaveBeenCalled();
  });

  it("removes a persisted attachment through the original draft callback", async () => {
    const p = props({ attachments: [{ name: "notes.tex", path: "/project/notes.tex", text: "context", lines: null, kind: "file" }] });
    renderUi(<AssistantUiChat {...p} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove file" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
    await waitFor(() => expect(p.onRemoveAttachment).toHaveBeenCalledWith(0));
  });

  it("reconciles externally removed attachments without leaving stale chips", async () => {
    const first = { name: "First", text: "first quote", lines: null, kind: "quote" as const };
    const second = { name: "Second", text: "second quote", lines: null, kind: "quote" as const };
    const p = props({ attachments: [first, second] });
    const view = renderUi(<AssistantUiChat {...p} />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Document attachment" })).toHaveLength(2));
    view.rerender(<AssistantUiChat {...p} attachments={[second]} />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Document attachment" })).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Message input"), { target: { value: "Lis ceci" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(p.onSubmit).toHaveBeenCalledWith("Lis ceci", "codex", "test-model", "high", "plan", "queue", false, [second]));
  });

  it("queues a follow-up during a run without stopping the active agent", async () => {
    const p = props({ workingSince: Date.now(), followUpMode: "queue" });
    renderUi(<AssistantUiChat {...p} />);
    fireEvent.change(screen.getByLabelText("Message input"), { target: { value: "Vérifie aussi la figure" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message de suivi" }));
    await waitFor(() => expect(p.onSubmit).toHaveBeenCalledTimes(1));
    expect(p.onSubmit).toHaveBeenCalledWith("Vérifie aussi la figure", "codex", "test-model", "high", "plan", "queue", false, []);
    expect(p.onStop).not.toHaveBeenCalled();
  });

  it("does not echo stale composer text when a queued draft is restored", async () => {
    const onDraftTextChange = vi.fn();
    const queued = { id: "queued-1", prompt: "Relance restaurée" } as QueuedTurn;
    const initial = props({
      workingSince: Date.now(),
      draftText: "",
      queuedTurns: [queued],
      onDraftTextChange,
    });
    const view = renderUi(<AssistantUiChat {...initial} />);
    const input = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toBe(""));
    onDraftTextChange.mockClear();

    view.rerender(
      <AssistantUiChat
        {...initial}
        queuedTurns={[]}
        draftText={queued.prompt}
      />,
    );

    await waitFor(() => expect(input.value).toBe(queued.prompt));
    expect(onDraftTextChange).not.toHaveBeenCalledWith("");
  });

  it("keeps a pending approval tool group open until the host answers", async () => {
    const p = props({
      events: [
        { kind: "user", text: "Inspecte le dossier" },
        {
          kind: "permission", requestId: "approval-1", toolName: "exec_command",
          input: { command: "ls" }, answered: null,
        },
      ],
      workingSince: Date.now(),
    });
    renderUi(<AssistantUiChat {...p} />);
    const group = await waitFor(() => screen.getByRole("button", { name: "1 tool call" }));
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Allow" })).toBeVisible();
  });

  it("passes native gallery sends through the selected configuration", () => {
    const p = props();
    const view = renderUi(<AssistantUiChat {...p} />);
    const send = vi.fn();
    view.container.querySelector("form.aui-composer-root")!.dispatchEvent(
      new CustomEvent("atelier-submit-context", { detail: { send } }),
    );
    expect(send).toHaveBeenCalledWith("codex", "test-model", "high", "plan", "queue", false);
    expect(p.onSubmit).not.toHaveBeenCalled();
  });

  it("restores the new conversation's draft and removes the previous composer state", async () => {
    const p = props({ draftText: "Premier brouillon" });
    const view = renderUi(<AssistantUiChat {...p} />);
    await waitFor(() => expect((screen.getByLabelText("Message input") as HTMLTextAreaElement).value).toBe("Premier brouillon"));
    view.rerender(<AssistantUiChat {...p} threadId="two" draftText="Deuxième brouillon" />);
    await waitFor(() => expect((screen.getByLabelText("Message input") as HTMLTextAreaElement).value).toBe("Deuxième brouillon"));
    expect(screen.queryByText("Premier brouillon")).toBeNull();
    expect(p.onSubmit).not.toHaveBeenCalled();
  });
});
