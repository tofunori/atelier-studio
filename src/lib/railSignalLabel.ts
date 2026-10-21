// Mots des signaux du rail : seule partie de lib/railSignals que l'entrée
// charge (budget JS plein) ; le calcul vit dans le chunk de RailSignalsSource.
export type RailSignal = "wait" | "fail" | "run" | "unread";

export const SIGNAL_LABEL: Record<RailSignal, string> = {
  wait: "Attend ta réponse",
  fail: "Échec",
  run: "Un agent travaille",
  unread: "Réponse terminée, non lue",
};
