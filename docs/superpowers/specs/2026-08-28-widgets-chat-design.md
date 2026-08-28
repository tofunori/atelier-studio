# Widgets vivants dans le fil — design

**Date** : 2026-08-28 · **Statut** : approuvé en discussion (Thierry) · **Référence visuelle** : les widgets interactifs de Claude Desktop (outil MCP → HTML sandboxé dans la bulle).

## Objectif

Un agent peut afficher dans le fil un panneau interactif — curseurs, courbes, chiffres qui se recalculent — au lieu d'une figure morte ou d'un pavé de chiffres. Le code du widget est écrit par un LLM : il tourne donc dans une iframe close, il ne repasse jamais dans le contexte du modèle, et il survit à un rechargement de session.

Cas d'usage moteur : « fais-moi voir ce que ν change au poids d'un résidu à 6 σ » — trois panneaux et un curseur, plus parlants que dix lignes de prose.

## Décisions structurantes

1. **Transport = outil MCP maison**, pas une fence markdown. Rendu atomique (aucun demi-widget pendant le streaming), aucun HTML dans le transcript lisible, découverte par le schéma d'outil plutôt que par une convention à répéter en prompt.
2. **Le HTML monte par le pont HTTP, pas par la sortie de l'outil.** Il échappe à la troncature 64 KiB de `tool_update.output` et ne revient jamais dans le contexte du modèle ; le CLI ne reçoit qu'un identifiant.
3. **Vitrine close + un seul canal de retour.** `sandbox="allow-scripts"` seul (origine opaque : pas de `localStorage`, pas de cookies, pas de navigation du parent), CSP `default-src 'none'` (aucun réseau, aucune police externe). Seule sortie : `sendPrompt(text)`, qui **pré-remplit le composeur** et rend la main — un widget ne déclenche jamais un tour tout seul.
4. **HTML sur disque, event léger dans le journal.** Le JSONL du thread reste léger et le widget revient intact au rejeu, y compris quand l'historique natif du CLI ne connaît pas l'event.
5. **Inline dans la bulle**, comme Claude Desktop. Ce qui impose deux mécanismes : hauteur connue avant montage, et gel d'état au démontage (§E).
6. **Rust-first.** Validation, enveloppe, écriture et service du fichier vivent dans `atelier-runtime`. Le frontend ne fait que monter une iframe.

### Ce qui existe déjà (et change l'estimation)

