import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

import { UpdateCard } from "./UpdateCard";
import { checkForUpdate, getUpdateState, resetUpdateStateForTests } from "../../lib/appUpdate";

const INFO = { version: "2.5.0", currentVersion: "2.4.0" };

beforeEach(() => {
  localStorage.clear();
  resetUpdateStateForTests();
  vi.clearAllMocks();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("carte de mise à jour", () => {
  it("annonce la version et ses deux actions, boutons neutres", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await act(() => checkForUpdate());
    const { container } = render(<UpdateCard />);
    expect(screen.getByText(/2\.5\.0/)).toBeInTheDocument();
    expect(screen.getByText(/2\.4\.0/)).toBeInTheDocument();
    const update = screen.getByRole("button", { name: /Mettre à jour|Update/ });
    expect(update.className).toContain("ui-btn--secondary");
    expect(container.querySelector(".ui-btn--primary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Plus tard|Later/ }));
    expect(getUpdateState().cardOpen).toBe(false);
  });

  it("« Voir les nouveautés » ouvre la page des versions en Rust", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await act(() => checkForUpdate());
    render(<UpdateCard />);
    fireEvent.click(screen.getByRole("button", { name: /nouveautés|what/ }));
    expect(core.invoke).toHaveBeenCalledWith("update_open_releases");
  });

  it("montre la progression du téléchargement en Mo", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await act(() => checkForUpdate());
    core.invoke.mockImplementationOnce(() => new Promise(() => {}));
    render(<UpdateCard />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Mettre à jour|Update/ })); });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(getUpdateState().phase.kind).toBe("downloading");
  });

  it("échec : « Réessayer » et « Télécharger »", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await act(() => checkForUpdate());
    core.invoke.mockRejectedValueOnce("réseau");
    render(<UpdateCard />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Mettre à jour|Update/ })); });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer|Try again/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Télécharger|Download/ }));
    expect(core.invoke).toHaveBeenCalledWith("update_open_releases");
  });
});
