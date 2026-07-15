# Parité ciblée du chat Synara — plan d’implémentation

**But :** reprendre les mécanismes de chat Synara qui réduisent le bruit et
sécurisent le travail en cours, sans copier son habillage ni simuler des
capacités que le sidecar Atelier ne possède pas.

## Audit du bundle Synara 0.5.3

L’audit a porté sur les modules compilés `chat._threadId`,
`composerDraftStore`, `ChatView.logic`, `ComposerReferenceAttachments` et
`ThreadTerminalDrawer` de `/Applications/Synara.app`.

### Mécanismes confirmés

1. **Brouillon par conversation.** Le store `synara:composer-drafts:v1`
   persiste avec un debounce de 300 ms, flush au `beforeunload`, migrations de
   schéma et repli mémoire. Il conserve le prompt, le contexte, les sélections
   de modèle par provider, le mode d’exécution et les relances en file.
2. **File FIFO visible.** Une relance n’est pas rendue comme une bulle déjà
   envoyée. La rangée permet `Steer`, modifier et supprimer. L’envoi automatique
   attend la fin du tour, des permissions et des interactions, puis ne retire
   l’élément qu’après dispatch réussi.
3. **Snapshot complet.** Chaque relance capture le provider, le modèle,
   l’effort, les options et toutes ses références. Un changement ultérieur du
   composer ne modifie pas une relance existante.
4. **Permissions à quatre décisions.** Approve once, Always allow this session,
   Decline et Cancel turn sont accessibles par les touches 1–4.
5. **Plan proposé durable.** Synara rend le plan comme un artefact distinct,
   repliable, copiable et exportable.
6. **Deux niveaux de retour.** Le rewind du fil supprime les messages plus
   récents et leurs diffs; l’undo de fichiers conserve la conversation.
7. **Virtualisation.** Les longues timelines utilisent une liste virtualisée.

## Décision d’architecture Atelier

- `useChatDraftStore` devient l’autorité locale des prompts, pièces jointes et
  relances en attente, indexés par `thread:<id>` ou `new:<projet>`.
- Le choix de modèle reste dans le stockage existant du chat, migré vers
  `activeProvider + byProvider`, afin de préserver les choix Claude et Codex
  indépendamment.
- Le sélecteur modèle expose d’abord les providers réellement disponibles,
  puis uniquement le catalogue publié par le provider choisi. Un changement
  de provider au repos garde le transcript Atelier, ferme l’ancienne session
  native et démarre une session neuve; il reste interdit pendant un run actif.
- La relance est conservée côté composer jusqu’à son exécution. Le sidecar
  existant reçoit alors le snapshot avec son `clientMessageId`; il garde son
  rôle d’autorité pour les tours, le steering et le journal.
- Une mise en file ne crée donc plus prématurément une bulle user ou un faux
  événement `__queued` impossible à modifier.
- Les permissions étendent le contrat `interactionResponse`. Codex reçoit les
  enums natifs `accept`/`acceptForSession`; Claude bénéficie d’une autorisation
  mémorisée pour la durée du sidecar. Annuler répond d’abord sûrement à la
  permission, puis interrompt le tour.

## Étapes livrées

- [x] Checkpoint complet, tag de retour et branche dédiée.
- [x] Store versionné, validation du schéma, nettoyage des data URLs et flush
  à 300 ms / fermeture.
- [x] Prompt et pièces jointes isolés par conversation.
- [x] Sélection modèle/effort/permission séparée par provider avec migration de
  l’ancien objet plat.
- [x] Snapshot FIFO de chaque relance.
- [x] Rangées visibles avec Envoyer maintenant, Modifier et Supprimer.
- [x] Reprise automatique au terminal du tour précédent, y compris pour un fil
  qui n’est plus sélectionné.
- [x] Carte de permission à quatre décisions et raccourcis 1–4.
- [x] Portée session propagée aux providers et interruption sur Cancel turn.
- [x] Tests du stockage, du changement de fil, du cycle de file, des raccourcis
  et des décisions Codex natives.
- [x] Sélecteur provider → modèles avec catalogue backend, mémorisation par fil
  et nouvelle session native lors d’un handoff Claude/Codex.
- [x] Artefact `proposed_plan` durable dans les journaux Node et Rust, repli à
  900 caractères ou 20 lignes, copie, sauvegarde dans `.plan/` et export `.md`.
- [x] Checkpoint Git attaché à chaque `done`, avec deux actions distinctes :
  restauration des fichiers seulement ou rewind du fil et des fichiers.
- [x] Timeline LegendList virtualisée avec clés stables, démarrage en bas,
  maintien du bord bas à 10 %, conservation de position, chapitres et sauts.
- [x] Contrat provider/modèle/effort/options complet dans chaque relance FIFO.
- [x] Parité de protocole Node/Rust et tests de changement de provider,
  interactions, plans, checkpoints et virtualisation sur 400 événements.

## Différences assumées selon les capacités du provider

- Codex expose les demandes d’approbation, les questions interactives et les
  sollicitations MCP dans le backend Rust comme dans le backend Node.
- Claude expose les quatre modes de permission. Le backend Rust traduit le
  mode Atelier `default` vers le nom CLI actuel `manual`; le backend Node SDK
  peut en plus relayer les cartes interactives natives de Claude.
- Les contrôles absents des capacités publiées par un provider ne sont pas
  montrés. Atelier n’invente donc pas une interaction que son transport actif
  ne sait pas servir.

## Validation obligatoire

1. `npx tsc --noEmit`
2. `npx vite build`
3. suites frontend ciblées puis complètes
4. `(cd sidecar && npx vitest run)`
5. tests Rust du workspace
6. protocole AGENTS.md : tuer app/sidecars/serveurs galerie, build release,
   relancer `Atelier.app` et vérifier le process `tauri-app`
