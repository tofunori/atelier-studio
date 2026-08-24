// OpenCodeRouter (lot B2, tâche 4) : catalogue navigable des routes opencode.
// Purement présentationnel — aucune connaissance du WebSocket, de `Settings`
// ni de `localStorage` (voir SectionProps.narrow dans shared.ts pour le
// précédent de ce même principe) : tout arrive en props déjà dérivées
// (`groups` via groupRoutes.ts) et tout remonte par callback. Le câblage
// (tâche 5) branchera `onGatewayChange`/`onQueryChange`/`onTogglePin` sur
// l'état réel et la persistance.
//
// Règle de dessin n°1 (spec §7.2), contre-intuitive mais centrale : la zone
// reste VIDE tant qu'aucune passerelle n'est choisie et qu'aucune recherche
// n'est en cours. opencode peut publier plusieurs milliers d'identifiants
// routés (voir l'en-tête de groupRoutes.ts) — afficher mille groupes au
// hasard serait pire que rien. Le catalogue ne se parcourt pas, il se filtre.
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import { EmptyState, RowButton, SegmentedControl, type SegmentedOption } from "../../ui";
import { t } from "../../../lib/i18n";
import { filterGroups, type ModelGroup, type Route } from "./groupRoutes";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Sentinelle du choix « toutes les passerelles » dans le SegmentedControl —
// distincte de tout id de passerelle réel, jamais transmise à onGatewayChange
// (convertie en `null` avant de remonter).
const ALL_GATEWAYS = "__all__";

