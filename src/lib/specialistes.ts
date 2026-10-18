/** Spécialistes (plan specialistes-2026-10-18, lot 1).
 *
 * Une fiche nommée (rôle, instructions, skills, connecteurs) qu'un fil peut
 * porter. Le spécialiste dit QUOI savoir, les consignes de forme disent
 * COMMENT répondre : le fil garde les deux dans la même copie
 * `extra.consigne` (texte = instructions du spécialiste + consignes), ce qui
 * réutilise tel quel le chemin d'envoi des consignes (Claude : prompt
 * système, Codex : bloc en tête du message, annonce si ça change). */
import { assemblerConsignes, basculerConsigne, consignesSelectionnees, type ConsigneDuFil } from "./consignes";

export type OrigineSpecialiste = {
  source: "claude-science";
  /** `user_agents.name` côté Claude Science. */
  cle: string;
  /** Empreinte des champs importés : sert à voir, au prochain import, ce
   *  qui a changé là-bas et ce qui a été modifié ici. */
  empreinte: string;
};

export type Specialiste = {
  id: string;
  nom: string;
  /** Un mot : affiché dans le compositeur et utilisé pour @mention. */
  nomCourt: string;
  /** Quand lui confier une tâche (1-2 phrases, lues par l'agent). */
  role: string;
  instructions: string;
  skills: string[];
  /** Accès à tous les skills (aucune préférence à annoncer). */
  tousSkills: boolean;
  connecteurs: string[];
  /** Fiche proposée dans le menu du fil. */
  visible: boolean;
  origine?: OrigineSpecialiste;
};

/** Ce que le fil retient du spécialiste : une copie, pour qu'un fil ancien
 *  garde son sens si la fiche disparaît. */
export type SpecialisteDuFil = {
  id: string; nom: string; nomCourt: string; texte: string;
  /** Seuls ces serveurs MCP restent branchés dans le fil (lu par le
   *  backend, `restriction_mcp`). Vide ou absent : tous les MCP. */
  connecteurs?: string[];
};

/** Spécialiste lu dans Claude Science (`claudeScienceImport` du backend). */
export type SpecialisteClaudeScience = {
  cle: string;
  nom: string;
  role: string;
  instructions: string;
  skills: string[];
  tousSkills: boolean;
  connecteurs: string[];
  actif: boolean;
  modifieLe: string;
};

export const NOM_COURT_MAX = 16;

