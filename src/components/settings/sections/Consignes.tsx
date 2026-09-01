// Section réglages — éditeur de consignes (tâche 9). Deux volets : la liste
// du catalogue à gauche (avec « Nouvelle consigne » en bas), les champs
// d'édition à droite. Sauvegarde continue — chaque frappe rappelle onChange
// avec le tableau COMPLET, jamais de bouton « Enregistrer » (même contrat
// que primitives/SavedIndicator.tsx pour le reste des réglages : l'écriture
// se fait au fil de l'eau, la pastille « Enregistré » est le seul retour).
//
// `Consignes` (export nommé) est le composant pur, testé isolément avec
// `{ consignes, onChange }` — aucune dépendance à SectionProps. L'export par
// défaut l'adapte au contrat des sections (`s.consignes` / `save`).
//
// Emplacement réservé pour la tâche 11 (« Reformuler » + sélecteur de
// modèle) : l'en-tête du champ Consigne (`.set-consignes-field-header`) ne
// porte pour l'instant que le libellé, à gauche — rien d'autre n'est
// construit ici.
import { useState } from "react";
import { normaliserNom, nouvelId, type Consigne } from "../../../lib/consignes";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import { Button, RowButton } from "../../ui";
import { Field, FieldLabel } from "../../shadcn/field";
import { Input } from "../../shadcn/input";
import { Textarea } from "../../shadcn/textarea";

// Cadenas — consigne livrée avec l'app : modifiable, jamais supprimable
// (sinon le catalogue redevient vidable par erreur). Icône locale, pas dans
// icons.tsx : même principe que GlypheConsigne dans ConsigneMenu.tsx, seul
// consommateur.
function IconeCadenas() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
         strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export function Consignes(p: { consignes: Consigne[]; onChange: (consignes: Consigne[]) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = p.consignes.find((c) => c.id === selectedId) ?? null;

  function patchSelected(patch: Partial<Consigne>) {
    if (!selected) return;
    p.onChange(p.consignes.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)));
  }

  function ajouter() {
    const id = nouvelId(p.consignes);
    const nouvelle: Consigne = { id, nom: "", description: "", texte: "" };
    p.onChange([...p.consignes, nouvelle]);
    setSelectedId(id);
  }

  function supprimer() {
    if (!selected || selected.livree) return;
    p.onChange(p.consignes.filter((c) => c.id !== selected.id));
    setSelectedId(null);
  }

  return (
    <div className="set-consignes">
      <div className="set-consignes-list">
        {p.consignes.map((c) => (
          <RowButton
            key={c.id}
            className={`set-consignes-item ${selectedId === c.id ? "on" : ""}`}
            aria-current={selectedId === c.id ? "true" : undefined}
            onClick={() => setSelectedId(c.id)}
          >
            {c.livree && (
              <span className="set-consignes-item-lock" title={t("settings.consignes-locked")}>
                <IconeCadenas />
              </span>
            )}
            <span className="set-consignes-item-nom">{c.nom || t("settings.consignes-untitled")}</span>
          </RowButton>
        ))}
        <RowButton className="set-consignes-new" onClick={ajouter}>
          {t("settings.consignes-new")}
        </RowButton>
      </div>

      <div className="set-consignes-form">
        {selected ? (
          <>
            <Field>
              <FieldLabel htmlFor="consigne-nom">{t("settings.consignes-field-nom")}</FieldLabel>
              <Input id="consigne-nom" className="set-text" value={selected.nom}
                onChange={(e) => patchSelected({ nom: normaliserNom(e.target.value) })} />
              <p className="set-consignes-hint">{t("settings.consignes-field-nom-hint")}</p>
            </Field>
            <Field>
              <FieldLabel htmlFor="consigne-description">{t("settings.consignes-field-description")}</FieldLabel>
              <Input id="consigne-description" className="set-text" value={selected.description}
                onChange={(e) => patchSelected({ description: e.target.value })} />
            </Field>
            <Field>
              <div className="set-consignes-field-header">
                <FieldLabel htmlFor="consigne-texte">{t("settings.consignes-field-texte")}</FieldLabel>
              </div>
              <Textarea id="consigne-texte" className="set-consignes-textarea" rows={8} value={selected.texte}
                onChange={(e) => patchSelected({ texte: e.target.value })} />
            </Field>
            {!selected.livree && (
              <Button variant="ghost" className="set-consignes-delete" onClick={supprimer}>
                {t("action.delete")}
              </Button>
            )}
          </>
        ) : (
          <p className="set-empty">{t("settings.consignes-empty")}</p>
        )}
      </div>
    </div>
  );
}

export default function ConsignesSection(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  return (
    <>
      <h1>{t("settings.consignes")}</h1>
      <p className="set-sub">{t("settings.consignes-sub")}</p>
      <Consignes consignes={p.s.consignes} onChange={(consignes) => save({ consignes })} />
    </>
  );
}
