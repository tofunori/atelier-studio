// Anatomie du tour : modèle Synara — un seul état actif, journal humain
// dépliable et, une fois terminé, pli compact « Worked for… ».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null), isTauri: () => false }));

import Chat from "../Chat";
import { LiveThinking, ThinkingBlock, ThinkingShimmer } from "./turnParts";
import { renderUi, resetTestState } from "../../test/render";
import { events, FIXED_TS } from "../../test/fixtures";
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
  // lui passer la pensée. Résultat : le mot « Réflexion » seul pendant toute
  // l'attente, quelle que soit sa durée.
  it("le tour en cours affiche la pensée, pas seulement le mot « Réflexion »", () => {
    const live: AgentEvent[] = [
      events.user("Ok et qu'est-ce que tu recommandes sinon", FIXED_TS),
      { kind: "thinking_live", text: "Je relis la section méthodes pour voir ce qui manque.", ts: FIXED_TS + 100 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: live, workingSince: FIXED_TS })} />);
    const indicator = document.querySelector(".thinking-live-indicator") as HTMLElement;
    // L'indicateur porte désormais un en-tête repliable (façon Hermes) : le
    // texte de la pensée doit s'y trouver, le shimmer non.
    expect(indicator.textContent).toContain("Je relis la section méthodes pour voir ce qui manque.");
    expect(indicator.querySelector(".thinking-live-stream")?.textContent).toBe("Je relis la section méthodes pour voir ce qui manque.");
    expect(indicator.querySelector(".thinking-shimmer")).toBeNull();
  });

  it("la préférence replie la pensée vivante par défaut, le clic la déplie", () => {
    const evs: AgentEvent[] = [
      events.user("Réfléchis.", FIXED_TS),
      { kind: "thinking_live", text: "Une longue pensée déjà en cours.", ts: FIXED_TS + 50 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS, defaults: { transcriptView: "normal" } })} />);
    // Réduit = fenêtre courte (quelques lignes, calée sur la fin), pas le flux.
    const fenetre = document.querySelector(".thinking-live-stream.windowed");
    expect(fenetre?.textContent).toContain("longue pensée");
    expect(document.querySelector(".thinking-live-stream.plein")).toBeNull();
    fireEvent.click(document.querySelector(".thinking-live-head") as HTMLButtonElement);
    expect(document.querySelector(".thinking-live-stream.plein")).toBeTruthy();
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
    const indicator = document.querySelector(".thinking-live-indicator") as HTMLElement;
    expect(indicator.textContent).toContain("CLAUDE.md content");
    expect(indicator.textContent!.endsWith("fro...")).toBe(true);
    expect(indicator.querySelector(".thinking-shimmer")).toBeNull();
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
    const indicator = document.querySelector(".thinking-live-indicator") as HTMLElement;
    expect(indicator.textContent).toContain("they want my opinion");
    // et surtout : pas la pensée d'AVANT le premier texte
    expect(indicator.textContent).not.toContain("asking about the style");
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
    const indicator = document.querySelector(".thinking-live-indicator") as HTMLElement;
    expect(indicator?.textContent).toContain("Je pèse le pour et le contre");
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

  it("chronomètre le silence d'une pensée muette — seulement après un premier progrès", () => {
    vi.useFakeTimers();
    // AVANT tout progrès : le chrono du tour compte déjà la même chose —
    // « en attente » serait un horodateur en double (vécu 2026-08-21).
    const sansProgres: AgentEvent[] = [
      events.user("Réfléchis.", FIXED_TS),
      { kind: "tool", name: "__thinking" } as AgentEvent, // pensée SANS texte (headless caviardé)
    ];
    const first = renderUi(<Chat {...chatProps({ events: sansProgres, workingSince: FIXED_TS })} />);
    act(() => { vi.advanceTimersByTime(3100); });
    // Le slot existe toujours (il réserve sa place) mais reste MUET.
    expect(document.querySelector(".turn-quiet")?.textContent).toBe("");
    first.unmount();

    // APRÈS un progrès (un outil réglé), le silence diverge du chrono du
    // tour : le minuteur remplace le shimmer dans la ligne Réflexion.
    const apresProgres: AgentEvent[] = [
      events.user("Réfléchis.", FIXED_TS),
      events.tool({ id: "t1", name: "Read", detail: "src/a.ts", status: "completed" }),
      { kind: "tool", name: "__thinking" } as AgentEvent,
    ];
    const view = renderUi(<Chat {...chatProps({ events: apresProgres, workingSince: FIXED_TS })} />);
    // le montage voit déjà la signature stable : simule le progrès en ajoutant
    // l'update qui MUTE la signature après coup
    view.rerender(<Chat {...chatProps({ events: [
      ...apresProgres.slice(0, 2),
      events.tool({ id: "t1", name: "Read", detail: "src/a.ts", status: "interrupted" }),
      { kind: "tool", name: "__thinking" } as AgentEvent,
    ], workingSince: FIXED_TS })} />);
    act(() => { vi.advanceTimersByTime(3100); });
    expect(document.querySelector(".turn-quiet")?.textContent).toMatch(/en attente · \d+ s/);
    vi.useRealTimers();
  });

  // F1 (revue finale phase 2) : « en attente » ne doit jamais s'afficher
  // pendant que la réponse est en train de streamer — le texte qui grossit
  // EST le progrès visible, même sans nouvel outil ni nouvelle pensée.
  it("ne montre jamais « en attente » pendant le streaming de la réponse, même après 3 s", () => {
    vi.useFakeTimers();
    const evs: AgentEvent[] = [
      events.user("Réponds.", FIXED_TS),
      { kind: "streaming", text: "Voici le début de la réponse", ts: FIXED_TS + 100 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    act(() => { vi.advanceTimersByTime(3100); });
    expect(document.querySelector(".turn-quiet")?.textContent).toBe("");
    vi.useRealTimers();
  });

  // Le dédoublonnage par inclusion est couvert par ses propres tests unitaires
  // (src/lib/chat/thinkingDedup.test.ts) : ici, le pli d'activité d'un tour
  // terminé masque déjà les blocs, donc le DOM n'en dirait rien de fiable.

  // Régression (vécu 2026-08-22, capture de Thierry) : « en attente · Ns » se
  // montait puis se démontait sur une ligne à elle. Le fil étant ancré en bas,
  // chaque aller-retour poussait tout le transcript vers le haut puis le
  // relâchait. Le slot doit donc EXISTER en permanence, sur la ligne du rappel
  // d'interruption : l'apparition du texte ne change aucune géométrie.
  it("le silence n'ajoute ni ne retire de ligne : slot permanent sur la ligne d'interruption", () => {
    vi.useFakeTimers();
    const evs: AgentEvent[] = [
      events.user("Réfléchis.", FIXED_TS),
      events.tool({ id: "t1", name: "Read", detail: "src/a.ts", status: "completed" }),
      { kind: "tool", name: "__thinking" } as AgentEvent,
    ];
    const view = renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    const ligneAvant = document.querySelector(".turn-tail-row");
    expect(ligneAvant).toBeTruthy();
    // le slot est déjà là, muet, et vit DANS la ligne du rappel d'interruption
    expect(ligneAvant!.querySelector(".turn-quiet")?.textContent).toBe("");
    expect(ligneAvant!.querySelector(".stop-hint")).toBeTruthy();

    // progrès puis silence : le texte apparaît SANS créer de nouvelle ligne
    view.rerender(<Chat {...chatProps({ events: [
      ...evs.slice(0, 2),
      events.tool({ id: "t1", name: "Read", detail: "src/a.ts", status: "interrupted" }),
      { kind: "tool", name: "__thinking" } as AgentEvent,
    ], workingSince: FIXED_TS })} />);
    act(() => { vi.advanceTimersByTime(3100); });
    const ligneApres = document.querySelector(".turn-tail-row")!;
    expect(ligneApres.querySelector(".turn-quiet")?.textContent).toMatch(/en attente · \d+ s/);
    expect(ligneApres.childElementCount).toBe(ligneAvant!.childElementCount);
    expect(document.querySelectorAll(".turn-tail-row")).toHaveLength(1);
    vi.useRealTimers();
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
    expect(document.querySelectorAll(".ui-activity:not(.is-summary)")).toHaveLength(1);
    expect(document.querySelectorAll(".ui-activity.is-completed:not(.is-summary)")).toHaveLength(1);
    expect(document.querySelectorAll(".ui-activity-label")[1]?.textContent?.toLowerCase())
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

    const working = document.querySelector(".working-header") as HTMLElement;
    expect(working).toBeTruthy();
    expect(document.querySelectorAll(".working-header")).toHaveLength(1);
    // Façon Hermes : pulse + temps seul, sans « Travaille depuis ».
    expect(working.textContent).not.toContain("Travaille depuis");
    expect(working.textContent).toMatch(/\d/);
    expect(working.querySelector(".working-spin")).toBeNull();
    expect(working.querySelector(".working-divider")).toBeTruthy();
    // Le raisonnement vit à SA place dans le fil (au-dessus de l'activité en
    // cours), plus dans la queue du tour : une ligne, jamais deux.
    expect(document.querySelectorAll(".thinking-live-indicator")).toHaveLength(1);
    expect(document.querySelectorAll(".active-turn-tail .thinking-live-indicator")).toHaveLength(0);
    expect(document.querySelector(".thinking-shimmer")).toBeNull();
    // Deux outils consécutifs forment UN run : une seule ligne, qui tique sur
    // l'action courante au lieu d'être hissée dans une queue.
    expect(document.querySelectorAll(".ui-activity:not(.is-summary)")).toHaveLength(1);
    // La ligne vivante est la DERNIÈRE du fil (elle porte le ticker) — la
    // queue ne narre plus le travail.
    expect(document.querySelectorAll(".active-turn-tail .ui-activity")).toHaveLength(0);
    const vivantes = [...document.querySelectorAll(".ui-activity:not(.is-summary)")];
    const activity = vivantes[vivantes.length - 1].querySelector(".ui-activity-trigger") as HTMLButtonElement;
    expect(activity.textContent).toContain("Lit albedo.ts");
    expect(activity.querySelector("[data-activity-icon='read']")).toBeTruthy();
    expect(activity.querySelector(".ui-activity-label.is-shimmering")).toBeTruthy();
    expect(screen.queryByText("Bash")).toBeNull();
    fireEvent.click(activity);
    expect(document.querySelectorAll(".reasoning-trace")).toHaveLength(0);
    expect(screen.queryByText("Je confirme le chemin utile.")).toBeNull();
    // Le run contient les DEUX appels (recherche réglée + lecture en cours) :
    // les déplier montre les deux lignes d'outil.
    expect(screen.getAllByText("Bash")).toHaveLength(2);
  });

  it("rend statique une commande running fermée par une narration plus récente", () => {
    const evs: AgentEvent[] = [
      events.user("Teste.", FIXED_TS),
      events.tool({ id: "test", name: "Bash", detail: "npm test", status: "inProgress" }),
      { kind: "streaming", text: "Je laisse les tests se terminer.", ts: FIXED_TS + 100 },
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const inlineActivity = document.querySelector(".timeline-virtual-row .ui-activity:not(.is-summary)") as HTMLElement;
    expect(inlineActivity).toBeTruthy();
    expect(inlineActivity.querySelector(".is-shimmering")).toBeNull();
    expect(inlineActivity.textContent).not.toContain(t("chat.working"));
    expect(document.querySelector(".active-turn-tail .ui-activity")).toBeNull();
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
    const inlineActivity = document.querySelector(".timeline-virtual-row .ui-activity:not(.is-summary)") as HTMLElement;
    const secondText = screen.getByText("Le premier contrôle est vert.");
    const tail = document.querySelector(".active-turn-tail") as HTMLElement;
    expect(firstText.compareDocumentPosition(inlineActivity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(inlineActivity.compareDocumentPosition(secondText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(secondText.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nommage Hermes : la lecture unique est nommée par son fichier.
    expect(inlineActivity.textContent).toContain("App.tsx consulté, commande exécutée");
    // La recherche en cours tique sur SA ligne, dans le fil.
    const derniere = [...document.querySelectorAll(".ui-activity:not(.is-summary)")].pop() as HTMLElement;
    expect(derniere.querySelector(".tool-ticker")).toBeTruthy();
    expect(derniere.textContent).toContain("Recherche");
    expect(tail.textContent).not.toContain("3 actions");
  });

  it("tour actif : le header cumule le travail de tout le tour, tranches fermées comprises", () => {
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

    const cumulative = document.querySelector(".active-turn-header .turn-cumulative") as HTMLElement;
    expect(cumulative).toBeTruthy();
    // Le cumul agrège les trois dépôts : la lecture et la recherche comptent
    // ensemble comme exploration, la commande garde sa clause.
    expect(cumulative.textContent).toContain("2 fichiers consultés");
    expect(cumulative.textContent).toContain("commande exécutée");
    // La catégorie de l'action la plus récente (la recherche) est éclairée.
    expect(cumulative.querySelector(".turn-cumulative-live")?.textContent).toContain("fichiers");
  });

  // Le seuil porte sur les LIGNES déposées, pas sur les appels : cinq lectures
  // d'affilée n'en forment qu'une, et le cumul la répéterait mot pour mot.
  it("tour actif : pas de cumul quand tout le travail tient en une seule ligne", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.tool({ id: "r1", name: "Read", detail: "src/a.ts", status: "completed" }),
      events.tool({ id: "r2", name: "Read", detail: "src/b.ts", status: "completed" }),
      events.tool({ id: "r3", name: "Read", detail: "src/c.ts", status: "completed" }),
      { kind: "thinking_live", text: "Je vérifie…", ts: FIXED_TS + 200 } as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    // une seule ligne « 3 fichiers consultés » déposée → aucun cumul au-dessus
    expect(document.querySelectorAll(".ui-activity:not(.is-summary)").length).toBe(1);
    expect(document.querySelector(".turn-cumulative")).toBeNull();
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

    const activity = [...document.querySelectorAll(".ui-activity:not(.is-summary)")].pop() as HTMLElement;
    expect(activity).toBeTruthy();
    expect(document.querySelectorAll(".active-turn-tail .ui-activity")).toHaveLength(0);
    expect(activity.textContent).toContain("file-7.ts");
    expect(activity.textContent).not.toContain(t("chat.active-action-n", { n: 8 }));
    fireEvent.click(activity.querySelector(".ui-activity-trigger") as HTMLButtonElement);
    expect(document.querySelectorAll(".ui-activity-detail .tool-output").length).toBeGreaterThan(0);
  });

  it("remplace Read par Thinking dans exactement le même slot sans ligne dupliquée", () => {
    const read: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.tool({ id: "read", name: "Read", detail: "src/App.tsx", status: "inProgress" }),
    ];
    const view = renderUi(<Chat {...chatProps({ events: read, workingSince: FIXED_TS })} />);
    const initialTail = document.querySelector(".active-turn-tail") as HTMLElement;
    const ligneVivante = document.querySelector(".ui-activity:not(.is-summary)") as HTMLElement;
    expect(ligneVivante.querySelector("[data-activity-icon='read']")).toBeTruthy();
    expect(ligneVivante.querySelector(".ui-activity-label.is-shimmering")).toBeTruthy();
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
    expect(updatedTail.querySelector(".ui-activity")).toBeNull();
    // Pensée sans texte : aucune ligne « Réflexion » inventée.
    expect(updatedTail.querySelector(".thinking-shimmer")).toBeNull();
    // La lecture terminée reste une ligne durable du transcript (progression).
    expect(document.querySelectorAll(".timeline-virtual-row .ui-activity:not(.is-summary)")).toHaveLength(1);
  });

  it("tour actif : l'icône suit l'appel réellement en cours, pas les actions précédentes", () => {
    const evs: AgentEvent[] = [
      events.user("Lis puis teste.", FIXED_TS),
      events.tool({ id: "read", name: "Read", detail: "src/App.tsx", status: "completed" }),
      events.tool({ id: "test", name: "Bash", detail: "npm test", status: "inProgress" }),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const activity = [...document.querySelectorAll(".ui-activity:not(.is-summary)")].pop() as HTMLElement;
    expect(activity.querySelector("[data-activity-icon='command']")).toBeTruthy();
    expect(activity.textContent).toContain(t("chat.activity-running-tests"));
    expect(activity.querySelector("[data-activity-icon='read']")).toBeNull();
    expect(activity.querySelector(".ui-activity-label.is-shimmering")).toBeTruthy();
    expect(activity.querySelector(".ui-activity-icon.is-shimmering")).toBeNull();
    expect(activity.querySelector(".ui-activity-meta.is-shimmering")).toBeNull();
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
    expect(header).toBeTruthy();
    expect(tail).toBeTruthy();
    expect(tail.querySelector(".thinking-shimmer")).toBeNull();
    expect(header.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    const activity = document.querySelector(".ui-activity:not(.is-summary)") as HTMLElement;
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

    const activity = document.querySelector(".ui-activity:not(.is-summary)") as HTMLElement;
    const icon = activity.querySelector("[data-activity-icon='image'] svg") as SVGElement;
    expect(activity.textContent).toContain("Image consultée");
    expect(icon).toHaveAttribute("fill", "none");
    expect(icon).toHaveAttribute("stroke", "currentColor");

    fireEvent.click(activity.querySelector(".ui-activity-trigger") as HTMLButtonElement);
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

    const activities = [...document.querySelectorAll<HTMLElement>(".ui-activity:not(.is-summary)")];
    expect(activities).toHaveLength(3);
    expect(activities[0].querySelector("[data-activity-icon='command']")).toBeTruthy();
    expect(activities[1].querySelector("[data-activity-icon='image']")).toBeTruthy();
    expect(activities[1].textContent).toContain("Image consultée");
    // La commande EN COURS se dépose à sa place et c'est SA ligne qui tique —
    // elle n'est plus hissée dans la queue du tour.
    expect(activities[2].closest(".active-turn-tail")).toBeNull();
    expect(activities[2].querySelector("[data-activity-icon='command']")).toBeTruthy();
    expect(activities[2].querySelector(".tool-ticker")).toBeTruthy();
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

  it("goal bloqué : état humain et actions rares seulement dans le détail", () => {
    const onGoal = vi.fn();
    const onStop = vi.fn();
    const evs: AgentEvent[] = [
      events.user("Fais X.", FIXED_TS),
      { kind: "goal", goal: { objective: "est un goal avec une tache précise", status: "blocked" }, ts: FIXED_TS + 10 } as unknown as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, onGoal, onStop })} />);
    expect(document.querySelector(".goal-bar")).toBeTruthy();
    expect(screen.getByText(t("goal.status.awaiting"))).toBeTruthy();
    expect(screen.queryByText(t("goal.status.blocked"))).toBeNull();
    expect(screen.queryByTitle(t("goal.stop"))).toBeNull();
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
