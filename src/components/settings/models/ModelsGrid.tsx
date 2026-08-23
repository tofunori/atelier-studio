// ModelsGrid (lot B1, tâche 3) : tableau dense des modèles — une ligne par
// modèle, colonnes alignées pour comparer d'un coup d'œil ce qu'aujourd'hui
// il faut mémoriser en scrollant des rangées de formulaire empilées.
// Purement présentationnel : aucune connaissance du socket ni de `Settings`,
// tout remonte par callback (tâche 4 branchera ces callbacks sur `s`/`set`).
//
// Décision de dessin tranchée ici (le brief demandait de la juger à l'œil) :
// pas de colonne « identifiant » dédiée. Un slug comme
// `openrouter/anthropic/claude-sonnet-4-5-20250929` (45 caractères) dans une
// colonne coincée entre cinq autres sur ~816px de large ne laisserait que
// 15-20 caractères visibles avant l'ellipse — quasi illisible même avec un
// `title`. L'identifiant devient donc la seconde ligne, en `--code-font`
// atténué, sous le libellé du modèle : il hérite de toute la largeur de la
// colonne « Modèle » (la plus large, puisqu'elle porte déjà le texte le plus
// long) au lieu de se battre pour de la place dans une colonne étroite à lui
// tout seul. Le texte complet reste disponible via `title` en cas de coupure.
import type { ChangeEvent, KeyboardEvent } from "react";
import { useRef } from "react";
import { EmptyState, RowButton, StatusBadge } from "../../ui";
import { Select } from "../../Select";
import { ProviderIcon, StarIcon } from "../../icons";
import { t } from "../../../lib/i18n";
import type { ModelRow } from "./buildModelRows";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function countLabel(n: number): string {
  const key = n === 1 ? "settings.models-grid.count-one" : "settings.models-grid.count-other";
  return t(key, { count: n });
}

