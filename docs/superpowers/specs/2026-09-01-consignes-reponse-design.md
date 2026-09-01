# Consignes de réponse — conception

Date : 2026-09-01
Statut : conception validée, à implémenter
Maquettes d'interface : artefact « Consignes de réponse »
(https://claude.ai/code/artifact/46650d6a-dc7b-452d-8e8f-b763b448f23a)

## Problème

Thierry répète les mêmes instructions de ton et de forme d'un fil à l'autre
(« sois concis », « explique comme un prof », « distingue mesuré de supposé »).
Les deux leviers existants ne couvrent pas ce besoin :

- un skill (`/concis`) se rejoue ou se perd d'un tour à l'autre ;
- `CLAUDE.md` s'applique partout, tout le temps, pour tous les projets.

Il manque l'échelon intermédiaire : une instruction qui tient **sur un fil de
conversation, et seulement celui-là**, activable sans la retaper.

## Ce qu'on construit

Une liste unique de **consignes** — nom, description, texte — éditable dans les
réglages, dont une est activable par fil depuis le composeur.

Décisions structurantes prises en amont :

| Décision | Choix | Raison |
|---|---|---|
| Portée | Le fil | C'est le seul créneau que ni les skills ni `CLAUDE.md` ne couvrent |
| Édition | Panneau dans l'app | Demandé explicitement ; pas de dossier de fichiers à gérer en v1 |
| CLIs v1 | claude + codex | Les deux réellement utilisés ; les trois autres dégradent proprement |
| Cardinalité | Une consigne active à la fois | Deux consignes contradictoires est un piège, pas une souplesse |
| Rapport aux skills | Indépendantes | Le texte de `/concis` est copié une fois comme point de départ, sans lien vivant vers `~/.claude/skills` |

Pas de « types de réponse » d'un côté et de « règles custom » de l'autre :
*Concis* est une consigne comme les autres, simplement livrée par défaut.

### Hors périmètre (v1)

- grok, kimi, opencode (déclencheur éteint, infobulle explicative) ;
- plusieurs consignes simultanées ;
- import/export en fichiers ;
- consigne par projet ou globale.

## Modèle de données

### Les consignes — `src/lib/settings.ts`

Stockées dans les réglages existants, sous la clé `consignes` :

```json
{
  "consignes": [
    {
      "id": "concis",
      "nom": "Concis",
      "description": "Réponse directe, sans préambule ni récapitulatif.",
      "texte": "Réponds directement…",
      "livree": true
    }
  ]
}
```

- `id` : slug stable, généré à la création, jamais réécrit par un renommage.
- `nom` : 24 caractères maximum, coupé à la saisie.
- `description` : une ligne, affichée sous le nom dans le menu.
- `texte` : la consigne elle-même, écrite au modèle.
- `livree` : marque les quatre consignes fournies — modifiables, non
  supprimables, pour qu'une liste ne puisse pas être vidée par accident.

**Le catalogue vit côté frontend.** `saveSettings` écrase `settings.json`
avec le miroir typé complet (`src/lib/settings.ts`, cf. `App.tsx:909`) : une
clé absente du type `Settings` serait effacée au premier enregistrement. Donc
`consignes` s'ajoute au type `Settings` et les quatre consignes livrées
(*Concis*, *Pédagogique*, *Rigueur scientifique*, *Français québécois*)
vivent dans `DEFAULT_SETTINGS` — appliquées seulement quand la clé est
absente du fichier, ce qui donne gratuitement l'idempotence (une consigne
livrée supprimée ne revient pas). `atelier-store/src/settings.rs` reste
inchangé : le Rust ne lit jamais le catalogue, seulement la copie portée par
le fil.

### L'état du fil — `atelier-store/src/threads.rs`

`Thread` possède déjà `extra: HashMap<String, Value>`. On y range :

```json
{ "consigne": { "id": "concis", "texte": "Réponds directement…" } }
```

**L'identifiant *et* une copie du texte.** C'est le point non négociable du
modèle : sans la copie, supprimer ou modifier une consigne réécrit
silencieusement le sens des conversations passées. Le fil est la source de
vérité de ce qui a été envoyé ; la liste des réglages n'est qu'un catalogue.

Règles qui en découlent :

- consigne supprimée → le fil garde son texte et continue de fonctionner ;
  le menu affiche le nom en grisé, suivi de « (supprimée) » ;
- consigne modifiée → le fil adopte la nouvelle version **au tour suivant**,
  en réécrivant sa copie ; les tours déjà envoyés ne sont pas réinterprétés ;
- nouveau fil → aucune consigne. Une consigne collée au fil ne doit jamais
  devenir un réglage global par accident.

## Transport vers les CLIs

