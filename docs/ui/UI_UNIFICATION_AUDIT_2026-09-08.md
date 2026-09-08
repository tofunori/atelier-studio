# Uniformisation des composants Atelier

Date : 8 septembre 2026. Audit réalisé par trois sous-agents GPT-5.6 Luna, raisonnement maximal, puis consolidé par l'agent principal.

## Objectif demandé

Tous les contrôles de l'app doivent appartenir au même système : shadcn/Base UI comme socle, composants produit Atelier comme API publique et tokens communs pour l'apparence. Une correction du composant doit se propager à tous ses consommateurs. Garder le style compact, l'accent orange et les fonctions existantes.

## Portée et niveau de preuve

Lecture des sources desktop React/Tauri, du chrome galerie et des règles/tests du dépôt. Aucun changement de code applicatif, build ou test visuel n'a été effectué pendant cet audit. Les défauts de comportement cités sont des constats source à reproduire lors de la migration. Les moteurs PDF, LaTeX, CodeMirror et terminal demandent des adaptateurs, pas une réécriture. Le mobile n'a pas été audité dans cette passe.

Le CLI `npx shadcn@latest info --json` confirme `base-nova`, Base UI et les sources desktop résolues dans `src/components/shadcn`. Son résultat est conservé temporairement dans `/tmp/atelier-ui-audit-info.json`. Aucune nouvelle bibliothèque n'est nécessaire pour la consolidation proposée.

## Diagnostic

La gouvernance existe déjà : `docs/ui/DESIGN_SYSTEM_GOVERNANCE.md:5` définit les couches et `:48` interdit les surcharges locales comme mode de correction. Le problème est son application incomplète. Installer un composant shadcn ne garantit ni un usage unique ni une apparence identique.

| Famille | Preuve dans les sources | Correction proposée |
|---|---|---|
| Boutons | `src/components/ui/Button.tsx:9` choisit secondaire par défaut; `src/components/shadcn/button.tsx:6` possède un autre défaut et une autre API. Des imports directs restent autorisés dans `src/components/ui/css-contract.test.ts:257`. | Une API produit et des variants sémantiques communs; migrer puis réduire l'allowlist. |
| Sélecteurs | `src/components/Select.tsx:13`, usages directs dans `ProjectFoldersDialog.tsx:22`, select natif dans `NarvalSurface.tsx:668`, skin `.custom-select` dans `App.css:696`. | Étendre le wrapper existant (disabled, placeholder, groupes, ouverture), puis migrer les consommateurs et supprimer les skins redondantes. |
| Infobulles | `ui/Tooltip.tsx:13`, `shadcn/tooltip.tsx:28` et `styles/primitives.css:62` répartissent comportement et présentation. | Une façade, un délai et un skin; laisser la primitive gérer les interactions. Vérifier les contraintes Tauri avant de retirer un contournement. |
| Statuts | `ui/StatusBadge.tsx:1` définit les états sémantiques; des statuts utilisent directement le Badge générique dans Automations, RemoteDevicesPanel et GitCommitsView. | Statuts via StatusBadge; conserver une variante distincte pour les étiquettes ordinaires. |
| Groupes et onglets | `ui/SegmentedControl.tsx:19` ajoute `.on` et du clavier au ToggleGroup. `ui/Tabs.tsx:18` utilise un callback vide et des labels comme valeurs. | Un propriétaire de l'état et de la navigation; identifiants stables, `value/onValueChange` contrôlés, variants communs. |
| Menus de connaissances | `chat/KbPicker.tsx:425` possède un menu inline personnalisé; `chat/KbSurface.tsx:632` utilise déjà LazyDropdownMenu. | Même menu de collections, avec cases et sous-menus accessibles; conserver sélection par lot et actions métier. |
| Contexte du composeur | `chat/ComposerControls.tsx:276` et `:395` utilisent un span, des listeners globaux et `.ctx-pop`; modèle/effort utilisent déjà Popover. | Migrer l'anneau vers le Popover commun et supprimer la mécanique manuelle. |
| Sidebar/projet | `sidebar/ProjectStyleMenu.tsx:46` utilise une ancre par coordonnées; `Sidebar.tsx:584` contient une reprise de sessions à coordonnées fixes et des div cliquables. | Ancre appropriée et contrôles interactifs accessibles. Une ancre virtuelle peut rester légitime pour un vrai menu contextuel, mais doit être encadrée par l'API. |
| Git et TopBar | `git/GitToolbar.tsx:87` annonce un menu mais rend un panneau personnalisé; `TopBarSurfaces.tsx:236` contient des actions secondaires en spans `tabIndex=-1`. | Choisir une sémantique menu ou panneau cohérente. Prévoir les actions secondaires sans imbriquer de boutons dans les items. |
| Thème galerie | `App.tsx:368` ne transmet qu'une partie des rôles; `gallery/assets/atelier_theme.js:48` dépend de fallbacks. Plusieurs racines déclarent leurs palettes. | Contrat de thème unique et adaptateur explicite pour le mode embarqué et standalone. |
| Cascade CSS | `gallery/react-ui/styles.css:159` redéfinit les gaps; `gallery/assets/latex_studio.css:179` réintroduit des couleurs fixes. `App.css:342`, `:1552`, `:4236` référencent des variables sans déclaration trouvée dans le périmètre. | Nettoyer par composant, supprimer la règle remplacée, contrôler les tokens non résolus et les styles calculés. |