// Id DOM stable et sûr pour aria-controls : `group.key` peut contenir des
// caractères de leaf normalisé ou le repli `__empty-leaf__:<id de route>`
// (voir groupRoutes.ts), potentiellement des slashes — on ne les évacue pas
// pour la lisibilité en devtools, mais on les rend inoffensifs pour un id.
function domId(prefix: string, key: string): string {
  return `${prefix}-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function pluralCount(key: string, count: number, vars?: Record<string, string | number>): string {
  return t((count === 1 ? `${key}-one` : `${key}-other`) as Parameters<typeof t>[0], { count, ...vars });
}

// Petit trombone monochrome — pas d'icône « pin » dans src/components/icons.tsx
// (revue : StarIcon sert déjà à un autre contrat, « favori de fournisseur »
// dans ModelsGrid ; l'épinglage de route est une action distincte, elle
// mérite son propre glyphe plutôt qu'une réutilisation trompeuse). Décoratif
// : le nom accessible vient du RowButton englobant (aria-label + aria-pressed).
function PinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="6" r="3" />
      <path d="M8 9v5.5" />
    </svg>
  );
}

// Chevron de dépliage — état porté par une classe (rotation CSS), jamais par
// deux glyphes distincts : un seul tracé, cohérent avec le reste de l'app
// (transitions 120–150ms, prefers-reduced-motion respecté côté CSS).
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx("ocr-chevron", open && "ocr-chevron--open")}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function OpenCodeRouter(props: {
  groups: ModelGroup[];
  gateways: { id: string; count: number }[];
  activeGateway: string | null;
  query: string;
  onGatewayChange: (id: string | null) => void;
  onQueryChange: (value: string) => void;
  onTogglePin: (route: Route) => void;
  pinned: string[];
}) {
  const { groups, gateways, activeGateway, query, onGatewayChange, onQueryChange, onTogglePin, pinned } = props;

  // Dépliage par groupe : état LOCAL (ce composant reste présentationnel
  // pour les données, mais l'ouverture/fermeture d'un groupe n'a pas de sens
  // hors de cette vue — rien à remonter). `undefined` = pas encore touché
  // par l'utilisateur, auto-ouvert si le groupe porte une route épinglée
  // (règle de dessin n°2) ; une fois touché, la préférence explicite gagne.
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  // Compte les épinglées PARMI LES ROUTES RÉELLEMENT VISIBLES d'un groupe —
  // jamais `group.pinnedCount` (revue tâche 3 : ce champ compte les
  // épinglées du groupe COMPLET avant filtrage par passerelle, donc peut
  // dépasser le nombre de routes affichées une fois un filtre actif, le cas
  // d'usage principal ici). Dérivé de `group.routes` (déjà réduit par
  // filterGroups le cas échéant) et de `pinned`, reçus tous deux en props :
  // juste quel que soit l'état de filterGroups en amont.
  const visiblePinnedCount = (group: ModelGroup): number =>
    group.routes.reduce((n, r) => n + (pinnedSet.has(r.id) ? 1 : 0), 0);

  const isOpen = (group: ModelGroup): boolean => {
    const override = openOverrides[group.key];
    if (override !== undefined) return override;
    return visiblePinnedCount(group) > 0;
  };

  const toggleOpen = (group: ModelGroup) => {
    setOpenOverrides((prev) => ({ ...prev, [group.key]: !isOpen(group) }));
  };

  // Routes épinglées, dans l'ORDRE de `pinned` (ordre du câblage — récence
  // ou autre, ce composant ne juge pas). Recherchées dans `groups` en entier
  // (pas dans le résultat filtré) : une route épinglée doit rester visible
  // en tête même si le filtre courant l'exclurait du catalogue en dessous —
  // c'est tout le sens de la règle de dessin n°4 (« hors du catalogue »).
  // Une route pointée par un id épinglé mais absente de `groups` (catalogue
  // qui a bougé) est silencieusement omise plutôt que de planter le rendu.
  const pinnedRoutes = useMemo(() => {
    const byId = new Map<string, { route: Route; label: string }>();
    for (const group of groups) {
      for (const route of group.routes) {
        if (!byId.has(route.id)) byId.set(route.id, { route, label: group.label });
      }
    }
    const found: { route: Route; label: string }[] = [];
    for (const id of pinned) {
      const entry = byId.get(id);
      if (entry) found.push(entry);
    }
    return found;
  }, [groups, pinned]);

  const hasFilter = activeGateway !== null || query.trim().length > 0;
  // `filterGroups` recalcule maintenant `pinnedCount` lui-même à partir des
  // routes visibles après filtre passerelle (correction post-revue tâche 3) —
  // ce composant n'en dépend pas pour autant : `visiblePinnedCount` ci-dessus
  // reste calculé localement depuis `group.routes` + `pinnedSet`, ce qui
  // donne le même résultat quelle que soit la version de groupRoutes.ts, sans
  // coupler ce rendu à un détail d'implémentation amont.
  const filtered = useMemo(
    () => (hasFilter ? filterGroups(groups, activeGateway, query, pinned) : []),
    [groups, activeGateway, query, pinned, hasFilter],
  );

  const gatewayOptions: SegmentedOption[] = [
    { value: ALL_GATEWAYS, label: t("settings.opencode-router.gateway-all") },
    ...gateways.map((g) => ({
      value: g.id,
      label: (
        <span className="ocr-gateway-pill-label">
          <span>{g.id}</span>
          <span className="ocr-gateway-count">{g.count}</span>
        </span>
      ),
      ariaLabel: t("settings.opencode-router.gateway-option", { gateway: g.id, count: g.count }),
    })),
  ];

  return (
    <div className="ocr-root">
      <div className="ocr-toolbar">
        <input
          type="search"
          className="ocr-search"
          placeholder={t("settings.opencode-router.search-ph")}
          aria-label={t("settings.opencode-router.search-ph")}
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)}
        />
        <SegmentedControl
          className="ocr-gateways"
          label={t("settings.opencode-router.gateways-label")}
          value={activeGateway ?? ALL_GATEWAYS}
          onChange={(value) => onGatewayChange(value === ALL_GATEWAYS ? null : value)}
          options={gatewayOptions}
        />
      </div>

      {pinnedRoutes.length > 0 && (
        <section className="ocr-pinned" aria-label={t("settings.opencode-router.pinned-title")}>
          <div className="ocr-pinned-head">
            <h3 className="ocr-pinned-title">{t("settings.opencode-router.pinned-title")}</h3>
            <p className="ocr-pinned-hint">{t("settings.opencode-router.pinned-hint")}</p>
          </div>
          <ul className="ocr-pinned-list">
            {pinnedRoutes.map(({ route, label }) => (
              <li key={route.id} className="ocr-pinned-item">
                <span className="ocr-pinned-model">{label}</span>
                <span className="ocr-pinned-gateway">{route.gateway}</span>
                <span className="ocr-pinned-id" title={route.id}>{route.id}</span>
                <RowButton
                  className="ocr-pin-btn"
                  aria-pressed={true}
                  aria-label={t("settings.opencode-router.route-unpin", { id: route.id })}
                  onClick={() => onTogglePin(route)}
                >
                  <PinIcon />
                </RowButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ocr-catalog">
        {!hasFilter ? (
          <EmptyState
            title={pluralCount("settings.opencode-router.unfiltered-title", groups.length, { gateways: gateways.length })}
            description={t("settings.opencode-router.unfiltered-desc")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t("settings.opencode-router.no-match-title")}
            description={t("settings.opencode-router.no-match-desc")}
          />
        ) : (
          <ul className="ocr-groups">
            {filtered.map((group) => (
              <GroupRow
                key={group.key}
                group={group}
                open={isOpen(group)}
                onToggleOpen={() => toggleOpen(group)}
                pinnedSet={pinnedSet}
                onTogglePin={onTogglePin}
                visiblePinnedCount={visiblePinnedCount(group)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GroupRow(props: {
  group: ModelGroup;
  open: boolean;
  onToggleOpen: () => void;
  pinnedSet: ReadonlySet<string>;
  onTogglePin: (route: Route) => void;
  visiblePinnedCount: number;
}) {
  const { group, open, onToggleOpen, pinnedSet, onTogglePin, visiblePinnedCount } = props;
  const routesId = domId("ocr-routes", group.key);
  const triggerLabel = open
    ? t("settings.opencode-router.group-collapse", { model: group.label })
    : t("settings.opencode-router.group-expand", { model: group.label });

  return (
    <li className="ocr-group">
      <RowButton
        className="ocr-group-trigger"
        aria-expanded={open}
        aria-controls={routesId}
        aria-label={triggerLabel}
        onClick={onToggleOpen}
      >
        <ChevronIcon open={open} />
        <span className="ocr-group-label">{group.label}</span>
        {group.vendor && <span className="ocr-group-vendor">{group.vendor}</span>}
        <span className="ocr-group-meta">
          <span className="ocr-group-count">{pluralCount("settings.opencode-router.group-routes", group.routes.length)}</span>
          {visiblePinnedCount > 0 && (
            <span className="ocr-group-pinned">{pluralCount("settings.opencode-router.group-pinned", visiblePinnedCount)}</span>
          )}
        </span>
      </RowButton>

      {open && (
        <ul id={routesId} className="ocr-routes">
          {group.routes.map((route) => {
            const pinned = pinnedSet.has(route.id);
            return (
              <li key={route.id} className="ocr-route">
                <span className="ocr-route-gateway">{route.gateway}</span>
                <span className="ocr-route-id" title={route.id}>{route.id}</span>
                {route.free && <span className="ocr-route-free">{t("settings.opencode-router.route-free")}</span>}
                <RowButton
                  className="ocr-pin-btn"
                  aria-pressed={pinned}
                  aria-label={t(pinned ? "settings.opencode-router.route-unpin" : "settings.opencode-router.route-pin", { id: route.id })}
                  onClick={() => onTogglePin(route)}
                >
                  <PinIcon />
                </RowButton>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
