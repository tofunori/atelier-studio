import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CommandPalette from "./CommandPalette";
import { setLanguage, t } from "../lib/i18n";

afterEach(cleanup);

describe("CommandPalette", () => {
  it("utilise un dialog nommé et focalise la recherche", async () => {
    setLanguage("fr");
    render(<CommandPalette open items={[]} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: t("palette.title") })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: t("palette.placeholder") })).toHaveFocus());
  });

  it("conserve la navigation métier et exécute l'item actif", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    setLanguage("fr");
    render(
      <CommandPalette
        open
        onClose={onClose}
        items={[{ id: "open", section: "actions", label: "Ouvrir", run }]}
      />,
    );
    const search = screen.getByRole("combobox", { name: t("palette.placeholder") });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("affiche les raccourcis actifs avec Kbd et conserve Escape", () => {
    const onClose = vi.fn();
    render(<CommandPalette open items={[]} onClose={onClose} />);
    expect(document.querySelectorAll('[data-slot="kbd"]')).toHaveLength(4);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filtre avec le score Atelier et laisse cmdk naviguer au clavier", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        items={[
          { id: "open", section: "actions", label: "Ouvrir", run: first },
          { id: "settings", section: "actions", label: "Réglages", run: second },
        ]}
      />,
    );
    const search = screen.getByRole("combobox");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(second).toHaveBeenCalledTimes(1);

    fireEvent.change(search, { target: { value: "ouvrir" } });
    expect(screen.getByText("Ouvrir")).toBeInTheDocument();
    expect(screen.queryByText("Réglages")).toBeNull();
  });
});
