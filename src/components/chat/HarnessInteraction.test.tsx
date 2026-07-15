// HarnessInteraction (plan 025, step 5) — RTL : la carte interaction émet le
// CustomEvent "interaction-answer" avec la réponse exacte du contrat
// (approval → {allow}, user_input → {answers}, mcp_elicitation → {action,
// content?}), les valeurs secret ne touchent JAMAIS le DOM après envoi, les
// états finaux sont non éditables, et tous les contrôles sont focusables.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { HarnessInteraction, type InteractionEvent } from "./HarnessInteraction";
import { setLanguage, t } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));
// libellés évalués au niveau module → langue fixée AVANT (patron ChatHeader.test)
setLanguage("fr");

const THREAD = "thread-A";

function makeEvent(over: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    kind: "interaction",
    requestId: "req-001",
    interactionType: "approval",
    title: "Exécuter `git push` ?",
    detail: "git push origin main",
    state: "pending",
    ...over,
  } as InteractionEvent;
}

/** Capture les CustomEvent "interaction-answer" émis pendant le test. */
function captureAnswers() {
  const details: { threadId: string; requestId: string; response: unknown }[] = [];
  const listener = (e: Event) => details.push((e as CustomEvent).detail);
  window.addEventListener("interaction-answer", listener);
  return { details, dispose: () => window.removeEventListener("interaction-answer", listener) };
}

describe("HarnessInteraction — approval", () => {
  it("rend titre, détail et type exact ; Allow once émet {allow:true} et fige la carte", () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={makeEvent()} threadId={THREAD} />);

      expect(screen.getByText("Exécuter `git push` ?")).toBeInTheDocument();
      expect(screen.getByText("git push origin main")).toBeInTheDocument();
      expect(screen.getByText(t("interaction.type-approval"))).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: t("interaction.allow-once") }));
      expect(cap.details).toEqual([
        { threadId: THREAD, requestId: "req-001", response: { allow: true, scope: "once" } },
      ]);
      // figée localement (optimiste) : plus aucun bouton, verdict visible
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.getByText(t("interaction.answered"))).toBeInTheDocument();
    } finally {
      cap.dispose();
    }
  });

  it("Deny émet {allow:false}", () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={makeEvent()} threadId={THREAD} />);
      fireEvent.click(screen.getByRole("button", { name: t("interaction.deny") }));
      expect(cap.details).toEqual([
        { threadId: THREAD, requestId: "req-001", response: { allow: false, scope: "once" } },
      ]);
    } finally {
      cap.dispose();
    }
  });

  it("propose les quatre décisions et les raccourcis 1–4", () => {
    const cap = captureAnswers();
    try {
      const { unmount } = render(<HarnessInteraction event={makeEvent()} threadId={THREAD} />);
      expect(screen.getByRole("button", { name: t("interaction.allow-session") })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: t("interaction.cancel-turn") })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "2" });
      expect(cap.details[0]).toEqual({
        threadId: THREAD,
        requestId: "req-001",
        response: { allow: true, scope: "session" },
      });
      unmount();

      render(<HarnessInteraction event={makeEvent({ requestId: "req-002" })} threadId={THREAD} />);
      fireEvent.keyDown(window, { key: "4" });
      expect(cap.details[1]).toEqual({
        threadId: THREAD,
        requestId: "req-002",
        response: { allow: false, scope: "once", cancelTurn: true },
      });
    } finally {
      cap.dispose();
    }
  });
});

