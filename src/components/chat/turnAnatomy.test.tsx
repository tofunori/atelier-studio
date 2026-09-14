// Anatomie du tour : modèle Synara — un seul état actif, journal humain
// dépliable et, une fois terminé, pli compact « Worked for… ».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null), isTauri: () => false }));
vi.mock("../../lib/localImage", () => ({
  localImagePreviewUrl: vi.fn(async () => "data:image/png;base64,AAAA"),
}));

import Chat from "../Chat";
import { DoneDiffToggle, LiveThinking, ThinkingBlock, ThinkingShimmer } from "./turnParts";
import { renderUi, resetTestState } from "../../test/render";
import { events, FIXED_TS } from "../../test/fixtures";
import { setWs } from "../../lib/wsBus";
import { setLanguage, t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";

function chatProps(
  over: Partial<Omit<Parameters<typeof Chat>[0], "defaults">> & { defaults?: Partial<Parameters<typeof Chat>[0]["defaults"]> } = {},
): Parameters<typeof Chat>[0] {
  const base = {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: "thread-A",
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [],
    defaults: { defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
    pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(), disabled: false, onSubmit: vi.fn(),
  };
  return {
    ...base,
    ...over,
    defaults: { ...base.defaults, ...over.defaults },
  } as Parameters<typeof Chat>[0];
}

// tour terminé avec 2 outils : produit un pli d'activité
function finishedTurn(): AgentEvent[] {
  return [
    events.user("Analyse l'albédo.", FIXED_TS),
    events.tool({ id: "t1", ts: FIXED_TS + 100 }),
    events.tool({ id: "t2", name: "Grep", detail: "albedo", ts: FIXED_TS + 200 }),
    events.text("Voici l'analyse.", FIXED_TS + 500),
    events.done({ ts: FIXED_TS + 700 }),
  ];
}

beforeEach(() => { resetTestState(); setLanguage("fr"); });
afterEach(cleanup);

describe("anatomie du tour — header d'activité", () => {
  it.each(["Read", "web_search"])("conserve la sortie %s ouverte jusqu’à la fin du tour", async (name) => {
    const user = events.user("Inspecte.", FIXED_TS);
    const running = events.tool({ id: "stable", name, status: "inProgress", output: "résultat conservé", detail: "src/App.tsx" }) as Extract<AgentEvent, { kind: "tool_update" }>;
    const view = renderUi(<Chat {...chatProps({ events: [user, running], workingSince: FIXED_TS })} />);
    // v2 : la dernière série de l'étape active tient sur UNE ligne « synthèse ·
    // statut vivant ». La sortie vit derrière ce pli — on ouvre donc la grappe
    // AVANT la sortie, et les deux doivent survivre à la fin du tour.
    const cluster = document.querySelector(".activity-cluster .ui-activity-trigger") as HTMLButtonElement;
    expect(cluster).toBeTruthy();
    expect(cluster).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(cluster);
    expect(cluster).toHaveAttribute("aria-expanded", "true");
    const tool = document.querySelector(".tool-output-head") as HTMLButtonElement;
    expect(tool).toBeTruthy();
    fireEvent.click(tool);
    expect(tool).toHaveAttribute("aria-expanded", "true");
    const completed = { ...running, status: "completed" };
    view.rerender(<Chat {...chatProps({ events: [user, completed], workingSince: FIXED_TS })} />);
    expect(document.querySelector(".activity-action-list")).toBeTruthy();
    expect(document.querySelector(".tool-output-head")).toHaveAttribute("aria-expanded", "true");
    // Le tour se pose avec une narration d'étape et un second outil : c'est le
    // cas réel (et LegendList/jsdom ne réinsère pas une rangée UNIQUE retirée
    // puis remise — cas à vérifier dans l'app, pas ici).
    const later = events.tool({ id: "later", name: "Bash", status: "completed", output: "ok", detail: "ls" });
    view.rerender(<Chat {...chatProps({ events: [user, completed, events.text("Étape faite.", FIXED_TS + 300), later, events.text("Terminé.", FIXED_TS + 500), events.done({ ts: FIXED_TS + 700 })] })} />);
    // Au terminal, le pli du tour se FERME toujours (le travail se regroupe
    // sous « A travaillé pendant… ») ; le détail ouvert n'est pas perdu : il
    // réapparaît ouvert dès qu'on redéplie le pli.
    const fold = await waitFor(() => {
      const trigger = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
      expect(trigger).toBeTruthy();
      return trigger;
    });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".tool-output-head")).toBeNull();
    fireEvent.click(fold);
    await waitFor(() => expect(document.querySelector(".tool-output-head")).toHaveAttribute("aria-expanded", "true"));
    expect(document.querySelectorAll(".tool-output")).toHaveLength(2);
    expect(screen.getByText("Terminé.")).toBeInTheDocument();
  });

  it("ne rouvre pas un pli historique au retour d'un autre fil", () => {
    const finishedA: AgentEvent[] = [
      events.user("Fil A", FIXED_TS),
      events.tool({ id: "shared-tool", name: "Read", output: "sortie A", status: "completed" }),
      events.text("Réponse A.", FIXED_TS + 500),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    const { rerender } = renderUi(<Chat {...chatProps({ threadId: "A", events: finishedA })} />);

    // Un historique déjà terminé reste fermé au premier affichage.
    let fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    expect(fold).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(fold);
    let tool = document.querySelector(".tool-output-head") as HTMLButtonElement;
    expect(tool).toBeTruthy();
    fireEvent.click(tool);
    expect(tool).toHaveAttribute("aria-expanded", "true");
    fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    fireEvent.click(fold);
    expect(fold).toHaveAttribute("aria-expanded", "false");

    // Un autre fil peut réutiliser les mêmes identifiants legacy et outils.
    rerender(<Chat {...chatProps({
      threadId: "B",
      workingSince: FIXED_TS,
      events: [events.user("Fil B", FIXED_TS), events.tool({ id: "shared-tool", status: "inProgress" })],
    })} />);
    // v2 : la ligne vivante est fusionnée dans la grappe active — une seule
    // ligne de statut dans le fil, jamais un dock séparé.
    expect(document.querySelectorAll(".timeline-scroll-wrap .activity-cluster-live [role=status]")).toHaveLength(1);
    expect(document.querySelector(".chat-activity-dock")).toBeNull();

    // Revenir à l'historique ne doit pas interpréter sa première observation
    // terminale comme une transition active→terminal.
    rerender(<Chat {...chatProps({ threadId: "A", events: finishedA })} />);
    fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    expect(fold).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(fold);
    tool = document.querySelector(".tool-output-head") as HTMLButtonElement;
    expect(tool).toHaveAttribute("aria-expanded", "true");
  });

  it("regroupe un résultat sans dupliquer son début canonique", () => {
    const meta = { eventId: "start", turnId: "t1", itemId: "same", ts: FIXED_TS, provider: "codex" };
    const evs = [events.user("Inspecte.", FIXED_TS),
      { kind: "tool", name: "Read", meta },
      { kind: "tool_update", id: "same", name: "Read", status: "completed", output: "ok", meta: { ...meta, eventId: "end" } },
    ] as AgentEvent[];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    // v2 : la série active tient sur une ligne — le détail s'ouvre au clic, et
    // le début canonique n'y ajoute PAS une seconde rangée.
    fireEvent.click(document.querySelector(".activity-cluster .ui-activity-trigger") as HTMLButtonElement);
    expect(document.querySelectorAll(".activity-action-list")).toHaveLength(1);
    expect(document.querySelectorAll(".activity-action-list .tool-output")).toHaveLength(1);
  });

  it("conserve le groupe et les appels parallèles pendant les mises à jour", () => {
    const user = events.user("Inspecte.", FIXED_TS);
    const a = events.tool({ id: "a", name: "Read", detail: "a.ts", status: "inProgress" });
    const b = events.tool({ id: "b", name: "Read", detail: "b.ts", status: "inProgress" });
    const view = renderUi(<Chat {...chatProps({ events: [user, a, b], workingSince: FIXED_TS })} />);
    // v2 : la série active (deux lectures) tient sur une ligne ; ouverte, elle
    // montre les DEUX appels parallèles, et ce corps garde son identité DOM
    // pendant que les statuts changent.
    const trigger = document.querySelector(".activity-cluster .ui-activity-trigger") as HTMLButtonElement;
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    const group = document.querySelector(".activity-action-list")!;
    expect(group.querySelectorAll(".tool-output")).toHaveLength(2);
    view.rerender(<Chat {...chatProps({ events: [user, a, { ...b, status: "completed" } as AgentEvent], workingSince: FIXED_TS })} />);
    expect(document.querySelector(".activity-action-list")).toBe(group);
    expect(group.querySelectorAll(".tool-output")).toHaveLength(2);
    // Un TROISIÈME outil de la même catégorie rejoint la même série, sans
    // refermer ce que l'utilisateur avait ouvert.
    view.rerender(<Chat {...chatProps({ events: [user, a, b, events.tool({ id: "c", status: "inProgress" })], workingSince: FIXED_TS })} />);
    expect(document.querySelector(".activity-cluster .ui-activity-trigger")).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelectorAll(".activity-action-list .tool-output")).toHaveLength(3);
    expect(document.querySelector(".active-turn-tail .ui-activity")).toBeNull();
  });

  it("conserve le dépliage et le texte après thinking_live puis outil et nouvelle pensée", () => {
    const user = events.user("Inspecte.", FIXED_TS);
    const thought = { kind: "thinking_live", text: "Je consulte les sources.", meta: { eventId: "live", ts: FIXED_TS + 10 } } as AgentEvent;
    const view = renderUi(<Chat {...chatProps({ events: [user, thought], workingSince: FIXED_TS })} />);
    const head = document.querySelector(".activity-thought-head")!;
    fireEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    view.rerender(<Chat {...chatProps({ events: [user,
      { ...thought, kind: "thinking", meta: { eventId: "durable", ts: FIXED_TS + 10 } } as AgentEvent,
      events.tool({ id: "r", status: "inProgress" }),
      { kind: "thinking_live", text: "Je compare maintenant.", ts: FIXED_TS + 100 } as AgentEvent,
    ], workingSince: FIXED_TS })} />);
    const updatedHead = document.querySelector(".activity-thought-head");
    expect(updatedHead).toBeTruthy();
    expect(updatedHead).toHaveAttribute("aria-expanded", "true");
    expect(updatedHead?.parentElement?.textContent).toContain("Je consulte les sources.");
  });

  it("transfère le dépliage au cumul de pensée remplaçant le bloc précédent", () => {
    const user = events.user("Inspecte.", FIXED_TS);
    const first = { kind: "thinking", text: "Je consulte les sources.", ts: FIXED_TS + 10 } as AgentEvent;
    const view = renderUi(<Chat {...chatProps({ events: [user, first], workingSince: FIXED_TS })} />);
    fireEvent.click(document.querySelector(".activity-thought-head")!);
    view.rerender(<Chat {...chatProps({ events: [user, first,
      events.text("Lecture terminée.", FIXED_TS + 20),
      events.tool({ id: "r", status: "completed" }),
      { kind: "thinking", text: "Je consulte les sources. Je compare maintenant les résultats.", ts: FIXED_TS + 50 } as AgentEvent,
    ], workingSince: FIXED_TS })} />);
    const heads = [...document.querySelectorAll(".activity-thought-head")];
    expect(heads.length).toBeGreaterThan(0);
    const latestHead = heads[heads.length - 1] as HTMLButtonElement;
    expect(latestHead).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(latestHead);
    expect(latestHead).toHaveAttribute("aria-expanded", "true");
    expect(latestHead.parentElement?.querySelector(".activity-thought-body")?.textContent)
      .toContain("Je compare maintenant");
  });

  it("affiche la même icône de réflexion dans l'état actif et le bloc repliable", () => {
    // Avec du texte : l'indicateur porte l'icône dans son en-tête ; sans
    // texte il ne rend RIEN (aucune « Réflexion » affirmée sans preuve).
    const { rerender } = renderUi(<LiveThinking thought="Je pèse les options." />);
    expect(document.querySelector(".thinking-live-head > .thinking-icon[aria-hidden='true']")).toBeTruthy();

    rerender(<ThinkingBlock text="Je vérifie les éléments utiles." live={false} collapsedByDefault />);
    const head = document.querySelector(".thinking-head") as HTMLButtonElement;
    expect(head.firstElementChild?.classList.contains("thinking-icon")).toBe(true);
    expect(head.lastElementChild?.classList.contains("tool-tick")).toBe(true);
    expect(head.getAttribute("aria-expanded")).toBe("false");
  });

  it("déroule la pensée en cours dans une fenêtre bornée, calée sur la fin", async () => {
    // Sans pensée reçue, on n'affirme RIEN : pas de « Réflexion » gratuite
    // (le pulse et le chrono du tour racontent déjà l'attente).
    const { rerender } = renderUi(<LiveThinking />);
    expect(document.querySelector(".thinking-live-stream")).toBeNull();
    expect(document.querySelector(".thinking-shimmer")).toBeNull();
    expect(document.querySelector(".thinking-live-indicator")).toBeNull();

    // Dès qu'une pensée arrive, c'est ELLE qu'on lit — en entier, chaque ligne
    // devenant un paragraphe (mise en forme structurée, plus de bloc brut).
    const pensee = "J'ouvre methods_en.tex\n\n  puis je compare les deux sections";
    rerender(<LiveThinking thought={pensee} />);
    // La pensée se LISSE (phase 2) : les assertions attendent la fin de la
    // révélation progressive au lieu d'exiger un rendu synchrone complet.
    const flux = document.querySelector(".thinking-live-stream") as HTMLElement;
    await waitFor(() => {
      const paras = [...flux.querySelectorAll(".thinking-para")].map((p) => p.textContent?.trim());
      expect(paras).toEqual(["J'ouvre methods_en.tex", "puis je compare les deux sections"]);
    }, { timeout: 3000 });
    expect(flux.querySelectorAll(".thinking-gap")).toHaveLength(1);
    expect(document.querySelector(".thinking-shimmer")).toBeNull();

    // Listes : marqueur en colonne, corps à part (retrait pendu façon Hermes).
    rerender(<LiveThinking thought={"11. Residual scales 0.033\n- Magnus formula"} />);
    await waitFor(() => {
      const items = [...document.querySelectorAll(".thinking-item")];
      expect(items.map((i) => i.querySelector(".thinking-marker")?.textContent)).toEqual(["11.", "-"]);
      expect(items[0].querySelector(".thinking-item-body")?.textContent).toBe("Residual scales 0.033");
    }, { timeout: 3000 });

    // Le gras markdown est rendu, pas affiché en astérisques littéraux.
    rerender(<LiveThinking thought={'12. **"regions 01 and 02"** : à vérifier'} />);
    await waitFor(() => {
      expect(document.querySelector(".thinking-item strong")?.textContent).toBe('"regions 01 and 02"');
    }, { timeout: 3000 });
    expect(document.querySelector(".thinking-live-stream")?.textContent).not.toContain("**");

    // Une pensée longue n'est PAS tronquée : la hauteur est bornée par le CSS,
    // le contenu reste entier et défile jusqu'à sa fin.
    const longue = "x".repeat(400) + " fin de raisonnement";
    rerender(<LiveThinking thought={longue} />);
    const suite = document.querySelector(".thinking-live-stream") as HTMLElement;
    await waitFor(() => expect(suite.textContent).toBe(longue), { timeout: 6000 });
    expect(suite.textContent!.endsWith("fin de raisonnement")).toBe(true);
  });

  it("la pensée vivante se lisse : une rafale se révèle progressivement (phase 2)", async () => {
    const { rerender } = renderUi(<LiveThinking thought="Départ." />);
    const rafale = "Départ. Ensuite une grosse rafale de pensée arrive d'un coup, comme Grok "
      + "livre ses blocs de cent caractères, et doit se dérouler au lieu de sauter jusqu'au terme.";
    rerender(<LiveThinking thought={rafale} />);
    const flux = () => document.querySelector(".thinking-live-stream") as HTMLElement;
    // pas de saut : juste après la rafale, la fin n'est pas encore affichée
    expect(flux().textContent).not.toContain("terme.");
    await waitFor(() => expect(flux().textContent).toContain("terme."), { timeout: 3000 });
  });

  // Régression (vécu 2026-08-13) : le tour actif rendait `LiveThinking` sans
  // lui passer la pensée. La feuille de réflexion porte désormais son texte,
  // avec une réduction compacte en vue normale.
  it("le tour en cours affiche la pensée, pas seulement le mot « Réflexion »", () => {
    const live: AgentEvent[] = [
      events.user("Ok et qu'est-ce que tu recommandes sinon", FIXED_TS),
      { kind: "thinking_live", text: "Je relis la section méthodes pour voir ce qui manque.", ts: FIXED_TS + 100 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: live, workingSince: FIXED_TS })} />);
    const thought = document.querySelector(".activity-thought") as HTMLElement;
    expect(thought).toBeTruthy();
    expect(thought.textContent).toContain("Je relis la section méthodes pour voir ce qui manque.");
    expect(thought.querySelector(".activity-thought-body")).toBeNull();
    fireEvent.click(thought.querySelector(".activity-thought-head") as HTMLButtonElement);
    expect(thought.querySelector(".activity-thought-body")?.textContent).toBe("Je relis la section méthodes pour voir ce qui manque.");
  });

  it("le reflet accompagne l'étape active sans remettre son outil en cours", () => {
    const evs: AgentEvent[] = [
      events.user("Lis le script.", FIXED_TS),
      {
        kind: "tool_update",
        id: "t-1",
        name: "Read",
        status: "completed",
        detail: "bayes_REGION_c.py",
        ts: FIXED_TS + 10,
      } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    // v2 : la série active porte « synthèse · statut vivant » sur une ligne.
    const ligne = document.querySelector(".timeline-virtual-row .activity-cluster .ui-activity") as HTMLElement;
    expect(ligne).toBeTruthy();
    expect(ligne.querySelector(".activity-cluster-summary")?.textContent?.toLowerCase()).toContain("bayes_region_c.py");
    // L'outil terminé n'est pas remis « en cours » : le reflet reste sur le
    // seul statut vivant, jamais sur la synthèse ni sur la rangée.
    expect(ligne.querySelector(".ui-activity-label.is-shimmering")).toBeNull();
    fireEvent.click(ligne.querySelector(".ui-activity-trigger") as HTMLButtonElement);
    expect(document.querySelector(".activity-action-list .tool-output.failed")).toBeNull();
    expect(document.querySelector(".activity-action-list .is-shimmering")).toBeNull();
    expect(document.querySelectorAll(".active-turn-tail .turn-working-shimmer")).toHaveLength(1);
  });

  it("n'anime pas les outils d'un tour précédent quand un nouveau tour démarre", () => {
    const evs: AgentEvent[] = [
      events.user("Premier tour.", FIXED_TS),
      events.tool({ id: "old", name: "Read", detail: "old.ts", status: "completed" }),
      events.done({ ts: FIXED_TS + 100 }),
      events.user("Nouveau tour.", FIXED_TS + 200),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS + 200 })} />);
    expect(document.querySelector(".is-shimmering")).toBeNull();
  });

  it("la préférence replie la pensée vivante par défaut, le clic la déplie", () => {
    const evs: AgentEvent[] = [
      events.user("Réfléchis.", FIXED_TS),
      { kind: "thinking_live", text: "Une longue pensée déjà en cours.", ts: FIXED_TS + 50 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS, defaults: { transcriptView: "normal" } })} />);
    // En vue normale la feuille est repliée, mais son aperçu reste lisible.
    const thought = document.querySelector(".activity-thought") as HTMLElement;
    expect(thought).toBeTruthy();
    expect(thought.querySelector(".activity-thought-preview")?.textContent).toContain("longue pensée");
    expect(thought).toHaveClass("collapsed");
    expect(thought.querySelector(".activity-thought-body")).toBeNull();
    fireEvent.click(thought.querySelector(".activity-thought-head") as HTMLButtonElement);
    expect(thought).toHaveClass("open");
    expect(thought.querySelector(".activity-thought-body")?.textContent).toContain("longue pensée");
  });

  // Flux Grok réel (capturé sur grok 1.0.3) : les blocs `thinking` durables
  // remplacent le live, et ce ne sont PAS des pensées distinctes — c'est un
  // flux continu coupé à ~100 caractères, parfois en plein mot. Prendre le
  // dernier bloc seul donnait « fro... ».
  it("recolle les blocs de pensée coupés en plein mot", () => {
    const live: AgentEvent[] = [
      events.user("Résume les règles de design.", FIXED_TS),
      { kind: "thinking", text: "The user wants me to read CLAUDE.md. I already have CLA", ts: FIXED_TS + 10 } as AgentEvent,
      { kind: "thinking", text: "UDE.md content in the workspace rules. Let me summarize the design system rules", ts: FIXED_TS + 20 } as AgentEvent,
      { kind: "thinking", text: " fro...", ts: FIXED_TS + 30 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: live, workingSince: FIXED_TS })} />);
    const thought = [...document.querySelectorAll<HTMLElement>(".activity-thought")].pop();
    expect(thought?.textContent).toContain("CLAUDE.md content");
    expect(thought?.textContent?.endsWith("fro...")) .toBe(true);
  });

  // Fil réel (thread c41476bd) : Grok répond, part en outils, puis repense.
  // S'arrêter au premier `text` rencontré rendait la ligne muette pendant
  // tout le reste du tour — l'essentiel des 46 s d'attente.
  it("garde la pensée quand le tour repart en outils après un premier texte", () => {
    const live: AgentEvent[] = [
      events.user("Que penses-tu du style ?", FIXED_TS),
      { kind: "thinking", text: "The user is asking about the style.", ts: FIXED_TS + 10 } as AgentEvent,
      { kind: "text", text: "Je relis le paragraphe.", ts: FIXED_TS + 20 } as AgentEvent,
      events.tool({ id: "t1", name: "Read", ts: FIXED_TS + 30 }),
      { kind: "thinking", text: "The user rewrote the paragraph. Now they want my opinion", ts: FIXED_TS + 40 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: live, workingSince: FIXED_TS })} />);
    const thought = [...document.querySelectorAll<HTMLElement>(".activity-thought")].pop() as HTMLElement;
    expect(thought.textContent).toContain("they want my opinion");
    // et surtout : pas la pensée d'AVANT le premier texte
    expect(thought.textContent).not.toContain("asking about the style");
  });

  // Forme RÉELLE produite par le réducteur pour Grok (harnessEvents.ts) : les
  // morceaux pensés APRÈS la réponse sont recollés dans le bloc qui PRÉCÈDE le
  // texte, sans le déplacer — seul son `meta.ts` avance. Couper bêtement sur le
  // texte rendait la ligne muette pour tout le reste du tour.
  it("garde la pensée recollée après la réponse, même placée avant le texte", () => {
    const live: AgentEvent[] = [
      events.user("Que penses-tu du style ?", FIXED_TS),
      {
        kind: "thinking",
        text: "Je pèse le pour et le contre après avoir répondu.",
        ts: FIXED_TS + 10,
        meta: { ts: FIXED_TS + 900 },
      } as AgentEvent,
      { kind: "text", text: "Je relis le paragraphe.", ts: FIXED_TS + 20, meta: { ts: FIXED_TS + 20 } } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: live, workingSince: FIXED_TS })} />);
    const thought = [...document.querySelectorAll<HTMLElement>(".activity-thought")].pop();
    expect(thought?.textContent).toContain("Je pèse le pour et le contre");
  });

  // Contrat §9 (« une seule boucle par surface ») : le reflet Thinking battait
  // toutes les 4 s SOUS l'anneau de Working, qui tourne à 0,8 s. Le libellé est
  // désormais statique — aucune classe de balayage, aucun minuteur.
  it("le reflet Thinking est statique : aucune boucle ni minuteur", () => {
    vi.useFakeTimers();
    try {
      renderUi(<ThinkingShimmer text="Thinking" />);
      const shimmer = document.querySelector(".thinking-shimmer") as HTMLElement;
      expect(shimmer.textContent).toBe("Thinking");
      expect(shimmer.children).toHaveLength(0);
      act(() => vi.advanceTimersByTime(10_000));
      expect(shimmer.classList.contains("is-sweeping")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("garde le statut animé après la fin du sous-agent et pendant le silence", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TS);
    try {
      const evs: AgentEvent[] = [events.user("Analyse.", FIXED_TS),
        events.tool({ id: "review", name: "Review results", status: "completed", ts: FIXED_TS })];
      const props = chatProps({ events: evs, workingSince: FIXED_TS, lastEventAt: FIXED_TS });
      const view = renderUi(<Chat {...props} />);
      // v2 : le statut vit dans la ligne fusionnée de la série active.
      const row = document.querySelector(".activity-cluster .ui-activity");
      expect(row?.textContent).toContain("Réflexion en cours");
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(row?.textContent).toContain("Réflexion en cours");
      expect(row?.querySelector(".activity-cluster-live .turn-working-shimmer")).toBeTruthy();
      // A new receipt preserves the persistent status and Stop.
      view.rerender(<Chat {...props} lastEventAt={Date.now()} />);
      expect(document.querySelector(".activity-cluster .ui-activity")).toBe(row);
      expect(row?.textContent).toContain("Réflexion en cours");
      expect(row?.querySelector(".stop-hint")).toBeNull();
      // Le losange du statut cède la place à l'icône de la synthèse, et le
      // chrono reste en méta de la même ligne.
      expect(row?.querySelector(".ui-activity-icon")).toBeTruthy();
      expect(row?.querySelector(".ui-activity-meta .turn-activity-elapsed")).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it("garde le statut actif pendant un outil ou une réponse silencieuse", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TS + 40_000);
    try {
      const base = chatProps({ workingSince: FIXED_TS, lastEventAt: FIXED_TS });
      const view = renderUi(<Chat {...base} events={[events.user("Analyse.", FIXED_TS),
        events.tool({ id: "cmd", status: "inProgress", ts: FIXED_TS })]} />);
      expect(document.querySelector(".active-turn-tail")?.textContent).toContain("Lit");
      expect(document.querySelector(".active-turn-tail .turn-working-shimmer")).toBeTruthy();
      view.rerender(<Chat {...base} events={[events.user("Analyse.", FIXED_TS),
        { kind: "streaming", text: "Début", ts: FIXED_TS }]} />);
      expect(document.querySelector(".active-turn-tail")?.textContent).toContain("Rédaction en cours");
      expect(document.querySelector(".active-turn-tail .turn-working-shimmer")).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it("remplace la réflexion par les outils puis l’attente sans éteindre le reflet", () => {
    const base = chatProps({ workingSince: FIXED_TS });
    const user = events.user("Analyse.", FIXED_TS);
    const view = renderUi(<Chat {...base} events={[user]} />);
    // Le statut vivant vit DANS le fil (plus de dock au-dessus du composeur)
    // et il n'en existe jamais qu'une seule instance à la fois.
    const liveStatus = () => document.querySelector(".active-turn-tail [role=status]");
    const status = liveStatus();
    expect(document.querySelector(".chat-activity-dock")).toBeNull();
    expect(status?.closest(".timeline-scroll-wrap")).toBeTruthy();
    expect(document.querySelectorAll(".active-turn-tail [role=status]")).toHaveLength(1);
    expect(status?.textContent).toContain("Réflexion en cours");
    const read = events.tool({ id: "read", status: "inProgress" });
    const image = events.tool({ id: "image", name: "view_image", status: "inProgress" });
    view.rerender(<Chat {...base} events={[user, read, image]} />);
    expect(liveStatus()?.textContent).toBe("2 actions en cours…");
    expect(document.querySelectorAll(".active-turn-tail [role=status]")).toHaveLength(1);
    view.rerender(<Chat {...base} events={[user,
      events.tool({ id: "read", status: "completed" }), image]} />);
    expect(liveStatus()?.textContent).not.toContain("Réflexion en cours");
    expect(liveStatus()?.textContent).not.toContain("2 actions");
    view.rerender(<Chat {...base} events={[user,
      events.tool({ id: "read", status: "completed" }),
      events.tool({ id: "image", name: "view_image", status: "completed" })]} />);
    expect(liveStatus()?.textContent).toContain("Réflexion en cours");
    view.rerender(<Chat {...base} events={[user,
      { kind: "permission", requestId: "approval", toolName: "Bash", answered: null }]} />);
    expect(liveStatus()?.textContent).toBe("En attente de votre réponse");
    expect(liveStatus()?.classList.contains("turn-working-shimmer")).toBe(true);
    expect(document.querySelectorAll(".active-turn-tail [role=status]")).toHaveLength(1);
  });

  it("conserve le statut actif au remontage et le retire à la fin", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TS + 60_000);
    try {
      const evs = [events.user("Analyse.", FIXED_TS), events.text("Résultat", FIXED_TS + 1000)];
      const props = chatProps({ events: evs, workingSince: FIXED_TS, lastEventAt: FIXED_TS + 1000 });
      const first = renderUi(<Chat {...props} />);
      first.unmount();
      const view = renderUi(<Chat {...props} />);
      expect(document.querySelector(".active-turn-tail")?.textContent).toContain("Réflexion en cours");
      view.rerender(<Chat {...props} workingSince={null} events={[...evs, events.done({ ts: Date.now() })]} />);
      expect(document.querySelector(".active-turn-tail")).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("un terminal canonique masque le dock même si workingSince arrive en retard", () => {
    const evs = [
      events.user("Analyse.", FIXED_TS),
      events.text("Résultat déjà reçu.", FIXED_TS + 100),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    expect(document.querySelector(".active-turn-tail [role=status]")).toBeNull();
    expect(document.querySelector(".active-turn-tail")).toBeNull();
    expect(document.querySelector(".assistant-message .msg-actions")).toBeTruthy();
  });

  it("tour terminé : header « A travaillé pendant… », replié par défaut", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    expect(fold).toBeTruthy();
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(fold.textContent).toContain(t("chat.worked-for", { duration: "1s" }));
    expect(fold.textContent).toContain("1s"); // durée user→done (600 ms → ≥1s)
    expect(fold.textContent).not.toContain(t("chat.activity-steps", { n: 2 }));
    // replié : le détail des outils n'est pas rendu
    expect(document.querySelector(".ui-activity:not(.is-summary)")).toBeNull();
  });

  it("rend l’image Codex directement quand le tour est replié", async () => {
    const evs: AgentEvent[] = [
      events.user("Génère une image.", FIXED_TS),
      {
        kind: "tool_update", id: "image-1", name: "image_generation",
        output: "/tmp/atelier.png", status: "completed",
        input: { paths: ["/tmp/atelier.png"] },
      },
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);

    expect(document.querySelector(".ui-activity.is-summary")).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector(".image-view-thumbnails img")).toBeTruthy();
    });
    expect(document.querySelector(".ui-activity:not(.is-summary)")).toBeNull();
  });

  it("horodatage début → fin gaté par displayTimestamps", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    let fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    fireEvent.click(fold);
    expect(document.querySelector(".timeline-stamp")).toBeNull();
    cleanup();

    renderUi(<Chat {...chatProps({ events: finishedTurn(), defaults: { displayTimestamps: true } })} />);
    fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    fireEvent.click(fold);
    expect(document.querySelector(".timeline-stamp")).toBeTruthy();
  });

  it("clic déplie le détail des outils ; aria-expanded suit", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    fireEvent.click(fold);
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll(".ui-activity:not(.is-summary)")).toHaveLength(0);
    expect(document.querySelectorAll(".activity-action-list .tool-output")).toHaveLength(2);
    expect(document.querySelector(".ui-activity.is-summary .ui-activity-label")?.textContent?.toLowerCase())
      .toContain(t("tools.summary.exploration-n", { n: 2 }).toLowerCase());
  });

  it("tour actif : remplace la recherche précédente par la lecture courante", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte puis corrige.", FIXED_TS),
      { kind: "tool", name: "__thinking" },
      events.thinking("Je localise les fichiers utiles.", FIXED_TS + 50),
      { kind: "thinking_live", text: "Running: Je confirme le chemin utile.", ts: FIXED_TS + 75 },
      events.tool({ id: "search-1", name: "Bash", detail: "rg -n albedo src", input: { command: "rg -n albedo src" } }),
      { kind: "tool", name: "__thinking" },
      events.tool({ id: "read-1", name: "Bash", detail: "cat src/albedo.ts", status: "inProgress", input: { command: "cat src/albedo.ts" } }),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const working = document.querySelector(".timeline-virtual-row .turn-activity-elapsed") as HTMLElement;
    expect(working).toBeTruthy();
    // Un seul chrono dans le FIL (celui de la pastille « retour en bas » ne
    // s'affiche qu'une fois remonté, hors du fil).
    expect(document.querySelectorAll(".timeline-virtual-row .turn-activity-elapsed")).toHaveLength(1);
    expect(document.querySelector(".active-turn-header")).toBeNull();
    // Le chronomètre vit sur la ligne de statut, sans ancien carré ni séparateur.
    expect(working.textContent).not.toContain("Travaille depuis");
    expect(working.textContent).toMatch(/\d/);
    expect(working.querySelector(".working-spin")).toBeNull();
    expect(working.querySelector(".working-divider")).toBeNull();
    // Le raisonnement et les outils partagent la même étape chronologique.
    // Aucun indicateur de réflexion parallèle ni catégorie imbriquée.
    const etape = document.querySelector(".activity-cluster") as HTMLElement;
    expect(etape).toBeTruthy();
    expect(etape.querySelectorAll(".activity-thought")).toHaveLength(1);
    expect(etape.textContent).toContain("Je localise les fichiers utiles.");
    expect(etape.textContent).toContain("Je confirme le chemin utile.");
    // Recherche puis lecture sont deux appels de la MÊME catégorie : une seule
    // série, ici la série vivante — repliée derrière l'unique ligne
    // « synthèse · statut », aucune rangée empilée.
    expect(etape.querySelectorAll(".tool-output")).toHaveLength(0);
    expect(document.querySelectorAll(".activity-cluster-live [role=status]")).toHaveLength(1);
    expect(document.querySelectorAll(".active-turn-tail .turn-working-shimmer")).toHaveLength(1);
    const vivante = etape.querySelector(".ui-activity-trigger") as HTMLButtonElement;
    fireEvent.click(vivante);
    expect(etape.querySelectorAll(".tool-output")).toHaveLength(2);
    expect(etape.querySelector("[data-activity-icon='read']")).toBeTruthy();
    const readHead = [...etape.querySelectorAll<HTMLButtonElement>(".tool-output-head")].pop()!;
    expect(readHead).toBeTruthy();
    fireEvent.click(readHead);
    expect(etape.querySelectorAll(".tool-output")).toHaveLength(2);
    expect(etape.querySelectorAll(".tool-output.open")).toHaveLength(1);
  });

  it("garde active une commande running après une narration plus récente", async () => {
    const evs: AgentEvent[] = [
      events.user("Teste.", FIXED_TS),
      events.tool({ id: "test", name: "Bash", detail: "npm test", status: "inProgress" }),
      { kind: "streaming", text: "Je laisse les tests se terminer.", ts: FIXED_TS + 100 },
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    // La commande reste consultable à sa place ; le statut vivant suit
    // la narration plus récente, même si cette commande travaille encore.
    const etape = document.querySelector(".timeline-virtual-row .activity-cluster") as HTMLElement;
    expect(etape).toBeTruthy();
    expect(etape.closest(".active-turn-tail")).toBeNull();
    fireEvent.click(etape.querySelector(".tool-output-head") as HTMLButtonElement);
    const inlineActivity = etape.querySelector(".activity-action-list") as HTMLElement;
    expect(inlineActivity.querySelector(".tool-output")).toBeTruthy();
    expect(inlineActivity.querySelector(".tool-output.open")).toBeTruthy();
    const message = await screen.findByText((_, element) =>
      element?.textContent === "Je laisse les tests se terminer."
      && !Array.from(element.children).some((child) => child.textContent === "Je laisse les tests se terminer."));
    const tail = document.querySelector(".active-turn-tail") as HTMLElement;
    expect(message.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll(".active-turn-tail .turn-working-shimmer")).toHaveLength(1);
    expect(inlineActivity.textContent).not.toContain(t("chat.working"));
    expect(document.querySelector(".active-turn-tail .thinking-shimmer")).toBeNull();
  });

  it("intercale narration et groupes d'actions comme Codex", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.text("Je lis d'abord les sources.", FIXED_TS + 50),
      events.tool({ id: "read", name: "Read", detail: "src/App.tsx", status: "completed" }),
      events.tool({ id: "cmd", name: "Bash", detail: "npm test", status: "completed" }),
      events.text("Le premier contrôle est vert.", FIXED_TS + 100),
      events.tool({ id: "search", name: "Bash", detail: "rg -n Chat src", status: "inProgress" }),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const firstText = screen.getByText("Je lis d'abord les sources.");
    const etape = document.querySelector(".timeline-virtual-row .activity-cluster") as HTMLElement;
    const secondText = screen.getByText("Le premier contrôle est vert.");
    const tail = document.querySelector(".active-turn-tail") as HTMLElement;
    expect(firstText.compareDocumentPosition(etape) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(etape.compareDocumentPosition(secondText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(secondText.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Étape DÉPASSÉE (une narration l'a suivie) : ses séries fusionnent en une
    // seule liste — deux outils, sous le seuil, donc rangées plates dans l'ordre.
    const series = [...etape.querySelectorAll<HTMLElement>(".activity-action-list")];
    expect(series).toHaveLength(1);
    const rangees = [...series[0].querySelectorAll<HTMLElement>(".tool-output")];
    expect(rangees).toHaveLength(2);
    // Nommage Hermes : la lecture unique est nommée par son fichier.
    expect(rangees[0].textContent).toContain("App.tsx consulté");
    expect(rangees[1].textContent).toContain("Commande exécutée");
    // La recherche en cours est la série vivante : une ligne, repliée, et le
    // statut y est fusionné — jamais une seconde ligne ticker.
    const derniere = [...document.querySelectorAll<HTMLElement>(".activity-cluster")].pop() as HTMLElement;
    expect(derniere.querySelector("[data-activity-icon='search'], [data-activity-icon='command']")).toBeTruthy();
    expect(derniere.querySelectorAll(".tool-output")).toHaveLength(0);
    expect(derniere.querySelectorAll(".activity-cluster-live [role=status]")).toHaveLength(1);
    expect(tail.textContent).not.toContain("3 actions");
  });

  it("tour actif : chaque tranche de travail reste dans la chronologie", () => {
    // Trois dépôts : en dessous de ce seuil, le cumul répéterait simplement la
    // ligne déposée juste dessous (et le ticker du bas) — cf. doublons signalés.
    const evs: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.tool({ id: "read", name: "Read", detail: "src/App.tsx", status: "completed" }),
      events.text("Je poursuis l'analyse.", FIXED_TS + 100),
      events.tool({ id: "cmd", name: "Bash", detail: "npm test", status: "completed" }),
      events.text("Les tests passent.", FIXED_TS + 150),
      events.tool({ id: "grep", name: "Bash", detail: "rg -n RGI src", status: "completed" }),
      { kind: "thinking_live", text: "Je vérifie les régions RGI…", ts: FIXED_TS + 200 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    // v2 : trois étapes, chacune une série d'une seule catégorie — les rangées
    // restent à plat et dans l'ordre du fil.
    const etapes = [...document.querySelectorAll<HTMLElement>(".activity-cluster")];
    expect(etapes).toHaveLength(3);
    expect(etapes[0].textContent).toContain("App.tsx consulté");
    expect(etapes[1].textContent).toContain("Commande exécutée");
    expect(etapes[2].textContent).toContain("Fichier consulté");
    // La dernière étape se termine par une PENSÉE : sa dernière série n'est pas
    // une grappe, la ligne vivante reste donc séparée — et unique.
    expect(etapes[2].querySelectorAll(".activity-thought")).toHaveLength(1);
    expect(document.querySelectorAll(".activity-cluster-live [role=status]")).toHaveLength(1);
    expect(document.querySelector(".active-turn-header .activity-action-list")).toBeNull();
    expect(document.querySelector(".active-turn-tail .ui-activity")).toBeNull();
  });

  // Le seuil porte sur les LIGNES déposées, pas sur les appels : cinq lectures
  // d'affilée n'en forment qu'une, et le cumul la répéterait mot pour mot.
  it("tour actif : un seul résumé pour plusieurs lectures terminées", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.tool({ id: "r1", name: "Read", detail: "src/a.ts", status: "completed" }),
      events.tool({ id: "r2", name: "Read", detail: "src/b.ts", status: "completed" }),
      events.tool({ id: "r3", name: "Read", detail: "src/c.ts", status: "completed" }),
      { kind: "thinking_live", text: "Je vérifie…", ts: FIXED_TS + 200 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    // Trois lectures = UNE série, repliée en une ligne ; le détail reste à un
    // clic. La pensée vivante garde sa rangée à plat, hors de la série.
    expect(document.querySelectorAll(".activity-action-list .tool-output")).toHaveLength(0);
    expect(document.querySelectorAll(".activity-cluster .ui-activity")).toHaveLength(1);
    fireEvent.click(document.querySelector(".activity-cluster .ui-activity-trigger") as HTMLButtonElement);
    const activity = document.querySelector(".ui-activity-detail .activity-action-list") as HTMLElement;
    expect(activity.querySelectorAll(".tool-output")).toHaveLength(3);
    expect(activity.textContent).toContain("A.ts consulté");
    expect(activity.textContent).toContain("B.ts consulté");
    expect(activity.textContent).toContain("C.ts consulté");
  });

  it("tour actif sans outil : pas de ligne cumulative", () => {
    const evs: AgentEvent[] = [
      events.user("Réfléchis.", FIXED_TS),
      { kind: "thinking_live", text: "Hmm…", ts: FIXED_TS + 50 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    expect(document.querySelector(".turn-cumulative")).toBeNull();
  });

  it("tour actif : n'affiche que l'action courante dans le slot vivant", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      ...Array.from({ length: 8 }, (_, index) => events.tool({
        id: `tool-${index}`,
        name: "Read",
        detail: `file-${index}.ts`,
        status: index === 7 ? "inProgress" : "completed",
      })),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    // Huit outils ne font plus huit rangées : une synthèse et UNE ligne vivante.
    expect(document.querySelector(".activity-action-list")).toBeNull();
    expect(document.querySelectorAll(".active-turn-tail .ui-activity")).toHaveLength(0);
    const live = document.querySelector(".active-turn-tail [role=status]") as HTMLElement;
    expect(live.textContent?.toLowerCase()).toContain("file-7.ts");
    fireEvent.click(document.querySelector(".activity-cluster .ui-activity-trigger") as HTMLButtonElement);
    const activity = document.querySelector(".activity-action-list") as HTMLElement;
    expect(activity.querySelectorAll(".tool-output")).toHaveLength(8);
    fireEvent.click(activity.querySelector(".tool-output-head:last-of-type") as HTMLButtonElement);
    expect(activity.querySelectorAll(".tool-output.open")).toHaveLength(1);
  });

  it("conserve le dernier résultat dans le même slot entre deux outils", () => {
    const read: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.tool({ id: "read", name: "Read", detail: "src/App.tsx", status: "inProgress" }),
    ];
    const view = renderUi(<Chat {...chatProps({ events: read, workingSince: FIXED_TS })} />);
    const initialTail = document.querySelector(".active-turn-tail") as HTMLElement;
    // v2 : la série vivante tient sur une ligne ; on l'ouvre, et ce corps doit
    // rester LE MÊME slot d'un outil à l'autre.
    fireEvent.click(document.querySelector(".activity-cluster .ui-activity-trigger") as HTMLButtonElement);
    const ligneVivante = document.querySelector(".activity-action-list") as HTMLElement;
    expect(ligneVivante.querySelector("[data-activity-icon='read']")).toBeTruthy();
    expect(ligneVivante.querySelector(".tool-output")).toBeTruthy();
    expect(document.querySelector(".active-turn-tail .turn-working-shimmer")).toBeTruthy();
    expect(initialTail.querySelector(".thinking-shimmer")).toBeNull();

    const thinking: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.tool({ id: "read", name: "Read", detail: "src/App.tsx", status: "completed" }),
      { kind: "tool", name: "__thinking" },
    ];
    view.rerender(<Chat {...chatProps({ events: thinking, workingSince: FIXED_TS })} />);

    const updatedTail = document.querySelector(".active-turn-tail") as HTMLElement;
    expect(updatedTail).toBe(initialTail);
    expect(document.querySelectorAll(".active-turn-tail")).toHaveLength(1);
    expect(document.querySelector(".activity-action-list")).toBe(ligneVivante);
    expect(ligneVivante.querySelector(".is-shimmering")).toBeNull();
    expect(document.querySelector(".active-turn-tail .turn-working-shimmer")).toBeTruthy();
    expect(ligneVivante.querySelector(".tool-output")).toHaveClass("is-done");
    // Pensée sans texte : aucune ligne « Réflexion » inventée.
    expect(updatedTail.querySelector(".thinking-shimmer")).toBeNull();
    expect(document.querySelectorAll(".timeline-virtual-row .activity-action-list")).toHaveLength(1);
    expect(ligneVivante.textContent).toContain("App.tsx");
    view.rerender(<Chat {...chatProps({ events: [...thinking, events.text("Je passe à la suite.", FIXED_TS + 500)], workingSince: FIXED_TS })} />);
    expect(ligneVivante.querySelector(".is-shimmering")).toBeNull();
  });

  it("tour actif : l'icône suit l'appel réellement en cours, pas les actions précédentes", () => {
    const evs: AgentEvent[] = [
      events.user("Lis puis teste.", FIXED_TS),
      events.tool({ id: "read", name: "Read", detail: "src/App.tsx", status: "completed" }),
      events.tool({ id: "test", name: "Bash", detail: "npm test", status: "inProgress" }),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    // v2 : la lecture POSÉE reste une rangée à plat ; la commande EN COURS est
    // la série vivante — c'est SON icône que porte la ligne de statut.
    const etape = document.querySelector(".activity-cluster") as HTMLElement;
    expect(etape.querySelector(".activity-action-list [data-activity-icon='read']")).toBeTruthy();
    const vivante = etape.querySelector(".ui-activity") as HTMLElement;
    expect(vivante.querySelector(".ui-activity-icon[data-activity-icon='command']")).toBeTruthy();
    expect(vivante.querySelector(".ui-activity-label.is-shimmering")).toBeNull();
    fireEvent.click(vivante.querySelector(".ui-activity-trigger") as HTMLButtonElement);
    const command = vivante.querySelector(".activity-action-list [data-activity-icon='command']")?.closest(".tool-output");
    expect(command?.querySelector(".tool-output-name")?.textContent).toContain("Commande exécutée");
    expect(document.querySelectorAll(".active-turn-tail .turn-working-shimmer")).toHaveLength(1);
    expect(etape.querySelectorAll(".tool-output")).toHaveLength(2);
  });

  it("déplace le statut sous la réponse après un outil, puis vers l'outil suivant", () => {
    const evs: AgentEvent[] = [
      events.user("Analyse.", FIXED_TS),
      events.tool({ id: "read-before-reply", name: "Read", detail: "Python.md", status: "completed" }),
      events.text("Je poursuis la vérification.", FIXED_TS + 100),
      { kind: "tool", name: "__thinking" },
    ];
    const view = renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    const message = screen.getByText("Je poursuis la vérification.");
    const tail = document.querySelector(".active-turn-tail") as HTMLElement;
    expect(document.querySelectorAll(".active-turn-tail [role=status]")).toHaveLength(1);
    expect(message.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const continued = [...evs, events.tool({ id: "next-command", name: "Bash", detail: "python check.py", status: "inProgress" })];
    view.rerender(<Chat {...chatProps({ events: continued, workingSince: FIXED_TS })} />);
    const nextTail = document.querySelector(".active-turn-tail") as HTMLElement;
    expect(document.querySelectorAll(".active-turn-tail [role=status]")).toHaveLength(1);
    expect(nextTail.closest(".activity-cluster")).toBeTruthy();
    expect(screen.getByText("Je poursuis la vérification.").compareDocumentPosition(nextTail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    view.rerender(<Chat {...chatProps({ events: [...continued, events.done()], workingSince: null })} />);
    expect(document.querySelector(".active-turn-tail")).toBeNull();
  });

  it("garde l'activité visible sous une narration intermédiaire tant que le tour travaille", () => {
    const evs: AgentEvent[] = [
      events.user("Analyse.", FIXED_TS),
      events.text("Je vérifie les données locales.", FIXED_TS + 100),
      { kind: "tool", name: "__thinking" },
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const header = document.querySelector(".active-turn-header") as HTMLElement;
    const message = screen.getByText("Je vérifie les données locales.");
    const tail = document.querySelector(".active-turn-tail") as HTMLElement;
    expect(header).toBeNull();
    expect(tail).toBeTruthy();
    expect(tail.querySelector(".thinking-shimmer")).toBeNull();
    expect(tail.querySelector(".turn-activity-elapsed")).toBeTruthy();
    expect(message.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tour terminé : résumé ordonné comme Codex et icône de la première partie", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.tool({ id: "cmd", name: "Bash", detail: "npm test" }),
      events.tool({ id: "search", name: "Bash", detail: "rg -n albedo src" }),
      events.text("Terminé.", FIXED_TS + 500),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    fireEvent.click(document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement);

    const activity = document.querySelector(".ui-activity.is-summary") as HTMLElement;
    // Une recherche seule porte une requête, pas un nom : elle reste comptée.
    expect(activity.textContent).toContain("Fichier consulté, commande exécutée");
    expect(activity.querySelector("[data-activity-icon='search']")).toBeTruthy();
    expect(activity.querySelector("[data-activity-icon='command']")).toBeNull();
    expect(activity.querySelector(".ui-activity-label.is-shimmering")).toBeNull();
  });

  it("affiche imageView comme Codex avec glyphe monochrome, vignette et aperçu", async () => {
    const imageUrl = "data:image/png;base64,iVBORw0KGgo=";
    const evs: AgentEvent[] = [
      events.user("Regarde l’image.", FIXED_TS),
      {
        kind: "tool_update",
        id: "image-1",
        name: "view_image",
        output: "",
        status: "completed",
        input: { paths: [imageUrl] },
        source: "codex",
      },
      events.text("Je l’ai inspectée.", FIXED_TS + 500),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    fireEvent.click(document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement);

    const activity = document.querySelector(".activity-action-list") as HTMLElement;
    const icon = activity.querySelector("[data-activity-icon='image'] svg") as SVGElement;
    expect(activity.textContent).toContain("Image consultée");
    expect(icon).toHaveAttribute("fill", "none");
    expect(icon).toHaveAttribute("stroke", "currentColor");

    fireEvent.click(activity.querySelector(".tool-output-head") as HTMLButtonElement);
    const thumbnail = await screen.findByRole("button", { name: /Aperçu de/i });
    expect(thumbnail).toHaveClass("image-view-thumbnail");
    fireEvent.click(thumbnail);
    expect(screen.getByRole("dialog", { name: "Aperçu agrandi de l’image" })).toBeInTheDocument();
  });

  it("garde imageView autonome entre deux groupes de commandes", () => {
    const imageUrl = "data:image/png;base64,iVBORw0KGgo=";
    const evs: AgentEvent[] = [
      events.user("Inspecte puis teste.", FIXED_TS),
      events.tool({ id: "cmd-1", name: "Bash", detail: "pwd", status: "completed" }),
      {
        kind: "tool_update", id: "image-1", name: "view_image", output: "", status: "completed",
        input: { paths: [imageUrl] }, source: "codex",
      },
      events.tool({ id: "cmd-2", name: "Bash", detail: "npm test", status: "inProgress" }),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    // v2 : l'image COUPE la série de commandes — trois séries dans l'étape, la
    // dernière (commande en cours) repliée derrière la ligne vivante.
    fireEvent.click(document.querySelector(".activity-cluster .ui-activity-trigger") as HTMLButtonElement);
    const etape = document.querySelector(".activity-cluster") as HTMLElement;
    expect(etape).toBeTruthy();
    expect(etape.querySelectorAll(".activity-action-list")).toHaveLength(3);
    expect(etape.querySelectorAll(".tool-output")).toHaveLength(3);
    expect(document.querySelector(".active-turn-header .activity-action-list")).toBeNull();
    expect(etape.querySelector(".activity-action-list [data-activity-icon='image']")).toBeTruthy();
    expect(etape.textContent).toContain("Image consultée");
    // Toutes les commandes restent à leur place, chacune étant un détail
    // ouvrable dans la même étape chronologique.
    expect(etape.querySelectorAll(".activity-action-list [data-activity-icon='command']")).toHaveLength(2);
  });

  it("rattache les narrations intermédiaires au pli du message final", () => {
    const evs: AgentEvent[] = [
      events.user("Analyse.", FIXED_TS),
      events.tool({ id: "read-1" }),
      events.text("Je vérifie encore.", FIXED_TS + 300),
      events.tool({ id: "read-2", detail: "second.csv" }),
      events.text("Voici la réponse finale.", FIXED_TS + 600),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);

    expect(screen.queryByText("Je vérifie encore.")).toBeNull();
    expect(screen.getByText("Voici la réponse finale.")).toBeTruthy();
    fireEvent.click(document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement);
    expect(screen.getByText("Je vérifie encore.")).toBeTruthy();
  });

  it("ne rend jamais une réflexion vide", () => {
    renderUi(<Chat {...chatProps({ events: [
      events.user("Inspecte."),
      { kind: "thinking", text: "   " } as AgentEvent,
    ] })} />);
    expect(document.querySelector(".thinking")).toBeNull();
  });

  it("l'erreur d'un tour reste visible même pli fermé", () => {
    const evs: AgentEvent[] = [
      events.user("Analyse.", FIXED_TS),
      events.tool({ id: "t1" }),
      events.tool({ id: "t2", name: "Bash" }),
      events.error("provider indisponible"),
      events.done({ ok: false, ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    expect(document.querySelector(".ui-activity.is-summary")).toBeTruthy(); // pli présent
    expect(screen.getByText(/provider indisponible/)).toBeTruthy(); // erreur hors pli
  });

  it("fusionne les appels Edit et les éditions répétées du même fichier", () => {
    const evs: AgentEvent[] = [
      events.user("Améliore la figure.", FIXED_TS),
      { kind: "tool_update", id: "edit-1", name: "Edit", output: "", status: "completed", durationMs: 117 },
      { kind: "edit", files: [{ path: "scripts/plot.py", add: 2, del: 1 }] },
      { kind: "tool_update", id: "edit-2", name: "Edit", output: "", status: "inProgress", durationMs: 140 },
      { kind: "edit", files: [{ path: "scripts/plot.py", add: 3, del: 2 }] },
    ] as AgentEvent[];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    expect(document.querySelectorAll(".edit-line")).toHaveLength(1);
    expect(document.querySelector(".edit-line")?.textContent).toContain("plot.py");
    expect(document.querySelector(".edit-line")?.textContent).toContain("+5");
    expect(document.querySelector(".edit-line")?.textContent).toContain("-3");
    // La ligne « fichier édité » porte déjà le travail (nom + ±) : aucune
    // ligne d'outil ne la double.
    expect(document.querySelectorAll(".ui-activity:not(.is-summary)")).toHaveLength(0);
  });

  it("ouvre un fichier édité dans l'IDE avec le diff exact du tour", () => {
    const onOpen = vi.fn();
    window.addEventListener("chat-open-file", onOpen);
    try {
      const baseSha = "a".repeat(40);
      const evs: AgentEvent[] = [
        events.user("Corrige le tracé.", FIXED_TS),
        {
          kind: "edit",
          projectRoot: "/tmp/fixtures/albedo-pipeline",
          baseSha,
          files: [{ path: "scripts/plot.py", add: 4, del: 1 }],
        },
      ];
      renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
      fireEvent.click(document.querySelector(".edit-line-open") as HTMLButtonElement);
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect((onOpen.mock.calls[0][0] as CustomEvent).detail).toEqual({
        rel: "scripts/plot.py",
        line: null,
        diff: true,
        baseSha,
      });
    } finally {
      window.removeEventListener("chat-open-file", onOpen);
    }
  });

  it("un diff de fin de tour refusé montre l'erreur et peut être redemandé", () => {
    const send = vi.fn();
    setWs({ readyState: 1, send } as unknown as WebSocket);
    try {
      renderUi(<DoneDiffToggle threadId="thread-A" event={{ kind: "done", ok: true, result: "", projectRoot: "/p", filesChanged: ["a.rs"] }} />);
      const toggle = document.querySelector(".turn-diff-toggle") as HTMLButtonElement;
      fireEvent.click(toggle);
      expect(send).toHaveBeenCalledTimes(1);
      act(() => window.dispatchEvent(new CustomEvent("git-diff", { detail: { type: "gitDiff", projectRoot: "/p", path: "a.rs", error: "Serveur occupé", diff: "" } })));
      expect(screen.getByRole("alert").textContent).toBe("Serveur occupé");
      expect(screen.queryByText(t("common.loading"))).toBeNull();
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      expect(send).toHaveBeenCalledTimes(2);
      expect(screen.getByText(t("common.loading"))).toBeTruthy();
    } finally { setWs(null); }
  });

  it("sort du chargement et montre l'erreur quand gitDiff échoue", () => {
    const evs: AgentEvent[] = [
      events.user("Modifie.", FIXED_TS),
      { kind: "edit", projectRoot: "/tmp/fixtures/albedo-pipeline", files: [{ path: "scripts/plot.py", add: 1, del: 0 }] },
    ] as AgentEvent[];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    fireEvent.click(document.querySelector(".edit-line-difftoggle") as HTMLButtonElement);
    act(() => window.dispatchEvent(new CustomEvent("git-diff", { detail: {
      type: "gitDiff", projectRoot: "/tmp/fixtures/albedo-pipeline",
      path: "scripts/plot.py", diff: "", error: "diff indisponible",
    } })));
    expect(screen.getByText("diff indisponible")).toBeTruthy();
    expect(screen.queryByText(t("common.loading"))).toBeNull();
  });

  // Façon Claude Code desktop (2026-08-22) : le diff porté par l'événement
  // (oldText/newText du tool Edit) s'affiche SANS clic et SANS requête git ;
  // un edit sans snippet, lui, reste fermé jusqu'au clic.
  it("le diff d'une édition à snippet s'ouvre tout seul, sans gitDiff", () => {
    const evs: AgentEvent[] = [
      events.user("Modifie.", FIXED_TS),
      { kind: "edit", projectRoot: "/tmp/fixtures/albedo-pipeline",
        files: [{ path: "scripts/plot.py", add: 1, del: 1, oldText: "x = 1", newText: "x = 2" }] },
    ] as AgentEvent[];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    expect(document.querySelector(".edit-line-difftoggle")?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".turn-diff-body")).toBeTruthy();
    // un clic referme — le choix manuel garde la main
    fireEvent.click(document.querySelector(".edit-line-difftoggle") as HTMLButtonElement);
    expect(document.querySelector(".turn-diff-body")).toBeNull();
  });

  it("un edit sans snippet reste fermé par défaut", () => {
    const evs: AgentEvent[] = [
      events.user("Modifie.", FIXED_TS),
      { kind: "edit", projectRoot: "/tmp/fixtures/albedo-pipeline",
        files: [{ path: "scripts/plot.py", add: 1, del: 0 }] },
    ] as AgentEvent[];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    expect(document.querySelector(".edit-line-difftoggle")?.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".turn-diff-body")).toBeNull();
  });

  it("aucun chevron texte ▸/▾ dans le fil", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    fireEvent.click(document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement);
    expect(document.body.textContent).not.toMatch(/[▸▾]/);
  });
});

describe("figure annotée envoyée depuis la galerie", () => {
  it("garde les fichiers dans la bulle et les affiche encore pendant la modification", () => {
    renderUi(<Chat {...chatProps({events:[{kind:"user",text:"Relis ceci",label:"results_en.tex · methods_en.tex",ts:FIXED_TS}] as AgentEvent[]})} />);
    const attachments = document.querySelectorAll(".user-bubble .user-file-attachment");
    expect([...attachments].map(el=>el.textContent)).toEqual(["results_en.tex","methods_en.tex"]);
    expect(document.querySelector(".user-label")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:t("action.edit-resend")}));
    expect(document.querySelectorAll(".edit-box-shell .user-file-attachment")).toHaveLength(2);
  });
  it("affiche un fichier envoyé sans texte dans sa propre bulle", () => {
    renderUi(<Chat {...chatProps({events:[{kind:"user",text:"",label:"results_en.tex",ts:FIXED_TS}] as AgentEvent[]})} />);
    expect(document.querySelector(".user-bubble .user-file-attachment")?.textContent).toBe("results_en.tex");
  });
  // 2026-09-04 : le fil n'affichait que le nom du fichier généré (horodaté)
  // au-dessus d'une bulle vide — vignette absente, notes jamais rendues.
  it("montre la vignette, la figure source et les badges numérotés", () => {
    const evenements: AgentEvent[] = [
      {
        kind: "user",
        text: "",
        ts: FIXED_TS,
        imageUrl: "data:image/png;base64,iVBORw0KGgo=",
        label: "fig3_regional_years.png",
        notes: [
          { n: 1, text: "déplacer la carte" },
          { n: 2, text: "l'axe des années déborde" },
        ],
      } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evenements })} />);
    // vignette discrète, jamais l'image en grand : Thierry a la figure sous
    // les yeux dans la galerie, le fil n'a besoin que du rappel
    expect(document.querySelector(".user-annot-thumb")).toBeTruthy();
    expect(document.querySelector(".user-img")).toBeNull();
    expect(screen.getByText("fig3_regional_years.png")).toBeTruthy();
    expect(screen.getByText("déplacer la carte")).toBeTruthy();
    expect(screen.getByText("l'axe des années déborde")).toBeTruthy();
    const badges = [...document.querySelectorAll(".user-annot-badge")].map((b) => b.textContent);
    expect(badges).toEqual(["1", "2"]);
    // texte vide → aucune bulle vide sous la carte (Thierry, 2026-09-04)
    expect(document.querySelector(".user-bubble")).toBeNull();
  });

  it("un message image sans notes garde le rendu d'avant", () => {
    const evenements: AgentEvent[] = [
      { kind: "user", text: "regarde", ts: FIXED_TS,
        imageUrl: "data:image/png;base64,iVBORw0KGgo=" } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evenements })} />);
    expect(document.querySelector(".user-annots")).toBeNull();
  });
});

describe("capsule résultat — honnêteté et actions", () => {
  it("tour ok : garde le statut et masque tokens et coût", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const capsule = document.querySelector(".result-capsule") as HTMLElement;
    expect(capsule).toBeTruthy();
    expect(capsule.textContent).toContain(t("chat.turn-done"));
    expect(capsule.textContent).not.toMatch(/tokens|\$/i);
    expect(capsule.querySelector(".capsule-meta")).toBeNull();
    expect(capsule.querySelector(".capsule-head.is-success-minimal")).toBeTruthy();
    expect(capsule.querySelector(".capsule-status")).toBeNull();
  });

  it("done sans usage : aucune ligne de télémétrie vide", () => {
    const evs: AgentEvent[] = [
      events.user("Question.", FIXED_TS),
      { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/fixtures/albedo-pipeline",
        filesChanged: [], ts: FIXED_TS + 100 } as unknown as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    const capsule = document.querySelector(".result-capsule") as HTMLElement;
    expect(capsule.querySelector(".capsule-head.is-success-minimal")).toBeTruthy();
    expect(capsule.querySelector(".capsule-meta")).toBeNull();
    expect(capsule.textContent).not.toContain("✓");
  });

  it("tour ok:false : « Tour interrompu » en ton warning", () => {
    const evs: AgentEvent[] = [
      events.user("Question.", FIXED_TS),
      events.done({ ok: false, ts: FIXED_TS + 100 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    const capsule = document.querySelector(".result-capsule.warn") as HTMLElement;
    expect(capsule).toBeTruthy();
    expect(capsule.textContent).toContain(t("chat.turn-interrupted"));
    expect(capsule.querySelector(".capsule-status.warn svg")).toBeTruthy();
  });

  // « Annuler le tour » retiré de la capsule (Thierry, 2026-08-21) : doublon
  // strict de l'action portée par la bulle user, et il flottait en absolu
  // par-dessus la carte des fichiers. L'annulation reste accessible là.
  it("l'annulation du tour vit sur la bulle user, pas dans la capsule", () => {
    const onRevert = vi.fn();
    renderUi(<Chat {...chatProps({ events: finishedTurn(), onRevert })} />);
    expect(screen.queryByText(t("chat.revert-turn"))).toBeNull();
    const action = document.querySelector(
      `.user-message [aria-label="${t("chat.revert-title")}"], .user-message [title="${t("chat.revert-title")}"]`,
    ) as HTMLElement;
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(onRevert).toHaveBeenCalledWith(0, "Analyse l'albédo.", false);
  });

  it("fichiers modifiés : le libellé honnête compte les fichiers, le diff est à la demande", () => {
    const evs: AgentEvent[] = [
      events.user("Corrige.", FIXED_TS),
      events.done({ filesChanged: ["a.py", "b.py"], ts: FIXED_TS + 100 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    // La carte « fichiers modifiés » porte le compte ; le repli DoneDiffToggle
    // ne duplique plus ce libellé quand la carte est rendue (F3).
    const card = document.querySelector(".changed-files-card") as HTMLElement;
    expect(card.querySelector(".changed-files-head")?.textContent).toContain(t("chat.files-modified", { count: 2 }));
    expect(document.querySelector(".turn-diff-toggle")).toBeNull();
    expect(document.querySelector(".turn-diff-body")).toBeNull(); // à la demande
  });

  it("carte « fichiers modifiés » : liste triée par volume, le clic ouvre le même diff que le repli", () => {
    const evs: AgentEvent[] = [
      events.user("Corrige.", FIXED_TS),
      { kind: "edit", files: [{ path: "src/a.ts", add: 1, del: 0 }], ts: FIXED_TS + 50 } as AgentEvent,
      { kind: "edit", files: [{ path: "src/b.ts", add: 5, del: 5 }], ts: FIXED_TS + 60 } as AgentEvent,
      events.done({ filesChanged: ["src/a.ts", "src/b.ts"], ts: FIXED_TS + 100 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);

    const card = document.querySelector(".changed-files-card") as HTMLElement;
    expect(card).toBeTruthy();
    const rows = [...card.querySelectorAll(".changed-files-row")];
    expect(rows).toHaveLength(2);
    // triée : b.ts (+5/−5) avant a.ts (+1/−0)
    expect(rows[0].textContent).toContain("b.ts");
    expect(rows[0].querySelector(".diff-add")?.textContent).toBe("+5");
    expect(rows[0].querySelector(".diff-del")?.textContent).toBe("−5");
    expect(rows[1].textContent).toContain("a.ts");

    // pas de diff ouvert avant le clic ; le repli est masqué (carte présente, F3)
    expect(document.querySelector(".changed-files-diff")).toBeNull();
    expect(document.querySelector(".turn-diff-toggle")).toBeNull();

    // Clic sur UNE ligne : seul CE fichier ouvre son diff, sous sa ligne.
    fireEvent.click(rows[0] as HTMLElement);
    const items = [...card.querySelectorAll(".changed-files-item")];
    expect(items[0].querySelector(".changed-files-diff")).toBeTruthy();
    expect(items[1].querySelector(".changed-files-diff")).toBeNull();
    expect(rows[0].getAttribute("aria-expanded")).toBe("true");
    // Re-clic : il se referme.
    fireEvent.click(rows[0] as HTMLElement);
    expect(document.querySelector(".changed-files-diff")).toBeNull();

    // Plus d'action d'en-tête (« Voir le diff » / « Annuler les fichiers »
    // retirés) : le clic par fichier est le seul point d'entrée, et deux
    // fichiers peuvent être ouverts en même temps.
    expect(card.querySelector(".changed-files-review")).toBeNull();
    expect(card.querySelector(".turn-diff-undo")).toBeNull();
    fireEvent.click(rows[0] as HTMLElement);
    fireEvent.click(rows[1] as HTMLElement);
    expect(card.querySelectorAll(".changed-files-diff")).toHaveLength(2);
  });

  it("aucune section « tests » n'existe sans événement qui la porte", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const capsule = document.querySelector(".result-capsule") as HTMLElement;
    expect(capsule.textContent!.toLowerCase()).not.toMatch(/test|réussi|validé/);
  });
});

// Demandes Thierry (2026-07-10) : pas de badge permanent après un tour ;
// la pastille goal se ferme immédiatement au clic corbeille.
describe("en-tête et goal — retours utilisateur", () => {
  it("aucun badge de statut dans l'en-tête après un tour terminé", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    expect(document.querySelector(".chat-surface-header .ui-badge")).toBeNull();
  });

  it("aucun badge non plus pendant un run (le fil porte le running)", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn().slice(0, 2), workingSince: FIXED_TS })} />);
    expect(document.querySelector(".chat-surface-header .ui-badge")).toBeNull();
  });

  it("goal bloqué : détail lisible et arrêt directement accessible", () => {
    const onGoal = vi.fn();
    const onStop = vi.fn();
    const evs: AgentEvent[] = [
      events.user("Fais X.", FIXED_TS),
      { kind: "goal", goal: { objective: "est un goal avec une tache précise", status: "blocked" }, ts: FIXED_TS + 10 } as unknown as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, onGoal, onStop })} />);
    expect(document.querySelector(".goal-bar")).toBeTruthy();
    expect(screen.getByTitle(t("goal.status.awaiting"))).toBeTruthy();
    expect(screen.queryByText(t("goal.status.blocked"))).toBeNull();
    expect(screen.getByTitle(t("goal.stop"))).toBeTruthy();
    fireEvent.click(screen.getByTitle(t("goal.expand")));
    fireEvent.click(screen.getByTitle(t("goal.stop")));
    expect(onGoal).toHaveBeenCalledWith("clear", undefined, undefined);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".goal-bar")).toBeNull();
  });
});