export function ModelsGrid(props: {
  rows: ModelRow[];
  onSetDefault: (row: ModelRow) => void;
  onToggleFavorite: (row: ModelRow) => void;
  onSetEffort: (row: ModelRow, effort: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  /** Repli en liste de cartes (tâche 5), sous le seuil ≤880px de la feuille
   *  modale — voir SectionProps.narrow (Models.tsx) pour la source unique de
   *  ce booléen. Même rappels, mêmes groupes ARIA (radiogroup par
   *  fournisseur) : seule la mise en page change, jamais `role="table"` ici. */
  compact?: boolean;
}) {
  const { rows, onSetDefault, onToggleFavorite, onSetEffort, filter, onFilterChange, compact = false } = props;

  // Regroupe les lignes CONSÉCUTIVES du même fournisseur : buildModelRows
  // (tâche 2) itère déjà provider par provider, donc un simple découpage en
  // tronçons suffit — ce composant reste présentationnel, il ne re-trie pas
  // ce qu'on lui donne. Chaque tronçon devient un radiogroup ARIA : c'est ce
  // qui traduit « un seul défaut par fournisseur » aux technologies
  // d'assistance (un <tbody role="radiogroup"> par fournisseur, les radios
  // de ses lignes en descendants).
  //
  // HYPOTHÈSE FRAGILE, à surveiller à la tâche 4 : ce découpage suppose que
  // les lignes d'un même fournisseur restent contiguës dans `rows`. Si un tri
  // (par nom, par statut…) s'intercale un jour entre buildModelRows et ce
  // composant, deux tronçons du même fournisseur redeviendraient possibles —
  // la clé React ci-dessous (dérivée de la première ligne du tronçon, pas du
  // seul id de fournisseur) évite la collision de clé, mais le radiogroup se
  // scinderait quand même en deux groupes ARIA distincts, silencieusement.
  const groups: ModelRow[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0].provider === row.provider) last.push(row);
    else groups.push([row]);
  }

  return (
    <div className="mg-root">
      <div className="mg-toolbar">
        <input
          type="search"
          className="mg-search"
          placeholder={t("settings.models-grid.filter-ph")}
          aria-label={t("settings.models-grid.filter-ph")}
          value={filter}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onFilterChange(event.target.value)}
        />
        <span className="mg-count">{countLabel(rows.length)}</span>
      </div>

      {rows.length === 0 ? (
        // Deux raisons distinctes pour un tableau vide (correction de revue,
        // importants) : aucun fournisseur actif (message générique), OU un
        // filtre actif qui ne trouve rien (message ré-employé de l'ancienne
        // recherche opencode dédiée — settings.model-no-match — plutôt
        // qu'un message qui parle de « fournisseurs » quand le problème est
        // la recherche).
        <EmptyState
          title={t("settings.models-grid.empty-title")}
          description={filter.trim() ? t("settings.model-no-match") : t("settings.models-grid.empty-desc")}
        />
      ) : compact ? (
        // Repli en cartes (tâche 5) : une carte par modèle, aucun <table> —
        // donc aucun role="table" implicite. Les mêmes tronçons par
        // fournisseur (même hypothèse de contiguïté que la table) deviennent
        // des <div role="radiogroup">, pas des <tbody> : ProviderGroup choisit
        // la balise selon `compact`, le radiogroup et sa navigation aux
        // flèches (roving tabindex) sont inchangés.
        <div className="mg-scroll">
          <div className="mg-cards">
            {groups.map((group) => (
              <ProviderGroup
                key={`group-${group[0].key}`}
                rows={group}
                compact
                onSetDefault={onSetDefault}
                onToggleFavorite={onToggleFavorite}
                onSetEffort={onSetEffort}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mg-scroll">
          <table className="mg-table">
            <thead>
              <tr>
                <th scope="col" className="mg-col-default">
                  <span className="tw:sr-only">{t("settings.models-grid.default")}</span>
                </th>
                <th scope="col" className="mg-col-model">{t("settings.models-grid.model")}</th>
                <th scope="col" className="mg-col-provider">{t("settings.models-grid.provider")}</th>
                <th scope="col" className="mg-col-effort">{t("settings.models-grid.effort")}</th>
                <th scope="col" className="mg-col-status">{t("settings.models-grid.status")}</th>
                <th scope="col" className="mg-col-favorite">
                  <span className="tw:sr-only">{t("settings.models-grid.favorite")}</span>
                </th>
              </tr>
            </thead>
            {groups.map((group) => (
              <ProviderGroup
                key={`group-${group[0].key}`}
                rows={group}
                compact={false}
                onSetDefault={onSetDefault}
                onToggleFavorite={onToggleFavorite}
                onSetEffort={onSetEffort}
              />
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

// Un <tbody> par fournisseur = un radiogroup ARIA. Calqué sur le roving
// tabindex de SegmentedControl (src/components/ui/SegmentedControl.tsx,
// fonction `move`) : dans un groupe, seule la ligne par défaut (ou la
// première si aucune ne l'est encore) porte tabIndex 0, les autres -1. Les
// flèches déplacent le focus ET la sélection dans le groupe — sans ça, un
// fournisseur qui publie des centaines de modèles (opencode) forcerait à
// appuyer sur Tab autant de fois qu'il y a de lignes pour sortir du groupe.
function ProviderGroup(props: {
  rows: ModelRow[];
  compact: boolean;
  onSetDefault: (row: ModelRow) => void;
  onToggleFavorite: (row: ModelRow) => void;
  onSetEffort: (row: ModelRow, effort: string) => void;
}) {
  const { rows, compact, onSetDefault, onToggleFavorite, onSetEffort } = props;
  // Un seul type de ref pour les deux balises possibles (<tbody> en tableau,
  // <div> en cartes) : querySelectorAll/focus ne dépendent pas de la balise
  // exacte, et HTMLElement est un supertype des deux — la ref-callback reste
  // assignable à Ref<HTMLTableSectionElement> ET à Ref<HTMLDivElement> par
  // contravariance de paramètre.
  const bodyRef = useRef<HTMLElement | null>(null);
  const setBodyRef = (el: HTMLElement | null) => { bodyRef.current = el; };
  const providerLabel = rows[0].providerLabel;

  const defaultIndex = rows.findIndex((row) => row.isDefault);
  const tabbableIndex = defaultIndex === -1 ? 0 : defaultIndex;

  const focusRadioAt = (index: number) => {
    const radios = Array.from(
      bodyRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
    radios[index]?.focus();
  };

  const selectAt = (index: number) => {
    onSetDefault(rows[index]);
    focusRadioAt(index);
  };

  // La position courante se lit sur l'élément RÉELLEMENT focalisé (et non
  // sur un data-attribute) : ce composant reste présentationnel, `rows` ne
  // change qu'au prochain rendu du parent, donc l'index le plus fiable est
  // celui du bouton radio que le clavier vient de quitter.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const radios = Array.from(
      bodyRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
    const currentIndex = radios.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1) return; // focus sur l'effort/le favori : on laisse passer

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      selectAt((currentIndex + 1) % rows.length);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      selectAt((currentIndex - 1 + rows.length) % rows.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectAt(rows.length - 1);
    }
  };

  const groupLabel = t("settings.models-grid.default-group", { provider: providerLabel });
  const items = rows.map((row, index) => (
    <ModelGridRow
      key={row.key}
      row={row}
      compact={compact}
      tabbable={index === tabbableIndex}
      onSetDefault={onSetDefault}
      onToggleFavorite={onToggleFavorite}
      onSetEffort={onSetEffort}
    />
  ));

  // Même radiogroup ARIA, deux balises : <tbody> en tableau (déjà en place),
  // <div> en cartes (tâche 5) — le rôle, le libellé et la navigation aux
  // flèches (onKeyDown ci-dessus) sont identiques dans les deux cas, `ref`
  // et `onKeyDown` acceptent bien les deux grâce au typage HTMLElement plus
  // haut.
  return compact ? (
    <div
      ref={setBodyRef}
      className="mg-card-group"
      role="radiogroup"
      aria-label={groupLabel}
      onKeyDown={onKeyDown}
    >
      {items}
    </div>
  ) : (
    <tbody
      ref={setBodyRef}
      role="radiogroup"
      aria-label={groupLabel}
      onKeyDown={onKeyDown}
    >
      {items}
    </tbody>
  );
}

function ModelGridRow(props: {
  row: ModelRow;
  compact: boolean;
  tabbable: boolean;
  onSetDefault: (row: ModelRow) => void;
  onToggleFavorite: (row: ModelRow) => void;
  onSetEffort: (row: ModelRow, effort: string) => void;
}) {
  const { row, compact, tabbable, onSetDefault, onToggleFavorite, onSetEffort } = props;
  const defaultLabel = t("settings.models-grid.default-for", { model: row.label });
  const favoriteLabel = row.isFavorite
    ? t("settings.models-grid.favorite-remove", { model: row.label })
    : t("settings.models-grid.favorite-add", { model: row.label });
  const effortLabel = `${t("settings.models-grid.effort")} — ${row.label}`;

  const defaultRadio = (
    <RowButton
      role="radio"
      aria-checked={row.isDefault}
      aria-label={defaultLabel}
      className={cx("mg-radio", compact && "mg-card-radio")}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => { if (!row.isDefault) onSetDefault(row); }}
    >
      <span className="mg-radio-dot" aria-hidden="true" />
    </RowButton>
  );

  const favoriteButton = (
    <RowButton
      aria-pressed={row.isFavorite}
      aria-label={favoriteLabel}
      className={cx("mg-fav", compact && "mg-card-fav")}
      onClick={() => onToggleFavorite(row)}
    >
      <StarIcon size={14} />
    </RowButton>
  );

  const effortSelect = (
    <Select
      compact
      title={effortLabel}
      value={row.effort}
      onChange={(value) => onSetEffort(row, value)}
      options={row.efforts.map((effort) => ({
        value: effort,
        label: effort === "" ? t("common.provider-default") : effort,
      }))}
    />
  );

  const statusBadge = (
    <StatusBadge status={row.status === "ready" ? "success" : "error"}>
      {row.status === "ready"
        ? t("settings.models-grid.status-ready")
        : t("settings.models-grid.status-absent")}
    </StatusBadge>
  );

  const providerTag = (
    <span className="mg-provider">
      <ProviderIcon provider={row.provider} size={13} />
      {row.providerLabel}
    </span>
  );

  // Bloc .mg-model INCHANGÉ (voir commentaire d'en-tête du fichier) : un
  // <div> flex-colonne autonome, déjà indépendant de la structure de
  // tableau — il se déplace tel quel dans la carte.
  const modelBlock = (
    <div className="mg-model">
      <span className="mg-model-name">{row.label}</span>
      <span className="mg-model-id" title={row.modelId}>{row.modelId}</span>
    </div>
  );

  if (compact) {
    // Une carte par modèle : même contenu que la ligne de tableau (radio de
    // défaut, modèle, fournisseur, effort, statut, favori), disposé en deux
    // rangées internes plutôt qu'en six cellules — les cinq rappels restent
    // les mêmes fonctions, appelées avec le même `row`.
    return (
      <div className={cx("mg-card", row.isDefault && "mg-card--default")}>
        <div className="mg-card-head">
          {defaultRadio}
          {modelBlock}
          {favoriteButton}
        </div>
        <div className="mg-card-meta">
          {providerTag}
          {effortSelect}
          {statusBadge}
        </div>
      </div>
    );
  }

  return (
    <tr className={cx("mg-row", row.isDefault && "mg-row--default")}>
      <td className="mg-col-default">
        {defaultRadio}
      </td>
      <td className="mg-col-model">
        {modelBlock}
      </td>
      <td className="mg-col-provider">
        {providerTag}
      </td>
      <td className="mg-col-effort">
        {effortSelect}
      </td>
      <td className="mg-col-status">
        {statusBadge}
      </td>
      <td className="mg-col-favorite">
        {favoriteButton}
      </td>
    </tr>
  );
}
