import { StrictMode, useRef, useState } from "react";
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DictationEvent } from "../../lib/dictation";

const native = vi.hoisted(() => ({
  listeners: [] as Array<(event: DictationEvent) => void>,
  start: vi.fn(), stop: vi.fn(), cancel: vi.fn(), unlisten: vi.fn(),
  listen: vi.fn(), error: vi.fn(), supported: true,
}));
vi.mock("../../lib/dictation", async (original) => ({
  ...await original<typeof import("../../lib/dictation")>(),
  supportsDictation: () => native.supported,
  startDictation: native.start, stopDictation: native.stop, cancelDictation: native.cancel,
  listenToDictation: native.listen,
}));
vi.mock("../ui/toast", () => ({ showError: native.error }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { makeProviderInfo } from "../../test/fixtures";
import { dictationDraft } from "../../lib/dictation";
import { t } from "../../lib/i18n";
import { useComposerDictation } from "./useComposerDictation";

function props(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: "dictation-A",
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [], pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(),
    disabled: false, onSubmit: vi.fn(), threadProvider: "codex",
    defaults: { defaultProvider: "codex", defaultModel: { codex: "gpt-5.6-sol" },
      defaultEffort: { codex: "medium" }, defaultPermissionMode: "bypassPermissions" },
    providers: [makeProviderInfo({ id: "codex", label: "Codex", models: ["gpt-5.6-sol"], defaultModel: "gpt-5.6-sol" })],
    ...over,
  };
}
const input = () => document.querySelector(".composer textarea") as HTMLTextAreaElement;
const mic = () => screen.getByRole("button", { name: t("dictation.start") });
function emit(status: DictationEvent["status"], text = "", error?: string) {
  const sessionId = native.start.mock.calls.slice(-1)[0]![0] as string;
  act(() => native.listeners.slice(-1)[0]!({ sessionId, status, text, error }));
}
async function start() {
  fireEvent.click(mic());
  await waitFor(() => expect(native.start).toHaveBeenCalledTimes(1));
  emit("listening");
}

beforeEach(() => {
  resetTestState();
  vi.clearAllMocks();
  native.listeners = [];
  native.supported = true;
  native.start.mockResolvedValue(undefined);
  native.stop.mockResolvedValue(undefined);
  native.cancel.mockResolvedValue(undefined);
  native.listen.mockImplementation(async (receive) => {
    native.listeners.push(receive);
    return native.unlisten;
  });
});
afterEach(cleanup);

describe("composer dictation", () => {
  it("streams revised hypotheses into the draft and sends only after explicit Enter", async () => {
    const onSubmit = vi.fn();
    renderUi(<StrictMode><Chat {...props({ onSubmit })} /></StrictMode>);
    fireEvent.change(input(), { target: { value: "Analyse" } });
    input().setSelectionRange(7, 7);
    await start();
    act(() => {
      const sessionId = native.start.mock.calls[0][0] as string;
      native.listeners[0]({ sessionId, status: "result", text: "le glacier" });
      native.listeners[0]({ sessionId, status: "result", text: "les glaciers." });
    });
    expect(input().value).toBe("Analyse les glaciers.");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("dictation.stop") }));
    await waitFor(() => expect(native.stop).toHaveBeenCalledOnce());
    emit("stopped", "les glaciers.");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toBe("Analyse les glaciers.");
    expect(input().value).toBe("");
    emit("result", "résultat tardif");
    expect(input().value).toBe("");
  });

  it("keeps a manual correction and cancels recording before later results", async () => {
    renderUi(<Chat {...props()} />);
    await start();
    emit("result", "Péto");
    fireEvent.change(input(), { target: { value: "Peyto" } });
    expect(native.cancel).toHaveBeenCalledOnce();
    emit("result", "Péto et Hague");
    expect(input().value).toBe("Peyto");
    expect(mic()).toBeTruthy();
  });

  it("cancels on chat switch and rejects results from the previous chat", async () => {
    function Harness({ thread }: { thread: string }) {
      const [drafts, setDrafts] = useState<Record<string, string>>({});
      return <Chat {...props({ threadId: thread, draftText: drafts[thread] ?? "",
        onDraftTextChange: next => setDrafts(previous => ({ ...previous,
          [thread]: typeof next === "function" ? next(previous[thread] ?? "") : next,
        })),
      })} />;
    }
    const view = renderUi(<Harness thread="A" />);
    await start();
    emit("result", "Brouillon A");
    view.rerender(<Harness thread="B" />);
    expect(native.cancel).toHaveBeenCalledOnce();
    emit("result", "A ne doit pas apparaître dans B");
    expect(input().value).toBe("");
    view.rerender(<Harness thread="A" />);
    expect(input().value).toBe("Brouillon A");
  });

  it("Escape stops dictation without interrupting the agent", async () => {
    const onStop = vi.fn();
    renderUi(<Chat {...props({ workingSince: Date.now(), onStop })} />);
    await start();
    emit("result", "Une précision");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(native.stop).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();
    emit("stopped", "Une précision.");
    expect(input().value).toBe("Une précision.");
  });

  it("permission refusal restores the button and preserves the existing selection", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...props({ onSubmit })} />);
    fireEvent.change(input(), { target: { value: "Texte déjà écrit" } });
    input().setSelectionRange(0, 5);
    fireEvent.click(mic());
    await waitFor(() => expect(native.start).toHaveBeenCalledOnce());
    emit("error", "", "microphone-denied");
    expect(input().value).toBe("Texte déjà écrit");
    expect(native.error).toHaveBeenCalledWith(t("dictation.microphone-denied"));
    expect(mic()).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("retains the last transcript when native recognition fails", async () => {
    renderUi(<Chat {...props()} />);
    await start();
    emit("result", "Conserver ces mots");
    emit("error", "Conserver ces mots", "recognition-failed");
    expect(input().value).toBe("Conserver ces mots");
    expect(mic()).toBeTruthy();
  });

  it("does not offer the native microphone outside supported desktop hosts", () => {
    native.supported = false;
    renderUi(<Chat {...props()} />);
    expect(screen.queryByRole("button", { name: t("dictation.start") })).toBeNull();
  });

  it("does not start capture if unmounted while the event listener is registering", async () => {
    let resolve!: (unlisten: () => void) => void;
    native.listen.mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = renderHook(() => {
      const [text, setText] = useState("");
      const taRef = useRef<HTMLTextAreaElement | null>(null);
      return useComposerDictation({ text, setText, taRef, scopeKey: "A", disabled: false });
    });
    act(() => hook.result.current.toggle());
    hook.unmount();
    await act(async () => { resolve(native.unlisten); });
    expect(native.start).not.toHaveBeenCalled();
    expect(native.unlisten).toHaveBeenCalledOnce();
  });

  it("replaces the selected words while retaining punctuation and the suffix", () => {
    expect(dictationDraft("Analyse ancien, puis compare.", 8, 14, "Peyto"))
      .toBe("Analyse Peyto, puis compare.");
    expect(dictationDraft("Peyto Haig", 5, 5, "et"))
      .toBe("Peyto et Haig");
    expect(dictationDraft("Garder la sélection", 0, 6, ""))
      .toBe("Garder la sélection");
  });

  it("shows measured audio and discards only the dictated part with Cancel", async () => {
    renderUi(<Chat {...props()} />);
    fireEvent.change(input(), { target: { value: "Conserver" } });
    input().setSelectionRange(9, 9);
    await start();
    expect(document.querySelectorAll('.dictation-waveform span')).toHaveLength(48);
    act(() => native.listeners[0]({sessionId: native.start.mock.calls[0][0], status: 'level', text: '', level: .8}));
    const bars = document.querySelectorAll<HTMLElement>('.dictation-waveform span');
    expect(parseFloat(bars[47].style.height)).toBeGreaterThan(8);
    expect(parseFloat(bars[47].style.height)).toBeLessThanOrEqual(14);
    expect(bars[0].style.height).toBe('1.5px');
    emit('result', 'la suite');
    fireEvent.click(screen.getByRole('button', {name: t('dictation.cancel')}));
    expect(input().value).toBe('Conserver');
    expect(native.cancel).toHaveBeenCalledOnce();
    emit('result', 'résultat tardif');
    expect(input().value).toBe('Conserver');
  });

  it("waits for final words before sending and ignores repeated Enter", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...props({onSubmit})} />);
    await start();
    emit('result', 'Compare');
    fireEvent.keyDown(input(), {key:'Enter'});
    fireEvent.keyDown(input(), {key:'Enter'});
    expect(native.stop).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    emit('stopped', 'Compare Peyto et Haig.');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toBe('Compare Peyto et Haig.');
  });

  it("never sends a failed or discarded dictation", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...props({onSubmit})} />);
    await start();
    emit('result', 'À conserver');
    fireEvent.keyDown(input(), {key:'Enter'});
    emit('error', 'À conserver', 'no-speech');
    await act(async () => {});
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input().value).toBe('À conserver');
    expect(native.error).toHaveBeenCalledWith(t('dictation.no-speech'));
  });

  it("retains recognized words when the final recognition result is empty", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...props({ onSubmit })} />);
    await start();
    emit('result', 'Le glacier reçoit de la neige.');
    fireEvent.keyDown(input(), { key: 'Enter' });
    emit('stopped', '');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toBe('Le glacier reçoit de la neige.');
  });

  it.each([false, true])("preserves an external addition while Send waits for final words (batched=%s)", async (batched) => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...props({ onSubmit })} />);
    await start();
    emit('result', 'Compare');
    fireEvent.keyDown(input(), { key: 'Enter' });
    const append = () => window.dispatchEvent(new CustomEvent('chat-compose-append', {
      detail: { text: 'Ajouter le bilan annuel' },
    }));
    const final = () => native.listeners[0]({ sessionId: native.start.mock.calls[0][0],
      status: 'stopped', text: 'Compare Peyto et Haig.' });
    if (batched) act(() => { append(); final(); });
    else { act(append); act(final); }
    await act(async () => {});
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input().value).toBe('Compare\nAjouter le bilan annuel');
  });

  it("invalidates a pending dictation send when switching chats", async () => {
    const onSubmit = vi.fn();
    function Harness({ thread }: { thread: string }) {
      const [drafts, setDrafts] = useState<Record<string, string>>({});
      return <Chat {...props({ threadId: thread, onSubmit, draftText: drafts[thread] ?? '',
        onDraftTextChange: next => setDrafts(previous => ({ ...previous,
          [thread]: typeof next === 'function' ? next(previous[thread] ?? '') : next,
        })),
      })} />;
    }
    const view = renderUi(<Harness thread="A" />);
    await start(); emit('result', 'Brouillon A');
    fireEvent.keyDown(input(), {key:'Enter'});
    view.rerender(<Harness thread="B" />);
    emit('stopped', 'Brouillon A final');
    await act(async () => {});
    expect(input().value).toBe('');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
