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

// Le Quick Ask tourne avec les outils du CLI, dans le dossier du projet
// ouvert. On lui laisse le disque : l'extrait ne suffit pas quand la question
// porte sur ce que le code fait vraiment (un coefficient standardisé ou brut,
// par exemple). La consigne cadre la fouille au lieu de l'interdire — c'est
// le prix à payer pour éviter les vingt appels d'outils aveugles de 2026-08-26.
const CONSIGNE =
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
function consigne(images: string[]): string {
  if (images.length === 0) return CONSIGNE;
  const bloc = images.map((p) => `- ${p}`).join("\n");
  const quoi = images.length > 1 ? "ces fichiers image" : "ce fichier image";
  return [
    images.length > 1 ? "Images collées par l’utilisateur :" : "Image collée par l’utilisateur :",
    bloc,
    `Lis ${quoi} (outil Read) avant de répondre.`,
    CONSIGNE,
  ].join("\n");
}

export function buildQuickAskPrompt(
  ctx: QaContext | null,
  question: string,
  images: string[] = [],
): string {
  const selection = ctx?.selection.trim() ?? "";
  const message = ctx?.message?.trim() ?? "";
  const fin = consigne(images);
  if (!ctx || (!selection && !message)) {
    return images.length === 0 ? question : [question, fin].join("\n\n");
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
