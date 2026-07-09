// Handoff inter-provider (voir buildHandoff dans src/App.tsx) : préambule
// préfixé au prompt réel lors d'un changement d'agent. Au replay de
// l'historique, on le retire pour n'afficher que ce que l'utilisateur a tapé.
//
// Deux formats coexistent :
//  - nouveau (2026-07-08) : le fil est fermé par une sentinelle unique
//    HANDOFF_END, insensible au contenu du transcript (les "---" de tables ou
//    de séparateurs markdown ne peuvent plus couper au mauvais endroit) ;
//  - legacy : fermé par "\n---\n\n" — fragile si le transcript contient des
//    "---", conservé en repli pour les vieux fichiers de session.
const HANDOFF_HEADER = "Tu reprends une conversation commencée avec un autre agent.";
export const HANDOFF_END = "\n=== fin du fil transmis — message réel ci-dessous ===\n\n";
const LEGACY_CLOSE = "\n---\n\n";

export function stripHandoff(text) {
  if (!text.startsWith(HANDOFF_HEADER)) return text;
  // format actuel : sentinelle unique, la DERNIÈRE occurrence fait foi (le
  // transcript ne peut la contenir que si un handoff a été imbriqué — auquel
  // cas le vrai message est bien après la dernière).
  const end = text.lastIndexOf(HANDOFF_END);
  if (end >= 0) return text.slice(end + HANDOFF_END.length).trim();
  // repli legacy : première fermeture "---" après l'ouverture
  const open = text.indexOf("---\n");
  if (open < 0) return text;
  const close = text.indexOf(LEGACY_CLOSE, open + 4);
  if (close < 0) return text;
  return text.slice(close + LEGACY_CLOSE.length).trim();
}
