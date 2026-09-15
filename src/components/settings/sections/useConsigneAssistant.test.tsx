import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Consigne } from "../../../lib/consignes";
import { setLanguage } from "../../../lib/i18n";
import {
  useConsigneAssistant,
  type ConsigneRewriteMode,
  type RewriteRequest,
} from "./useConsigneAssistant";

const native = vi.hoisted(() => ({
  options: null as { setText: (next: string | ((value: string) => string)) => void; disabled: boolean } | null,
  dictation: {
    available: true,
    phase: "idle" as const,
    levels: [] as number[],
    active: false,
    cancel: vi.fn(),
    discard: vi.fn(),
    finish: vi.fn(async () => null),
    stop: vi.fn(),
    toggle: vi.fn(),
  },
}));

vi.mock("../../chat/useComposerDictation", () => ({
  useComposerDictation: (options: typeof native.options) => {
    native.options = options;
    return native.dictation;
  },
}));

const selected: Consigne = {
  id: "c1",
  nom: "Ma règle",
  description: "Réponse précise",
  texte: "Réponds avec les données utiles.",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function props(over: Partial<Parameters<typeof useConsigneAssistant>[0]> = {}) {
  return {
    selected,
    onText: vi.fn(),
    reformuler: vi.fn(async () => "Proposition claire"),
    ...over,
  };
}

beforeEach(() => {
  setLanguage("fr");
  native.options = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("useConsigneAssistant", () => {
  it("construit l'action Clarifier sans écraser le texte, puis applique et rétablit explicitement", async () => {
    const rewrite = vi.fn<(c: Consigne, request?: RewriteRequest) => Promise<string | null>>(
      async () => "Proposition claire",
    );
    const onText = vi.fn();
    function Harness() {
      const [text, setText] = useState(selected.texte);
      return useConsigneAssistant({
        selected: { ...selected, texte: text },
        onText: next => { onText(next); setText(next); },
        reformuler: rewrite,
      });
    }
    const view = renderHook(() => Harness());

    act(() => view.result.current.run());
    await waitFor(() => expect(view.result.current.proposal).toBe("Proposition claire"));
    expect(rewrite).toHaveBeenCalledWith(
      selected,
      expect.objectContaining({ mode: "clarify", language: "fr" }),
    );
    expect(onText).not.toHaveBeenCalled();
    expect(view.result.current.original).toBeNull();

    act(() => view.result.current.apply());
    expect(onText).toHaveBeenCalledWith("Proposition claire");
    expect(view.result.current.proposal).toBeNull();
    expect(view.result.current.original).toBe(selected.texte);

    act(() => view.result.current.restore());
    expect(onText).toHaveBeenLastCalledWith(selected.texte);
    expect(view.result.current.original).toBeNull();
  });

  it.each([
    ["correct", undefined],
    ["clarify", undefined],
    ["shorten", undefined],
    ["structure", undefined],
    ["custom", "Garde le ton mais rends les critères mesurables"],
  ] as Array<[ConsigneRewriteMode, string | undefined]>)
    ("transmet le mode %s et son texte libre sans mutation locale", async (mode, custom) => {
      const rewrite = vi.fn<(c: Consigne, request?: RewriteRequest) => Promise<string | null>>(
        async () => "sortie",
      );
      const input = props({ reformuler: rewrite });
      const view = renderHook(() => useConsigneAssistant(input));
      act(() => view.result.current.setMode(mode));
      if (custom) act(() => view.result.current.setCustom(custom));
      act(() => view.result.current.run());
      await waitFor(() => expect(view.result.current.proposal).toBe("sortie"));
      const request = rewrite.mock.calls[0]?.[1] as RewriteRequest;
      expect(request.mode).toBe(mode);
      if (custom) expect(request.custom).toBe(custom);
      expect(rewrite.mock.calls[0]?.[0]).toEqual(selected);
      expect(input.onText).not.toHaveBeenCalled();
    });

  it("n'envoie pas un ajustement personnalisé conservé après le changement de mode", async () => {
    const rewrite = vi.fn<(c: Consigne, request?: RewriteRequest) => Promise<string | null>>(
      async () => "sortie",
    );
    const input = props({ reformuler: rewrite });
    const view = renderHook(() => useConsigneAssistant(input));
    act(() => view.result.current.setMode("custom"));
    act(() => view.result.current.setCustom("Ajoute une contrainte"));
    act(() => view.result.current.setMode("correct"));
    act(() => view.result.current.run());
    await waitFor(() => expect(view.result.current.proposal).toBe("sortie"));
    expect(rewrite.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ mode: "correct" }));
    expect((rewrite.mock.calls[0]?.[1] as RewriteRequest).custom).toBeUndefined();
  });

  it("insère les résultats de dictée par mise à jour fonctionnelle", () => {
    const input = props();
    renderHook(() => useConsigneAssistant(input));
    expect(native.options?.disabled).toBe(false);
    act(() => native.options?.setText(value => `${value}\nAjoute les sources.`));
    expect(input.onText).toHaveBeenCalledWith(`${selected.texte}\nAjoute les sources.`);
  });

  it("ignore une proposition arrivée après une modification manuelle", async () => {
    const pending = deferred<string | null>();
    const input = props({ reformuler: vi.fn(() => pending.promise) });
    const view = renderHook(() => useConsigneAssistant(input));
    act(() => view.result.current.run());
    expect(view.result.current.busy).toBe(true);
    act(() => view.result.current.editText("Texte modifié"));
    pending.resolve("réponse obsolète");
    await act(async () => { await pending.promise; });
    expect(view.result.current.proposal).toBeNull();
    expect(view.result.current.busy).toBe(false);
    expect(input.onText).toHaveBeenCalledWith("Texte modifié");
  });

  it("ignore une réponse en vol après un changement de sélection", async () => {
    const pending = deferred<string | null>();
    const input = props({ reformuler: vi.fn(() => pending.promise) });
    const view = renderHook(
      ({ current }: { current: Consigne }) => useConsigneAssistant({ ...input, selected: current }),
      { initialProps: { current: selected } },
    );
    act(() => view.result.current.run());
    const other = { ...selected, id: "c2", nom: "Autre", texte: "Autre texte" };
    view.rerender({ current: other });
    pending.resolve("réponse de la première sélection");
    await act(async () => { await pending.promise; });
    expect(view.result.current.proposal).toBeNull();
    expect(view.result.current.busy).toBe(false);
  });

  it("invalide l'aperçu lorsqu'une édition contrôlée arrive du parent", async () => {
    const rewrite = vi.fn<(c: Consigne, request?: RewriteRequest) => Promise<string | null>>(
      async () => "Proposition",
    );
    const onText = vi.fn();
    const view = renderHook(
      ({ current }: { current: Consigne }) => useConsigneAssistant({
        selected: current,
        onText,
        reformuler: rewrite,
      }),
      { initialProps: { current: selected } },
    );
    act(() => view.result.current.run());
    await waitFor(() => expect(view.result.current.proposal).toBe("Proposition"));
    const edited = { ...selected, texte: "Modification externe" };
    view.rerender({ current: edited });
    expect(view.result.current.proposal).toBeNull();
    act(() => view.result.current.apply());
    expect(onText).not.toHaveBeenCalledWith("Proposition");
  });

  it("pose des questions, réutilise les réponses et permet de réessayer la proposition", async () => {
    const rewrite = vi.fn<(c: Consigne, request?: RewriteRequest) => Promise<string | null>>()
      .mockResolvedValueOnce("1. Quels critères faut-il vérifier ?")
      .mockResolvedValueOnce("Vérifie les critères définis.")
      .mockResolvedValueOnce("Vérifie chaque critère défini.");
    const input = props({ reformuler: rewrite });
    const view = renderHook(() => useConsigneAssistant(input));
    act(() => view.result.current.setMode("questions"));
    act(() => view.result.current.run());
    await waitFor(() => expect(view.result.current.questions).toContain("Quels critères"));
    expect(view.result.current.proposal).toBeNull();

    act(() => view.result.current.setAnswers("Les critères sont la couverture et la date."));
    act(() => view.result.current.run());
    await waitFor(() => expect(view.result.current.proposal).toBe("Vérifie les critères définis."));
    expect(rewrite.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      mode: "questions",
      questions: "1. Quels critères faut-il vérifier ?",
      answers: "Les critères sont la couverture et la date.",
    }));

    act(() => view.result.current.retry());
    await waitFor(() => expect(view.result.current.proposal).toBe("Vérifie chaque critère défini."));
    expect(rewrite.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
      questions: "1. Quels critères faut-il vérifier ?",
      answers: "Les critères sont la couverture et la date.",
    }));
  });

  it("annule une requête et ignore son résultat tardif", async () => {
    const pending = deferred<string | null>();
    const input = props({ reformuler: vi.fn(() => pending.promise) });
    const view = renderHook(() => useConsigneAssistant(input));
    act(() => view.result.current.run());
    act(() => view.result.current.cancel());
    pending.resolve("ne doit pas apparaître");
    await act(async () => { await pending.promise; });
    expect(view.result.current.busy).toBe(false);
    expect(view.result.current.proposal).toBeNull();
    expect(view.result.current.questions).toBeNull();
  });
});
