// Sonde de sélection du navigateur NATIF. La page vit dans une child-webview
// native : le DOM hôte ne reçoit AUCUN événement de sélection — la seule voie
// est d'interroger la webview (browser_capture_selection) à intervalle court,
// et uniquement quand la surface est visible. Ce module est pur pour être
// testé aux fake timers, sans monter BrowserTab (lourd : ws, scan, tabs).
//
// Il livre le TEXTE de chaque échantillon (onSample), pas un booléen : la
// pilule « Ajouter la sélection » envoie le DERNIER échantillon au clic, sans
// re-capturer. Re-capturer au clic partageait le capture_store (une seule
// case, côté Rust) avec la sonde : quand les deux couraient, le clic perdait
// sa charge utile, expirait, et envoyait la PAGE au lieu de la sélection
// (vécu 2026-08-27). L'échantillon a ≤ 800 ms — et survit même à une
// sélection que le clic lui-même efface.
export type SelectionProbe = () => Promise<string>;

export function startSelectionPoll(
  probe: SelectionProbe,
  onSample: (text: string) => void,
  intervalMs = 800,
): () => void {
  let stopped = false;
  let inFlight = false;
  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const text = (await probe()).trim();
      if (!stopped) onSample(text);
    } catch {
      // webview pas prête (navigation, onglet fermé) : échantillon inchangé
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
