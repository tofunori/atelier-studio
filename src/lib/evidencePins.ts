// Store des épingles Preuves (plan Preuves, tâche 5) — pattern module-level
// exact de src/lib/kbSources.ts (subscribe/snapshot/request), lu via
// useSyncExternalStore côté composant. Contrat WS (tâche 2, Rust seulement) :
// pinPassage/listPins/unpinPassage répondent TOUS `evidencePins`
// ({projectRoot, pins[]} + `error` optionnel).
import { showError } from "../components/ui/toast";
import { wsSend } from "./wsBus";

export type EvidenceSupports = { text: string; file: string; lines: string } | null;

export type EvidencePin = {
  id: string;
  ts: number;
  quote: string;
  zoteroKey: string;
  pdfKey: string;
  pdfFile: string;
  page: number;
  citeLabel: string;
  supports: EvidenceSupports;
  threadId: string | null;
  provider: string | null;
};

export type EvidencePinsMsg = {
  type: "evidencePins";
  projectRoot?: string;
  pins?: EvidencePin[];
  error?: string;
};

type EvidencePinsState = { projectRoot: string | null; pins: EvidencePin[] };

// nouvelle référence à chaque changement réel (jamais mutée en place) —
// condition du contrat useSyncExternalStore : getSnapshot doit rester STABLE
// (même référence) tant que rien n'a changé, sous peine de boucle de rendu.
let state: EvidencePinsState = { projectRoot: null, pins: [] };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

export function evidencePinsSnapshot(): EvidencePinsState {
  return state;
}

export function subscribeEvidencePins(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Demande la liste des épingles d'un projet — retient `projectRoot` pour que
 * PassageCard sache où épingler sans qu'il faille percer une prop à travers
 * MD_COMPONENTS (App.tsx appelle ceci à chaque changement de projet actif,
 * tâche 6). */
export function requestEvidencePins(projectRoot: string): void {
  if (state.projectRoot !== projectRoot) {
    state = { ...state, projectRoot };
    emit();
  }
  wsSend({ type: "listPins", projectRoot });
}

/** Pousse une réponse `evidencePins` (App.tsx, dispatch WS) dans le store.
 * En cas d'`error`, toast et RIEN d'autre ne change — la carte garde son état
 * précédent (brief tâche 5). */
export function pushEvidencePins(msg: EvidencePinsMsg): void {
  if (msg.error) {
    void showError(msg.error);
    return;
  }
  state = {
    projectRoot: typeof msg.projectRoot === "string" ? msg.projectRoot : state.projectRoot,
    pins: Array.isArray(msg.pins) ? msg.pins : state.pins,
  };
  emit();
}

/** L'épingle correspondante si ce passage exact (fichier + page + citation)
 * est déjà épinglé, sinon `null`. */
export function isPinned(pdfKey: string, page: number, quote: string): EvidencePin | null {
  return state.pins.find((p) => p.pdfKey === pdfKey && p.page === page && p.quote === quote) ?? null;
}

// test seulement : remet le cache à zéro entre deux cas
export function resetEvidencePinsForTests(): void {
  state = { projectRoot: null, pins: [] };
}
