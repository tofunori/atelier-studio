# ATELIER_VISUAL_QA — matrice de contrôle

Version 1.0 — 2026-07-09 — plan 014. Sévérités : **S1** bloquant (donnée
illisible/perdue, action impossible), **S2** majeur (hiérarchie cassée,
contraste sous seuil), **S3** mineur (esthétique). Mécanismes : **RTL**
(vitest + Testing Library), **PW** (Playwright, plan 021), **APP** (inspection
app buildée selon AGENTS.md), **BASE** (comparaison à la capture de référence).

Colonnes par ligne de test : Attendu · Interaction testée · Référence ·
Sévérité si régression · Mécanisme.

## Surface : shell (TopBar + rail + panneaux)

| Cas | Attendu | Interaction | Référence | Sév. | Méc. |
|---|---|---|---|---|---|
| dark 1512×883 | TopBar 32, rail 48, séparateurs 1 px, zéro ombre sur dockés | — | `baseline/1512x883-dark-split-sans-thread.png` | S2 | BASE+APP |
| light 1512×883 | mêmes paliers, bordures `--border` visibles | bascule thème | — (à capturer plan 016) | S2 | APP |
| 1280×800 | aucun repli, command center ≥ 280 | resize | `baseline/1280x800-light-settings.png` | S3 | APP |
| 800×600 | rail + TopBar intacts, layout force chat OU atelier | resize + ⌘1/⌘2 | `baseline/800x600-dark-split.png` | S1 | PW |
| clavier | ⌘K palette, ⌘0/1/2 layouts, tab rail→panneau→surface | parcours complet | — | S1 | PW |
| zoom 125 % | pas d'overflow caché, chips repliées dans ⋯ | zoom WebKit | — | S2 | APP |
| reduced motion | plus aucun translate/scale/boucle ; états statiques conservés (contrat § 9) | préf. système | — | S2 | RTL |
| texte long | nom de projet tronqué milieu dans TopBar | projet au nom long | — | S3 | RTL |
| zéro donnée | aucun projet : rail réduit + invite d'ouverture | premier lancement | — | S2 | APP |
| erreur | bannière sidecar : accent, texte, disparition à la reconnexion | kill sidecar | `baseline/1512x883-dark-sidecar-indisponible.png` | S1 | APP |
| running | — (le shell ne montre pas de running global) | — | — | — | — |

## Surface : Research Home (après plan 017)

| Cas | Attendu | Interaction | Référence | Sév. | Méc. |
|---|---|---|---|---|---|
| dark/light 1512×883 | 1 action accent (Reprendre), sections dans l'ordre A | — | wireframe A | S2 | BASE |
| 800×600 | colonnes empilées, DÉMARRER dans ⋯ | resize | wireframe A | S2 | PW |
| clavier | Reprendre premier focus ; liens À TRAITER atteignables | tab | — | S1 | PW |
| zéro donnée | projet neuf : invite simple, pas de squelette | nouveau projet | — | S2 | RTL |
| texte long | question de recherche sur 1 ligne, tronquée fin | — | — | S3 | RTL |
| running | thread en cours listé dans CONTINUER avec badge accent | tour actif | — | S2 | APP |
| erreur | tour en erreur listé dans À TRAITER avec `--u-hot` | tour raté | — | S2 | RTL |

## Surface : thread / chat

| Cas | Attendu | Interaction | Référence | Sév. | Méc. |
|---|---|---|---|---|---|
| dark 1512×883 | colonne 640–720, activité repliable, capsule fin de tour | scroll complet | `baseline/1512x883-dark-split-thread-actif.png` | S2 | BASE |
| composer | ContextShelf au-dessus ; saisie dominante ; barre compacte (+ ctx, provider·modèle) ; Envoyer/Stop = seule action accent ; effort/permissions en popovers | ouvrir popovers, envoyer, stopper | wireframe B | S2 | RTL+PW |
| light | contraste bulles/citations ≥ 4.5:1 | bascule thème | — | S2 | APP |
| 800×600 | chat seul (⌘1), composer intact | resize | — | S1 | PW |
| clavier | composer focus par défaut, Échap ferme menus | parcours | — | S1 | PW |
| zoom 125 % | markdown sans overflow horizontal | zoom | — | S2 | APP |
| texte long | collage > 12 lignes replié en capsule avec « Afficher » | coller fiche Zotero | `baseline/1512x883-dark-split-thread-zotero.png` (contre-exemple) | S2 | RTL |
| zéro donnée | nouveau thread : composer + suggestion contexte | nouveau chat | — | S3 | RTL |
| running | ligne d'activité accent + durée ; streaming sans saut de scroll | tour réel | — | S1 | APP |
| erreur | capsule `--u-hot` avec cause + Réessayer ; jamais silencieux | tour raté | — | S1 | RTL |

