# Refonte de la surface des réglages (design)

Date : 2026-08-23. Auteur : session Opus 5 avec Thierry. Statut : proposition, non implémentée.

Maquettes interactives (artefacts) :
- Architecture d'information et rangées : `claude.ai/code/artifact/2abf5610-9007-40cd-b45f-cb4d8c159f0a`
- Cinq directions visuelles : `claude.ai/code/artifact/577e2128-04b1-41b4-9e2c-eb1f4d6c37dc`

## 1. Le problème

Quatre griefs exprimés par Thierry, dans l'ordre où il les a nommés :

1. **la sélection des modèles n'est pas top** ;
2. **trouver un réglage est pénible** ;
3. **le visuel est daté / incohérent** ;
4. **trop de réglages exposés**.

Le code confirme les quatre et en explique la cause commune.

### 1.1 L'identité d'un modèle est éclatée sur quatre sections

`Settings.tsx` (1 295 l.) découpe en 9 sections. Pour un seul modèle :

| Question | Section actuelle | Emplacement |
|---|---|---|
| Le CLI est-il installé ? version, chemin, login | `setup` | Settings.tsx:595 |
| Visible dans le picker ? ordre ? favoris ? | `providers` | Settings.tsx:1006 |
| Quel effort par défaut ? slug custom ? | `modeles` | Settings.tsx:790 |
| Quel modèle au lancement d'un fil ? | `general` | `defaultProvider` / `defaultModel` |

Aucun écran ne répond à « quels modèles j'ai, lesquels j'utilise ». La
recherche et l'étoile de favori n'existent que pour **opencode**
(Settings.tsx:1053) — les autres fournisseurs n'ont ni l'une ni l'autre.

### 1.2 opencode est un routeur traité comme un fournisseur plat

`parse_model_catalog` (opencode.rs:40) accepte jusqu'à
`MAX_CATALOG_MODELS = 5_000` identifiants, filtrés sur la seule présence
d'un `/`. Ces identifiants sont **routés** :

```
opencode/glm-5.2              passerelle « opencode »
openrouter/z-ai/glm-5.2       passerelle « openrouter », éditeur « z-ai », MÊME modèle
kimi-for-coding/k3            passerelle « kimi-for-coding »
```

`modelDisplayLabel` (modelCatalog.ts:63-68) **jette le préfixe** et n'affiche
que la feuille. Conséquence directe : deux routes du même modèle s'affichent
comme deux entrées homonymes sans lien, dans une liste plate de plusieurs
milliers de lignes. C'est la cause n°1 du grief « la sélection des modèles
n'est pas top ».

### 1.3 Skills, plugins et MCP n'ont aucune surface

- `PluginPanel.tsx` (43 l.) est un dialogue **en lecture seule**, ouvert
  depuis le chat, pas depuis les réglages.
- Les dossiers de plugins Claude passent par les variables d'environnement
  `ATELIER_CLAUDE_PLUGIN_DIRS` / `ATELIER_CLAUDE_PLUGIN_URLS` (claude.rs:292)
  — non réglables depuis l'app.
- Les serveurs MCP **n'apparaissent nulle part**. `atelier-agent-mcp` est le
  shim que l'app s'injecte à elle-même (plan 057), pas un inventaire.

Or les capacités sont des booléens **par fournisseur**
(atelier-protocol/src/lib.rs:89-103) :

```rust
mcp_elicitation, mcp_tools, atelier_sessions_mcp, mcp_widgets,
plugins, skills, skills_attach
```

Un même skill est donc **natif chez Claude**, **rattaché en texte chez Kimi**
(`skills_attach`) et **absent chez Grok** — information qu'aucune interface
ne donne. On découvre le trou en pleine conversation.

### 1.4 La sauvegarde marche, mais ne se voit pas

Question posée par Thierry : « est-ce que je peux appuyer sur save ? ».
Réponse : il n'y a pas de bouton, et il n'en faut pas — chaque changement
est déjà écrit deux fois.