`SendRequest` (`atelier-providers/src/traits.rs`) reçoit un champ :

```rust
/// Consigne de fil : instruction de ton/forme réémise à CHAQUE tour.
/// `None` = aucune consigne active.
pub consigne: Option<String>,
```

Rempli par `atelier-runtime/src/send.rs` depuis `previous.extra["consigne"]`
(le `Thread` est déjà passé en paramètre aux deux endroits qui construisent
un `SendRequest`) : le tour normal (`send.rs:1422`) **et** le chemin steer
non-claude (`send.rs:1110`) — le steer claude retombe dans le tour normal
(`send.rs:1063-1077`) et est couvert par le premier site. La copie est rafraîchie **côté
frontend**, au moment de l'envoi : le composeur relit le texte courant du
catalogue pour l'identifiant actif et le joint au patch `upsertThread`. Le
Rust ne fait que lire — aucun chemin d'écriture de la consigne côté runtime.
`upsert` fusionne clé à clé au niveau racine et `extra` est
`#[serde(flatten)]`, donc un patch `{"id": …, "consigne": {…}}` préserve les
autres clés d'extra (test existant `preserves_extra_fields`).

### claude — en système

Un argument de plus dans `build_args` (`claude.rs:211`, à côté de
`--model`). `build_args` est le seul constructeur de production (appelé de
`send()`, y compris pour `--resume`), donc chaque tour du fil le reçoit :

```
--append-system-prompt <texte>
```

Invisible dans le fil : le message de l'utilisateur reste son message.

### codex — en préfixe

codex n'a pas d'équivalent. **Piège vérifié** : dans `build_input`
(`codex.rs:265`), `prompt` n'est utilisé que dans la branche de repli — si
`req.inputs` est non vide (image, mention, skill), un préfixe posé sur
`req.prompt` disparaîtrait. La consigne s'injecte donc *dans* `build_input`
(nouveau paramètre `consigne: Option<&str>`), en tête du tableau d'items
dans **les deux branches**, et ses quatre sites d'appel (`codex.rs:790`,
`815`, `849`, `1030` — steer, retry steer, queue, tour normal) la reçoivent.

```
<consigne-atelier>
{texte}
</consigne-atelier>

{prompt}
```

**Aucun masquage frontend.** `send.rs:906-985` sépare déjà `prompt` (ce que
la bulle affiche) de `provider_prompt` (les blocs injectés galerie/zotero/
KB) ; la consigne suit ce patron et n'atteint jamais l'UI. Un utilisateur
qui tape `<consigne-atelier>` dans son message ne voit rien disparaître. Le
texte part bien dans l'historique de codex — c'est le prix du CLI, et le
pied du menu le dit.

**Piège :** codex ne retient aucun réglage entre les tours (modèle, effort,
politique de sandbox sont tous réémis à chaque envoi). La consigne suit la
même règle, y compris à la reprise. Une consigne appliquée au premier tour
puis oubliée serait le pire bogue possible : silencieux.

### Les trois autres

`grok`, `kimi`, `opencode` : le déclencheur est éteint dans le composeur,
infobulle « pas encore supporté sur ce CLI ». Le champ `consigne` de
`SendRequest` est ignoré par ces adaptateurs — aucun texte ne fuit dans un
prompt sans mécanisme prévu pour lui.

## Interface

### Composeur — `src/components/chat/ComposerControls.tsx`

Un déclencheur dans le **groupe de gauche**, après l'icône de base de
connaissances. La règle de partage de la barre : le groupe de gauche décide
*ce qui entre* dans le tour, celui de droite *comment le modèle tourne*. Une
consigne est du contenu.

- **Au repos** : icône seule (trois filets marqués de puces, stroke 1.4),
  couleur `--muted`. Aucune pilule, aucun libellé.
- **Actif** : pilule à fond plein `--bg-ctl`, texte `--fg`, rayon 999 px.
  **Pas de teinte d'accent** — l'état se lit au remplissage, comme les autres
  contrôles de la barre. Un fond tient dans les deux thèmes ; une bordure
  seule disparaît en sombre.
- **Largeur** : plafond dur de 132 px, `text-overflow: ellipsis`, nom complet
  en infobulle. Sous 720 px de fenêtre, le texte disparaît et il ne reste que
  le glyphe à fond plein — la barre garde sa largeur d'origine.

Le nom de la consigne apparaît aussi en petit dans l'en-tête de conversation
(`ChatHeader.tsx`) : en remontant un fil, on doit pouvoir expliquer pourquoi
les réponses ont ce ton.

### Menu

Popover `--bg-pop` + `--elevation-overlay`, rayon 10, sans bordure
supplémentaire — comme les autres popovers de l'app.

