import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { cancelDictation, dictationDraft, listenToDictation, startDictation, stopDictation, supportsDictation, type DictationEvent } from "../../lib/dictation";
import { getResolvedLanguage, t } from "../../lib/i18n";
import { showError } from "../ui/toast";

export type DictationPhase = "idle" | "starting" | "listening" | "finishing";
type Session = {
  id: string;
  scope: string;
  base: string;
  start: number;
  end: number;
  applied: string;
  unlisten?: () => void;
  completion?: Promise<string | null>;
  resolve?: (text: string | null) => void;
};

function errorMessage(code?: string | null) {
  if (code === "microphone-denied") return t("dictation.microphone-denied");
  if (code === "speech-denied") return t("dictation.speech-denied");
  if (code === "busy") return t("dictation.busy");
  if (code === "no-input") return t("dictation.no-input");
  if (code === "no-speech") return t("dictation.no-speech");
  if (code === "unavailable") return t("dictation.unavailable");
  return t("dictation.failed");
}

export function useComposerDictation(options: {
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  taRef: MutableRefObject<HTMLTextAreaElement | null>;
  scopeKey: string;
  disabled: boolean;
}) {
  const latest = useRef(options);
  latest.current = options;
  const session = useRef<Session | null>(null);
  const pendingCompletion = useRef<Session | null>(null);
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [levels, setLevels] = useState<number[]>(() => Array(48).fill(0));
  const phaseRef = useRef<DictationPhase>("idle");
  const available = supportsDictation();

  const changePhase = useCallback((value: DictationPhase) => {
    phaseRef.current = value;
    setPhase(value);
  }, []);

  const detach = useCallback((deferCompletion = false) => {
    const current = session.current;
    session.current = null;
    current?.unlisten?.();
    if (!deferCompletion) current?.resolve?.(null);
    return current;
  }, []);

  const cancel = useCallback(() => {
    pendingCompletion.current?.resolve?.(null);
    pendingCompletion.current = null;
    const current = detach();
    changePhase("idle");
    if (current) void cancelDictation(current.id).catch(() => {});
  }, [detach, changePhase]);

  const discard = useCallback(() => {
    const current = session.current;
    cancel();
    if (current) latest.current.setText(value => value === current.applied ? current.base : value);
    latest.current.taRef.current?.focus();
  }, [cancel]);

  useLayoutEffect(() => {
    changePhase("idle");
    // Permission dialogs may temporarily occlude the webview during startup.
    const onHidden = () => { if (document.hidden && phaseRef.current !== "starting") cancel(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      pendingCompletion.current?.resolve?.(null);
      pendingCompletion.current = null;
      const current = detach();
      if (current) void cancelDictation(current.id).catch(() => {});
    };
  }, [options.scopeKey, options.disabled, cancel, changePhase, detach]);

  useLayoutEffect(() => {
    const completed = pendingCompletion.current;
    if (!completed) return;
    pendingCompletion.current = null;
    // Settle only after React commits the guarded draft updater. External
    // additions may have won that update, including within the same batch.
    completed.resolve?.(!options.disabled && options.scopeKey === completed.scope
      && options.text === completed.applied ? options.text : null);
  });

  const start = useCallback(async () => {
    const input = latest.current;
    if (!supportsDictation() || input.disabled || session.current) return;
    const textarea = input.taRef.current;
    const current: Session = {
      id: crypto.randomUUID(), scope: input.scopeKey, base: input.text, applied: input.text,
      start: textarea?.selectionStart ?? input.text.length,
      end: textarea?.selectionEnd ?? input.text.length,
    };
    session.current = current;
    setLevels(Array(48).fill(0));
    changePhase("starting");
    const receive = (event: DictationEvent) => {
      if (session.current !== current || event.sessionId !== current.id
        || latest.current.scopeKey !== current.scope) return;
      if (event.status === "level") {
        const value = event.level ?? 0;
        if (Number.isFinite(value)) setLevels(previous => [...previous.slice(1), Math.max(0, Math.min(1, value))]);
        return;
      }
      if (event.text.trim() && (event.status === "result" || event.status === "stopped" || event.status === "error")) {
        const expected = current.applied;
        const next = dictationDraft(current.base, current.start, current.end, event.text);
        current.applied = next;
        // A concurrent manual/programmatic edit always wins. The updater stays
        // pure and composes correctly when several hypotheses share a batch.
        latest.current.setText(value => value === expected ? next : value);
      }
      if (event.status === "listening") changePhase("listening");
      else if (event.status === "finishing") changePhase("finishing");
      else if (event.status === "stopped" || event.status === "error") {
        const successful = event.status === "stopped" && !!current.resolve;
        if (successful) pendingCompletion.current = current;
        detach(successful);
        changePhase("idle");
        if (event.status === "error") void showError(errorMessage(event.error));
      }
    };
    try {
      const unlisten = await listenToDictation(receive);
      if (session.current !== current) { unlisten(); return; }
      current.unlisten = unlisten;
      const language = getResolvedLanguage();
      const locale = navigator.languages?.find(value => value.toLowerCase().startsWith(`${language}-`))
        ?? (language === "fr" ? "fr-CA" : "en-CA");
      await startDictation(current.id, locale);
      if (session.current !== current) {
        await cancelDictation(current.id);
        return;
      }
      textarea?.focus();
    } catch {
      if (session.current !== current) return;
      cancel();
      void showError(t("dictation.failed"));
    }
  }, [cancel, changePhase, detach]);

  const stop = useCallback(async () => {
    const current = session.current;
    if (!current) return;
    if (phaseRef.current === "starting") { cancel(); return; }
    if (phaseRef.current === "finishing") return;
    changePhase("finishing");
    try { await stopDictation(current.id); }
    catch {
      if (session.current !== current) return;
      cancel();
      void showError(t("dictation.failed"));
    }
  }, [cancel, changePhase]);

  const finish = useCallback((): Promise<string | null> => {
    const current = session.current;
    if (!current) return Promise.resolve(null);
    if (!current.completion) {
      current.completion = new Promise(resolve => { current.resolve = resolve; });
      void stop();
    }
    return current.completion;
  }, [stop]);

  return {
    available, phase, levels, active: phase !== "idle", cancel, discard, finish,
    stop: () => { void stop(); },
    toggle: () => { if (session.current) void stop(); else void start(); },
  };
}