| Écriture | Quand | Emplacement |
|---|---|---|
| `localStorage` | synchrone, à chaque changement | settings.ts:287 |
| Miroir disque via sidecar | débouncé `MIRROR_WRITE_DEBOUNCE_MS = 200` | App.tsx:683 |
| Lecture au boot | **le disque fait foi** | App.tsx:1500 |

Le manque n'est pas la persistance, c'est **le retour**. L'interface reste
muette, donc l'utilisateur cherche un bouton Save qui n'existe pas.

## 2. Partis pris

1. **Le regroupement suit ce qu'on vient chercher, pas la structure du code.**
   Review, AppSnap et Avancé n'étaient pas des destinations : ce sont des
   blocs à l'intérieur d'une section.
2. **Un modèle est un objet, pas quatre réglages.** Statut, défaut, favori et
   effort vivent sur la même ligne.
3. **On n'ajoute pas de bouton Enregistrer.** Il laisserait croire que
   l'aperçu du thème est provisoire alors qu'il s'applique en direct. On
   ajoute la confirmation qui manque.
4. **Atelier ne réécrit jamais la configuration d'un CLI.** Il la lit, et
   pour installer il **appelle la commande du CLI**. Le CLI reste
   propriétaire de son état.
5. **La forme suit la matière.** Un tableau dense pour des objets
   comparables, un aperçu vivant pour ce qui a un rendu, des rangées sobres
   pour de l'hétérogène. Imposer une forme unique partout serait l'erreur
   inverse de l'uniformité actuelle.
6. **Rien n'est supprimé.** Le type `Settings` compte 40 clés, dont 3 d'état
   interne non exposées (`activeView`, `railMoreOpen`, `thinkingCollapsed`
   héritée) : les 37 réglages réels restent tous. Environ la moitié passe
   sous un repli « Avancé » fermé par défaut. Les comptes de rangées du §3
   sont supérieurs parce qu'une rangée peut porter plusieurs clés (les trois
   couleurs personnalisées) ou n'en porter aucune (les récapitulatifs
   dérivés).