- `atelier-agent-mcp` est un serveur MCP stdio complet, avec pont HTTP authentifié par jeton de capacité vers le runtime (`bridge.rs`, endpoint `/internal/agent-mcp`). On ajoute **un outil**, pas un serveur.
- Le branchement dans les CLI est fait : claude reçoit un fichier de config par thread (`claude.rs:336`), opencode/grok/kimi reçoivent `mcpServers` à la session ACP. Le nouvel outil arrive partout sans câblage.
- `MermaidBlock` est le précédent complet d'un rendu riche depuis du contenu LLM : palette résolue depuis les tokens CSS, cache par hash, sécurité stricte, jamais en streaming. Le widget suit la même discipline et **le même châssis CSS** (§F).
- Le routeur du runtime porte déjà un `CorsLayer` global (`server.rs:85`) — la nouvelle route en hérite. (Piège connu : tout endpoint loopback consommé par la webview doit échouer bruyamment si l'ACAO manque.)

## A. Outil MCP — `atelier_widget`

`schema.rs` expose aujourd'hui **un** outil (`atelier_sessions`, à actions). On ajoute un **second outil** plutôt qu'une action : un outil dédié se découvre mieux dans la liste, et son schéma d'entrée est plat.

```json
{
  "name": "atelier_widget",
  "description": "Afficher un panneau interactif dans le fil de la conversation. HTML autonome : aucun réseau, aucune bibliothèque externe, tout le calcul en JS local.",
  "inputSchema": {
    "type": "object",
    "required": ["html", "title", "height"],
    "properties": {
      "html":   { "type": "string", "description": "Contenu de la page (sans <html>/<head>/<body>)" },
      "title":  { "type": "string", "description": "Titre court affiché dans la barre" },
      "height": { "type": "integer", "description": "Hauteur en pixels, 120 à 900" }
    },
    "additionalProperties": false
  }
}
```

`server.rs` : `tools/list` rend `[tool_definition(), widget_tool_definition()]` ; `tools/call` route `atelier_widget` vers `bridge.call("show_widget", args)`. Le résultat rendu au CLI est minuscule :

```json
{ "ok": true, "widgetId": "w_3f1a…", "note": "Le panneau est affiché. Ne recopie pas le HTML dans ta réponse." }
```

## B. Runtime — validation, enveloppe, écriture

Nouveau module `rust/crates/atelier-runtime/src/widgets.rs`, appelé depuis `agent_mcp_handler` sur l'action `show_widget` (jeton de capacité déjà exigé par le handler existant).

1. **Validation** — `html` ≤ 128 KiB (le pont impose `REQUEST_BODY_MAX = 256 KiB`, `agent_link.rs:160`, et l'échappement JSON gonfle la charge — 128 KiB laisse la marge ; un panneau n'est pas une application), `title` ≤ 80 caractères (tronqué, pas rejeté), `height` clampé à [120, 900]. Plafond de **8 widgets par tour** ; au-delà, l'appel rend une erreur explicite au modèle.
2. **Identifiant** — `w_` + 16 hexadécimaux tirés dans le runtime. **Jamais dérivé d'une entrée de l'agent** : la traversée de chemin est impossible par construction, pas par assainissement.
3. **Enveloppe** — le HTML de l'agent n'est jamais servi tel quel. Le runtime le place dans une coquille qui porte la balise CSP, le pont `postMessage` et les variables de thème (§D). *L'agent écrit le contenu de la page, pas sa tête.*
4. **Écriture** — `<app_dir>/widgets/<sha256(threadId)>/<id>.html`.
   **Pas dans `.atelier/` du projet** : un widget par question polluerait le dépôt de Thierry et le `git status` de chaque tour. On reprend la convention de `harness-history/` (§`journal.rs`), qui hache déjà le threadId.
5. **Émission** — un event `widget` sur le WS du thread (§C).
6. **Ménage** — les fichiers d'un thread supprimé partent avec lui (branchement sur la suppression de journal existante) ; au-delà, plafond de 200 fichiers par thread, purge du plus ancien.

Échec d'écriture = erreur rendue au modèle + log, jamais un tour cassé.

### Service du HTML

Nouvelle route `GET /widgets/:id` sur le routeur du runtime (hérite du `CorsLayer` global). Elle rend la coquille complète en `text/html`. Le frontend ne l'appelle que lorsque la rangée monte — un widget jamais scrollé n'est jamais lu.

`id` est validé contre `^w_[0-9a-f]{16}$` avant toute construction de chemin.

## C. Event et journal

Nouvelle variante dans `atelier-protocol` et `src/lib/ws.ts` :

```ts
| { kind: "widget"; id: string; title: string; height: number; ts?: number }
```

- **Non éphémère** : `widget` n'entre ni dans `EPHEMERAL`, ni dans `ITEM_COMPACT`, ni dans `SINGLETON` de `journal.rs` — il est donc journalisé tel quel et rejoué au chargement.
- **Rejeu natif** : quand la session est rejouée depuis l'historique du CLI (qui ignore nos events), le widget revient quand même par le journal Atelier. C'est précisément la raison d'être de la décision 4.
- **Fichier manquant** au rejeu (purge, app dir déplacé) : état *introuvable* (§E), jamais une carte cassée.

## D. Coquille et bac à sable

L'iframe est montée en `srcdoc` avec le contenu de `GET /widgets/:id`, attribut `sandbox="allow-scripts"` **seul** — origine opaque. La coquille contient :

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none';">
```

Aucun `connect-src`, aucun `font-src` : pas de réseau, pas de police externe, pas de CDN. `form-action` et `base-uri` sont déclarés explicitement parce que `default-src` **n'est pas** un repli pour ces deux directives (relecture tâche 2) — sans eux, un `<form>` posté par le widget partirait vraiment sur le réseau. Les images en `data:` restent permises (un widget peut dessiner puis exporter en canvas).

### Protocole `postMessage` — cinq messages, rien d'autre

| Sens | Message | Charge | Contrôle |
|---|---|---|---|
| hôte → widget | `theme` | tokens de couleur résolus + police effective | rejoué à chaque bascule clair/sombre, **sans remontage** |
| hôte → widget | `restore` | dernier état connu, ou rien | envoyé une fois, avant révélation |
| widget → hôte | `ready` | — | au-delà de 3 s : état *muet* |
| widget → hôte | `state` | JSON ≤ 4 Ko | débounce 200 ms ; au-delà, ignoré |
| widget → hôte | `prompt` | texte ≤ 2000 caractères | pré-remplit le composeur ; **jamais d'envoi automatique** |

L'hôte ignore tout message dont la `source` n'est pas le `contentWindow` de l'iframe qu'il a montée, et rejette silencieusement les charges hors gabarit. Le widget reçoit un `sendPrompt(text)` déjà défini par la coquille — il n'écrit pas de `postMessage` à la main.

## E. Frontend — `src/components/chat/WidgetFrame.tsx`

### Hauteur, avant le montage

`ChatTimeline` tourne sur LegendList avec `recycleItems={false}`, mais la virtualisation démonte quand même les rangées sorties de la fenêtre. Un widget qui annoncerait sa hauteur après coup ferait sauter le scroll — le piège déjà documenté de ce fil.

Donc : `height` est **obligatoire à l'appel d'outil**, et le corps de la carte porte cette hauteur en style inline dès le premier rendu — avant même que le `fetch` du HTML ne résolve. LegendList mesure donc la bonne hauteur du premier coup. (`virtualRows.ts` n'est pas concerné : ce module ne fait que stabiliser l'identité des rangées, pas leur taille.) En v1 la hauteur déclarée fait foi ; un dépassement scrolle à l'intérieur de l'iframe. Pas de négociation.

### État, après le démontage

Sans traitement, remonter le fil puis redescendre remet tous les curseurs à zéro. Le widget pousse son état à chaque changement ; l'hôte le garde dans une `Map` au niveau du module (clé = id du widget, plafond LRU) et le renvoie au remontage **avant** de révéler la frame. Le widget implémente `onRestore`, ou l'ignore et repart de ses valeurs par défaut.

La `Map` est mémoire seule : l'état des curseurs ne survit pas à un redémarrage de l'app, seulement au scroll. C'est suffisant et ça évite d'écrire de l'état LLM sur disque.

### Quatre états, aucun rouge

| État | Rendu |
|---|---|
| **réservé** | la rangée tient déjà la hauteur déclarée ; barre + point d'activité discret. Pas de squelette clignotant. |
| **vivant** | frame révélée en 140 ms (`opacity`), respect de `prefers-reduced-motion` |
| **muet** | 3 s sans `ready`, ou erreur au chargement : ligne sobre « le widget n'a pas démarré » + action « voir la source ». **La hauteur est rendue au fil.** |
| **introuvable** | fichier absent au rejeu : « widget expiré », titre conservé, hauteur rendue. |

Même refus du rouge que pour un diagramme mermaid invalide : jamais d'écran d'erreur criard dans le fil.

## F. UI — le troisième membre d'une famille

`.codeblock` et `.mermaid-block` partagent déjà le même châssis (`App.css:290`). `.widget-block` le reprend **sans le modifier** : bordure 1 px `--border`, rayon `--r-m`, barre `min-height: 30px` / `padding: 4px 8px 4px 10px`, boutons-icônes 24×22 au rayon `--r-s`.

- **Libellé de gauche** : icône monochrome (curseurs, stroke 1.4) + titre de l'agent. Seul écart assumé au précédent : c'est de la prose, donc police d'interface à `--fs-s` au lieu de la police de code, avec ellipsis.
- **Trois actions**, les mêmes que mermaid : voir la source (bascule vers un `.codeblock` du HTML), plein écran, copier la source. *La source visible est l'affordance de confiance* — du code LLM tourne chez Thierry, il doit être lisible en un clic. La réinitialisation de l'état vit dans la barre du plein écran, pas dans le fil.
- **Plein écran** : reprise du `Dialog` de `MermaidBlock` (toolbar + canvas), et un `theme` rejoué pour que le widget se remette en page.
- **Thème** : la coquille injecte `--bg-card`, `--fg`, `--fg2`, `--muted`, `--border`, `--accent` et la police effective ; le fond de l'iframe est `transparent`, donc le widget flotte sur le `--bg-side` du châssis. **L'orange est le seul accent disponible** — ce qui interdit mécaniquement les palettes décoratives dans du HTML généré, plutôt que de l'interdire dans un prompt.
- **Clavier** : Tab entre dans l'iframe, Échap rend le focus à la timeline, la carte porte un `:focus-within` visible. Sans ça, un widget est un piège à clavier.
- Boutons via `IconButton` / `RowButton` (jamais de `<button>` nu — `css-contract.test.ts`).

## G. `sendPrompt()`

Le texte arrive dans le composeur, qui prend le focus. Si le composeur contient déjà quelque chose, le texte **s'ajoute à la ligne suivante** — il n'écrase rien. Le remplissage est le seul retour visuel : pas de toast.

Écart assumé avec Claude Desktop, qui envoie directement. Le bouton est écrit par un LLM ; le pré-remplissage évite qu'un widget consomme des tours tout seul. C'est une ligne à changer si l'usage prouve que ça agace.

## H. Tests

**Rust** (`widgets.rs`) : schéma de l'outil ; refus d'une hauteur hors bornes ; troncature du titre ; refus d'un `html` au-delà de 128 KiB ; plafond de 8 par tour ; un `id` malformé ne construit jamais de chemin ; purge au-delà de 200 ; `GET /widgets/:id` rend la coquille et un 404 propre sur fichier absent.

**Vitest** (`WidgetFrame.test.tsx`) : `theme` rejoué à la bascule **sans remontage** ; état restauré au remontage ; message d'une `source` étrangère ignoré ; `state` > 4 Ko ignoré ; `prompt` > 2000 caractères rejeté ; `prompt` ajouté sans écraser le composeur ; passage à *muet* après 3 s sans `ready` ; *introuvable* sur 404.

**Rangée** : la hauteur déclarée est bien celle réservée avant montage — le test qui garde le scroll immobile.

**Portes existantes** : `npx tsc --noEmit`, `npx vite build`, `css-contract.test.ts`, `cargo test`.

## I. Hors périmètre (v1)

- Aucun accès aux données du projet : pas de lecture de fichier, pas de requête DuckDB depuis l'iframe. Les données sont écrites en dur dans le HTML par l'agent.
- Aucun réseau, donc aucune bibliothèque par CDN.
- Pas de widget en cours de streaming — il apparaît à la fin de l'appel d'outil, comme un diagramme mermaid.
- Pas d'export, pas de partage, pas de persistance de l'état des curseurs entre deux lancements de l'app.
- Pas de négociation de hauteur automatique. Premier candidat pour la suite si la contrainte gêne.
- Pas de skill dédié pour apprendre à l'agent à respecter les tokens de design. Le schéma de l'outil suffit pour un panneau simple ; un skill viendra si la qualité du HTML généré déçoit.

## J. Points tranchés en cours de discussion

| Question | Décision | Révisable ? |
|---|---|---|
| Second outil ou action sur `atelier_sessions` | Second outil `atelier_widget` | oui, sans coût |
| `sendPrompt` envoie ou pré-remplit | Pré-remplit | une ligne |
| Borne haute de hauteur | 900 px — une figure à trois panneaux comme celle qui a lancé la discussion ne tient pas en 720 | oui |
| Titre de la barre | Fourni par l'agent, tronqué à 80 | si la qualité déçoit, repli sur « widget » + attribut `title` |
| Emplacement du fichier | App dir, pas `.atelier/` du projet — évite le bruit git | non, c'est un vrai défaut évité |
