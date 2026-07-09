// Hook d'infrastructure (plan 015, slice 2.3) : cycle de vie des familles
// d'événements `window` du workspace. Il NE contient aucune logique métier —
// celle-ci reste dans App (closures sur son état). Le hook garantit :
//  - une seule subscription par nom d'événement (pas de doublon) ;
//  - le dispatch va toujours au handler LE PLUS RÉCENT (aucune closure périmée,
//    sans re-souscrire à chaque render) ;
//  - removeEventListener systématique au démontage (cleanup testé).
//
// Regroupement par domaine : chaque appel du hook reçoit une famille cohérente
// (palette, revue, navigation…), jamais un mega-hook fourre-tout.
import { useEffect, useRef } from "react";

export type WindowEventHandlers = Record<string, (event: Event) => void>;

export function useWorkspaceEvents(handlers: WindowEventHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  // clé stable de l'ensemble des noms : on ne re-souscrit que si la LISTE des
  // événements change (pas à chaque nouvelle identité de fonction)
  const names = Object.keys(handlers).sort().join("\u0000");

  useEffect(() => {
    const eventNames = names ? names.split("\u0000") : [];
    const dispatchers = new Map<string, (event: Event) => void>();
    for (const name of eventNames) {
      const dispatch = (event: Event) => handlersRef.current[name]?.(event);
      dispatchers.set(name, dispatch);
      window.addEventListener(name, dispatch);
    }
    return () => {
      for (const [name, dispatch] of dispatchers) {
        window.removeEventListener(name, dispatch);
      }
    };
  }, [names]);
}
