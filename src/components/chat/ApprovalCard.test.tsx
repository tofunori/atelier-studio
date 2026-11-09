// Carte d'approbation (variante C compacte, 2026-11-09) — RTL : réponses
// exactes du contrat (Codex {allow, scope}, Claude/Kimi optionId OPAQUE),
// raccourcis 1–n, consigne de refus ouverte à la demande, repli en une ligne
// après réponse (verdict + règle retenue), découpe de la commande.
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { HarnessInteraction, type InteractionEvent } from "./HarnessInteraction";
import { commandLines } from "./commandLines";
import { setLanguage, t } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));
setLanguage("fr");

const THREAD = "thread-A";

function makeEvent(over: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    kind: "interaction",
    requestId: "req-001",
    interactionType: "approval",
    title: "Exécution de commande",
    detail: "git push origin main",
    state: "pending",
    ...over,
  } as InteractionEvent;
}

function captureAnswers() {
  const details: { threadId: string; requestId: string; response: unknown }[] = [];
  const listener = (e: Event) => details.push((e as CustomEvent).detail);
  window.addEventListener("interaction-answer", listener);
  return { details, dispose: () => window.removeEventListener("interaction-answer", listener) };
}

const claudeChoices = [
  { optionId: "allow_once", label: "Autoriser", kind: "allow_once" as const },
  { optionId: "allow_always", label: "Oui, et ne plus demander pour « npm test:* »", kind: "allow_always" as const },
  { optionId: "deny", label: "Refuser", kind: "reject_once" as const },
  { optionId: "deny_stop", label: "Refuser et arrêter", kind: "reject_always" as const, cancelTurn: true },
];
const claudeEvent = (over: Partial<InteractionEvent> = {}) => makeEvent({
  requestId: "req-claude", detail: "cd /Users/tofunori/projet; npm test",
  reason: "Commande hors des règles du projet", feedback: true, choices: claudeChoices, ...over,
});

/** Ouvre un menu (déclencheur nommé) et choisit la rangée qui commence par `item`. */
async function pick(trigger: string, item: string) {
  fireEvent.click(await screen.findByRole("button", { name: trigger }));
  const rows = await screen.findAllByRole("menuitem");
  const row = rows.find((r) => r.textContent?.startsWith(item));
  if (!row) throw new Error(`rangée absente : ${item} (${rows.map((r) => r.textContent).join(" | ")})`);
  fireEvent.click(row);
}

