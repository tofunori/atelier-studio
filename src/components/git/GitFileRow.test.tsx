// « Restaurer » sur un fichier non suivi n'a rien à restaurer : le fichier
// part à la Corbeille (audit 2026-10-18, problème 3). Le libellé le dit.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitFileRow } from "./GitFileRow";
import { renderUi } from "../../test/render";
import { t } from "../../lib/i18n";

afterEach(cleanup);

async function ouvrirMenu(status: string) {
  renderUi(
    <GitFileRow
      file={{ path: "donnees/mesures.csv", status }}
      group={status === "?" ? "untracked" : "changes"}
      selected={false}
      onSelect={vi.fn()}
      onUpdateStage={vi.fn()}
      onRevert={vi.fn()}
      onIgnore={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t("project.actions") }));
  return waitFor(() => screen.getByRole("menu"));
}

describe("GitFileRow — action de restauration", () => {
  it("fichier non suivi : « Mettre à la Corbeille »", async () => {
    await ouvrirMenu("?");
    expect(screen.getByRole("menuitem", { name: t("git.trash-file") })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: t("action.restore") })).toBeNull();
  });

  it("fichier suivi modifié : « Restaurer »", async () => {
    await ouvrirMenu("M");
    expect(screen.getByRole("menuitem", { name: t("action.restore") })).toBeInTheDocument();
  });
});
