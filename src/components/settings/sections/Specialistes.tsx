// Réglages › Spécialistes (plan specialistes-2026-10-18, lot 1). Même
// disposition que Consignes (bibliothèque à gauche, fiche à droite) ; on
// crée, modifie, masque ou supprime une fiche, et on importe celles de
// Claude Science (lecture seule de sa base, côté Rust).
import { useState } from "react";
import { Download, Plus } from "lucide-react";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import {
  appliquerVersion, fusionnerImport, nomCourtDe, normaliserNomCourt, prendreFicheDemandee, specialisteVide,
  type BilanImport, type Specialiste,
} from "../../../lib/specialistes";
import { importerDepuisClaudeScience, type ReponseImport } from "../../../lib/claudeScienceImport";
import { Button, InlineNotice, RowButton } from "../../ui";
import { Toggle } from "../primitives";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../shadcn/field";
import { Input } from "../../shadcn/input";
import { Textarea } from "../../shadcn/textarea";
import "./Consignes.css";
import "./Specialistes.css";

const SOCKET_OPEN = 1;

const enListe = (valeur: string) => valeur.split(",").map((s) => s.trim()).filter(Boolean);

export function Specialistes(p: {
  specialistes: Specialiste[];
  onChange: (specialistes: Specialiste[]) => void;
  importer?: (() => Promise<ReponseImport>) | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const demandee = prendreFicheDemandee();
    return (demandee && p.specialistes.some((s) => s.id === demandee) ? demandee : p.specialistes[0]?.id) ?? null;
  });
  const [importEnCours, setImportEnCours] = useState(false);
  const [bilan, setBilan] = useState<BilanImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Remonte la fiche quand une version de Claude Science la remplace, pour
  // que les champs en saisie libre repartent de la nouvelle valeur.
  const [revision, setRevision] = useState(0);
  const selected = p.specialistes.find((s) => s.id === selectedId) ?? null;

  function patch(changes: Partial<Specialiste>) {
    if (!selected) return;
    p.onChange(p.specialistes.map((s) => (s.id === selected.id ? { ...s, ...changes } : s)));
  }
  function ajouter() {
    const fiche = specialisteVide(p.specialistes);
    p.onChange([...p.specialistes, fiche]);
    setSelectedId(fiche.id);
  }
  function supprimer() {
    if (!selected) return;
    p.onChange(p.specialistes.filter((s) => s.id !== selected.id));
    setSelectedId(p.specialistes.find((s) => s.id !== selected.id)?.id ?? null);
  }
  async function importer() {
    if (!p.importer) return;
    setImportEnCours(true);
    setErreur(null);
    setBilan(null);
    const reponse = await p.importer();
    setImportEnCours(false);
    if (!reponse.ok) {
      setErreur(reponse.error ?? t("specialistes.import-failed"));
      return;
    }
    const resultat = fusionnerImport(p.specialistes, reponse.specialistes ?? []);
    setBilan(resultat);
    p.onChange(resultat.specialistes);
    if (!selectedId && resultat.specialistes[0]) setSelectedId(resultat.specialistes[0].id);
  }
  function prendreVersion(conflit: BilanImport["conflits"][number]) {
    p.onChange(appliquerVersion(p.specialistes, conflit));
    setBilan((b) => (b ? { ...b, conflits: b.conflits.filter((c) => c.id !== conflit.id) } : b));
    if (conflit.id === selectedId) setRevision((r) => r + 1);
  }

  const resume = bilan
    ? [
        bilan.ajoutes.length ? t("specialistes.import-added", { n: bilan.ajoutes.length }) : "",
        bilan.misAJour.length ? t("specialistes.import-updated", { n: bilan.misAJour.length }) : "",
        bilan.inchanges.length ? t("specialistes.import-unchanged", { n: bilan.inchanges.length }) : "",
      ].filter(Boolean).join(" · ") || t("specialistes.import-none")
    : "";

  return (
    <div className="set-consignes-wrap consignes-studio specialistes-studio">
      <div className="specialistes-import">
        <Button variant="outline" loading={importEnCours} disabled={!p.importer} onClick={importer}>
          <Download size={14} aria-hidden="true" />{t("specialistes.import")}
        </Button>
        <span className="specialistes-import-hint">{t("specialistes.import-hint")}</span>
      </div>
      {erreur && <InlineNotice tone="error" className="set-notice">{erreur}</InlineNotice>}
      {bilan && (
        <div className="specialistes-bilan" role="status">
          <span>{resume}</span>
          {bilan.conflits.map((c) => (
            <div key={c.id} className="specialistes-conflit">
              <span>{t("specialistes.import-conflict", { nom: c.nom })}</span>
              <Button variant="ghost" onClick={() => prendreVersion(c)}>{t("specialistes.import-take")}</Button>
            </div>
          ))}
        </div>
      )}
      <div className="set-consignes">
        <nav className="set-consignes-list" aria-label={t("specialistes.library")}>
          <div className="consignes-library-heading">{t("specialistes.library")}<span>{p.specialistes.length}</span></div>
          <div className="consignes-library-items">
            {p.specialistes.map((s) => (
              <RowButton key={s.id} className={`set-consignes-item specialistes-item ${selectedId === s.id ? "on" : ""}`}
                aria-current={selectedId === s.id ? "true" : undefined} onClick={() => setSelectedId(s.id)}>
                <span className="set-consignes-item-nom">{s.nom || t("specialistes.untitled")}</span>
                {!s.visible && <span className="specialistes-item-masque">{t("specialistes.hidden")}</span>}
              </RowButton>
            ))}
          </div>
          <RowButton className="set-consignes-new" onClick={ajouter}><Plus size={14} aria-hidden="true" />{t("specialistes.new")}</RowButton>
        </nav>
        <div className="set-consignes-form">
          {selected ? <FicheSpecialiste key={`${selected.id}:${revision}`} fiche={selected} onPatch={patch} onSupprimer={supprimer} />
           : <div className="consignes-empty"><p className="set-empty">{t("specialistes.empty")}</p></div>}
        </div>
      </div>
    </div>
  );
}

