# Spécialistes — profils d'agent réutilisables

Design approuvé par Thierry le 2026-08-13. Inspiré des « specialists » de
Claude Science (app Operon), dont le modèle a été relevé directement dans son
schéma SQLite local (`~/Documents/Claude Science/operon-cli.db`).

## Objectif

Un **spécialiste** est un profil nommé et réutilisable qui donne à une
conversation une identité et un chargement d'outils restreints. Deux usages
retenus, et deux seulement :

1. **Personas de travail réutilisables** — `REDACTEUR_MEMOIRE`,
   `RELECTEUR_METHODO`, `FIGURES_NATURE`. La valeur est dans le prompt
   système.
2. **Réduction du bruit de contexte** — un spécialiste ne voit que les skills
   et connecteurs qui le concernent : moins de tokens, moins de skills
   déclenchés à tort.

Ce n'est **pas** un bac à sable : la restriction est un filtre de contexte, pas
une garantie de sécurité. Ce n'est pas non plus un mécanisme de délégation —
les fils enfants du plan 057 restent le chemin pour ça.

## Décisions de cadrage

| Question | Décision |
| --- | --- |
| Portée | Globale — un catalogue unique pour toute l'app, comme Claude Science |
| Création / édition | Par l'agent, via MCP ; aucun formulaire à dessiner |
| Bascule en cours de conversation | Re-dress du fil courant, transcript et session provider hérités |
| Providers v1 | claude, grok, codex |
| Contenu du profil | Identité + chargement seulement — jamais modèle, effort, provider ni mode de permission |
| Persistance | Le dernier spécialiste choisi devient le défaut des nouvelles conversations |
| Indicateur d'état | Glyphe du spécialiste sur le bouton de menu + pastille accent |

## Ce qui est repris de Claude Science

Relevé dans le schéma de `operon-cli.db` :

- **`user_agents`** porte `name`, `display_name`, `description`,
  `system_prompt`, `icon_key`, `color_key`, `skill_names`, `unrestricted`, et
  surtout `skill_tombstones` / `connector_tombstones`.
- **Les tombstones** résolvent un problème que la liste blanche ne sait pas
  exprimer : « le catalogue vivant complet, moins ces deux-là ». Sans elles, un
  profil illimité perd son caractère illimité dès la première soustraction.
- **`frames.agent_name`** — la conversation porte le nom de l'agent. Le switch
  est un `UPDATE` sur cette ligne, pas un protocole de passation.
- **`frame_system_prompts(frame_id, hash, payload)`** — le prompt résolu est
  matérialisé par conversation avec un hash, pas recomposé à chaque tour.
- **`agent_skill_assignments` / `mcp_agent_assignments`** avec
  `excluded_tools` par affectation — d'où le fait que la liste d'outils exclus
  soit par connecteur et seulement agrégée en lecture sur le profil.

Écarté volontairement : `color_key`. Le système de design d'atelier interdit
de multiplier les couleurs — glyphe monochrome, et l'accent orange réservé au
seul état actif.

## 1. Modèle de données

### `<app_dir>/profiles.json`

Nouveau module `atelier-store/src/profiles.rs`, sur le patron exact de
`threads.rs` : lecture tolérante, `#[serde(flatten)] extra` pour préserver les
champs inconnus, écriture atomique. Le fichier vit à côté de `threads.json`
(`rust/crates/atelier-runtime/src/state.rs:86`).

```jsonc
{
  "name": "REDACTEUR_MEMOIRE",       // UPPER_SNAKE, 2–32, unique
  "displayName": "Rédacteur mémoire",
  "description": "Rédige et révise les sections du mémoire. Ne code pas.",
  "systemPrompt": "Tu es le Rédacteur mémoire…",
  "iconKey": "pen",                  // clé d'un jeu fermé
  "unrestricted": true,              // true = catalogue vivant complet
  "skillNames": [],                  // utilisé seulement si unrestricted=false
  "skillTombstones": [],             // soustractions sur un profil illimité
  "deniedTools": ["Bash", "mcp__gbrain__submit_job"],
  "allowedTools": [],                // vide = pas de liste blanche
  "enabled": true,
  "createdAt": "…", "updatedAt": "…"
}
```

### Pourquoi des outils, et non des connecteurs

Claude Science restreint les **connecteurs** parce qu'il possède son registre
MCP. Atelier n'en a pas : le seul serveur qu'il injecte est le sien
(`atelier-providers/src/claude.rs:285`, `codex.rs:148`, `grok.rs:316`), et les
connecteurs réels de Thierry vivent dans la configuration propre à chaque CLI,
qu'atelier ne lit pas. Un `mcp_allowlist` n'aurait rien à filtrer.

