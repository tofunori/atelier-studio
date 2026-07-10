// ContextInspector (plan 018, étape 4) — instance du modèle d'inspecteur
// commun (InspectorPanel) pour un fichier du projet. Rendu pur des
// métadonnées reçues : aucune requête ici. L'ajout au contexte suit le
// contrat de transfert (étape 5) : `pending` bloque le double ajout,
// `added` est annoncé via une région role=status (accusé accessible).
// Un changement de p.item met à jour le contenu en place, sans animation.
import { useEffect } from "react";
import { t } from "../lib/i18n";
import type { HomeArtefactKind } from "../lib/researchHome";
import { Button, InspectorPanel } from "./ui";
import "../styles/inspector.css";

export type InspectedFile = {
  rel: string;
  name: string;
  dir: string;
  kind: HomeArtefactKind;
  projectRoot: string;
  projectName: string | null;
};

// map EXHAUSTIVE (le compilateur exige chaque variante — pas de clé i18n
// dynamique qui dégraderait en silence si un type d'artefact est ajouté)
type I18nKey = Parameters<typeof t>[0];
const KIND_KEYS: Record<HomeArtefactKind, I18nKey> = {
  figure: "home.kind.figure",
  document: "home.kind.document",
  code: "home.kind.code",
  data: "home.kind.data",
  other: "home.kind.other",
};

export function ContextInspector(p: {
  item: InspectedFile;
  onClose: () => void;
  onOpen: (rel: string) => void;
  onAddToChat: (item: InspectedFile) => void;
  addState: "idle" | "pending" | "added";
  /** Le choix inline/drawer appartient à l'intégrateur (classe `drawer`). */
  className?: string;
}) {
  const { item, onClose, onOpen, onAddToChat, addState, className } = p;

  // Escape ferme l'inspecteur quel que soit l'élément focalisé. Phase de
  // CAPTURE + stopPropagation : l'inspecteur est la surface au sommet — un
  // seul appui ne doit ni interrompre le thread (handler global d'App,
  // Escape du composer) ni fermer une autre surface en même temps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <InspectorPanel
      className={["context-inspector", className].filter(Boolean).join(" ")}
      title={item.name}
      eyebrow={t("inspector.title")}
      onClose={onClose}
      closeLabel={t("inspector.close")}
      footer={
        <>
          {/* le bouton reste ACTIVABLE à « added » (sinon disabled éjecte le
              focus vers body) — le double ajout est bloqué par l'hôte
              (addState !== "idle" → no-op) et par la dédup des attachments */}
          <Button
            variant="primary"
            loading={addState === "pending"}
            onClick={() => onAddToChat(item)}
          >
            {addState === "added" ? t("inspector.added") : t("action.add-to-chat")}
          </Button>
          {/* région vive persistante : le texte n'apparaît qu'à l'accusé,
              la région existe avant pour être annoncée par les lecteurs */}
          <span role="status" className="ci-sr">
            {addState === "added" ? t("inspector.added") : null}
          </span>
        </>
      }
    >
      <section className="ci-section">
        <h3>{t("inspector.overview")}</h3>
        <div className="ci-row">
          <span className="ci-value ci-trunc">{item.name}</span>
        </div>
        <div className="ci-row">
          <span className="ci-label">{t("inspector.type")}</span>
          <span className="ci-value">{t(KIND_KEYS[item.kind])}</span>
        </div>
      </section>

      <section className="ci-section">
        <h3>{t("inspector.source")}</h3>
        <div className="ci-row">
          <span className="ci-label">{t("inspector.path")}</span>
          <span className="ci-value ci-trunc" title={item.rel}>{item.rel}</span>
        </div>
        <div className="ci-row">
          <span className="ci-label">{t("inspector.project")}</span>
          <span className="ci-value ci-trunc">{item.projectName ?? item.projectRoot}</span>
        </div>
      </section>

      <section className="ci-section">
        <h3>{t("inspector.context")}</h3>
        <Button variant="secondary" onClick={() => onOpen(item.rel)}>
          {t("inspector.tab-open")}
        </Button>
      </section>
    </InspectorPanel>
  );
}
