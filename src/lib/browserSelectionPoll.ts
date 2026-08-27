// Sonde de sélection du navigateur NATIF. La page vit dans une child-webview
// native : le DOM hôte ne reçoit AUCUN événement de sélection — la seule voie
// est d'interroger la webview (browser_capture_selection) à intervalle court,
// et uniquement quand la surface est visible. Ce module est pur pour être
// testé aux fake timers, sans monter BrowserTab (lourd : ws, scan, tabs).
export type SelectionProbe = () => Promise<string>;

export function startSelectionPoll(
  probe: SelectionProbe,
  onChange: (hasSelection: boolean) => void,
  intervalMs = 800,
): () => void {
  let stopped = false;
  let last: boolean | null = null;
  let inFlight = false;
  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const text = (await probe()).trim();
      const has = text.length > 0;
      // n'appeler onChange qu'aux TRANSITIONS : un setState par tick ferait
      // re-rendre toute la barre 1,25 fois par seconde pour rien
      if (!stopped && has !== last) {
        last = has;
        onChange(has);
      }
    } catch {
      // webview pas prête (navigation, onglet fermé) : état inchangé
    } finally {
      inFlight = false;
    }
  };
  void tick();
  const id = setInterval(() => { void tick(); }, intervalMs);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}