Le niveau **outil** est en revanche disponible et uniforme sur les trois
providers, et les outils MCP y sont adressables par nom
(`mcp__<serveur>__<outil>`) — on retire donc un connecteur entier par motif de
refus, faute de pouvoir choisir de ne pas le lancer. Doter atelier d'un vrai
catalogue de connecteurs reste possible plus tard ; c'est un chantier autonome
(lire et fusionner les configs des trois CLI, gérer l'auth), plus gros que les
spécialistes eux-mêmes, et hors de cette spec.

### Sur le fil

`Thread.profile: Option<String>` — le **nom**, jamais une copie du profil.
Conséquences assumées :

- Renommer un profil met à jour les fils qui le portent : balayage de
  `threads.json` et réécriture atomique dans la foulée du renommage.
- Supprimer un profil laisse les fils avec un nom orphelin. À la résolution,
  un nom orphelin se comporte comme « aucun » et pose une note dans le fil ;
  ce n'est pas une erreur de tour.

`Thread.profileHash: Option<String>` — hash du `ProfileSpec` **résolu** au
dernier tour, prompt système *et* chargement compris. Il ne peut pas se limiter
au prompt : chez Grok, la liste d'outils passe aussi par les arguments de
lancement, donc un simple `detach_skill` doit également réveiller le
sous-processus. Sert uniquement à ça (§3).

### Dans `settings.json`

`defaultProfile: string | null`. Écrit à chaque changement de spécialiste,
**lu uniquement à la création d'un fil**. Ce n'est pas un état partagé : une
fois le fil créé, il possède son propre spécialiste.

## 2. Résolution et application

`SendRequest` gagne trois champs neutres — aucun ne nomme un provider :

```rust
pub system_prompt: Option<String>,
pub skills: Option<Vec<String>>,        // None = catalogue complet
pub allowed_tools: Option<Vec<String>>, // None = aucune liste blanche
pub denied_tools: Option<Vec<String>>,
```

Une fonction unique `resolve_profile(thread, profiles) -> ProfileSpec` les
produit, appelée aux deux sites de construction de `SendRequest`
(`atelier-runtime/src/send.rs:868`, `atelier-runtime/src/ws_router.rs:2679`).
Règle de résolution :

- `unrestricted = true` → `skills = None`, sauf tombstones : alors
  `Some(catalogue − tombstones)`.
- `unrestricted = false` → `Some(skillNames)`.
- Listes d'outils reprises telles quelles ; vides ⇒ `None`.
- Un skill absent du catalogue est ignoré silencieusement à la résolution et
  affiché barré dans les Réglages.

### Traduction par provider

| Provider | Identité | Outils | Skills |
| --- | --- | --- | --- |
| **claude** | `--system-prompt` | `--allowedTools` / `--disallowedTools` | `--disable-slash-commands` si la liste est vide ; **liste blanche fine non disponible en CLI** |
| **grok** | `--system-prompt-override` | `--allow` / `--deny` | — (pas de chargement natif) |
| **codex** | `baseInstructions` sur `threadStart` **et** `threadResume` | non appliqué en v1 | — |

Le champ `skills` sert dans tous les cas à filtrer le picker `/nom` d'atelier
(`src/lib/skills.ts`, `src/lib/providers.ts:71`), y compris là où le provider
n'a pas de chargement natif — c'est la part de réduction de bruit qui marche
partout.

La case creuse côté Claude est assumée et visible : le CLI n'offre que
`--disable-slash-commands` (tout ou rien), alors que le SDK expose
`skills: string[]`. Le profil enregistre quand même la liste — le champ est
neutre — et le provider applique ce qu'il peut. Le sous-menu affiche la note
plutôt que de laisser croire au filtrage. Basculer le chemin Claude sur le SDK
pour récupérer le filtrage fin est un sujet distinct, hors de cette spec.

## 3. La bascule (re-dress)

Changer de spécialiste écrit `Thread.profile` et rien d'autre. Le transcript,
la session provider, le cwd et les fichiers sont inchangés — c'est la même
conversation sous une autre identité, à partir du tour suivant.

- **claude** — rien à faire. Chaque tour relance le CLI ; le nouveau
  `--system-prompt` part avec le `--resume`.
- **codex** — natif : `ThreadResumeParams` accepte `baseInstructions`.
- **grok** — le sous-processus ACP est long
  (`atelier-providers/src/grok.rs:214`) et ses arguments sont figés au
  lancement. Si `hash(systemPrompt) != thread.profileHash` : retirer le
  runtime, le relancer avec les nouveaux `agent_args`, puis `session/load` la
  session existante. La machinerie de retrait existe déjà — elle sert au
  changement de cwd. **Si le hash est inchangé, ne rien faire** : c'est ce qui
  évite de respawner le sous-processus à chaque tour.

## 4. CRUD par l'agent

Le serveur MCP n'expose qu'un outil aujourd'hui
(`atelier-agent-mcp/src/server.rs:59`). On en ajoute un second plutôt que de
surcharger `atelier_sessions`, dont la description porte sur la coordination
de fils liés.

**`atelier_specialists`**, actions :

| Action | Effet | Autorisation |
| --- | --- | --- |
| `list` | Profils + jeu de glyphes disponibles + catalogue des skills | directe |
| `create` | Crée un profil (défaut : `unrestricted`) | directe |
| `update` | Champs ciblés, dont `allowedTools` / `deniedTools` | directe |
| `attach_skill` | Ajoute un skill, sans changer le mode | directe |
| `detach_skill` | Retire — **tombstone** si `unrestricted` | directe |
| `switch` | Pose le profil sur le fil courant | carte d'autorisation |
| `delete` | Supprime le profil | carte d'autorisation |

`create` et `update` **ne demandent jamais** au modèle de choisir une couleur :
`iconKey` se prend dans le jeu fermé renvoyé par `list`, aligné sur les glyphes
déjà présents dans `src/components/icons.tsx`. Aucun sélecteur d'icônes n'est
dessiné ; changer d'icône se fait en le demandant à l'agent.

Un skill d'accompagnement (`specialists`) décrira le flux cadrage → rédaction
du prompt → confirmation → création, sur le modèle du skill `customize` de
Claude Science.

## 5. UI

Aucune nouvelle surface. Trois points d'accroche, tous sur des composants
existants.

**Rangée dans le menu du composer** — `DropdownMenu` existant
(`src/components/chat/ComposerControls.tsx:236`) : `Spécialiste ▸ <nom>`. La
valeur courante se lit sans ouvrir le sous-menu ; c'est ce qui remplace le
rappel permanent qu'on n'a pas voulu mettre dans la barre.

**Sous-menu** — calqué sur le picker de modèles
(`src/components/chat/ComposerControls.tsx:424`), qui a déjà champ de
recherche, liste et état actif : recherche, entrée « Aucun », liste des
profils, coche accent sur l'actif, séparateur, `+ Créer un spécialiste…`.
Cette dernière entrée **préremplit le composer** avec la demande adressée à
l'agent — elle n'ouvre pas de formulaire.

**Bouton de menu** — son glyphe est remplacé par celui du spécialiste actif,
plus une pastille accent de 6px en haut à droite. Sans spécialiste, le glyphe
d'origine et pas de pastille.

**Réglages** — section « Spécialistes » : liste avec nom, description et
chargement en tags (`4 skills` ou `tous skills`, `3 outils refusés`),
renommage, suppression, activation. Un skill disparu du catalogue s'affiche en
tag barré. Aucune édition de prompt système ici : elle reste dans le chat avec
l'agent.

**Gating** — la rangée n'apparaît que si `capabilities.profiles`, déclarée
dans `atelier-protocol/src/lib.rs` pour claude, grok et codex uniquement, et
reflétée dans `ProviderCapabilities` (`src/lib/providers.ts:23`). Sur les
autres providers, rien n'est affiché — pas de version dégradée trompeuse.

Contraintes de design applicables : tailles 11/12/13, rayons 6/10, poids
500/600, ombre `0 4px 16px rgba(0,0,0,.25)` sur les surfaces élevées, glyphes
SVG monochromes `stroke 1.3–1.5`, aucun `<button>` nu hors `ui/`, transitions
120–150ms.

## 6. Erreurs et cas limites

| Cas | Comportement |
| --- | --- |
| `Thread.profile` orphelin | Résolu comme « aucun » + note dans le fil ; le tour part normalement |
| Skill disparu du catalogue | Ignoré à la résolution, tag barré dans les Réglages |
| `allowedTools` et `deniedTools` en conflit sur un nom | Le refus gagne — c'est déjà la règle des CLI |
| Respawn ACP Grok en échec | Le tour échoue avec le message du provider ; le profil reste posé sur le fil, aucun retour arrière silencieux |
| Nom de profil en collision | `create` refuse ; l'agent propose un autre nom |
| Profil illimité entièrement vidé par tombstones | Autorisé — équivaut à un profil sans skill |
| Changement de spécialiste pendant un tour en cours | Appliqué au tour suivant, jamais au tour courant |

## 7. Tests

- **Rust `profiles.rs`** — round-trip, préservation des champs inconnus,
  unicité du nom, tombstones.
- **Rust `resolve_profile`** — illimité sans tombstone ⇒ `None` ; illimité
  avec tombstones ⇒ catalogue moins les soustraits ; restreint ⇒ liste exacte ;
  entrée absente du catalogue ignorée.
- **Rust providers** — `build_args` claude et grok, et la map d'options codex,
  avec et sans profil ; hash inchangé ⇒ aucun respawn Grok ; hash changé ⇒
  retrait + `session/load`.
- **Rust `atelier-agent-mcp`** — `tools/list` expose deux outils ; chaque
  action ; `detach` sur profil illimité écrit bien une tombstone.
- **Frontend** — helper de résolution du libellé, rendu du sous-menu (recherche,
  coche, entrée « Aucun »), gating par capability, glyphe + pastille.
- **Obligatoire avant de conclure** : `npx tsc --noEmit` et `npx vite build`.

## Hors périmètre v1

- kimi, opencode, gemini et providers API.
- Profils par projet, ou surcharge projet d'un catalogue global.
- Modèle, effort, mode de permission ou provider dans le profil.
- `color_key` et thématisation par profil.
- Délégation à un spécialiste dans un fil enfant (plan 057).
- Bascule du chemin Claude vers le SDK pour obtenir la liste blanche fine de
  skills.
- **Catalogue de connecteurs MCP dans atelier** — prérequis d'une restriction
  par connecteur plutôt que par motif d'outil. Chantier autonome.
- Restriction d'outils côté Codex.
