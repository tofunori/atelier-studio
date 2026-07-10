# 020 — Matrice événements → présentation (consomme le contrat 025)

Source normative : `docs/AGENT_HARNESS_CONTRACT.md` (schema v1, codex-cli 0.142.5,
vérifié 2026-07-10 contre `src/lib/ws.ts` — les kinds du type `AgentEvent`
correspondent un à un au contrat ; aucun kind orphelin). Ce document mappe les
événements DURABLES vers les cinq zones d'un tour (plan 020) ; il ne crée aucune
matrice protocolaire concurrente.

Anatomie cible d'un tour : **Demande → Activité → Réponse → Capsule → Actions**.

| Événement (kind) | Durable | Zone de présentation | Règles d'honnêteté |
|---|---|---|---|
| `user` | oui | **Demande** (texte + chips contexte/pastes) | contexte du tour = objet historique, jamais modifié après coup |
| `delta` / `streaming` / `stream_set` | non | **Réponse** (flux, `.stream-caret`) | compacté au reload — ne jamais s'y fier pour l'état final |
| `text` | oui | **Réponse** (markdown, largeur lecture) | N blocs possibles par tour (Claude) — tous rendus |
| `thinking` / `thinking_delta` / `thinking_live` | durable / non / non | **Activité** (bloc thinking replié) | distinct de la réponse, ne domine jamais |
| `started` / `heartbeat` | non | **Activité** (durée running) | jamais journalisés — la durée finale vient de `durationMs`/ts |
| `activity` | non | **Activité** (carte de progrès) | éphémère, disparaît au reload |
| `tool` / `tool_update` | oui (update) | **Activité** (ligne outil : nom humain + nom exact accessible, statut, durée) | `interrupted` affiché tel quel ; sortie bornée 64 KiB avec `truncated` |
| `edit` | oui | **Activité** (ligne fichier ±lignes) **et Capsule** (agrégat fichiers) | ± lignes seulement si enrichis (git numstat) |
| `todos` | oui | **Activité** (dernier état seul) | pas de « progression » inventée |
| `permission` / `interaction` | oui | **Activité**, toujours visible même replié (KEEP_TAIL) | secrets jamais dans le DOM après envoi (contrat HarnessInteraction) |
| `goal` | oui | hors fil (GoalBar) | — |
| `usage` | oui | **Capsule** (via `done.usage` porté par le terminal) | « Usage indisponible » si absent — jamais de valeur inventée |
| `done` (ok) | oui, terminal | **Capsule** : fichiers modifiés (n), usage, review si enregistrée, actions (diff, vérifier, revert si dispo) | « N fichiers modifiés », jamais « changement réussi » |
| `done` (ok:false) / interruption | oui, terminal | **Capsule** ton warning (« Tour interrompu ») | interruption ≠ échec scientifique |
| `error` | oui, terminal | **Capsule/fil** ton erreur, visible même Activité repliée | cause + action (Réessayer) ; jamais un code brut seul |
| review (`review-result`, état local Chat) | hors journal | **Capsule** (badge + détail) | « Review terminée », jamais « approuvé scientifiquement » |

Non-inférences obligatoires : une commande lancée sans `exitCode` enregistré
n'est jamais présentée comme « réussie » ; aucun signal « tests passés » n'existe
tant qu'aucun événement ne le porte explicitement (aujourd'hui : aucun — la
capsule n'affiche donc JAMAIS de section tests) ; un `tool_use` sans résultat au
terminal est `interrupted` (contrat), pas « en cours ».

Événements sans attribution fiable (meta absente, `origin:"legacy-import"`) :
rendus dans le journal détaillé de l'Activité, jamais agrégés dans la capsule.