describe("HarnessInteraction — formulaire user_input", () => {
  const form = () =>
    makeEvent({
      requestId: "req-form",
      interactionType: "user_input",
      title: "L'agent a besoin de précisions",
      detail: undefined,
      fields: [
        {
          id: "q1",
          question: "Quel dossier cibler ?",
          header: "Contexte",
          options: [{ label: "src" }, { label: "gallery", description: "galerie vendorisée" }],
          allowOther: true,
        },
        { id: "q2", question: "Jeton API ?", secret: true },
      ],
    });

  it("options + Other + secret : Submit émet answers complet ; la valeur secrète ne reste PAS dans le DOM", () => {
    const cap = captureAnswers();
    try {
      const { container } = render(<HarnessInteraction event={form()} threadId={THREAD} />);

      // type visible + questions et header rendus
      expect(screen.getByText(t("interaction.type-user_input"))).toBeInTheDocument();
      expect(screen.getByText("Contexte")).toBeInTheDocument();
      expect(screen.getByText("Quel dossier cibler ?")).toBeInTheDocument();

      // q1 : choisir « Autre » puis taper la réponse libre
      fireEvent.click(screen.getByRole("radio", { name: t("interaction.other") }));
      fireEvent.change(screen.getByPlaceholderText(t("interaction.other-placeholder")), {
        target: { value: "docs/media" },
      });

      // q2 : champ secret → input type=password
      const secret = screen.getByLabelText("Jeton API ?") as HTMLInputElement;
      expect(secret.type).toBe("password");
      fireEvent.change(secret, { target: { value: "s3cret-tok" } });

      fireEvent.click(screen.getByRole("button", { name: t("interaction.submit") }));
      expect(cap.details).toEqual([
        {
          threadId: THREAD,
          requestId: "req-form",
          response: { answers: { q1: "docs/media", q2: "s3cret-tok" } },
        },
      ]);

      // après envoi : formulaire démonté, la valeur secrète n'existe plus dans
      // le DOM (ni innerHTML ni un input résiduel), et le résumé ne la cite pas
      expect(container.querySelector("input")).toBeNull();
      expect(document.body.innerHTML).not.toContain("s3cret-tok");
      expect(screen.getByText(t("interaction.answered"))).toBeInTheDocument();
    } finally {
      cap.dispose();
    }
  });

  it("choisir une option listée l'envoie telle quelle ; Cancel émet answers vide", () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={form()} threadId={THREAD} />);
      fireEvent.click(screen.getByRole("radio", { name: "src" }));
      fireEvent.click(screen.getByRole("button", { name: t("interaction.submit") }));
      expect((cap.details[0].response as { answers: Record<string, string> }).answers.q1).toBe("src");

      cleanup();
      cap.details.length = 0;
      render(<HarnessInteraction event={form()} threadId={THREAD} />);
      fireEvent.click(screen.getByRole("button", { name: t("interaction.cancel") }));
      expect(cap.details).toEqual([
        { threadId: THREAD, requestId: "req-form", response: { answers: {} } },
      ]);
    } finally {
      cap.dispose();
    }
  });

  it("navigation clavier : radios, champ texte et boutons sont focusables", () => {
    const { container } = render(<HarnessInteraction event={form()} threadId={THREAD} />);
    expect(container.querySelectorAll('[data-slot="field"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-slot="field-label"]')).toHaveLength(1);
    const radio = screen.getByRole("radio", { name: "src" });
    radio.focus();
    expect(document.activeElement).toBe(radio);

    const secret = screen.getByLabelText("Jeton API ?");
    secret.focus();
    expect(document.activeElement).toBe(secret);

    const submit = screen.getByRole("button", { name: t("interaction.submit") });
    submit.focus();
    expect(document.activeElement).toBe(submit);
  });
});

describe("HarnessInteraction — mcp_elicitation", () => {
  it("formulaire MCP : Submit émet {action:'accept', content} ; Cancel émet {action:'decline'}", () => {
    const cap = captureAnswers();
    try {
      const ev = makeEvent({
        requestId: "req-mcp",
        interactionType: "mcp_elicitation",
        title: "Serveur gbrain",
        fields: [{ id: "scope", question: "Portée ?", options: [{ label: "lecture" }, { label: "écriture" }] }],
      });
      render(<HarnessInteraction event={ev} threadId={THREAD} />);
      fireEvent.click(screen.getByRole("radio", { name: "lecture" }));
      fireEvent.click(screen.getByRole("button", { name: t("interaction.submit") }));
      expect(cap.details).toEqual([
        { threadId: THREAD, requestId: "req-mcp", response: { action: "accept", content: { scope: "lecture" } } },
      ]);

      cleanup();
      cap.details.length = 0;
      render(<HarnessInteraction event={ev} threadId={THREAD} />);
      fireEvent.click(screen.getByRole("button", { name: t("interaction.cancel") }));
      expect(cap.details).toEqual([
        { threadId: THREAD, requestId: "req-mcp", response: { action: "decline" } },
      ]);
    } finally {
      cap.dispose();
    }
  });

  it("mode URL : affiche le domaine seul, « Ouvrir » émet accept SANS window.open", () => {
    const cap = captureAnswers();
    const openSpy = vi.spyOn(window, "open");
    try {
      const ev = makeEvent({
        requestId: "req-url",
        interactionType: "mcp_elicitation",
        title: "Authentification requise",
        detail: undefined,
        urlDomain: "auth.example.com",
      });
      render(<HarnessInteraction event={ev} threadId={THREAD} />);
      expect(screen.getByText(t("interaction.url-ask", { domain: "auth.example.com" }))).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: t("interaction.open") }));
      expect(cap.details).toEqual([
        { threadId: THREAD, requestId: "req-url", response: { action: "accept" } },
      ]);
      // le frontend ne navigue JAMAIS lui-même : le sidecar/l'OS gère l'ouverture
      expect(openSpy).not.toHaveBeenCalled();

      cleanup();
      cap.details.length = 0;
      render(<HarnessInteraction event={ev} threadId={THREAD} />);
      fireEvent.click(screen.getByRole("button", { name: t("interaction.deny") }));
      expect(cap.details).toEqual([
        { threadId: THREAD, requestId: "req-url", response: { action: "decline" } },
      ]);
    } finally {
      openSpy.mockRestore();
      cap.dispose();
    }
  });
});

describe("HarnessInteraction — états finaux non éditables", () => {
  it.each([
    ["answered", "réponse : autorisé une fois"],
    ["declined", t("interaction.declined")],
    ["expired", t("interaction.expired")],
  ] as const)("état %s : aucun contrôle, résumé visible", (state, expected) => {
    const ev = makeEvent({
      state,
      answerSummary: state === "answered" ? "réponse : autorisé une fois" : undefined,
      fields: [{ id: "q1", question: "Question ?", options: [{ label: "a" }] }],
    });
    const { container } = render(<HarnessInteraction event={ev} threadId={THREAD} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.getByText(expected)).toBeInTheDocument();
    // la carte porte l'état visuel « répondu » (opacité .perm-card.answered)
    expect(container.querySelector(".perm-card.answered")).toBeTruthy();
  });
});
