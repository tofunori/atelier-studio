import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type DictationEvent = {
  sessionId: string;
  status: "listening" | "level" | "result" | "finishing" | "stopped" | "error";
  text: string;
  error?: string | null;
  level?: number;
};

export function supportsDictation(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    && /Mac/i.test(navigator.platform);
}

export const listenToDictation = (receive: (event: DictationEvent) => void) =>
  listen<DictationEvent>("dictation", event => receive(event.payload));
export const startDictation = (sessionId: string, locale: string) =>
  invoke<void>("dictation_start", { sessionId, locale });
export const stopDictation = (sessionId: string) =>
  invoke<void>("dictation_stop", { sessionId });
export const cancelDictation = (sessionId: string) =>
  invoke<void>("dictation_cancel", { sessionId });

/** Recognition hypotheses replace only the selection captured at start. */
export function dictationDraft(base: string, start: number, end: number, transcript: string): string {
  if (!transcript) return base;
  const prefix = base.slice(0, start);
  const suffix = base.slice(end);
  const before = prefix && !/\s$/u.test(prefix) && !/^[,.;:!?)}\]]/u.test(transcript) ? " " : "";
  const after = suffix && !/^\s|^[,.;:!?)}\]]/u.test(suffix) ? " " : "";
  return `${prefix}${before}${transcript}${after}${suffix}`;
}