7. **Rust-first** : tout parsing (routes opencode, inventaire des
   extensions) et tout spawn (commandes d'installation) s'écrit en Rust.
   React ne fait que rendre.

## 3. Architecture d'information : cinq sections

Neuf sections deviennent cinq. La cinquième (Extensions) est une entorse
assumée au « quatre sections » de départ : ni Général ni Modèles ne peut
absorber une trentaine d'extensions sans redevenir le fourre-tout qu'on
supprime.

| Section | Absorbe | Contient | ≈ rangées |
|---|---|---|---|
| **Général** | `general` · `avance` | Langue, dossiers autorisés, permissions, ordre des fils, recherche web, format d'heure | 10 |
| **Modèles** | `setup` · `providers` · `modeles` | Fournisseur et modèle de départ, statut, favori, effort par modèle ; routeur opencode et fournisseurs API en repli | 12 |
| **Extensions** | — (n'existe pas aujourd'hui) | Skills, plugins, serveurs MCP ; matrice de compatibilité ; installation | 5 + inventaire |
| **Apparence** | `apparence` | Thème, préréglages, accent, typographie, mise en page du fil, densité | 15 |
| **Atelier** | `atelier` · `review` · `appsnap` | Galerie, extensions suivies, rafraîchissement, revue auto, AppSnap, appareils distants | 10 |

Chaque section porte un repli **« Avancé »** fermé par défaut.

## 4. Primitives et découpage de fichiers

`Settings.tsx` (1 295 l.) et les ~64 règles `.set-*` d'App.css se réduisent à
un jeu de primitives et un fichier par section.

```
src/components/settings/
  SettingsPage.tsx        coquille : nav, recherche, routage de section
  useSettingsSearch.ts    registre + filtrage (pure, testable)
  primitives/
    Section.tsx           titre + fil d'Ariane + pastille « Enregistré »
    Group.tsx             étiquette majuscule + carte
    Row.tsx               titre/desc à gauche, contrôle à droite
    Advanced.tsx          repli fermé par défaut
  sections/
    General.tsx  Models.tsx  Extensions.tsx  Appearance.tsx  Atelier.tsx
  models/
    ModelsGrid.tsx        tableau dense (direction Console)
    OpenCodeRouter.tsx    catalogue par passerelle (direction Routeur)
  extensions/
    ExtensionsInventory.tsx   trois familles, une grammaire de ligne
    InstallDialog.tsx         construction et exécution de la commande
```

Contraintes de style déjà verrouillées à respecter (CLAUDE.md,
`src/components/ui/css-contract.test.ts`) : aucun `<button>` nu hors
`ui/` et `shadcn/` — `Button`, `IconButton`, `RowButton` uniquement ;
tailles 10/11/12/13/15 ; poids 400/500/600 ; rayons 6/10/999 ;
espacements multiples de 4 ; transitions 120–150 ms ;
`font-variant-numeric: tabular-nums` sur tout chiffre aligné ;
aucune couleur en dur.

## 5. Recherche globale

Un champ en tête du panneau filtre **les cinq sections d'un coup** et
étiquette chaque résultat avec sa section d'origine. C'est la réponse
directe au grief « trouver un réglage est pénible ».

- Chaque `Row` déclare des mots-clés (`keywords`) en plus de son titre et de
  sa description ; la recherche interroge les trois.
- Le filtrage vit dans `useSettingsSearch.ts`, **fonction pure testable**,
  sans dépendance React — même discipline que `turnViewModel.ts`.
- Un résultat cliqué ouvre sa section et met sa rangée en évidence (surbrillance
  temporaire de 1,5 s, `prefers-reduced-motion` respecté).
- Les rangées sous un repli « Avancé » sont **incluses** dans la recherche :
  replier ne doit jamais rendre introuvable.

Hors périmètre de ce lot : exposer le registre à ⌘K (voir §12).

## 6. Section Modèles

### 6.1 Les défauts se règlent là où on voit les modèles

Trois réglages aujourd'hui dans `general` remontent en tête de Modèles :

- **Fournisseur de départ** — contrôle segmenté (`defaultProvider`).
- **Modèle par défaut** — un marqueur radio par ligne, **un seul par
  fournisseur** (`defaultModel[provider]`).
- **Rangée récapitulative « Conversation neuve »** — ce que donnera
  concrètement un nouveau fil : fournisseur, modèle, effort, mode de
  permissions. Lecture seule, dérivée.

### 6.2 Le tableau dense (direction Console)

Les modèles cessent d'être des rangées de formulaire et deviennent des
données. Colonnes : **défaut · modèle · fournisseur · identifiant ·
contexte · effort · état · favori**.

- En-tête collant, survol de ligne, ligne sélectionnée marquée par un filet
  d'accent à gauche (`inset 2px 0 0 var(--accent)`).
- Chips de filtre : Tous, Favoris, un par fournisseur, Indisponibles — avec
  leur compte.
- Champ de filtre textuel.
- Barre d'état basse : raccourcis (`↑↓` naviguer, `D` défaut, `F` favori) et
  compteur « N modèles · N favoris ».
- Les fournisseurs absents ou non connectés forment un groupe
  « Non disponibles » portant l'action qui débloque (Installer / Se
  connecter). La section `setup` disparaît ainsi comme destination : son
  information devient la pastille d'état et le bouton de la ligne.
- Les favoris et la recherche, aujourd'hui réservés à opencode, deviennent
  le mécanisme commun à **tous** les fournisseurs, API compris.

**Repli sous 700 px** : le tableau redevient une liste de cartes. Un tableau
à huit colonnes est illisible en fenêtre étroite — la nav compacte existante
(`.settings-page.narrow`, App.css:2572) donne le seuil et le précédent.

### 6.3 En repli « Avancé »