/** Premier mot du nom, sans ponctuation : « Glaciologue albédo » → Glaciologue. */
export function nomCourtPropose(nom: string): string {
  const mot = nom.trim().split(/\s+/)[0] ?? "";
  return mot.replace(/^[@#]+/, "").replace(/[.,;:!?()]+$/g, "").slice(0, NOM_COURT_MAX);
}

/** Un mot, sans @ : c'est aussi la future @mention. */
export function normaliserNomCourt(valeur: string): string {
  return valeur.replace(/^@+/, "").replace(/\s+/g, "").slice(0, NOM_COURT_MAX);
}

export function nomCourtDe(s: Pick<Specialiste, "nom" | "nomCourt">): string {
  return s.nomCourt.trim() || nomCourtPropose(s.nom);
}

export function nouvelIdSpecialiste(existants: Specialiste[]): string {
  const pris = new Set(existants.map((s) => s.id));
  for (let n = 1; ; n += 1) {
    const id = `sp${n}`;
    if (!pris.has(id)) return id;
  }
}

export function specialisteVide(existants: Specialiste[]): Specialiste {
  return {
    id: nouvelIdSpecialiste(existants), nom: "", nomCourt: "", role: "", instructions: "",
    skills: [], tousSkills: true, connecteurs: [], visible: true,
  };
}

/** Texte envoyé à l'agent pour un fil qui porte ce spécialiste. Les skills
 *  restent une préférence (Claude et Codex chargent tout leur catalogue) ;
 *  les connecteurs, eux, sont les seuls MCP branchés dans le fil. */
export function texteSpecialiste(s: Specialiste): string {
  const lignes = [`Specialist for this conversation: ${s.nom}.`];
  if (s.role.trim()) lignes.push(`Role: ${s.role.trim()}`);
  if (s.instructions.trim()) lignes.push(s.instructions.trim());
  if (!s.tousSkills && s.skills.length) lignes.push(`Prefer these skills when they apply: ${s.skills.join(", ")}.`);
  if (s.connecteurs.length) lignes.push(`Connectors (MCP servers) of this specialist: ${s.connecteurs.join(", ")}. Other MCP servers are not connected in this conversation.`);
  return lignes.join("\n");
}

export function specialisteDuFil(s: Specialiste): SpecialisteDuFil {
  return { id: s.id, nom: s.nom, nomCourt: nomCourtDe(s), texte: texteSpecialiste(s), connecteurs: [...s.connecteurs] };
}

/** Consignes de forme du fil, sans le spécialiste. */
export function formesDuFil(actif: ConsigneDuFil | null | undefined): ConsigneDuFil | null {
  if (!actif) return null;
  if (!actif.specialiste) return actif;
  const selection = actif.selection ?? [];
  return selection.length ? assemblerConsignes(selection) : null;
}

/** Copie du fil : spécialiste (ou non) + consignes de forme. Avec un
 *  spécialiste, la forme est toujours une `selection` (même vide) : la copie
 *  ne peut plus être relue comme une consigne unique du catalogue. */
export function composerFil(
  specialiste: SpecialisteDuFil | null | undefined,
  formes: ConsigneDuFil | null,
): ConsigneDuFil | null {
  if (!specialiste) return formes;
  const selection = consignesSelectionnees(formes);
  const texte = [specialiste.texte, ...selection.map((c) => c.texte)].filter((t) => t.trim()).join("\n\n");
  return { id: `specialiste:${specialiste.id}`, texte, selection, specialiste };
}

export function choisirSpecialiste(actif: ConsigneDuFil | null, s: Specialiste | null): ConsigneDuFil | null {
  return composerFil(s ? specialisteDuFil(s) : null, formesDuFil(actif));
}

/** Bascule d'une consigne de forme : garde le spécialiste du fil. */
export function basculerForme(actif: ConsigneDuFil | null, choix: { id: string; texte: string }): ConsigneDuFil | null {
  if (!actif?.specialiste) return basculerConsigne(actif, choix);
  return composerFil(actif.specialiste, basculerConsigne(formesDuFil(actif), choix));
}

/** Copie rafraîchie avant un tour : une fiche modifiée dans les réglages
 *  s'applique au tour suivant ; une fiche supprimée laisse la dernière copie. */
export function specialisteAJour(actif: ConsigneDuFil | null, catalogue: Specialiste[]): ConsigneDuFil | null {
  if (!actif?.specialiste) return actif;
  const fiche = catalogue.find((s) => s.id === actif.specialiste?.id);
  return fiche ? composerFil(specialisteDuFil(fiche), formesDuFil(actif)) : actif;
}

function hash(texte: string): string {
  let h = 5381;
  for (let i = 0; i < texte.length; i += 1) h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

type ChampsImportes = Pick<Specialiste, "nom" | "role" | "instructions" | "skills" | "tousSkills" | "connecteurs">;

export function empreinteSpecialiste(s: ChampsImportes): string {
  return hash(JSON.stringify([s.nom, s.role, s.instructions, s.skills, s.tousSkills, s.connecteurs]));
}

function depuisClaudeScience(cs: SpecialisteClaudeScience): ChampsImportes {
  return {
    nom: cs.nom.trim(), role: cs.role.trim(), instructions: cs.instructions.trim(),
    skills: cs.tousSkills ? [] : cs.skills, tousSkills: cs.tousSkills, connecteurs: cs.connecteurs,
  };
}

export type BilanImport = {
  specialistes: Specialiste[];
  ajoutes: string[];
  misAJour: string[];
  inchanges: string[];
  /** Changés dans Claude Science ET modifiés dans Atelier : la fiche
   *  d'Atelier est gardée, la version de Claude Science attend un choix. */
  conflits: { id: string; nom: string; version: ChampsImportes; empreinte: string }[];
};

/** Fusionne un import de Claude Science dans le catalogue, sans jamais
 *  écraser une fiche modifiée dans Atelier. */
export function fusionnerImport(catalogue: Specialiste[], importes: SpecialisteClaudeScience[]): BilanImport {
  const bilan: BilanImport = { specialistes: [...catalogue], ajoutes: [], misAJour: [], inchanges: [], conflits: [] };
  for (const cs of importes) {
    const champs = depuisClaudeScience(cs);
    const empreinte = empreinteSpecialiste(champs);
    const index = bilan.specialistes.findIndex((s) => s.origine?.source === "claude-science" && s.origine.cle === cs.cle);
    if (index < 0) {
      const id = nouvelIdSpecialiste(bilan.specialistes);
      bilan.specialistes.push({
        id, ...champs, nomCourt: nomCourtPropose(champs.nom), visible: cs.actif,
        origine: { source: "claude-science", cle: cs.cle, empreinte },
      });
      bilan.ajoutes.push(champs.nom);
      continue;
    }
    const existant = bilan.specialistes[index];
    if (existant.origine?.empreinte === empreinte) {
      bilan.inchanges.push(existant.nom);
      continue;
    }
    const intact = empreinteSpecialiste(existant) === existant.origine?.empreinte;
    if (intact) {
      bilan.specialistes[index] = { ...existant, ...champs, origine: { source: "claude-science", cle: cs.cle, empreinte } };
      bilan.misAJour.push(champs.nom);
    } else {
      bilan.conflits.push({ id: existant.id, nom: existant.nom, version: champs, empreinte });
    }
  }
  return bilan;
}

/** « Prendre la version de Claude Science » pour une fiche en conflit. */
export function appliquerVersion(catalogue: Specialiste[], conflit: BilanImport["conflits"][number]): Specialiste[] {
  return catalogue.map((s) => s.id === conflit.id && s.origine
    ? { ...s, ...conflit.version, origine: { ...s.origine, empreinte: conflit.empreinte } }
    : s);
}

/** Proposition posée par l'agent (`propose_specialist`). */
export type PropositionSpecialiste = {
  nom: string;
  nomCourt: string;
  role: string;
  instructions: string;
  skills: string[];
  connecteurs: string[];
  replaceId: string | null;
};

/** Garder une proposition : nouvelle fiche, ou fiche remplacée sur place. */
export function garderProposition(catalogue: Specialiste[], p: PropositionSpecialiste): { specialistes: Specialiste[]; id: string } {
  const champs = {
    nom: p.nom.trim(), nomCourt: normaliserNomCourt(p.nomCourt) || nomCourtPropose(p.nom),
    role: p.role.trim(), instructions: p.instructions.trim(),
    skills: p.skills, tousSkills: p.skills.length === 0, connecteurs: p.connecteurs,
  };
  if (p.replaceId && catalogue.some((s) => s.id === p.replaceId)) {
    return { specialistes: catalogue.map((s) => s.id === p.replaceId ? { ...s, ...champs } : s), id: p.replaceId };
  }
  const id = nouvelIdSpecialiste(catalogue);
  return { specialistes: [...catalogue, { id, ...champs, visible: true }], id };
}

/** Fiche à ouvrir à l'arrivée dans Réglages › Spécialistes (carte
 *  « Modifier dans Réglages » du fil) ; lue une fois par la section. */
let ficheDemandee: string | null = null;
export function ouvrirFicheSpecialiste(id: string) { ficheDemandee = id; }
export function prendreFicheDemandee(): string | null {
  const id = ficheDemandee;
  ficheDemandee = null;
  return id;
}

/** Clé de comparaison d'un nom de connecteur, la même que le backend
 *  (`cle_mcp`) : minuscules, lettres et chiffres seulement. */
export function cleMcp(nom: string): string {
  return nom.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Connecteurs de la fiche introuvables parmi les MCP du Mac. */
export function connecteursAbsents(connecteurs: string[], duMac: { nom: string }[]): string[] {
  const presents = new Set(duMac.map((m) => cleMcp(m.nom)));
  return connecteurs.filter((c) => !presents.has(cleMcp(c)));
}
