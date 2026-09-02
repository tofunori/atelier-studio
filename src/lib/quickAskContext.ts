// Contexte transmis au Quick Ask quand une sélection part du chat.
//
// Une sélection seule ne suffit pas : « Contribution » arraché à un message
// ne dit rien au modèle, qui part alors fouiller le disque pour deviner de
// quoi on parle (session grok du 2026-08-26, ~20 appels d'outils dans $HOME
// pour un mot). On envoie donc le message ENTIER d'où vient la sélection —
// c'est là que le sens du mot se trouve — plus le fil auquel il appartient.
export type QaContext = {
  /** Le texte réellement surligné. */
  selection: string;
  /** Le message complet qui le contient, quand on a pu le retrouver. */
  message?: string;
  /** Qui a écrit ce message. */
  role?: "user" | "assistant";
  /** Titre du fil d'origine. */
  threadTitle?: string;
  /** Origine fichier (studio LaTeX/code) — prime sur le fil. */
  source?: {file: string; lines?: string};
};

// Le Quick Ask tourne avec les outils du CLI. Deux régimes, choisis par le
// bouton de fouille du composeur (2026-09-02) :
//
// SCELLÉ (défaut) — l'extrait et rien d'autre. C'est ce qui rend la fenêtre
// instantanée, et ce qui évite les vingt appels d'outils aveugles dans $HOME
// vécus le 2026-08-26.
//
// OUVERT (sur geste) — le disque est autorisé, parce que l'extrait ne suffit
// pas quand la question porte sur ce que le code fait vraiment (un
// coefficient standardisé ou brut, par exemple). C'était le régime imposé à
// tous depuis le 2026-08-31 ; il redevient volontaire au lieu d'être subi.
const SCELLEE = "Réponds à partir de cet extrait. N’ouvre pas de fichiers.";
const OUVERTE =
  "Pars de cet extrait. Tu peux ouvrir les fichiers du projet si la réponse en dépend.";

function ou(ctx: QaContext): string {
  if (ctx.source) {
    const lignes = ctx.source.lines ? ` (${ctx.source.lines})` : "";
    return `le fichier « ${ctx.source.file} »${lignes}`;
  }
  return ctx.threadTitle ? `le fil « ${ctx.threadTitle} »` : "la conversation";
}

// Images collées : elles ne se devinent pas, il faut les lire d'abord — la
// consigne les nomme explicitement avant de rendre la main sur le reste.
function consigne(images: string[], fouille: boolean): string {
  if (images.length === 0) return fouille ? OUVERTE : SCELLEE;
  const bloc = images.map((p) => `- ${p}`).join("\n");
  const quoi = images.length > 1 ? "ces fichiers image" : "ce fichier image";
  // En régime scellé, « n'ouvre pas de fichiers » interdirait justement le
  // seul fichier qu'il FAUT ouvrir : la permission est bornée aux captures
  // nommées, et à rien d'autre. En régime ouvert, la capture s'ajoute au
  // reste sans le restreindre.
  const lecture = fouille
    ? `Lis ${quoi} (outil Read) avant de répondre.`
    : `Lis ${quoi} (outil Read) avant de répondre — n’ouvre aucun autre fichier.`;
  return [
    images.length > 1 ? "Images collées par l’utilisateur :" : "Image collée par l’utilisateur :",
    bloc,
    lecture,
    ...(fouille ? [OUVERTE] : []),
  ].join("\n");
}

export function buildQuickAskPrompt(
  ctx: QaContext | null,
  question: string,
  images: string[] = [],
  /** Bouton de fouille du composeur. Faux = scellé, le défaut. */
  fouille = false,
): string {
  const selection = ctx?.selection.trim() ?? "";
  const message = ctx?.message?.trim() ?? "";
  const fin = consigne(images, fouille);
  if (!ctx || (!selection && !message)) {
    // Question posée à froid. En régime OUVERT, la permission doit tout de
    // même être dite : le dossier du projet part avec, et un modèle qui
    // reçoit le disque sans instruction fouille au hasard (2026-08-26).
    // En régime scellé, rien à ajouter — sans extrait, « réponds à partir
    // de cet extrait » ne veut rien dire, et le disque n'est pas transmis.
    const nu = images.length === 0 && !fouille;
    return nu ? question : [question, fin].join("\n\n");
  }

  if (!message) {
    return [
      `Extrait sélectionné dans ${ou(ctx)} :`,
      `"""\n${selection}\n"""`,
      question,
      fin,
    ].join("\n\n");
  }

  // Un fichier n'a pas d'auteur dans la conversation : on le nomme, sans
  // attribuer le passage à quelqu'un.
  const auteur = ctx.role === "user" ? "j’ai écrit" : "l’agent a écrit";
  const entete = ctx.source ? `Dans ${ou(ctx)} :` : `Dans ${ou(ctx)}, ${auteur} :`;
  const bloc = [entete, `"""\n${message}\n"""`];
  // La sélection couvre déjà tout le message : le répéter n'ajouterait rien.
  if (selection && selection !== message) bloc.push(`Sélection : « ${selection} »`);
  return [...bloc, question, fin].join("\n\n");
}

/** Remonte d'un nœud sélectionné jusqu'à l'index de sa ligne de timeline. */
export function messageIndexFromNode(node: Node | null): number | null {
  const start = node?.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node?.parentElement ?? null;
  const row = start?.closest("[data-message-id]");
  const found = row?.getAttribute("data-message-id")?.match(/^message-(\d+)$/);
  return found ? Number(found[1]) : null;
}

/** Relie une sélection du chat au message du fil qui la contient. */
export function quoteContext(
  quote: { text: string; messageIndex: number | null } | null,
  events: { kind: string; text?: string }[],
  threadTitle: string,
): QaContext | null {
  if (!quote) return null;
  const ctx: QaContext = { selection: quote.text };
  const event = quote.messageIndex == null ? undefined : events[quote.messageIndex];
  if (event?.text) {
    ctx.message = event.text;
    ctx.role = event.kind === "user" ? "user" : "assistant";
  }
  if (threadTitle) ctx.threadTitle = threadTitle;
  return ctx;
}
