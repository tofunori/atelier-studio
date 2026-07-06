// Handoff inter-provider (voir buildHandoff dans src/App.tsx) : préambule
// préfixé au prompt réel lors d'un changement d'agent. Au replay de
// l'historique, on le retire pour n'afficher que ce que l'utilisateur a tapé.
const HANDOFF_HEADER = "Tu reprends une conversation commencée avec un autre agent.";
const HANDOFF_CLOSE = "\n---\n\n";

export function stripHandoff(text) {
  if (!text.startsWith(HANDOFF_HEADER)) return text;
  const open = text.indexOf("---\n");
  if (open < 0) return text;
  const close = text.indexOf(HANDOFF_CLOSE, open + 4);
  if (close < 0) return text;
  return text.slice(close + HANDOFF_CLOSE.length).trim();
}