Fournisseurs API (CRUD existant), modèles personnalisés (slugs), ordre du
sélecteur.

## 7. Le routeur opencode

### 7.1 Contrat Rust

`parse_model_catalog` (opencode.rs:40) retourne aujourd'hui des `Vec<String>`
bruts. Il retournera des lignes structurées :

```rust
pub struct RoutedModel {
    pub id: String,        // identifiant exact, tel qu'envoyé au CLI
    pub gateway: String,   // premier segment : opencode, openrouter, anthropic…
    pub vendor: Option<String>, // segment intermédiaire s'il existe : z-ai, moonshotai…
    pub leaf: String,      // nom du modèle
    pub free: bool,        // suffixe `:free` ou `-free`
}
```

Le découpage quitte la regex de `modelDisplayLabel` pour devenir **testable
en Rust**. `modelDisplayLabel` conserve son rôle d'habillage du `leaf` ;
il ne fait plus office de parseur.

### 7.2 Surface

1. **Regrouper par modèle, pas par route.** Une entrée « GLM 5.2 · 2 routes »
   qui se déplie, au lieu de deux lignes homonymes. C'est ce regroupement,
   plus que n'importe quel filtre, qui rend le catalogue lisible.
2. **Épingler plutôt que parcourir.** Les épinglés sont l'objet réel de la
   page : c'est eux, et **eux seuls**, que le sélecteur du chat affiche. Le
   catalogue n'est qu'un outil pour alimenter cette liste.
3. **On épingle une route précise, pas un modèle** — le prix et la latence
   en dépendent.
4. **Ne rien afficher tant qu'on n'a pas filtré.** Tant qu'aucune passerelle
   ni recherche n'est choisie, la zone reste vide avec son compte. Afficher
   mille rangées au hasard serait pire que rien.

### 7.3 Effet sur le stockage

`favoriteModels: Record<string, string[]>` (settings.ts:56) reste
**compatible sans migration** : les identifiants routés *sont* les
identifiants. Aucune donnée nouvelle n'est nécessaire tant qu'on n'ajoute pas
de métadonnée par route (latence mesurée, prix) — ce qui est hors périmètre.

## 8. Section Extensions

### 8.1 Inventaire

Trois familles — **Skills**, **Plugins**, **Serveurs MCP** — sous une
**grammaire de ligne unique** : nom, provenance en chemin réel, matrice de
compatibilité, contrôle. Elles diffèrent par leur contenu, pas par leur
forme ; une primitive suffit là où trois écrans seraient tentants.

### 8.2 La matrice de compatibilité

Trois états, par fournisseur, dérivés des booléens du registre
(lib.rs:89-103) :

| Symbole | Sens | Source |
|---|---|---|
| ● plein | natif | `skills` / `plugins` / `mcp_tools` = true |
| ○ cerclé accent | rattaché par Atelier | `skills_attach` = true |
| ○ cerclé gris | non supporté | tous false |

C'est l'apport réel de la section : cette information n'existe nulle part
aujourd'hui, ni dans Atelier ni dans les CLI.

### 8.3 Lecture seule par défaut, deux exceptions

Les serveurs MCP vivent dans `~/.claude.json` ou le `config.toml` de Codex.
Atelier les lit et propose « Ouvrir le fichier ». Écrire dedans, c'est se
battre contre le CLI qui les possède — et perdre à sa prochaine mise à jour.

Deux lignes seulement sont pleinement réglables, marquées **« Réglé par
Atelier »** :

1. **Dossiers de plugins** — aujourd'hui `ATELIER_CLAUDE_PLUGIN_DIRS`
   (claude.rs:292), qui devient un vrai réglage persisté ;
2. **`atelier-sessions`** — le shim que l'app injecte elle-même (plan 057),
   donc légitimement sous son contrôle.

### 8.4 Installer

La règle du §2.4 n'interdit pas d'installer : elle impose la porte d'entrée.
Les CLI publient leurs commandes.