## Surface : galerie + inspecteur (après plan 019)

| Cas | Attendu | Interaction | Référence | Sév. | Méc. |
|---|---|---|---|---|---|
| dark 1512×883 | recherche + Formats/Statut/Tri + sélecteur de vue (Grille·Board·Notes) + ⋯ ; filtres actifs seuls ; grille déterministe | filtres, bascule de vue | `baseline/1512x883-dark-galerie-formats.png` (avant) | S2 | BASE |
| light | vignettes sur fond clair : bordure carte visible | bascule | — | S2 | APP |
| 800×600 | inspecteur overlay ; toolbar recherche + ⋯ (Grille/Board/Notes rejoignent ⋯ à cette taille seulement) | resize | — | S2 | PW |
| clavier | flèches dans la grille, Échap ferme l'inspecteur | parcours | — | S1 | PW |
| texte long | noms tronqués milieu, jamais 2 lignes | fichiers longs | — | S3 | RTL |
| zéro donnée | « Aucune figure » + Relancer le scan | projet vide | — | S2 | E2E galerie |
| filtre vide | « Rien pour ces filtres » + Effacer | filtre absurde | — | S2 | E2E galerie |
| running | rescan : squelettes « Starting atelier… » conservés | rescan | — | S3 | E2E galerie |
| erreur | serveur galerie mort : message + relance auto (sonde 15 s) | kill serveur | — | S1 | APP |
| statut workflow | badge discret sur carte + filtre Statut cohérents | set candidate | E2E `core.spec.js` | S2 | E2E galerie |

## Surface : Settings

| Cas | Attendu | Interaction | Référence | Sév. | Méc. |
|---|---|---|---|---|---|
| light 1280×800 | modèle nav/contenu, groupes calmes | — | `baseline/1280x800-light-settings.png` | S3 | BASE |
| dark | parité stricte avec light | bascule | — | S3 | APP |
| 800×600 | nav en select compact | resize | — | S3 | APP |
| clavier | tous les contrôles atteignables, Restore confirme | parcours | — | S2 | PW |
| texte long | clés/chemins API en `--code-font`, scroll horizontal local | longue clé | — | S3 | RTL |
| erreur | clé manquante = warning ciblé sur le champ | vider une clé | — | S2 | RTL |

## Transverse

| Cas | Attendu | Sév. | Méc. |
|---|---|---|---|
| Budget accent | ≤ 1 action accent visible par panneau focalisé | S2 | revue + BASE |
| Hover rapide | balayer une liste/grille à la souris : aucun retard perceptible ni accumulation d'états hover (120 ms, propriété unique) | S2 | APP + PW |
| focus-within | conteneurs (composer, inspecteur, cartes) signalent le focus clavier interne sans layout shift ; anneau visible sur le contrôle réel | S2 | RTL |
| Layout shift | aucune transition/entrée d'élément ne déplace le contenu voisin (motion = opacity/transform uniquement) | S1 | PW + revue CSS |
| Une boucle par surface | maximum une animation continue (spinner/pulse) par surface, même avec plusieurs statuts actifs | S2 | RTL + APP |
| Reduced motion | `prefers-reduced-motion` : plus aucun translate/scale/boucle ; états statiques (fond, contour, couleur, opacité finale) conservés | S1 | RTL |
| Tokens | zéro hex en dur hors sémantique documentée App.css | S2 | `rg` en CI (plan 016) |
| Tailles | zéro font-size hors 10/11/12/13/15 + tokens display 18/20 (décision B — Research Home et vrais titres de page UNIQUEMENT, jamais TopBar/panneaux/cartes) | S2 | `rg` en CI (plan 016) |
| `transition: all` | zéro occurrence | S2 | `rg` en CI (plan 016) |
| Motion Quiet Instrument | timings 120/140/150 ms + `--ease-out` conformes au contrat § 9 du DESIGN ; aucun bounce/blur/parallaxe | S2 | `rg` tokens + audit plans 016/023 |
| aria-live | bannières et fins de tour annoncées | S2 | RTL |
