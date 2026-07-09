// Hook d'infrastructure (plan 015, slice 2.2 — durci en revue) : serveur
// galerie/atelier du projet actif — démarrage, relance dure, sonde de vie.
// Durcissements (revue Codex 015) :
//  - une résolution start_atelier arrivée APRÈS un changement de projet est
//    ignorée (ni URL, ni onReady : les onglets de A ne fuient jamais dans B) ;
//  - après 2 échecs de sonde consécutifs, le serveur est réellement redémarré
//    (l'ancien comportement se contentait d'effacer l'URL : deps [activeProject]
//    ne redéclenchaient jamais le démarrage) ;
//  - au démontage, plus aucune résolution n'applique d'état.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { withAtelierNonce } from "../lib/ipc";

type GalleryConfig = { galleryDir: string; galleryExts: string };

export function useAtelierServer(
  activeProject: string | null,
  opts: {
    atelierNonce: string;
    /** lu À CHAQUE démarrage (équivalent de settingsRef.current) */
    galleryConfig: () => GalleryConfig;
    /** serveur prêt pour ce projet (ex. restaurer les onglets épinglés) */
    onReady?: (project: string, nonceUrl: string) => void;
    /** échec start_atelier — l'appelant affiche sa bannière */
    onError?: (message: string) => void;
    /** démarrage réussi — l'appelant efface une éventuelle bannière d'échec */
    onRecovered?: () => void;
  },
): {
  atelierUrl: string | null;
  reloadKey: number;
  hardReload: () => void;
  /** force un rechargement de l'iframe sans redémarrer le serveur (auto-refresh sur done) */
  bumpReload: () => void;
} {
  const [atelierUrls, setAtelierUrls] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function start(project: string, onUrl?: (nonceUrl: string) => void) {
    const { galleryDir, galleryExts } = optsRef.current.galleryConfig();
    invoke<string>("start_atelier", { root: project, galleryDir, galleryExts })
      .then((url) => {
        // résolution périmée : projet changé ou hook démonté pendant l'attente
        // → ne rien appliquer (ni URL, ni onReady, ni bannière)
        if (!mountedRef.current || activeProjectRef.current !== project) return;
        const nonceUrl = withAtelierNonce(url, optsRef.current.atelierNonce);
        optsRef.current.onRecovered?.();
        setAtelierUrls((p) => ({ ...p, [project]: nonceUrl }));
        onUrl?.(nonceUrl);
      })
      .catch((e) => {
        if (!mountedRef.current || activeProjectRef.current !== project) return;
        console.error("start_atelier:", e);
        optsRef.current.onError?.(String(e));
      });
  }

  // (ré)ouvre le serveur atelier du projet actif
  useEffect(() => {
    if (!activeProject || atelierUrls[activeProject]) return;
    start(activeProject, (nonceUrl) => optsRef.current.onReady?.(activeProject, nonceUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- même contrat
    // que l'effet historique : uniquement au changement de projet actif
  }, [activeProject]);

  const atelierUrl = activeProject ? atelierUrls[activeProject] ?? null : null;

  // le serveur galerie peut mourir (kill, reboot) : sonde 15 s → vrai redémarrage
  useEffect(() => {
    if (!activeProject || !atelierUrl) return;
    let fails = 0;
    const iv = setInterval(async () => {
      try {
        await fetch(atelierUrl, { method: "HEAD", mode: "no-cors", cache: "no-store" });
        fails = 0;
      } catch {
        // 2 échecs consécutifs requis : un redémarrage de serveur (~8s de build)
        // ne doit pas déclencher une relance en boucle
        if (++fails >= 2) {
          fails = 0;
          setAtelierUrls((p) => {
            const { [activeProject]: _, ...rest } = p;
            return rest; // retire l'iframe morte pendant le redémarrage
          });
          start(activeProject); // redémarrage RÉEL (revue 015)
        }
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [activeProject, atelierUrl]);

  // relance dure (redémarre le serveur s'il est mort) + rechargement iframe
  function hardReload() {
    if (!activeProject) return;
    start(activeProject, () => setReloadKey((n) => n + 1));
  }

  return { atelierUrl, reloadKey, hardReload, bumpReload: () => setReloadKey((n) => n + 1) };
}
