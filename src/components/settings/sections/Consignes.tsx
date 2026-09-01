// Section réglages — éditeur de consignes (tâche 9). Deux volets : la liste
// du catalogue à gauche (avec « Nouvelle consigne » en bas), les champs
// d'édition à droite. Sauvegarde continue — chaque frappe rappelle onChange
// avec le tableau COMPLET, jamais de bouton « Enregistrer » (même contrat
// que primitives/SavedIndicator.tsx pour le reste des réglages : l'écriture
// se fait au fil de l'eau, la pastille « Enregistré » est le seul retour).
//
// `Consignes` (export nommé) est le composant pur, testé isolément avec
// `{ consignes, onChange }` — aucune dépendance à SectionProps. L'export par
// défaut l'adapte au contrat des sections (`s.consignes` / `save`) et câble
// le bouton « Reformuler » sur la socket (tâche 11).
//
// Bouton Reformuler (en-tête du champ Consigne) : trois états selon le champ
// et l'historique local — texte vide → « Rédiger » ; texte présent →
// « Reformuler » ; juste après une reformulation → « Rétablir ». L'original
// vit dans un `useState`, jamais dans `Consigne` — il est effacé à la
// première frappe suivante dans le textarea, pas seulement au changement de
// sélection.
import { useState } from "react";
import { normaliserNom, nouvelId, type Consigne } from "../../../lib/consignes";
import type { SectionProps } from "../shared";
import { DEFAULT_SETTINGS, type Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import { Button, RowButton } from "../../ui";
import { Field, FieldLabel } from "../../shadcn/field";
import { Input } from "../../shadcn/input";
import { Textarea } from "../../shadcn/textarea";

type Assist = { provider: string; model: string };

// Liste en dur, même parti pris que le sélecteur autoReview
// (sections/Atelier.tsx) : aucun catalogue à porter pour une poignée
// d'entrées. Ne jamais y ajouter un provider dont `reformuler_consigne`
// rend encore `None` côté Rust — un choix qui éteint le bouton sans
// l'expliquer serait pire que pas de choix (codex seul tant que claude
// n'a pas son implémentation, tâche 12).
const OPTIONS_MODELE_REFORMULATION: { value: string; label: string }[] = [
  { value: "codex:gpt-5.6-sol", label: "GPT-5.6 sol" },
  { value: "codex:gpt-5.5", label: "GPT-5.5" },
];

const EVENT_CONSIGNE_REFORMULEE = "consigne-reformulee";
const SOCKET_OPEN = 1;

/** Pont WS pour le bouton Reformuler : un aller-retour, pas de corrélation
 *  par id (le contrat `reformulerConsigne` → `consigneReformulee` n'en porte
 *  aucune) — un seul clic possible à la fois, le bouton se bloque le temps
 *  de la requête (`Button loading`). */
function reformulerViaWs(
  ws: WebSocket | null,
  projectRoot: string,
  assist: Assist,
  c: Consigne,
): Promise<string | null> {
  if (!ws || ws.readyState !== SOCKET_OPEN) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (texte: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener(EVENT_CONSIGNE_REFORMULEE, onEvent);
      resolve(texte);
    };
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { texte?: string | null } | undefined;
      finish(detail?.texte ?? null);
    };
    const timer = window.setTimeout(() => finish(null), 65_000);
    window.addEventListener(EVENT_CONSIGNE_REFORMULEE, onEvent);
    ws.send(JSON.stringify({
      type: "reformulerConsigne",
      nom: c.nom,
      description: c.description,
      texte: c.texte,
      provider: assist.provider,
      model: assist.model,
      projectRoot,
    }));
  });
}

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

export function Consignes(p: {
  consignes: Consigne[];
  onChange: (consignes: Consigne[]) => void;
  /** `null` = CLI indisponible (le bouton s'éteint) ; absent = pas encore
   *  câblé (même effet — un bouton qui ne peut rien faire reste inerte). */
  reformuler?: ((c: Consigne) => Promise<string | null>) | null;
  assist?: Assist;
  onChangeAssist?: (a: Assist) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Texte d'avant la dernière reformulation réussie — tant qu'il est posé,
  // le bouton dit « Rétablir ». Effacé par la frappe suivante OU un
  // changement de sélection (jamais dérivé de `selected.texte` : le parent
  // peut très bien ignorer le patch, comme en test).
  const [original, setOriginal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = p.consignes.find((c) => c.id === selectedId) ?? null;
  const assist = p.assist ?? DEFAULT_SETTINGS.consignesAssist;

  function patchSelected(patch: Partial<Consigne>) {
    if (!selected) return;
    p.onChange(p.consignes.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)));
  }

  function selectionner(id: string) {
    setSelectedId(id);
    setOriginal(null);
  }

  function ajouter() {
    const id = nouvelId(p.consignes);
    const nouvelle: Consigne = { id, nom: "", description: "", texte: "" };
    p.onChange([...p.consignes, nouvelle]);
    selectionner(id);
  }

  function supprimer() {
    if (!selected || selected.livree) return;
    p.onChange(p.consignes.filter((c) => c.id !== selected.id));
    setSelectedId(null);
    setOriginal(null);
  }

  async function reformulerClick() {
    if (!selected) return;
    if (original !== null) {
      patchSelected({ texte: original });
      setOriginal(null);
      return;
    }
    if (!p.reformuler) return;
    setBusy(true);
    try {
      const texte = await p.reformuler(selected);
      if (texte) {
        setOriginal(selected.texte);
        patchSelected({ texte });
      }
    } finally {
      setBusy(false);
    }
  }

  const labelReformuler = original !== null
    ? t("settings.consignes-restore")
    : selected?.texte.trim()
      ? t("settings.consignes-rewrite")
      : t("settings.consignes-write");

  return (
    <div className="set-consignes-wrap">
      <div className="set-consignes">
        <div className="set-consignes-list">
          {p.consignes.map((c) => (
            <RowButton
              key={c.id}
              className={`set-consignes-item ${selectedId === c.id ? "on" : ""}`}
              aria-current={selectedId === c.id ? "true" : undefined}
              onClick={() => selectionner(c.id)}
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
                  <Button
                    variant="ghost"
                    className="set-consignes-reformuler"
                    disabled={!p.reformuler && original === null}
                    loading={busy}
                    onClick={reformulerClick}
                  >
                    {labelReformuler}
                  </Button>
                </div>
                <Textarea id="consigne-texte" className="set-consignes-textarea" rows={8} value={selected.texte}
                  onChange={(e) => { setOriginal(null); patchSelected({ texte: e.target.value }); }} />
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

      <Field className="set-consignes-assist">
        <FieldLabel htmlFor="consignes-assist-model">{t("settings.consignes-assist-model")}</FieldLabel>
        <select
          id="consignes-assist-model"
          className="set-consignes-assist-select"
          value={`${assist.provider}:${assist.model}`}
          onChange={(e) => {
            const [provider, model] = e.target.value.split(":");
            (p.onChangeAssist ?? (() => {}))({ provider, model });
          }}
        >
          {OPTIONS_MODELE_REFORMULATION.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

export default function ConsignesSection(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  return (
    <>
      <h1>{t("settings.consignes")}</h1>
      <p className="set-sub">{t("settings.consignes-sub")}</p>
      <Consignes
        consignes={p.s.consignes}
        onChange={(consignes) => save({ consignes })}
        reformuler={(c) => reformulerViaWs(p.ws, p.projectRoot ?? "", p.s.consignesAssist, c)}
        assist={p.s.consignesAssist}
        onChangeAssist={(consignesAssist) => save({ consignesAssist })}
      />
    </>
  );
}
