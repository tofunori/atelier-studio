// État vide du chat sans fil : « Terminer la configuration » n'apparaît que
// quand le serveur a répondu et qu'aucun agent n'est prêt (premier lancement).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatEmptyState } from "./turns";
import { setLanguage, t } from "../../lib/i18n";
import {
  applySetupStatus,
  closeSetupWelcome,
  resetSetupEnvironmentForTests,
  setupEnvironmentSnapshot,
} from "../../lib/setupEnvironment";
import { CLAUDE_MISSING, CLAUDE_READY, CODEX_MISSING, setupStatus } from "../../test/fixtures/setupEnvironment";

beforeEach(() => {
  setLanguage("fr");
  localStorage.clear();
  resetSetupEnvironmentForTests();
});
afterEach(() => {
  cleanup();
  resetSetupEnvironmentForTests();
});

function renderEmpty() {
  return render(<ChatEmptyState threadId={null} hasEvents={false} onNewChat={vi.fn()} onOpenProject={vi.fn()} />);
}

describe("ChatEmptyState — premier lancement", () => {
  it("aucun agent prêt : le bouton ouvre la fenêtre de bienvenue", () => {
    applySetupStatus(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    closeSetupWelcome();
    renderEmpty();
    fireEvent.click(screen.getByRole("button", { name: t("setup.finish-setup") }));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
  });

  it("un agent prêt, ou aucune réponse encore : rien de plus", () => {
    const { unmount } = renderEmpty();
    expect(screen.queryByRole("button", { name: t("setup.finish-setup") })).toBeNull();
    unmount();
    applySetupStatus(setupStatus([CLAUDE_READY, CODEX_MISSING]));
    renderEmpty();
    expect(screen.queryByRole("button", { name: t("setup.finish-setup") })).toBeNull();
    expect(screen.getByRole("button", { name: t("action.new-chat") })).toBeInTheDocument();
  });
});
