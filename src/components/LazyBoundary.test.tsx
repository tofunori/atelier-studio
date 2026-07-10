// Frontière lazy (plan 022) : contrats de la LazyBoundary — fallback pendant
// le chargement, notice actionnable si le chunk échoue (offline / app mise à
// jour), retry qui relance réellement l'import, et pas de re-fallback à la
// deuxième ouverture (module déjà en cache).
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { LazyBoundary, lazyWithRetry } from "./LazyBoundary";
import { t } from "../lib/i18n";

describe("LazyBoundary (plan 022)", () => {
  it("affiche le fallback pendant le chargement puis le contenu", async () => {
    let resolve!: (m: any) => void;
    const Slow = lazyWithRetry(() => new Promise<any>((r) => { resolve = r; }));
    render(
      <LazyBoundary fallback={<div data-testid="fb" />}>
        <Slow />
      </LazyBoundary>,
    );
    expect(screen.getByTestId("fb")).toBeTruthy();
    resolve({ default: () => <div data-testid="loaded" /> });
    await waitFor(() => expect(screen.getByTestId("loaded")).toBeTruthy());
  });

  it("chunk en échec → notice + Réessayer qui relance l'import", async () => {
    // échec PERSISTANT (offline) : React 19 rejoue de lui-même le montage
    // initial en erreur — la notice ne commit que si l'échec insiste.
    let attempts = 0;
    let online = false;
    const Flaky = lazyWithRetry((): Promise<{ default: React.ComponentType }> => {
      attempts += 1;
      return online
        ? Promise.resolve({ default: () => <div data-testid="recovered" /> })
        : Promise.reject(new Error("Failed to fetch dynamically imported module"));
    });
    // React log l'erreur de boundary sur console.error — bruit attendu ici
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <LazyBoundary fallback={<div data-testid="fb" />}>
          <Flaky />
        </LazyBoundary>,
      );
      await waitFor(() => expect(screen.getByText(t("lazy.chunk-error"))).toBeTruthy());
      const failedAttempts = attempts; // ≥ 1 (React peut rejouer le montage)
      online = true;
      fireEvent.click(screen.getByRole("button", { name: t("action.retry") }));
      await waitFor(() => expect(screen.getByTestId("recovered")).toBeTruthy());
      // le Réessayer a bien relancé l'import (pas rejoué l'erreur en cache)
      expect(attempts).toBeGreaterThan(failedAttempts);
    } finally {
      quiet.mockRestore();
    }
  });

  it("deuxième montage : module en cache, le contenu apparaît sans casse", async () => {
    const Once = lazyWithRetry(() => Promise.resolve({ default: () => <div data-testid="again" /> }));
    const first = render(
      <LazyBoundary fallback={<div data-testid="fb" />}><Once /></LazyBoundary>,
    );
    await waitFor(() => expect(screen.getByTestId("again")).toBeTruthy());
    first.unmount();
    render(<LazyBoundary fallback={<div data-testid="fb" />}><Once /></LazyBoundary>);
    await waitFor(() => expect(screen.getByTestId("again")).toBeTruthy());
  });
});
