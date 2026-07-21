// ChatHeader (plan 018, étape 2) — RTL : eyebrow projet + titre au nom
// accessible complet, badge piloté par le statut présenté (masqué si null ou
// idle), menu overflow conditionné à onRename. Aucune assertion de couleur.
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ChatHeader } from "./ChatHeader";
import { setLanguage, t } from "../../lib/i18n";
import { presentStatus } from "../../lib/statusPresentation";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

// libellé du bouton overflow = clé i18n action.more — langue fixée AVANT
// l'évaluation du libellé (le module s'évalue avant les beforeEach)
setLanguage("fr");
const MORE_LABEL = t("action.more");

const base = {
  title: "Comparaison MOD10A1 vs MCD43A3",
  provider: "claude",
  projectName: "Thèse albédo",
  projectPath: "/Users/tofunori/Documents/these-albedo",
  status: null,
} as const;

describe("ChatHeader", () => {
  it("rend le titre seul — ni eyebrow projet, ni méta provider (demandes Thierry)", () => {
    const { container } = render(
      <ChatHeader {...base} status={presentStatus({ kind: "error", detail: "boom" })} />,
    );

    // l'identité projet ne vit qu'au crumb de la TopBar
    expect(container.querySelector(".eyebrow")).toBeNull();

    expect(screen.getByText(base.title)).toBeInTheDocument();
    // demande Thierry (2026-07-10) : plus de méta provider dans l'en-tête
    expect(screen.queryByText("claude")).toBeNull();

    const badge = container.querySelector(".ui-badge")!;
    expect(badge).toHaveTextContent(t("status.error"));
  });

  it("status null → aucun badge", () => {
    const { container } = render(<ChatHeader {...base} />);
    expect(container.querySelector(".ui-badge")).toBeNull();
  });

  it("kind idle → badge masqué aussi", () => {
    const { container } = render(
      <ChatHeader {...base} status={presentStatus({ kind: "idle" })} />,
    );
    expect(container.querySelector(".ui-badge")).toBeNull();
  });

  it("kind running → badge « en cours depuis … »", () => {
    const now = 1_700_000_000_000;
    const { container } = render(
      <ChatHeader {...base} status={presentStatus({ kind: "running", since: now - 5000, now })} />,
    );
    expect(container.querySelector(".ui-badge")).toHaveTextContent(
      t("status.running-for", { t: "5 s" }),
    );
  });

  it("onRename absent → pas de bouton overflow", () => {
    render(<ChatHeader {...base} />);
    expect(screen.queryByRole("button", { name: MORE_LABEL })).toBeNull();
  });

  it("onRename présent → ⋯ ouvre le menu, Renommer appelle onRename et ferme", async () => {
    const onRename = vi.fn();
    render(<ChatHeader {...base} onRename={onRename} />);

    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: MORE_LABEL }));
    // Base UI monte le popup en portal après positionnement — asynchrone
    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: t("action.rename") }));
    expect(onRename).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("titre long → attribut title complet présent (troncature CSS)", () => {
    const long = "Un très long titre de thread qui déborde largement de la largeur du panneau de chat";
    render(<ChatHeader {...base} title={long} />);
    expect(screen.getByTitle(long)).toHaveTextContent(long);
  });

  it("affiche les agents associés dans un popover compact", async () => {
    const onOpen = vi.fn();
    const onUnlink = vi.fn();
    render(
      <ChatHeader
        {...base}
        linkedAgents={[
          { id: "kimi-1", provider: "Kimi", title: "Analyse initiale", paused: false, direction: "parent" },
          { id: "codex-1", provider: "Codex", title: "Deuxième avis", paused: false, direction: "child" },
        ]}
        onOpenLinkedAgent={onOpen}
        onUnlinkLinkedAgent={onUnlink}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: t("linkedConversation.title") }));
    expect(await screen.findByText(t("linkedConversation.title"))).toBeInTheDocument();
    expect(screen.getByRole("region", { name: t("linkedConversation.createdFrom") }))
      .toHaveTextContent("Kimi · Analyse initiale");
    expect(screen.getByRole("region", { name: t("linkedConversation.continuesTo") }))
      .toHaveTextContent("Codex · Deuxième avis");
    fireEvent.click(screen.getByRole("button", { name: /Codex · Deuxième avis/ }));
    expect(onOpen).toHaveBeenCalledWith("codex-1");
    fireEvent.click(screen.getByRole("button", { name: t("linkedConversation.unlinkNamed", { provider: "Codex" }) }));
    expect(onUnlink).toHaveBeenCalledWith("codex-1");
  });
});
