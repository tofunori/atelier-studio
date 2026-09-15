import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { getResolvedLanguage } from "../../../lib/i18n";
import type { Consigne } from "../../../lib/consignes";
import { useComposerDictation } from "../../chat/useComposerDictation";

export type ConsigneRewriteMode =
  | "correct"
  | "clarify"
  | "shorten"
  | "structure"
  | "questions"
  | "custom";

/** Extraire le choix de l'éditeur dans un message de transport stable. */
export type RewriteRequest = {
  mode: ConsigneRewriteMode;
  language?: "fr" | "en";
  custom?: string;
  questions?: string;
  answers?: string;
};

export type ConsigneRewriteRequest = RewriteRequest;

type Rewrite = (consigne: Consigne, request?: RewriteRequest) => Promise<string | null>;

type RequestState = {
  token: number;
  id: string;
  text: string;
  mode: ConsigneRewriteMode;
};

type TextMarker = { id: string; text: string } | null;

type AssistantOptions = {
  selected: Consigne | null;
  onText: (text: string) => void;
  reformuler: Rewrite | null | undefined;
};

function languageForRequest(): "fr" | "en" {
  return getResolvedLanguage() === "fr" ? "fr" : "en";
}

/**
 * Assistance de rédaction non destructive pour l'éditeur de consignes.
 *
 * Les résultats d'un provider restent une proposition tant que `apply` n'a
 * pas été appelé. Le compteur de génération et le marqueur de texte rendent
 * les callbacks tardifs inoffensifs quand la sélection, le texte ou l'action
 * changent pendant une requête.
 */