// Régression 2026-07-16 : au boot, le replay renvoie la bulle user ARCHIVÉE
// (UserDisplayEvent : pastes {name, lines}, jamais de texte) — le fil doit la
// rendre sans crasher, méta lignes comprise, chip inerte (rien à ouvrir).
describe("bulle user restaurée — pastes archivés sans texte", () => {
  it("pastes {name, lines} : rendu sans crash, nom + méta lignes affichés", () => {
    const restored: AgentEvent = {
      kind: "user", text: "Regarde ma sélection.", ts: FIXED_TS,
      pastes: [{ name: "atelier", lines: 12 }],
    };
    renderUi(<Chat {...chatProps({ events: [restored] })} />);
    const chip = document.querySelector(".paste-chip") as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("atelier");
    expect(chip.textContent).toContain(t("chat.lines", { lines: "12" }));
  });

  // L'aperçu vit DANS le panneau de chat, délibérément : la webview NATIVE du
  // navigateur peint au-dessus de tout le DOM, donc un overlay pleine fenêtre
  // (portail body, essayé puis annulé le 2026-08-27) passait SOUS elle et se
  // faisait couper. Le `container-type` de .chat-primary fait du panneau le
  // bloc conteneur du `position: fixed` — inset 0 y couvre exactement le seul
  // espace garanti visible. Le débordement d'origine venait de la LARGEUR
  // (640px fixes dans un panneau rétréci), corrigée en % dans App.css.
  it("l'aperçu d'un collage reste confiné au panneau de chat (webview native au-dessus du DOM)", () => {
    const local: AgentEvent = {
      kind: "user", text: "Voici le fichier.", ts: FIXED_TS,
      pastes: [{ name: "extrait.txt", text: "a\nb\nc" }],
    };
    renderUi(<Chat {...chatProps({ events: [local] })} />);
    fireEvent.click(document.querySelector(".paste-chip") as HTMLElement);
    const overlay = document.querySelector(".paste-overlay") as HTMLElement;
    expect(overlay, "aperçu non ouvert au clic").toBeTruthy();
    expect(document.querySelector(".chat-primary")?.contains(overlay)).toBe(true);
  });

  it("pastes locaux {name, text} : méta lignes calculée depuis le texte", () => {
    const local: AgentEvent = {
      kind: "user", text: "Voici le fichier.", ts: FIXED_TS,
      pastes: [{ name: "extrait.txt", text: "a\nb\nc" }],
    };
    renderUi(<Chat {...chatProps({ events: [local] })} />);
    const chip = document.querySelector(".paste-chip") as HTMLElement;
    expect(chip.textContent).toContain(t("chat.lines", { lines: "3" }));
  });
});
