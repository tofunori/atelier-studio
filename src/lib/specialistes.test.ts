import { describe, expect, it } from "vitest";
import { CONSIGNES_LIVREES, basculerConsigne } from "./consignes";
import {
  appliquerVersion, basculerForme, connecteursAbsents, choisirSpecialiste, composerFil, empreinteSpecialiste, formesDuFil,
  fusionnerImport, garderProposition, mentionSpecialiste, nomCourtPropose, normaliserNomCourt, skillsAbsents, specialisteAJour,
  type Specialiste, type SpecialisteClaudeScience,
} from "./specialistes";

const glacio: Specialiste = {
  id: "sp1", nom: "Glaciologue albédo", nomCourt: "Glaciologue", role: "Albédo des glaciers",
  instructions: "Tu es glaciologue.", skills: ["bilan-energie-fonte"], tousSkills: false,
  connecteurs: ["scholar"], visible: true,
};

const cs = (patch: Partial<SpecialisteClaudeScience> = {}): SpecialisteClaudeScience => ({
  cle: "GLACIOLOGUE_ALBEDO", nom: "Glaciologue albédo", role: "Albédo des glaciers",
  instructions: "Tu es glaciologue.", skills: ["bilan-energie-fonte"], tousSkills: false,
  connecteurs: ["scholar"], actif: true, modifieLe: "2026-10-01", ...patch,
});

describe("nom court", () => {
  it("prend le premier mot, sans ponctuation ni @", () => {
    expect(nomCourtPropose("Glaciologue albédo")).toBe("Glaciologue");
    expect(nomCourtPropose("@Bayes, ordre")).toBe("Bayes");
    expect(normaliserNomCourt("@Peyto glacier")).toBe("Peytoglacier");
  });
});

describe("le fil porte le spécialiste par le chemin des consignes", () => {
  it("met les instructions du spécialiste devant les consignes de forme", () => {
    const concis = basculerConsigne(null, CONSIGNES_LIVREES[0]);
    const fil = choisirSpecialiste(concis, glacio)!;
    expect(fil.specialiste).toMatchObject({ id: "sp1", nom: "Glaciologue albédo", nomCourt: "Glaciologue" });
    expect(fil.texte.indexOf("Tu es glaciologue.")).toBeLessThan(fil.texte.indexOf(CONSIGNES_LIVREES[0].texte));
    expect(fil.texte).toContain("Skills of this specialist: bilan-energie-fonte. Other skills are not loaded in this conversation.");
    expect(fil.specialiste?.skills).toEqual(["bilan-energie-fonte"]);
    expect(fil.texte).toContain("Connectors (MCP servers) of this specialist: scholar. Other MCP servers are not connected in this conversation.");
    expect(fil.specialiste?.connecteurs).toEqual(["scholar"]);
    expect(fil.selection).toEqual([{ id: "concis", texte: CONSIGNES_LIVREES[0].texte }]);
  });

  it("un spécialiste « tous les skills » n'annonce pas de préférence", () => {
    const fil = choisirSpecialiste(null, { ...glacio, tousSkills: true, connecteurs: [] })!;
    expect(fil.texte).not.toContain("Skills of this specialist");
    expect(fil.specialiste?.skills).toBeNull();
  });

  it("basculer une forme garde le spécialiste ; retirer le spécialiste garde les formes", () => {
    let fil = choisirSpecialiste(null, glacio);
    fil = basculerForme(fil, CONSIGNES_LIVREES[3]);
    fil = basculerForme(fil, CONSIGNES_LIVREES[2]);
    expect(fil?.specialiste?.id).toBe("sp1");
    expect(fil?.selection?.map((c) => c.id)).toEqual(["quebecois", "rigueur"]);
    const sans = choisirSpecialiste(fil, null);
    expect(sans?.specialiste).toBeUndefined();
    expect(sans?.selection?.map((c) => c.id)).toEqual(["quebecois", "rigueur"]);
  });

  it("un spécialiste seul garde une sélection vide, jamais relue comme consigne du catalogue", () => {
    const fil = choisirSpecialiste(null, glacio)!;
    expect(fil.selection).toEqual([]);
    expect(formesDuFil(fil)).toBeNull();
    expect(composerFil(null, null)).toBeNull();
  });

  it("la fiche modifiée s'applique au tour suivant, la fiche supprimée garde sa copie", () => {
    const fil = choisirSpecialiste(null, glacio)!;
    const edite = specialisteAJour(fil, [{ ...glacio, instructions: "Nouvelle consigne." }]);
    expect(edite?.texte).toContain("Nouvelle consigne.");
    expect(specialisteAJour(fil, [])).toBe(fil);
  });
});