export function useConsigneAssistant({
  selected,
  onText,
  reformuler,
}: AssistantOptions): {
  taRef: MutableRefObject<HTMLTextAreaElement | null>;
  dictation: ReturnType<typeof useComposerDictation>;
  mode: ConsigneRewriteMode;
  setMode: Dispatch<SetStateAction<ConsigneRewriteMode>>;
  custom: string;
  setCustom: Dispatch<SetStateAction<string>>;
  answers: string;
  setAnswers: Dispatch<SetStateAction<string>>;
  questions: string | null;
  proposal: string | null;
  original: string | null;
  busy: boolean;
  error: string | null;
  run: () => void;
  apply: () => void;
  retry: () => void;
  cancel: () => void;
  restore: () => void;
  editText: (text: string) => void;
} {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedRef = useRef<Consigne | null>(selected);
  selectedRef.current = selected;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const reformulerRef = useRef<Rewrite | null | undefined>(reformuler);
  reformulerRef.current = reformuler;

  const selectedId = selected?.id ?? null;
  const selectedText = selected?.texte ?? "";
  const scopeRef = useRef<{ id: string | null; text: string }>({
    id: selectedId,
    text: selectedText,
  });
  const draftRef = useRef(selectedText);
  const ownTextRef = useRef<TextMarker>(null);
  const generationRef = useRef(0);
  const requestRef = useRef<RequestState | null>(null);
  const busyRef = useRef(false);
  const modeRef = useRef<ConsigneRewriteMode>("clarify");
  const customRef = useRef("");
  const answersRef = useRef("");
  const questionsRef = useRef<string | null>(null);
  const originalRef = useRef<string | null>(null);
  const proposalRef = useRef<string | null>(null);
  const proposalSourceRef = useRef<TextMarker>(null);
  const questionSourceRef = useRef<TextMarker>(null);
  const appliedTextRef = useRef<TextMarker>(null);

  const [modeState, setModeState] = useState<ConsigneRewriteMode>("clarify");
  const [customState, setCustomState] = useState("");
  const [answersState, setAnswersState] = useState("");
  const [questionsState, setQuestionsState] = useState<string | null>(null);
  const [proposalState, setProposalState] = useState<string | null>(null);
  const [originalState, setOriginalState] = useState<string | null>(null);
  const [busy, setBusyState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  modeRef.current = modeState;
  customRef.current = customState;
  answersRef.current = answersState;
  questionsRef.current = questionsState;
  proposalRef.current = proposalState;
  originalRef.current = originalState;

  /** Invalide les appels en vol et efface les éléments de revue. */
  const invalidate = useCallback((clearQuestions = true) => {
    generationRef.current += 1;
    requestRef.current = null;
    busyRef.current = false;
    setBusyState(false);
    setError(null);
    setProposalState(null);
    proposalSourceRef.current = null;
    if (clearQuestions) {
      setQuestionsState(null);
      questionsRef.current = null;
      questionSourceRef.current = null;
      setAnswersState("");
      answersRef.current = "";
    }
    setOriginalState(null);
    originalRef.current = null;
  }, []);

  /** Écrit une valeur dans l'éditeur et compose les mises à jour dictées. */
  const writeText = useCallback((next: string | ((value: string) => string)) => {
    const current = selectedRef.current;
    if (!current) return;
    const previous = draftRef.current;
    const value = typeof next === "function" ? next(previous) : next;
    if (value === previous) return;
    draftRef.current = value;
    ownTextRef.current = { id: current.id, text: value };
    invalidate();
    onTextRef.current(value);
  }, [invalidate]);

  const editText = useCallback((text: string) => {
    writeText(text);
  }, [writeText]);

  const setMode = useCallback<Dispatch<SetStateAction<ConsigneRewriteMode>>>((next) => {
    const value = typeof next === "function" ? next(modeRef.current) : next;
    if (value === modeRef.current) return;
    modeRef.current = value;
    invalidate();
    setModeState(value);
  }, [invalidate]);

  const setCustom = useCallback<Dispatch<SetStateAction<string>>>((next) => {
    const value = typeof next === "function" ? next(customRef.current) : next;
    if (value === customRef.current) return;
    customRef.current = value;
    // Keep a pending question list only when the user is still answering it;
    // custom is normally hidden in that mode, but preserving the list avoids
    // losing a question flow because of a parent rerender.
    invalidate(modeRef.current !== "questions");
    setCustomState(value);
  }, [invalidate]);

  const setAnswers = useCallback<Dispatch<SetStateAction<string>>>((next) => {
    const value = typeof next === "function" ? next(answersRef.current) : next;
    if (value === answersRef.current) return;
    answersRef.current = value;
    generationRef.current += 1;
    requestRef.current = null;
    busyRef.current = false;
    setBusyState(false);
    setError(null);
    setProposalState(null);
    proposalSourceRef.current = null;
    setAnswersState(value);
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    requestRef.current = null;
    busyRef.current = false;
    setBusyState(false);
    setError(null);
    setProposalState(null);
    proposalSourceRef.current = null;
    setQuestionsState(null);
    questionsRef.current = null;
    questionSourceRef.current = null;
    setAnswersState("");
    answersRef.current = "";
    // A previously applied proposal may still be restorable after cancelling
    // a new preview; an un-applied preview has no original to retain.
  }, []);

  const apply = useCallback(() => {
    const current = selectedRef.current;
    const proposal = proposalRef.current;
    const source = proposalSourceRef.current;
    if (!current || proposal == null || !source
      || current.id !== source.id || current.texte !== source.text) return;
    generationRef.current += 1;
    requestRef.current = null;
    busyRef.current = false;
    ownTextRef.current = { id: current.id, text: proposal };
    draftRef.current = proposal;
    onTextRef.current(proposal);
    appliedTextRef.current = { id: current.id, text: proposal };
    setBusyState(false);
    setError(null);
    setProposalState(null);
    proposalRef.current = null;
    proposalSourceRef.current = null;
    setQuestionsState(null);
    questionsRef.current = null;
    questionSourceRef.current = null;
    setAnswersState("");
    answersRef.current = "";
    setOriginalState(source.text);
    originalRef.current = source.text;
  }, []);

  const restore = useCallback(() => {
    const current = selectedRef.current;
    const original = originalRef.current;
    const applied = appliedTextRef.current;
    if (!current || original == null || !applied
      || current.id !== applied.id
      || current.texte !== applied.text) return;
    generationRef.current += 1;
    requestRef.current = null;
    busyRef.current = false;
    draftRef.current = original;
    ownTextRef.current = { id: current.id, text: original };
    onTextRef.current(original);
    appliedTextRef.current = null;
    setBusyState(false);
    setError(null);
    setProposalState(null);
    proposalRef.current = null;
    proposalSourceRef.current = null;
    setQuestionsState(null);
    questionsRef.current = null;
    questionSourceRef.current = null;
    setAnswersState("");
    answersRef.current = "";
    setOriginalState(null);
    originalRef.current = null;
  }, []);

  const run = useCallback(() => {
    const current = selectedRef.current;
    const fn = reformulerRef.current;
    const currentMode = modeRef.current;
    if (!current || !fn || busyRef.current) return;
    const custom = customRef.current.trim();
    const pendingQuestions = questionsRef.current;
    const followup = currentMode === "questions" && pendingQuestions !== null;
    const answers = answersRef.current.trim();
    if (currentMode === "custom" && !custom) {
      setError("custom-empty");
      return;
    }
    if (followup && !answers) {
      setError("answers-empty");
      return;
    }

    const source: TextMarker = followup
      ? questionSourceRef.current
      : { id: current.id, text: current.texte };
    if (!source || source.id !== current.id) return;
    if (currentMode === "questions" && !followup) {
      questionSourceRef.current = source;
    }
    const request: RewriteRequest = {
      mode: currentMode,
      language: languageForRequest(),
      ...(currentMode === "custom" && custom ? { custom } : {}),
      ...(followup && pendingQuestions ? { questions: pendingQuestions, answers } : {}),
    };
    const token = generationRef.current + 1;
    generationRef.current = token;
    const requestState: RequestState = {
      token,
      id: source.id,
      text: source.text,
      mode: currentMode,
    };
    requestRef.current = requestState;
    busyRef.current = true;
    setBusyState(true);
    setError(null);

    void (async () => {
      try {
        const response = await fn(current, request);
        const live = requestRef.current;
        const latest = selectedRef.current;
        if (!live || live.token !== token || generationRef.current !== token
          || !latest || latest.id !== source.id || latest.texte !== source.text
          || modeRef.current !== currentMode) return;
        const text = response?.trim() ?? "";
        if (!text) {
          setError("empty-response");
          return;
        }
        if (currentMode === "questions" && !followup) {
          setQuestionsState(text);
          questionsRef.current = text;
          setAnswersState("");
          answersRef.current = "";
          setProposalState(null);
          proposalRef.current = null;
          proposalSourceRef.current = null;
        } else {
          setProposalState(text);
          proposalRef.current = text;
          proposalSourceRef.current = source;
          // Keep the question context behind the proposal. It is hidden by
          // the UI while `proposal !== null`, and lets Retry regenerate the
          // final draft with the same answers instead of asking questions a
          // second time.
          if (!followup) {
            setQuestionsState(null);
            questionsRef.current = null;
            questionSourceRef.current = null;
          }
        }
      } catch {
        const live = requestRef.current;
        const latest = selectedRef.current;
        if (live?.token === token && generationRef.current === token
          && latest?.id === source.id && latest.texte === source.text
          && modeRef.current === currentMode) {
          setError("request-failed");
        }
      } finally {
        const live = requestRef.current;
        if (live?.token === token && generationRef.current === token) {
          busyRef.current = false;
          setBusyState(false);
        }
      }
    })();
  }, []);

  const retry = useCallback(() => {
    if (proposalRef.current == null) return;
    run();
  }, [run]);

  // A direct parent edit or a selection change invalidates every pending
  // result. Writes made through this hook carry an own-text marker so the
  // apply/restore callback can update the controlled textarea safely.
  useLayoutEffect(() => {
    const previous = scopeRef.current;
    scopeRef.current = { id: selectedId, text: selectedText };
    if (previous.id !== selectedId) {
      draftRef.current = selectedText;
      ownTextRef.current = null;
      appliedTextRef.current = null;
      invalidate();
      modeRef.current = "clarify";
      setModeState("clarify");
      setCustomState("");
      customRef.current = "";
      return;
    }
    if (previous.text === selectedText) return;
    const own = ownTextRef.current;
    if (own?.id === selectedId && own.text === selectedText) {
      ownTextRef.current = null;
      draftRef.current = selectedText;
      return;
    }
    draftRef.current = selectedText;
    ownTextRef.current = null;
    appliedTextRef.current = null;
    invalidate();
  }, [invalidate, selectedId, selectedText]);

  useEffect(() => () => {
    generationRef.current += 1;
    requestRef.current = null;
    busyRef.current = false;
  }, []);

  const dictation = useComposerDictation({
    text: selectedText,
    setText: writeText,
    taRef,
    scopeKey: selectedId ?? "consigne-none",
    disabled: selected == null || busy,
  });

  return {
    taRef,
    dictation,
    mode: modeState,
    setMode,
    custom: customState,
    setCustom,
    answers: answersState,
    setAnswers,
    questions: questionsState,
    proposal: proposalState,
    original: originalState,
    busy,
    error,
    run,
    apply,
    retry,
    cancel,
    restore,
    editText,
  };
}
