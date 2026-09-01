/** Instruction de ton/forme réutilisable, activable sur un fil. */
export type Consigne = {
  id: string;
  nom: string;
  description: string;
  texte: string;
  /** Livrée avec l'app : modifiable, non supprimable. */
  livree?: boolean;
};

/** Ce que le fil retient : l'identifiant ET une copie du texte envoyé. */
export type ConsigneDuFil = { id: string; texte: string };

/** Plafond du nom — la pilule du composeur est bornée à 132 px. */
export const NOM_MAX = 24;

export function normaliserNom(nom: string): string {
  return nom.trim().slice(0, NOM_MAX);
}

export function nouvelId(existants: Consigne[]): string {
  const pris = new Set(existants.map((c) => c.id));
  for (let n = 1; ; n += 1) {
    const id = `c${n}`;
    if (!pris.has(id)) return id;
  }
}

export const CONSIGNES_LIVREES: Consigne[] = [
  {
    id: "concis",
    nom: "Concis",
    description: "Réponse directe, sans préambule ni récapitulatif.",
    texte: [
      "Réponds directement à la question posée.",
      "Pas de préambule, pas de reformulation de la demande, pas de récapitulatif final.",
      "Une phrase suffit quand une phrase suffit.",
    ].join("\n"),
    livree: true,
  },
  {
    id: "pedagogique",
    nom: "Pédagogique",
    description: "Décompose du concret vers le technique, comme un prof.",
    texte: [
      "Décompose le sujet en morceaux simples, puis monte du très concret vers le technique.",
      "Définis chaque terme la première fois qu'il apparaît.",
      "Donne un exemple chiffré avant la formule générale.",
    ].join("\n"),
    livree: true,
  },
  {
    id: "rigueur",
    nom: "Rigueur scientifique",
    description: "Chiffre, cite, distingue mesuré de supposé.",
    texte: [
      "Distingue toujours ce qui est mesuré de ce qui est supposé.",
      "Donne les incertitudes quand elles existent.",
      "Ne présente jamais une corrélation comme une cause.",
      "Si une affirmation vient d'une source, nomme-la.",
    ].join("\n"),
    livree: true,
  },
  {
    id: "quebecois",
    nom: "Français québécois",
    description: "Norme OQLF, typographie canadienne-française.",
    texte: [
      "Écris en français québécois selon la norme de l'OQLF.",
      "Évite les anglicismes et les calques de l'anglais.",
      "Applique la typographie canadienne-française : pas d'espace avant les deux-points en usage courant, guillemets français.",
    ].join("\n"),
    livree: true,
  },
];
