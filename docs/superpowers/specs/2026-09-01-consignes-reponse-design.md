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

### Les consignes — `atelier-store/src/settings.rs`

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

Quatre consignes livrées à la première ouverture, insérées si la clé est
absente : *Concis*, *Pédagogique*, *Rigueur scientifique*, *Français
québécois*. L'insertion est idempotente : une consigne livrée supprimée du
JSON à la main ne revient pas (on écrit un marqueur `consignes_amorcees:
true` à côté).

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

Rempli par `atelier-runtime/src/send.rs` depuis `thread.extra["consigne"]`.

### claude — en système

Deux arguments de plus dans le constructeur d'arguments
(`atelier-providers/src/claude.rs`, à côté de `--model`) :

```
--append-system-prompt <texte>
```

Invisible dans le fil : le message de l'utilisateur reste son message.

### codex — en préfixe

codex n'a pas d'équivalent. Le texte est préfixé à l'entrée dans
`build_input` (`atelier-providers/src/codex.rs`), séparé du message par une
ligne vide, et **marqué** pour que le rendu puisse le masquer :

```
<consigne-atelier>
{texte}
</consigne-atelier>

{prompt}
```

Le frontend retire ce bloc à l'affichage du message utilisateur. Le texte
part donc bien dans l'historique de codex — c'est le prix du CLI, et le pied
du menu le dit à l'utilisateur.

**Piège :** codex ne retient aucun réglage entre les tours (modèle, effort,
politique de sandbox sont tous réémis à chaque envoi). La consigne suit la
même règle, y compris sur `--resume`. Une consigne appliquée au premier tour
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
`atelier-providers/src/claude.rs`, calqué sur `commit_message` — même
`--system-prompt`, même modèle, même délai de 60 s. **N'envoie que les trois
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

- **Store** : amorçage idempotent des quatre consignes livrées ; suppression
  refusée sur une consigne `livree` ; `nom` coupé à 24 caractères.
- **Fil** : `extra.consigne` survit à un aller-retour d'`upsert` ; une
  consigne supprimée du catalogue laisse le fil fonctionnel.
- **claude** : `--append-system-prompt` présent avec le bon texte quand
  `consigne` est `Some`, absent quand elle est `None`.
- **codex** : le bloc `<consigne-atelier>` est présent dans `build_input`,
  et **sur le second tour d'un même fil** — le test qui protège du bogue
  silencieux.
- **grok / kimi / opencode** : `consigne: Some(_)` ne modifie aucun argument
  ni aucune charge utile.
- **Frontend** : le bloc `<consigne-atelier>` est retiré au rendu du message
  utilisateur ; la pilule est plafonnée à 132 px ; l'état actif n'utilise
  aucune couleur d'accent (verrouillé dans `css-contract.test.ts`).

## Découpage en phases

1. **Store + transport** — clé `consignes`, `extra.consigne`, champ
   `SendRequest`, câblage claude et codex, tests Rust. Rien de visible.
2. **Composeur** — déclencheur, menu, pilule, marqueur d'en-tête, masquage du
   bloc codex au rendu.
3. **Éditeur** — section de réglages, liste et formulaire.
4. **Reformuler** — le tour haiku et les trois états du bouton.

Chaque phase est livrable seule : après la 1, tout marche par écriture
manuelle du JSON ; après la 2, la fonctionnalité est utilisable ; la 3 et la
4 sont du confort.
