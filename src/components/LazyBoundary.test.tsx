// Frontière lazy (plan 022) : contrats de la LazyBoundary — fallback pendant
// le chargement, notice actionnable si le chunk échoue (offline / app mise à
// jour), retry qui relance réellement l'import, et pas de re-fallback à la
// deuxième ouverture (module déjà en cache).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { LazyBoundary, lazyWithRetry } from "./LazyBoundary";
import { t } from "../lib/i18n";

// Vitest n'expose pas afterEach globalement : le nettoyage automatique de RTL
// n'est donc pas installé. Un échec ne doit laisser ni racine ni retry suivant.
afterEach(cleanup);

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
    await act(async () => { resolve({ default: () => <div data-testid="loaded" /> }); });
    expect(screen.getByTestId("loaded")).toBeTruthy();
    expect(screen.queryByTestId("fb")).toBeNull();
  });

  it("partage la tentative lazy pendant les replays de StrictMode", async () => {
    let resolve!: (m: { default: React.ComponentType }) => void;
    const importer = vi.fn(() => new Promise<{ default: React.ComponentType }>((r) => { resolve = r; }));
    const StrictLazy = lazyWithRetry(importer);

    render(
      <React.StrictMode>
        <LazyBoundary fallback={<div data-testid="strict-fallback" />}>
          <StrictLazy />
        </LazyBoundary>
      </React.StrictMode>,
    );

    expect(screen.getByTestId("strict-fallback")).toBeTruthy();
    expect(importer).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ default: () => <div data-testid="strict-loaded" /> }); });
    expect(screen.getByTestId("strict-loaded")).toBeTruthy();
    expect(importer).toHaveBeenCalledTimes(1);
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
      // Le rejet persistant passe par la récupération concurrente de React.
      // Une portée act asynchrone englobant ce montage rejoue indéfiniment
      // les imports rejetés ; observer son commit laisse fonctionner le scheduler.
      // La borne de 1 s de RTL est trop courte sous plusieurs workers.
      render(
        <LazyBoundary fallback={<div data-testid="fb" />}>
          <Flaky />
        </LazyBoundary>,
      );
      await waitFor(() => expect(screen.getByText(t("lazy.chunk-error"))).toBeTruthy(), { timeout: 4000 });
      const failedAttempts = attempts; // ≥ 1 (React peut rejouer le montage)
      online = true;
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: t("action.retry") })); });
      expect(screen.getByTestId("recovered")).toBeTruthy();
      expect(screen.queryByRole("button", { name: t("action.retry") })).toBeNull();
      // le Réessayer a bien relancé l'import (pas rejoué l'erreur en cache)
      expect(attempts).toBeGreaterThan(failedAttempts);
    } finally {
      quiet.mockRestore();
    }
  });

  it("deuxième montage : module en cache, le contenu apparaît sans casse", async () => {
    const Once = lazyWithRetry(() => Promise.resolve({ default: () => <div data-testid="again" /> }));
    let first!: ReturnType<typeof render>;
    await act(async () => {
      first = render(<LazyBoundary fallback={<div data-testid="fb" />}><Once /></LazyBoundary>);
    });
    expect(screen.getByTestId("again")).toBeTruthy();
    first.unmount();
    render(<LazyBoundary fallback={<div data-testid="fb" />}><Once /></LazyBoundary>);
    expect(screen.getByTestId("again")).toBeTruthy();
    expect(screen.queryByTestId("fb")).toBeNull();
  });

  it("garde le réessai au-dessus d’un lecteur en plein écran", async () => {
    const showPopover = vi.fn();
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "showPopover");
    Object.defineProperty(HTMLElement.prototype, "showPopover", { configurable: true, value: showPopover });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    let online = false;
    const Reader = lazyWithRetry((): Promise<{ default: React.ComponentType }> => online
      ? Promise.resolve({ default: () => <div data-testid="reader-retried" /> })
      : Promise.reject(new Error("chunk indisponible")));
    let view: ReturnType<typeof render> | undefined;
    try {
      view = render(<LazyBoundary fallback={null} errorInTopLayer><Reader /></LazyBoundary>);
      await waitFor(() => expect(showPopover).toHaveBeenCalled(), { timeout: 4000 });
      // JSDOM does not open the native top layer; WebKit covers visibility.
      const retry = view!.getByRole("button", { name: t("action.retry"), hidden: true });
      expect(retry.closest('[popover="manual"]')).toBeTruthy();
      online = true;
      await act(async () => { fireEvent.click(retry); });
      expect(view!.getByTestId("reader-retried")).toBeTruthy();
      expect(view!.container.querySelector(".lazy-error-top-layer")).toBeNull();
    } finally {
      view?.unmount();
      quiet.mockRestore();
      if (previous) Object.defineProperty(HTMLElement.prototype, "showPopover", previous);
      else Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
    }
  });
});