/** Formulaire d'une fiche, remonté à chaque changement de fiche (clé). */
function FicheSpecialiste(p: { fiche: Specialiste; onPatch: (changes: Partial<Specialiste>) => void; onSupprimer: () => void }) {
  const { fiche } = p;
  // Les listes se tapent séparées par des virgules : on garde la saisie
  // brute pendant la frappe, sinon « a, » perdrait sa virgule à chaque touche.
  const [skillsBrut, setSkillsBrut] = useState(() => fiche.skills.join(", "));
  const [connecteursBrut, setConnecteursBrut] = useState(() => fiche.connecteurs.join(", "));
  return (
    <>
      <FieldGroup className="consignes-metadata">
        <div className="specialistes-noms">
          <Field>
            <FieldLabel htmlFor="specialiste-nom">{t("specialistes.field-nom")}</FieldLabel>
            <Input id="specialiste-nom" className="consignes-title" value={fiche.nom} maxLength={60}
              placeholder={t("specialistes.untitled")} onChange={(e) => p.onPatch({ nom: e.target.value })} />
          </Field>
          <Field className="specialistes-nom-court">
            <FieldLabel htmlFor="specialiste-nom-court">{t("specialistes.field-nom-court")}</FieldLabel>
            <Input id="specialiste-nom-court" value={fiche.nomCourt} placeholder={nomCourtDe({ ...fiche, nomCourt: "" })}
              onChange={(e) => p.onPatch({ nomCourt: normaliserNomCourt(e.target.value) })} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="specialiste-role">{t("specialistes.field-role")}</FieldLabel>
          <Input id="specialiste-role" value={fiche.role} placeholder={t("specialistes.role-placeholder")}
            onChange={(e) => p.onPatch({ role: e.target.value })} />
        </Field>
        {fiche.origine && <p className="specialistes-origine">{t("specialistes.origin-claude-science")}</p>}
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="specialiste-instructions">{t("specialistes.field-instructions")}</FieldLabel>
        <div className="consignes-editor">
          <Textarea id="specialiste-instructions" className="set-consignes-textarea" rows={10}
            value={fiche.instructions} placeholder={t("specialistes.instructions-placeholder")}
            onChange={(e) => p.onPatch({ instructions: e.target.value })} />
        </div>
      </Field>
      <FieldGroup className="specialistes-outils">
        <div className="specialistes-toggle">
          <span>{t("specialistes.all-skills")}</span>
          <Toggle checked={fiche.tousSkills} label={t("specialistes.all-skills")}
            onChange={(tousSkills) => p.onPatch({ tousSkills })} />
        </div>
        {!fiche.tousSkills && <Field>
          <FieldLabel htmlFor="specialiste-skills">{t("specialistes.field-skills")}</FieldLabel>
          <Input id="specialiste-skills" value={skillsBrut} placeholder="bilan-energie-fonte, recherche-references"
            onChange={(e) => { setSkillsBrut(e.target.value); p.onPatch({ skills: enListe(e.target.value) }); }} />
        </Field>}
        <Field>
          <FieldLabel htmlFor="specialiste-connecteurs">{t("specialistes.field-connectors")}</FieldLabel>
          <Input id="specialiste-connecteurs" value={connecteursBrut} placeholder="scholar"
            onChange={(e) => { setConnecteursBrut(e.target.value); p.onPatch({ connecteurs: enListe(e.target.value) }); }} />
          <FieldDescription>{t("specialistes.tools-hint")}</FieldDescription>
        </Field>
        <div className="specialistes-toggle">
          <span>{t("specialistes.visible")}</span>
          <Toggle checked={fiche.visible} label={t("specialistes.visible")} onChange={(visible) => p.onPatch({ visible })} />
        </div>
      </FieldGroup>
      <Button variant="ghost" className="set-consignes-delete" onClick={p.onSupprimer}>{t("action.delete")}</Button>
    </>
  );
}

export default function SpecialistesSection(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  return (
    <>
      <h1>{t("settings.specialistes")}</h1>
      <p className="set-sub">{t("settings.specialistes-sub")}</p>
      <Specialistes
        specialistes={p.s.specialistes ?? []}
        onChange={(specialistes) => save({ specialistes })}
        importer={p.ws?.readyState === SOCKET_OPEN ? () => importerDepuisClaudeScience(p.ws) : null}
      />
    </>
  );
}
