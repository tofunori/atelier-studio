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
export type ConsigneDuFil = { id: string; texte: string; composition?: ConsigneComposition; selection?: { id: string; texte: string }[] };

export type ConsigneComposition = {
  style: "standard" | "concis" | "pedagogique";
  langue: "auto" | "quebecois" | "anglais";
  citer: boolean;
  distinguer: boolean;
  incertitudes: boolean;
  personnel: string;
};

export const COMPOSITION_VIDE: ConsigneComposition = {
  style: "standard", langue: "auto", citer: false, distinguer: false,
  incertitudes: false, personnel: "",
};

/** Les anciens préréglages restent intacts : leur texte est repris comme
 * consigne personnelle. Aucun texte édité par l'utilisateur n'est perdu. */
export function compositionDuFil(actif?: ConsigneDuFil | null): ConsigneComposition {
  return actif?.composition ?? { ...COMPOSITION_VIDE, personnel: actif?.texte ?? "" };
}

export function composerConsigne(c: ConsigneComposition): ConsigneDuFil | null {
  const texte = [
    c.style === "concis" ? "Réponds directement à la question, sans préambule ni récapitulatif final."
      : c.style === "pedagogique" ? "Pars d'un exemple concret, puis explique les notions et définis les termes techniques." : "",
    c.langue === "quebecois" ? "Écris en français québécois selon les recommandations de l'OQLF."
      : c.langue === "anglais" ? "Écris en anglais scientifique, avec des formulations précises et directes." : "",
    c.citer ? "Cite les sources utilisées et indique les passages qui soutiennent tes affirmations." : "",
    c.distinguer ? "Distingue les observations, les hypothèses et les interprétations. Ne présente pas une corrélation comme une cause." : "",
    c.incertitudes ? "Signale les incertitudes connues et ce qui reste à vérifier." : "",
    c.personnel.trim(),
  ].filter(Boolean).join("\n");
  return texte ? { id: "atelier-composition", texte, composition: { ...c } } : null;
}

/** Keep the existing menu; a selection is just a list of saved rule texts. */
export function consignesSelectionnees(actif?: ConsigneDuFil | null): {id:string; texte:string}[] {
  if (!actif) return [];
  if (actif.selection) return actif.selection;
  if (!actif.composition) return [{id:actif.id, texte:actif.texte}];
  const c = actif.composition;
  const parts: {id:string; texte:string}[] = [];
  const add = (id:string, patch:Partial<ConsigneComposition>) => {
    const rule = composerConsigne({...COMPOSITION_VIDE,...patch});
    if (rule) parts.push({id,texte:rule.texte});
  };
  add(c.style, {style:c.style});
  add(c.langue === "quebecois" ? "quebecois" : "atelier-anglais", {langue:c.langue});
  add("rigueur", {citer:c.citer,distinguer:c.distinguer,incertitudes:c.incertitudes});
  add("atelier-personnelle", {personnel:c.personnel});
  return parts;
}

export function assemblerConsignes(selection: {id:string; texte:string}[], preserveSelection = false): ConsigneDuFil | null {
  if (!selection.length) return null;
  if (selection.length === 1 && !preserveSelection) return {...selection[0]};
  return {id:"atelier-combination",texte:selection.map(c => c.texte).join("\n"),selection};
}

export function basculerConsigne(actif: ConsigneDuFil | null, choix: {id:string; texte:string}): ConsigneDuFil | null {
  const selection = consignesSelectionnees(actif);
  if (selection.some(c => c.id === choix.id)) return assemblerConsignes(selection.filter(c => c.id !== choix.id), true);
  const incompatible = choix.id === "concis" ? "pedagogique" : choix.id === "pedagogique" ? "concis"
    : choix.id === "quebecois" ? "atelier-anglais" : "";
  return assemblerConsignes([...selection.filter(c => c.id !== incompatible), {id:choix.id,texte:choix.texte}], Boolean(actif?.selection || actif?.composition));
}

export function nomConsigne(actif?: ConsigneDuFil | null, catalogue: Consigne[] = []): string {
  if (!actif) return "";
  if (actif.selection) return actif.selection.map(c => catalogue.find(rule => rule.id === c.id)?.nom
    ?? (c.id === "atelier-anglais" ? "Anglais scientifique" : "Personnalisée")).join(" · ");
  if (actif.composition) {
    const c = actif.composition;
    return [c.style === "concis" ? "Concis" : c.style === "pedagogique" ? "Pédagogique" : "",
      c.langue === "quebecois" ? "Français québécois" : c.langue === "anglais" ? "Anglais scientifique" : "",
    ].filter(Boolean).join(" · ") || "Consignes personnalisées";
  }
  return catalogue.find(c => c.id === actif.id)?.nom ?? "Consigne personnelle";
}

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
    description: "direct, sans préambule",
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
    description: "du concret au technique",
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
    description: "chiffre et cite",
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
    description: "norme OQLF",
    texte: [
      "Écris en français québécois selon la norme de l'OQLF.",
      "Évite les anglicismes et les calques de l'anglais.",
      "Applique la typographie canadienne-française : pas d'espace avant les deux-points en usage courant, guillemets français.",
    ].join("\n"),
    livree: true,
  },
];