describe("import depuis Claude Science", () => {
  it("ajoute les nouveaux avec un nom court et masque les inactifs", () => {
    const bilan = fusionnerImport([], [cs(), cs({ cle: "PAPER_WRITER", nom: "Paper Writer", actif: false, tousSkills: true, skills: [] })]);
    expect(bilan.ajoutes).toEqual(["Glaciologue albédo", "Paper Writer"]);
    expect(bilan.specialistes[0]).toMatchObject({ nomCourt: "Glaciologue", visible: true, origine: { cle: "GLACIOLOGUE_ALBEDO" } });
    expect(bilan.specialistes[1]).toMatchObject({ nomCourt: "Paper", visible: false, tousSkills: true });
  });

  it("un second import identique ne change rien", () => {
    const premier = fusionnerImport([], [cs()]);
    const second = fusionnerImport(premier.specialistes, [cs()]);
    expect(second.inchanges).toEqual(["Glaciologue albédo"]);
    expect(second.specialistes).toEqual(premier.specialistes);
  });

  it("met à jour une fiche intacte, mais ne remplace jamais une fiche modifiée ici", () => {
    const premier = fusionnerImport([], [cs()]).specialistes;
    const change = cs({ instructions: "Version Claude Science 2." });
    const intacte = fusionnerImport(premier, [change]);
    expect(intacte.misAJour).toEqual(["Glaciologue albédo"]);
    expect(intacte.specialistes[0].instructions).toBe("Version Claude Science 2.");

    const editee = premier.map((s) => ({ ...s, instructions: "Ma version Atelier." }));
    const conflit = fusionnerImport(editee, [change]);
    expect(conflit.conflits).toHaveLength(1);
    expect(conflit.specialistes[0].instructions).toBe("Ma version Atelier.");
    const pris = appliquerVersion(conflit.specialistes, conflit.conflits[0]);
    expect(pris[0].instructions).toBe("Version Claude Science 2.");
    expect(pris[0].origine?.empreinte).toBe(empreinteSpecialiste(pris[0]));
  });

  it("renommer le nom court ou masquer une fiche n'est pas une modification du contenu importé", () => {
    const premier = fusionnerImport([], [cs()]).specialistes.map((s) => ({ ...s, nomCourt: "Albédo", visible: false }));
    const change = fusionnerImport(premier, [cs({ role: "Nouveau rôle" })]);
    expect(change.misAJour).toHaveLength(1);
    expect(change.specialistes[0]).toMatchObject({ nomCourt: "Albédo", visible: false, role: "Nouveau rôle" });
  });
});

describe("proposition de l'agent", () => {
  const proposition = {
    nom: "Spécialiste Peyto", nomCourt: "Peyto", role: "Bilan de masse de Peyto",
    instructions: "Tu connais Peyto.", skills: [], connecteurs: ["scholar"], replaceId: null,
  };

  it("Garder ajoute une fiche visible", () => {
    const { specialistes, id } = garderProposition([glacio], proposition);
    expect(specialistes).toHaveLength(2);
    expect(specialistes.find((s) => s.id === id)).toMatchObject({ nom: "Spécialiste Peyto", nomCourt: "Peyto", tousSkills: true, visible: true });
  });

  it("une proposition qui remplace modifie la fiche sur place", () => {
    const { specialistes, id } = garderProposition([glacio], { ...proposition, replaceId: "sp1" });
    expect(id).toBe("sp1");
    expect(specialistes).toHaveLength(1);
    expect(specialistes[0].instructions).toBe("Tu connais Peyto.");
  });
});

describe("connecteurs du Mac", () => {
  it("compare les noms à la casse et la ponctuation près", () => {
    expect(connecteursAbsents(["Scholar Sidekick", "zotero"], [{ nom: "scholar-sidekick" }, { nom: "gbrain" }])).toEqual(["zotero"]);
  });
});

describe("délégation par @mention", () => {
  const stats: Specialiste = { ...glacio, id: "sp2", nom: "Analyste stats", nomCourt: "Stats" };
  it("reconnaît le nom court, sans la casse, et garde le reste comme tâche", () => {
    expect(mentionSpecialiste("@stats vérifie la convergence de M3", [glacio, stats])).toEqual({ specialiste: stats, task: "vérifie la convergence de M3" });
    expect(mentionSpecialiste("Peux-tu, @Glaciologue, relire ça ?", [glacio])?.task).toBe("Peux-tu, relire ça ?");
  });
  it("ignore une fiche masquée et un mot qui n'est pas un nom court", () => {
    expect(mentionSpecialiste("@Stats fais ceci", [{ ...stats, visible: false }])).toBeNull();
    expect(mentionSpecialiste("écris à @Thierry", [glacio, stats])).toBeNull();
  });
});

describe("skills du Mac", () => {
  it("sépare ce qui manque à Claude et à Codex", () => {
    const duMac = [
      { nom: "bilan-energie-fonte", claude: true, codex: false },
      { nom: "Write", claude: true, codex: true },
    ];
    expect(skillsAbsents(["bilan-energie-fonte", "write", "literature-review"], duMac)).toEqual({
      claude: ["literature-review"],
      codex: ["bilan-energie-fonte", "literature-review"],
    });
  });
});