Les fichiers de composants ci-dessus sont sous `src/components/`, sauf indication contraire. Les numéros de ligne décrivent le checkout audité et pourront évoluer.

## Architecture cible

1. **Tokens communs** : rôles de couleur, typo, densité, espacements, icônes, rayons, élévation et mouvement.
2. **Primitives shadcn/Base UI** : mécanique d'interaction, accessibilité et variants visuels canoniques.
3. **API produit `src/components/ui`** : Button, IconButton, Select, Tooltip, menus, Popover, Dialog, Tabs et statuts. Les écrans choisissent des variants, sans repeindre les primitives.
4. **Compositions métier** : contenu et logique de Git, connaissances, modèles, projets; même enveloppe de contrôles.
5. **Adaptateurs galerie/moteurs** : même contrat de thème pour le chrome; rendu scientifique et contraintes d'édition préservés.

Ne pas créer un nouveau `ProductMenu` parallèle : `LazyDropdownMenu` charge déjà `DropdownMenuSurface`. Ce sont une couche de chargement et son rendu, pas deux bibliothèques. Harmoniser leurs capacités (checked, footer, keepOpen, groupes et sous-menus) et conserver un seul rendu canonique. Le chemin du registre shadcn peut rester interne; changer son alias n'est pas en soi une solution.

Uniforme ne signifie pas identique pour tous les usages. Les variants compact/standard, action destructive, état désactivé, menu contextuel et panneau riche doivent être explicites. RowButton, les compositions Field/InputGroup/Command et les contrôles OS justifiés peuvent rester, avec un contrat documenté.

## Migration proposée

| Lot | Résultat attendu | Critère de sortie |
|---|---|---|
| 1. Référence commune | Compléter le banc existant avec boutons, menus ouverts, sous-menus, select, tooltip, dialog, onglets et panneau modèle orange compact. Définir la liste des variants. | Même composant comparé sombre/clair, clavier/souris, largeur étroite et zoom. |
| 2. API et état | Harmoniser Button, Select, Tooltip, StatusBadge, Tabs et SegmentedControl. Réunir les capacités des menus existants. | Tests de comportement; aucune double gestion de sélection, de focus ou de clavier. |
| 3. Consommateurs desktop | Migrer par famille complète : menus simples, KB/sidebar/projet, Git, composeur et actions riches TopBar. | Fonctions et raccourcis conservés; supprimer les anciennes règles dans chaque lot. |
| 4. Chrome galerie | Propager le contrat de thème, aligner contrôles et supprimer les surcharges redondantes. | Galerie embarquée et standalone, thèmes clair/sombre, PDF/LaTeX intacts. |
| 5. Prévention | Réduire les exceptions d'import, contrôler les variables CSS non résolues, interdire les nouvelles skins locales et compléter les captures CI. | Une nouvelle surface ne peut pas créer silencieusement un autre style de menu. |

Cette séquence décrit la migration à réaliser; elle ne signifie pas que ces lots sont déjà implémentés. La règle de suppression de coexistence s'applique à la famille migrée dans chaque lot.

## Vérification et limites

La CI exécute déjà `npm run test:visual` (`.github/workflows/ci.yml:70`). `tests/visual/golden.spec.ts` couvre des écrans et `select-density.spec.ts` vérifie un sélecteur au clavier. Le banc `ui/UiBench.tsx:157` existe, mais son exemple d'effort ne représente pas le panneau produit actuel. Étendre ces outils, sans installer obligatoirement Storybook.

Les contrats source ne prouvent pas la cohérence visuelle : par exemple, `css-contract.test.ts:132` accepte un rayon dès qu'il contient `var(...)`, sans vérifier ici que la variable se résout ni que deux menus obtiennent la même géométrie. Ajouter une couverture des styles calculés et des menus effectivement ouverts.

Chaque lot applicatif devra suivre `docs/agent-reference/atelier-runtime.md` : contrôles adaptés, build du bon bundle, relance vérifiée, backend sain et validation interactive. Vérifier flèches, Tab, Échap, retour focus, sous-menus, cases, états désactivés/destructifs et absence de débordement. Ne pas mettre à jour les captures de référence automatiquement pour faire passer les tests.