| Famille | Commande appelée |
|---|---|
| Serveur MCP | `claude mcp add [--transport http] <nom> <url\|-- cmd>` |
| Plugin | `claude plugin install <nom>[@<marketplace>]` |
| Skill | `claude plugin init <nom>` → scaffold `~/.claude/skills/<nom>` |

Quatre exigences du dialogue :

1. **La commande littérale est affichée avant exécution**, et se réécrit en
   direct pendant la saisie. Point de sécurité, pas coquetterie : installer un
   serveur MCP fait tourner du code tiers avec les clés et l'accès disque de
   l'utilisateur. Elle est copiable.
2. **« Installer pour qui » est une question explicite.** `claude mcp add`
   n'ajoute rien à Codex ; chaque CLI a sa commande et son fichier. Les
   fournisseurs qui ne supportent pas la famille sont grisés, selon la même
   matrice qu'au §8.2. N destinataires = N commandes lancées à la suite, et
   la note du dialogue le dit.
3. **`stdout` / `stderr` défilent dans le dialogue** — pas de roue qui
   tourne. Quand ça échoue (réseau, jeton, version), on voit pourquoi et on
   rejoue la commande au terminal.
4. **Le spawn se fait depuis Rust**, jamais depuis le webview.

Note : `claude plugin init` scaffolde directement dans `~/.claude/skills/`.
« Créer un skill » est donc le même chemin que « en installer un », pas une
fonctionnalité séparée.

## 9. Section Apparence

Quatre groupes, avec les contrôles réels (plus de replis opaques du type
« 3 réglages ») :

1. **Thème** — mode segmenté clair/sombre/système, préréglages en pastilles
   bicolores, accent personnalisé avec son hexadécimal.
2. **Typographie** — police d'interface, police de code, taille de
   l'interface, lissage.
3. **Le fil** — vue par défaut (4 états), taille du texte, largeur de
   colonne, interligne, densité des rangées.
4. **Avancé** — fondu du streaming, horodatages.

### 9.1 L'aperçu vivant (direction Cockpit)

Une troisième colonne montre un **extrait réel de conversation** qui adopte
immédiatement taille, largeur, interligne et densité. Les réglages
typographiques sont les seuls dont on ne peut pas juger sans voir.

- **Apparence uniquement.** Aucune autre section n'a de rendu à montrer ;
  y coller un aperçu vide serait pire que pas d'aperçu.
- **Sous 1 100 px, la colonne disparaît** au profit d'un spécimen inline
  au-dessus des contrôles. La fenêtre large ne doit pas devenir obligatoire.
- L'aperçu consomme les mêmes variables CSS que le vrai fil (`--chat-fs`,
  `--chat-w`, `--chat-lh`, App.tsx:638-640) : il ne peut donc pas dériver du
  rendu réel.

## 10. Persistance et confirmation

**Aucun bouton Enregistrer.** On conserve l'écriture double existante (§1.4)
et on ajoute le retour manquant :

- Une pastille discrète **« Enregistré »** avec coche, `role="status"`
  `aria-live="polite"`, dans l'en-tête de section.
- Apparition en 140 ms, disparition après 1,6 s ; `prefers-reduced-motion`
  respecté.
- Elle confirme l'écriture `localStorage`, immédiate. Si le miroir disque
  échoue (sidecar absent), la pastille passe en avertissement — un silence
  serait un mensonge.

## 11. Tests

