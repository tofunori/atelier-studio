import type { DictationAdapter } from "@assistant-ui/react";

import {
  cancelDictation,
  listenToDictation,
  startDictation,
  stopDictation,
  type DictationEvent,
} from "../dictation";
import { getResolvedLanguage } from "../i18n";

export type AtelierDictationAdapterOptions = {
  /** Explicit locale for deterministic hosts/tests; otherwise use Atelier's language preference. */
  locale?: string;
  /** assistant-ui keeps the input editable while recognition is active by default. */
  disableInputDuringDictation?: boolean;
};

function resolveLocale(explicit?: string): string {
  if (explicit) return explicit;
  const language = getResolvedLanguage();
  const preferred = typeof navigator !== "undefined"
    ? navigator.languages?.find((value) => value.toLowerCase().startsWith(`${language}-`))
    : undefined;
  return preferred ?? (language === "fr" ? "fr-CA" : "en-CA");
}

/**
 * Adapt Atelier's session-scoped Tauri recognizer to assistant-ui's native
 * `DictationAdapter`. The adapter keeps the transport listener alive for the
 * session, exposes mutable status through the official getter, and translates
 * cumulative hypotheses into interim/final assistant-ui results.
 */
export function createAtelierDictationAdapter(
  options: AtelierDictationAdapterOptions = {},
): DictationAdapter {
  return {
    disableInputDuringDictation: options.disableInputDuringDictation ?? false,
    listen: () => createSession(resolveLocale(options.locale)),
  };
}

export const atelierDictationAdapter = createAtelierDictationAdapter();

function createSession(locale: string): DictationAdapter.Session {
  const sessionId = crypto.randomUUID();
  const speechStartCallbacks = new Set<() => void>();
  const speechEndCallbacks = new Set<(result: DictationAdapter.Result) => void>();
  const speechCallbacks = new Set<(result: DictationAdapter.Result) => void>();
  let status: DictationAdapter.Status = { type: "starting" };
  let unlisten: (() => void) | undefined;
  let disposed = false;
  let startPromise: Promise<void> | undefined;
  let stopPromise: Promise<void> | undefined;
  let latestTranscript = "";

  const session: DictationAdapter.Session = {
    get status() {
      return status;
    },

    stop: async () => {
      if (status.type === "ended") return;
      if (stopPromise) return stopPromise;
      stopPromise = stopDictation(sessionId)
        .then(() => {
          // The sidecar normally emits `stopped`; settle defensively when a
          // command acknowledgement arrives without that event (for example
          // while the webview is closing).
          if (status.type !== "ended") finish("stopped", latestTranscript);
        })
        .catch((error: unknown) => {
          if (status.type !== "ended") finish("error", latestTranscript);
          throw error;
        });
      return stopPromise;
    },

    cancel: () => {
      if (status.type === "ended") return;
      finish("cancelled");
      void cancelDictation(sessionId).catch(() => {});
    },

    onSpeechStart: (callback) => {
      speechStartCallbacks.add(callback);
      return () => speechStartCallbacks.delete(callback);
    },

    onSpeechEnd: (callback) => {
      speechEndCallbacks.add(callback);
      return () => speechEndCallbacks.delete(callback);
    },

    onSpeech: (callback) => {
      speechCallbacks.add(callback);
      return () => speechCallbacks.delete(callback);
    },
  };

  const emitSpeech = (transcript: string, isFinal: boolean) => {
    if (!transcript) return;
    latestTranscript = transcript;
    const result = { transcript, isFinal };
    for (const callback of [...speechCallbacks]) callback(result);
  };

  const emitSpeechEnd = (transcript: string) => {
    if (!transcript) return;
    const result = { transcript };
    for (const callback of [...speechEndCallbacks]) callback(result);
  };

  function finish(reason: "stopped" | "cancelled" | "error", transcript = "") {
    if (status.type === "ended") return;
    if (reason !== "cancelled" && transcript) emitSpeech(transcript, true);
    status = { type: "ended", reason };
    if (reason !== "cancelled") emitSpeechEnd(transcript);
    unlisten?.();
    unlisten = undefined;
    disposed = true;
  }

  const receive = (event: DictationEvent) => {
    if (disposed || event.sessionId !== sessionId) return;
    switch (event.status) {
      case "listening":
        status = { type: "running" };
        for (const callback of [...speechStartCallbacks]) callback();
        return;
      case "result":
        // Tauri sends a cumulative hypothesis; assistant-ui's composer owns
        // the final append, so expose intermediate hypotheses as interim.
        emitSpeech(event.text, false);
        return;
      case "stopped":
        finish("stopped", event.text || latestTranscript);
        return;
      case "error":
        finish("error", event.text || latestTranscript);
        return;
      case "finishing":
        return;
      case "level":
        // Audio levels are intentionally transport-only; assistant-ui's
        // official dictation contract has no waveform callback.
        return;
    }
  };

  startPromise = listenToDictation(receive)
    .then((stopListening) => {
      if (disposed) {
        stopListening();
        return;
      }
      unlisten = stopListening;
      return startDictation(sessionId, locale).then(() => {
        if (disposed) return cancelDictation(sessionId).then(() => undefined);
      });
    })
    .catch((error: unknown) => {
      if (!disposed) finish("error");
      throw error;
    });
  // Starting the sidecar is intentionally detached from `listen()`: the
  // official adapter contract is synchronous and status begins at `starting`.
  void startPromise.catch(() => {});

  return session;
}
