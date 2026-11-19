// Visite guidée (version Fable, choisie par Thierry le 2026-11-19).
//
// Store minuscule, importé par l'App au démarrage : l'interface de la visite
// (components/tour/GuidedTour) n'est chargée qu'à la première ouverture.
//
// Parcours : une invitation discrète (une seule fois, après « Terminer » dans
// la fenêtre de bienvenue), puis six arrêts dans le projet d'exemple
// Glacier-Exemple, puis une carte de fin. On avance par « Suivant » ; l'App
// prépare l'état utile à chaque arrêt (galerie, figure, documents) via le
// pilote qu'elle enregistre ici. Relance : Réglages › Environnement ou la
// palette de commandes.
import { useSyncExternalStore } from "react";
import type { TourAppContext } from "./tourDriver";

export const TOUR_STEPS = ["projects", "chat", "gallery", "annotate", "documents", "surfaces"] as const;
export type TourStepId = (typeof TOUR_STEPS)[number];

export type TourPhase = "idle" | "invite" | "loading" | "step" | "end";

export type TourState = {
  phase: TourPhase;
  /** index dans TOUR_STEPS, valable en phase « step » */
  step: number;
  /** échec de la création du projet d'exemple, montré sur l'invitation */
  error: string | null;
};

/** Ce que l'App sait faire pour la visite. */
export type TourDriver = {
  /** Crée ou retrouve le projet d'exemple, l'ajoute et l'ouvre. */
  openExample: () => Promise<void>;
  /** Met l'app dans l'état dont parle l'arrêt (figure, documents…). */
  prepare: (step: TourStepId) => void;
  /** « Ouvrir mon dossier » de la carte de fin. */
  openOwnFolder: () => void;
};

export const TOUR_OFFERED_KEY = "atelier.tour.offered";

const IDLE: TourState = { phase: "idle", step: 0, error: null };
let state: TourState = IDLE;
let driver: TourDriver | null = null;
let context: (() => TourAppContext | null) | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<TourState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function offered(): boolean {
  try {
    return localStorage.getItem(TOUR_OFFERED_KEY) === "1";
  } catch {
    return false;
  }
}

function markOffered(): void {
  try {
    localStorage.setItem(TOUR_OFFERED_KEY, "1");
  } catch {
    /* stockage indisponible : l'invitation pourra revenir, sans gravité */
  }
}

/** Après « Terminer » dans la fenêtre de bienvenue : l'invitation, une fois. */
export function offerGuidedTour(): void {
  if (offered() || state.phase !== "idle") return;
  markOffered();
  update({ phase: "invite", step: 0, error: null });
}

/** Réglages › Environnement, palette : l'invitation est sautée. */
export function launchGuidedTour(): void {
  markOffered();
  void startGuidedTour();
}

export async function startGuidedTour(): Promise<void> {
  if (state.phase === "loading") return;
  update({ phase: "loading", error: null });
  try {
    if (!driver) {
      if (!context) throw new Error("Atelier n’est pas prêt");
      const { createTourDriver } = await import("./tourDriver");
      driver = createTourDriver(context);
    }
    await driver.openExample();
  } catch (error) {
    update({ phase: "invite", error: String(error instanceof Error ? error.message : error) });
    return;
  }
  goToStep(0);
}

function goToStep(index: number): void {
  const step = Math.max(0, Math.min(TOUR_STEPS.length - 1, index));
  update({ phase: "step", step, error: null });
  driver?.prepare(TOUR_STEPS[step]);
}

export function nextTourStep(): void {
  if (state.phase !== "step") return;
  if (state.step >= TOUR_STEPS.length - 1) update({ phase: "end" });
  else goToStep(state.step + 1);
}

export function previousTourStep(): void {
  if (state.phase === "step" && state.step > 0) goToStep(state.step - 1);
}

/** « Plus tard », « Passer », Échap, « Rester dans l'exemple ». */
export function closeGuidedTour(): void {
  if (state.phase !== "idle") update(IDLE);
}

export function openOwnFolderFromTour(): void {
  closeGuidedTour();
  driver?.openOwnFolder();
}

/** L'App publie son contexte ; le pilote (lib/tourDriver) n'est chargé
 *  qu'au premier « Commencer ». Renvoie de quoi le retirer. */
export function provideTourContext(next: () => TourAppContext | null): () => void {
  context = next;
  return () => {
    if (context === next) context = null;
  };
}

/** Pilote imposé (tests) ; renvoie de quoi le retirer. */
export function registerTourDriver(next: TourDriver): () => void {
  driver = next;
  return () => {
    if (driver === next) driver = null;
  };
}

export function tourSnapshot(): TourState {
  return state;
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGuidedTour(): TourState {
  return useSyncExternalStore(subscribeTour, tourSnapshot);
}

/** Abonnement étroit (App) : ne re-rend qu'à l'ouverture/fermeture. */
export function useGuidedTourActive(): boolean {
  return useSyncExternalStore(subscribeTour, () => state.phase !== "idle");
}

// tests seulement
export function resetGuidedTourForTests(): void {
  state = IDLE;
  driver = null;
  context = null;
}
