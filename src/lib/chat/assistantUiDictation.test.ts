import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DictationEvent } from "../dictation";

const native = vi.hoisted(() => ({
  listen: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  unlisten: vi.fn(),
  receive: null as ((event: DictationEvent) => void) | null,
}));

vi.mock("../dictation", () => ({
  listenToDictation: native.listen,
  startDictation: native.start,
  stopDictation: native.stop,
  cancelDictation: native.cancel,
}));
vi.mock("../i18n", () => ({ getResolvedLanguage: () => "fr" }));

import { createAtelierDictationAdapter } from "./assistantUiDictation";

function emit(event: Omit<DictationEvent, "sessionId">) {
  const sessionId = native.start.mock.calls[0]?.[0] as string;
  native.receive?.({ ...event, sessionId });
}

beforeEach(() => {
  vi.clearAllMocks();
  native.receive = null;
  native.start.mockResolvedValue(undefined);
  native.stop.mockResolvedValue(undefined);
  native.cancel.mockResolvedValue(undefined);
  native.listen.mockImplementation(async (receive: (event: DictationEvent) => void) => {
    native.receive = receive;
    return native.unlisten;
  });
});

afterEach(() => {
  native.receive = null;
});

describe("assistant-ui Atelier dictation adapter", () => {
  it("forwards cumulative hypotheses as interim text and the stopped result as final", async () => {
    const adapter = createAtelierDictationAdapter({ locale: "fr-CA" });
    const session = adapter.listen();
    const starts: number[] = [];
    const speech: Array<{ transcript: string; isFinal?: boolean }> = [];
    const ended: Array<{ transcript: string }> = [];
    session.onSpeechStart(() => starts.push(1));
    session.onSpeech((result) => speech.push(result));
    session.onSpeechEnd((result) => ended.push(result));

    expect(session.status).toEqual({ type: "starting" });
    await vi.waitFor(() => expect(native.start).toHaveBeenCalledWith(expect.any(String), "fr-CA"));
    emit({ status: "listening", text: "" });
    emit({ status: "result", text: "Peyto" });
    emit({ status: "result", text: "Peyto Haig" });
    expect(session.status).toEqual({ type: "running" });
    expect(starts).toHaveLength(1);
    expect(speech).toEqual([
      { transcript: "Peyto", isFinal: false },
      { transcript: "Peyto Haig", isFinal: false },
    ]);

    emit({ status: "stopped", text: "Peyto Haig" });
    expect(session.status).toEqual({ type: "ended", reason: "stopped" });
    expect(speech[speech.length - 1]).toEqual({ transcript: "Peyto Haig", isFinal: true });
    expect(ended).toEqual([{ transcript: "Peyto Haig" }]);
    expect(native.unlisten).toHaveBeenCalledOnce();
  });

  it("settles stop acknowledgements even if the sidecar omits its terminal event", async () => {
    const session = createAtelierDictationAdapter({ locale: "en-CA" }).listen();
    await vi.waitFor(() => expect(native.start).toHaveBeenCalled());
    await session.stop();
    expect(native.stop).toHaveBeenCalledWith(expect.any(String));
    expect(session.status).toEqual({ type: "ended", reason: "stopped" });
    expect(native.unlisten).toHaveBeenCalledOnce();
  });

  it("cancels without committing the latest interim hypothesis", async () => {
    const speech: Array<{ transcript: string; isFinal?: boolean }> = [];
    const session = createAtelierDictationAdapter({ locale: "fr-CA" }).listen();
    session.onSpeech((result) => speech.push(result));
    await vi.waitFor(() => expect(native.start).toHaveBeenCalled());
    emit({ status: "result", text: "à supprimer" });
    session.cancel();
    expect(session.status).toEqual({ type: "ended", reason: "cancelled" });
    expect(native.cancel).toHaveBeenCalledWith(expect.any(String));
    expect(speech).toEqual([{ transcript: "à supprimer", isFinal: false }]);
    emit({ status: "stopped", text: "à supprimer" });
    expect(speech).toHaveLength(1);
  });

  it("does not start a cancelled session when listener registration resolves late", async () => {
    let resolveListener!: (unsubscribe: () => void) => void;
    native.listen.mockImplementation(() => new Promise((resolve) => { resolveListener = resolve; }));
    const session = createAtelierDictationAdapter({ locale: "fr-CA" }).listen();
    session.cancel();
    resolveListener(native.unlisten);
    await Promise.resolve();
    expect(native.start).not.toHaveBeenCalled();
    expect(native.unlisten).toHaveBeenCalledOnce();
  });

  it("maps provider errors to the official ended/error status while preserving text", async () => {
    const speech: Array<{ transcript: string; isFinal?: boolean }> = [];
    const session = createAtelierDictationAdapter({ locale: "fr-CA" }).listen();
    session.onSpeech((result) => speech.push(result));
    await vi.waitFor(() => expect(native.start).toHaveBeenCalled());
    emit({ status: "error", text: "mot conservé", error: "recognition-failed" });
    expect(session.status).toEqual({ type: "ended", reason: "error" });
    expect(speech[speech.length - 1]).toEqual({ transcript: "mot conservé", isFinal: true });
  });
});