- étiquette « CONSIGNE DU FIL » ;
- « Aucune » en premier, toujours : retirer doit être aussi rapide qu'activer ;
- une rangée par consigne — nom en 13/500, description en 11/400 `--muted` ;
- rangée active : fond `--bg-ctl`, coche `--fg2` ;
- séparateur, puis « Modifier les consignes… » qui ouvre les réglages ;
- **une ligne de pied** qui dit la vérité technique du CLI courant :
  claude → « appliquée en système, invisible dans le fil » ;
  codex → « ajoutée en tête de chaque message ».

### Éditeur — `src/components/settings/`

Nouvelle section de réglages, deux panneaux : liste à gauche (avec
« Nouvelle consigne »), formulaire à droite. Sauvegarde continue, pas de
bouton « Enregistrer ». Les consignes livrées portent un cadenas et n'ont pas
de bouton « Supprimer ».

Champs : **Nom** (24 car.), **Description** (une ligne), **Consigne**
(zone de texte monospace).

### Reformuler

Un bouton discret dans l'en-tête du champ *Consigne*, qui change de verbe
selon l'état :

| État du champ | Verbe | Effet |
|---|---|---|
| vide | Rédiger | Premier jet à partir du nom et de la description |
| rempli | Reformuler | Resserre, met à l'impératif, coupe le flou |
| juste reformulé | Rétablir | Ramène le texte original, jusqu'à la frappe suivante |

Il écrase sur place plutôt que d'ouvrir un panneau de comparaison à
arbitrer ; le filet est « Rétablir ».

Implémentation : un tour unique sur haiku dans
`atelier-providers/src/claude.rs`, calqué sur `commit_message`
(`claude.rs:773` — args construits en dur hors `build_args`, comme
`title_conversation`) : même `--system-prompt`, même modèle, même délai de
60 s. **N'envoie que les trois
champs** : ni le fil, ni les fichiers du projet, ni `CLAUDE.md`. CLI
indisponible → bouton éteint, éditeur utilisable à la main. Rien d'assisté
sur le nom ni la description.

## Règles de préséance

1. `CLAUDE.md` du projet — une consigne affine le ton, elle ne renverse pas
   les règles du projet ;
2. la consigne du fil ;
3. les skills chargés.

`/concis` et la consigne « Concis » peuvent donc se doubler. On ne l'empêche
pas : elles disent la même chose, la redondance est inoffensive.

## Tests

- **Réglages frontend** : `DEFAULT_SETTINGS` fournit les quatre consignes
  quand la clé est absente et ne touche pas une clé présente ; suppression
  refusée sur une consigne `livree` ; `nom` coupé à 24 caractères.
- **Fil** : un patch `{"consigne": …}` via `upsert` préserve les autres clés
  d'extra ; une consigne supprimée du catalogue laisse le fil fonctionnel.
- **claude** : `--append-system-prompt` présent avec le bon texte quand
  `consigne` est `Some`, absent quand elle est `None`, y compris sur un tour
  `--resume`.
- **codex** : le bloc `<consigne-atelier>` est présent dans les **deux
  branches** de `build_input` (avec et sans `inputs`), et **sur le second
  tour d'un même fil** — le test qui protège du bogue silencieux.
- **grok / kimi / opencode** : `consigne: Some(_)` ne modifie aucun argument
  ni aucune charge utile.
- **Frontend** : la bulle utilisateur n'affiche jamais le bloc (il ne quitte
  pas `provider_prompt`) ; la pilule est plafonnée à 132 px ; l'état actif
  n'utilise aucune couleur d'accent — ancré dans `css-contract.test.ts` sur
  le patron existant « tabs neutres sans accent de marque »
  (`css-contract.test.ts:684`).

## Découpage en phases

1. **Transport** — `extra.consigne`, champ `SendRequest` aux deux sites de
   construction, câblage claude et codex, tests Rust. Rien de visible ;
   activable en écrivant l'extra du fil à la main.
2. **Composeur** — déclencheur, menu, pilule, marqueur d'en-tête, masquage du
   bloc codex au rendu.
3. **Éditeur** — section de réglages, liste et formulaire.
4. **Reformuler** — le tour haiku et les trois états du bouton.

La clé `consignes` du type `Settings` frontend arrive avec la phase 2 (le
menu en a besoin). Chaque phase est livrable seule : après la 1, tout marche
par écriture manuelle de l'extra ; après la 2, la fonctionnalité est
utilisable ; la 3 et la 4 sont du confort.

Réglages : lecture/écriture par le canal WebSocket existant
(`getSettings`/`saveSettings`, `ws_router.rs:393-402`) ; la nouvelle section
de l'éditeur se déclare dans `src/components/settings/sections.ts` (une
ligne + un fichier dans `sections/` + clé i18n).