describe("ApprovalCard — en attente", () => {
  it("deux lignes : action, commande sur une ligne, raison ; plus d'étiquette « approbation »", async () => {
    render(<HarnessInteraction event={claudeEvent()} threadId={THREAD} />);
    expect(await screen.findByText(t("interaction.run"))).toBeInTheDocument();
    // chemin personnel raccourci, commande sur une ligne
    expect(screen.getByText("cd ~/projet; npm test")).toBeInTheDocument();
    expect(screen.getByText("Commande hors des règles du projet")).toBeInTheDocument();
    expect(screen.queryByText(t("interaction.type-approval"))).toBeNull();
    // la consigne n'est pas visible tant qu'on ne la demande pas
    expect(screen.queryByLabelText(t("interaction.feedback-placeholder"))).toBeNull();
  });

  it("le chevron déplie la commande, une instruction par ligne", async () => {
    const { container } = render(<HarnessInteraction event={claudeEvent()} threadId={THREAD} />);
    fireEvent.click(await screen.findByRole("button", { name: t("interaction.show-command") }));
    const lines = [...container.querySelectorAll(".appr-code-line")].map((l) => l.textContent);
    expect(lines).toEqual(["cd ~/projet", "npm test"]);
  });

  it("Codex (sans choix) : Autoriser émet {allow:true, scope:'once'} et replie la carte", async () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={makeEvent()} threadId={THREAD} />);
      fireEvent.click(await screen.findByRole("button", { name: t("interaction.allow-once") }));
      expect(cap.details).toEqual([
        { threadId: THREAD, requestId: "req-001", response: { allow: true, scope: "once" } },
      ]);
      expect(screen.getByText(t("interaction.cmd-allowed"))).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: t("interaction.allow-once") })).toBeNull();
    } finally {
      cap.dispose();
    }
  });

  it("Codex : raccourcis 2 (session) et 4 (arrêter) ; Refuser passe par le menu", async () => {
    const cap = captureAnswers();
    try {
      const first = render(<HarnessInteraction event={makeEvent()} threadId={THREAD} />);
      await screen.findByRole("button", { name: t("interaction.allow-once") });
      fireEvent.keyDown(window, { key: "2" });
      expect(cap.details[0].response).toEqual({ allow: true, scope: "session" });
      first.unmount();

      const second = render(<HarnessInteraction event={makeEvent({ requestId: "req-002" })} threadId={THREAD} />);
      await screen.findByRole("button", { name: t("interaction.allow-once") });
      fireEvent.keyDown(window, { key: "4" });
      expect(cap.details[1].response).toEqual({ allow: false, scope: "once", cancelTurn: true });
      second.unmount();

      render(<HarnessInteraction event={makeEvent({ requestId: "req-003" })} threadId={THREAD} />);
      await pick(t("interaction.deny"), t("interaction.deny"));
      expect(cap.details[2]).toEqual({ threadId: THREAD, requestId: "req-003", response: { allow: false, scope: "once" } });
    } finally {
      cap.dispose();
    }
  });

  it("copie d'un fil lié : nomme ce fil et répond en son nom", async () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={makeEvent({ forThreadId: "child-1", forTitle: "Références · Vérifier" })} threadId={THREAD} />);
      expect(await screen.findByText(t("interaction.for-linked", { title: "Références · Vérifier" }))).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: t("interaction.allow-once") }));
      expect(cap.details[0].threadId).toBe("child-1");
    } finally {
      cap.dispose();
    }
  });

  it("Claude : « Dire quoi faire à la place » ouvre la consigne ; Entrée refuse avec elle", async () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={claudeEvent()} threadId={THREAD} />);
      await pick(t("interaction.deny"), t("interaction.feedback-open"));
      const input = await screen.findByLabelText(t("interaction.feedback-placeholder"));
      fireEvent.change(input, { target: { value: "lance plutôt cargo test" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(cap.details).toEqual([{ threadId: THREAD, requestId: "req-claude",
        response: { optionId: "deny", message: "lance plutôt cargo test" } }]);
      expect(screen.getByText(t("interaction.cmd-denied"))).toBeInTheDocument();
      expect(screen.getByText("« lance plutôt cargo test »")).toBeInTheDocument();
    } finally {
      cap.dispose();
    }
  });

  it("Claude : Échap referme la consigne sans répondre", async () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={claudeEvent()} threadId={THREAD} />);
      await pick(t("interaction.deny"), t("interaction.feedback-open"));
      fireEvent.keyDown(await screen.findByLabelText(t("interaction.feedback-placeholder")), { key: "Escape" });
      expect(screen.queryByLabelText(t("interaction.feedback-placeholder"))).toBeNull();
      expect(cap.details).toEqual([]);
    } finally {
      cap.dispose();
    }
  });

  it("Claude : « ne plus demander » vit sous le chevron d'Autoriser ; optionId opaque", async () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={claudeEvent()} threadId={THREAD} />);
      await pick(t("interaction.more-allow"), "Ne plus demander pour « npm test:* »");
      expect(cap.details[0].response).toEqual({ optionId: "allow_always" });
    } finally {
      cap.dispose();
    }
  });

  it("Claude : la touche 4 refuse et arrête le tour ; « Refuser et arrêter » est destructif", async () => {
    const cap = captureAnswers();
    try {
      render(<HarnessInteraction event={claudeEvent()} threadId={THREAD} />);
      fireEvent.click(await screen.findByRole("button", { name: t("interaction.deny") }));
      const stop = (await screen.findAllByRole("menuitem")).find((r) => r.textContent?.startsWith("Refuser et arrêter"));
      expect(stop?.getAttribute("data-variant")).toBe("destructive");
      fireEvent.keyDown(document.body, { key: "Escape" });
      cleanup();
      render(<HarnessInteraction event={claudeEvent({ requestId: "req-stop" })} threadId={THREAD} />);
      await screen.findByRole("button", { name: "Autoriser" });
      fireEvent.keyDown(window, { key: "4" });
      expect(cap.details[0].response).toEqual({ optionId: "deny_stop", cancelTurn: true });
    } finally {
      cap.dispose();
    }
  });

  it("Kimi : ordre du provider, touche n → optionId n", async () => {
    const cap = captureAnswers();
    try {
      render(
        <HarnessInteraction
          event={makeEvent({
            requestId: "req-plan", title: "ExitPlanMode", detail: undefined,
            choices: [
              { optionId: "plan_opt_0", label: "Variante A", kind: "allow_once" },
              { optionId: "plan_opt_1", label: "Variante B", kind: "allow_once" },
              { optionId: "plan_opt_2", label: "Variante C", kind: "allow_once" },
              { optionId: "plan_revise", label: "Revise", kind: "reject_once" },
              { optionId: "plan_reject_and_exit", label: "Reject and Exit", kind: "reject_once" },
            ],
          })}
          threadId={THREAD}
        />,
      );
      expect(await screen.findByRole("button", { name: "Variante A" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "5" });
      expect(cap.details[0].response).toEqual({ optionId: "plan_reject_and_exit" });
    } finally {
      cap.dispose();
    }
  });

  it("plan à valider : le markdown est rendu ; la consigne part avec « continuer à planifier »", async () => {
    const cap = captureAnswers();
    try {
      render(
        <HarnessInteraction
          event={makeEvent({
            requestId: "req-exit-plan", title: "Plan prêt à exécuter", detail: undefined, feedback: true,
            markdown: "## Étapes\n\n1. Lire le panel\n2. Refaire la figure",
            choices: [
              { optionId: "plan_auto", label: "Oui, et accepter les modifications", kind: "allow_always" },
              { optionId: "plan_manual", label: "Oui, en validant chaque modification", kind: "allow_once" },
              { optionId: "plan_keep", label: "Non, continuer à planifier", kind: "reject_once" },
            ],
          })}
          threadId={THREAD}
        />,
      );
      expect(await screen.findByRole("heading", { name: "Étapes" })).toBeInTheDocument();
      await pick(t("interaction.deny"), t("interaction.feedback-open"));
      const input = await screen.findByLabelText(t("interaction.feedback-placeholder"));
      fireEvent.change(input, { target: { value: "ajoute un test" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(cap.details[0].response).toEqual({ optionId: "plan_keep", message: "ajoute un test" });
    } finally {
      cap.dispose();
    }
  });
});

describe("ApprovalCard — répondue (historique)", () => {
  it.each([
    ["answered", "Oui, et ne plus demander pour « npm test:* »", t("interaction.cmd-allowed"), "ne plus demander pour « npm test:* »"],
    ["answered", "Refuser · « lis le README »", t("interaction.cmd-denied"), "« lis le README »"],
    ["answered", "Refuser et arrêter · tour annulé", t("interaction.cmd-denied"), "tour annulé"],
    ["declined", undefined, t("interaction.cmd-denied"), null],
    ["expired", undefined, t("interaction.expired-title"), null],
  ] as const)("état %s « %s » : une ligne, aucun contrôle d'action", async (state, summary, verdict, sub) => {
    const { container } = render(
      <HarnessInteraction event={claudeEvent({ state, answerSummary: summary })} threadId={THREAD} />,
    );
    expect(await screen.findByText(verdict)).toBeInTheDocument();
    if (sub) expect(screen.getByText(sub)).toBeInTheDocument();
    expect(container.querySelector("input")).toBeNull();
    // seule la ligne elle-même est cliquable (elle déplie la commande)
    expect(within(container).getAllByRole("button")).toHaveLength(1);
  });

  it("Codex : « autorisé une fois » donne une ligne sobre sans redite", async () => {
    render(<HarnessInteraction event={makeEvent({ state: "answered", answerSummary: "autorisé une fois" })} threadId={THREAD} />);
    expect(await screen.findByText(t("interaction.cmd-allowed"))).toBeInTheDocument();
    expect(screen.queryByText("autorisé une fois")).toBeNull();
  });
});

describe("commandLines", () => {
  it("coupe aux ; && || de premier niveau, jamais dans une chaîne ni dans $( … )", () => {
    expect(commandLines(`cd x; f=$(find a -name b | head -1); echo "a; b" && python3 -c 'print(1);print(2)' || true`)).toEqual([
      "cd x",
      "f=$(find a -name b | head -1)",
      `echo "a; b" &&`,
      `python3 -c 'print(1);print(2)' ||`,
      "true",
    ]);
  });
});
