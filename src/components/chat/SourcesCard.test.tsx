// Carte « Sources » (maquette « Narration du tour ») : les liens ne viennent
// QUE du markdown du message — jamais du réseau — et la carte n'apparaît que
// sous la réponse d'un tour qui a réellement fait une recherche web.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null), isTauri: () => false }));

import Chat from "../Chat";
import { SourcesCard } from "./SourcesCard";
import { renderUi, resetTestState } from "../../test/render";
import { events, FIXED_TS } from "../../test/fixtures";
import { setLanguage } from "../../lib/i18n";
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
  return { ...base, ...over, defaults: { ...base.defaults, ...over.defaults } } as Parameters<typeof Chat>[0];
}

beforeEach(() => { resetTestState(); setLanguage("fr"); });
afterEach(cleanup);

describe("SourcesCard", () => {
  it("rend les chips de domaine et le plafond", () => {
    renderUi(<SourcesCard markdown={"Voir [G](https://www.grammalecte.net/doc) et https://a.org/x"} />);
    const carte = screen.getByTestId("sources-card");
    expect(carte.textContent).toContain("grammalecte.net");
    expect(carte.textContent).toContain("a.org");
    expect(carte.querySelectorAll("a.source-chip")).toHaveLength(2);
  });

  it("aucune source → aucun rendu", () => {
    renderUi(<SourcesCard markdown={"Pas de lien ici."} />);
    expect(screen.queryByTestId("sources-card")).toBeNull();
  });
});

describe("carte Sources dans le fil", () => {
  const reponse = "Trouvé sur [Grammalecte](https://www.grammalecte.net/doc).";

  it("un tour avec recherche web montre la carte sous la réponse", () => {
    const fil: AgentEvent[] = [
      events.user("Cherche une alternative à Antidote.", FIXED_TS),
      events.tool({ id: "ws1", name: "web_search", detail: "grammalecte", output: "", input: { queries: ["grammalecte"] }, ts: FIXED_TS + 100 }),
      events.text(reponse, FIXED_TS + 500),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: fil })} />);
    expect(screen.getByTestId("sources-card").textContent).toContain("grammalecte.net");
  });

  it("un tour sans recherche web ne montre aucune carte", () => {
    const fil: AgentEvent[] = [
      events.user("Résume ce fichier.", FIXED_TS),
      events.text(reponse, FIXED_TS + 500),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: fil })} />);
    expect(screen.queryByTestId("sources-card")).toBeNull();
  });

  // Clic = navigateur d'ATELIER (demande Thierry 2026-08-27) : la chip
  // dispatche l'événement global qu'App route vers la surface browser —
  // même canal que les citations kb. ⌘clic garde le navigateur système
  // (le <a target="_blank"> fait alors son travail normal).
  it("clic simple : ouvre dans Atelier (événement global), défaut annulé", () => {
    const reçus: string[] = [];
    const écoute = (e: Event) => reçus.push((e as CustomEvent).detail?.url);
    window.addEventListener("chat-open-web-url", écoute);
    try {
      renderUi(<SourcesCard markdown={"Voir [G](https://grammalecte.net/doc)"} />);
      const chip = screen.getByTestId("sources-card").querySelector("a.source-chip")!;
      const clic = fireEvent.click(chip);
      expect(reçus).toEqual(["https://grammalecte.net/doc"]);
      expect(clic).toBe(false); // preventDefault posé — pas de navigateur système
    } finally {
      window.removeEventListener("chat-open-web-url", écoute);
    }
  });

  it("⌘clic : aucun événement — le navigateur système garde la main", () => {
    const reçus: string[] = [];
    const écoute = (e: Event) => reçus.push((e as CustomEvent).detail?.url);
    window.addEventListener("chat-open-web-url", écoute);
    try {
      renderUi(<SourcesCard markdown={"Voir [G](https://grammalecte.net/doc)"} />);
      const chip = screen.getByTestId("sources-card").querySelector("a.source-chip")!;
      const clic = fireEvent.click(chip, { metaKey: true });
      expect(reçus).toEqual([]);
      expect(clic).toBe(true); // défaut intact → target=_blank
    } finally {
      window.removeEventListener("chat-open-web-url", écoute);
    }
  });
});