| Objet | Test | Emplacement |
|---|---|---|
| 5 sections, `aria-current` sur l'active | adapter l'existant (`rend les 9 sections`) | Settings.test.tsx:53 |
| Recherche : traverse les 5 sections, étiquette la provenance, inclut l'« Avancé » replié | nouveau | `useSettingsSearch.test.ts` (pur) |
| Défaut : un seul par fournisseur | nouveau | `ModelsGrid.test.tsx` |
| Découpage de route opencode (`openrouter/z-ai/glm-5.2`, `:free`, segment unique) | nouveau, **Rust** | `opencode.rs` (à côté de `parse_model_catalog`) |
| Regroupement par modèle : deux routes → une entrée | nouveau | `OpenCodeRouter.test.tsx` |
| Matrice : `skills_attach` rend « rattaché », pas « natif » | nouveau | `ExtensionsInventory.test.tsx` |
| Installer : la commande affichée est exactement celle spawnée ; 2 destinataires = 2 commandes | nouveau | `InstallDialog.test.tsx` |
| Aucun `<button>` nu, tailles/rayons dans le système | existant, à ne pas casser | `ui/css-contract.test.ts` |
| Restaurer les défauts reste confirmé | existant | Settings.test.tsx:104 |
| Échap ferme, jamais pendant une saisie | existant | Settings.test.tsx:79 |
| Miroir disque inchangé | existant | App.settingsMirror.test.tsx |

Tests d'environnement : `env::set_var` est une course en Rust (leçon
2026-08-16) — injecter la configuration sur la struct, jamais muter l'env.

## 12. Hors périmètre (explicitement)

- **Exposer le registre de réglages à ⌘K.** C'est le vrai remède de fond à
  la findabilité, mais ça demande un registre déclaratif complet ; à faire
  après, une fois la recherche interne éprouvée.
- **Métadonnées par route opencode** (latence mesurée, prix). Les valeurs
  des maquettes sont illustratives ; rien dans le catalogue ne les fournit
  aujourd'hui.
- **Écrire dans la configuration des CLI** (§2.4).
- **Retirer l'ordre manuel des fournisseurs.** Si les favoris pilotent le
  sélecteur du chat, `providerOrder` devient probablement inutile — décision
  reportée après mesure d'usage, pas prise ici.
- **Toucher au sélecteur de modèles du chat.** La section Modèles change ce
  qu'il *affiche* (les favoris/épinglés), pas sa forme.

## 13. Hypothèses retenues faute de décision

Quatre questions posées pendant la conception sont restées sans réponse.
Décisions prises pour ne pas bloquer, **à valider à la revue** :

1. **Le repli « Avancé » est par section**, pas une bascule globale
   « Tout afficher » en tête de page. Motif : un repli local garde le
   contexte ; une bascule globale rouvre les cinq sections d'un coup et
   annule le bénéfice.
2. **Les favoris pilotent le sélecteur du chat**, et `providerOrder` est
   conservé tel quel pour l'instant (§12).
3. **Un fichier par section** (§4). Le découpage n'était pas dans les
   griefs, mais 1 295 lignes rendent le reste risqué à implémenter.
4. **Cinq sections, pas quatre** (§3) — Extensions ne peut être absorbée.

## 14. Découpage en lots

Chaque lot est livrable et testable seul.

| Lot | Contenu | Dépend de |
|---|---|---|
| **1 — Coquille** | Primitives, 5 sections, un fichier par section, migration des rangées existantes, pastille « Enregistré » | — |
| **2 — Recherche** | Registre de mots-clés, `useSettingsSearch`, étiquettes de provenance, surbrillance | 1 |
| **3 — Modèles** | Tableau dense, défauts sur place, favoris généralisés, repli en cartes | 1 |
| **4 — Routeur** | `RoutedModel` en Rust, regroupement par modèle, épinglage par route | 3 |
| **5 — Extensions** | Inventaire trois familles, matrice de compatibilité, « Ouvrir le fichier » | 1 |
| **6 — Installer** | Dialogue, construction de commande, spawn Rust, sortie streamée | 5 |
| **7 — Cockpit** | Aperçu vivant d'Apparence, repli sous 1 100 px | 1 |

Ordre recommandé : 1 → 3 → 2 → 4 → 5 → 6 → 7. Le lot 3 avant le 2 parce que
la sélection de modèles est le grief n°1 ; la recherche gagne à être écrite
quand les rangées ont leur forme définitive.
