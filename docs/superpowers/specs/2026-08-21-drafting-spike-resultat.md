# SPIKE — signal de rédaction d'appel (« Édite… » avant exécution)

Tâche 6 du plan `2026-08-21-hermes-work-display-phase2`. Sortie = recommandation, aucun code gardé.

## Probe 1 — Claude CLI

Commande, dans le scratchpad, chaque ligne préfixée d'un timestamp `time.time()` à réception :

```
claude -p "crée un fichier hello.txt contenant bonjour" \
  --output-format stream-json --verbose --include-partial-messages \
  --permission-mode bypassPermissions --max-turns 2
```

- Version testée : `claude 2.1.238 (Claude Code)`.
- `--permission-mode bypassPermissions` accepté tel quel (pas eu besoin de `--dangerously-skip-permissions`).
- `--include-partial-messages` est **déjà** le flag utilisé par le spawn actuel (`rust/crates/atelier-providers/src/claude.rs:227`).

### Timeline observée (extraits, ts = epoch seconds)

```
424.215073  content_block_start  content_block={"type":"tool_use","name":"Bash","input":{}}
424.240609  content_block_delta  input_json_delta partial_json=""
424.268225  content_block_delta  input_json_delta partial_json="{\"command\": \"ech"
424.293473  content_block_delta  input_json_delta partial_json="o \"bonjour\" >"
424.344172  content_block_delta  input_json_delta partial_json=" h"
424.909310  content_block_delta  input_json_delta partial_json="ello.txt && cat hello.txt"
424.937245  content_block_delta  input_json_delta partial_json="\", \"description\": ..."
424.966814  content_block_delta  input_json_delta partial_json="\"}"
424.994137  type=assistant        message.content[0] = {"type":"tool_use","name":"Bash","input":{"command":"echo \"bonjour\" > hello.txt && cat hello.txt", ...}}  ← bloc COMPLET
425.021296  content_block_stop
```

`content_block_start` porte le `name` de l'outil (`Bash`) avec un `input` **vide** dès **424.215s**, avant tout `input_json_delta`. Le message `assistant` complet (avec l'`input` intégral) n'arrive qu'à **424.994s**, soit un écart de **~779 ms** entre « on sait quel outil va s'exécuter » et « on connaît les arguments complets ». C'est exactement le trou que Hermes comble avec le verbe de rédaction.

**Conclusion probe 1 : le signal existe et est exploitable.** `content_block_start` de type `tool_use` donne le nom de l'outil (donc le verbe à afficher, ex. « Édite… » pour `Write`/`Edit`, « Exécute… » pour `Bash`) largement avant que l'input soit complet et donc avant l'exécution réelle. Le CLI actuel est déjà lancé avec le flag qui produit cet événement — aucun changement de spawn nécessaire, seulement du parsing.

## Probe 2 — Codex (lecture de code, pas de run live)

Lu `rust/crates/atelier-providers/src/codex_parse.rs` (méthode `map_turn_notification`, ~L75-151).

Constat structurel : le protocole ACP de Codex n'a pas d'équivalent du `content_block_start`/`content_block_delta` de Claude. `item/started` (L96) reçoit un `item` **déjà entièrement formé** — pour `commandExecution` par exemple, `item.command` est présent dès `item/started` (voir `remember_command`/`command_update` appelés directement, sans étape « nom connu, arguments pas encore »). Il n'existe pas, dans les notifications actuellement mappées, de sous-événement portant seulement le nom/type de l'item avant ses arguments : Codex core assemble l'item côté agent puis notifie une fois prêt.

Ce qui **peut** être conclu par lecture seule :
- Il n'y a pas de hook structurel pour un verbe « en rédaction » distinct de l'item complet — contrairement à Claude, il n'y a pas de paire (start vide → deltas → complet) à exploiter.
- Le seul signal antérieur disponible est `item/started` de type `reasoning` (L99, déjà mappé à `__thinking`), qui indique que le modèle réfléchit mais ne dit pas quel outil arrive ni avec quels arguments.

Ce qui **ne peut pas** être conclu sans mesure live : le délai réel entre la fin du dernier delta de raisonnement et `item/started` (les deux portent un `ts` d'après le brief, mais aucune session Codex réelle n'a été lancée dans ce spike). Une mesure live reste à faire lors d'un usage réel dans Atelier pour confirmer si ce délai est structurellement négligeable (< 1 s, comme pressenti par le brief) — mais même si le délai est non négligeable, il n'y a **aucune donnée exploitable** (pas de nom d'outil connu à l'avance) pendant cette fenêtre, donc la mesure ne changerait pas la conclusion : rien à afficher de plus utile qu'« Exécute… » au moment où `item/started` arrive déjà complet.

**Conclusion probe 2 : signal non exploitable côté Codex avec le protocole actuel** — pas par manque de vitesse, mais par absence d'un événement « nom connu / arguments pas encore » dans le flux de notifications mappé.

## Coût d'implémentation si GO (Claude seul)

1. **`rust/crates/atelier-providers/src/claude.rs`** : aucun changement de spawn — `--include-partial-messages` déjà présent (L227).
2. **`rust/crates/atelier-providers/src/claude_parse.rs`** : ajouter une branche dans le bloc `if ty == "stream_event"` (après L169, à côté de `content_block_delta`) :
   ```rust
   if et == "content_block_start" {
       if let Some(cb) = ev.get("content_block") {
           if cb.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
               if let Some(name) = cb.get("name").and_then(|v| v.as_str()) {
                   out.push(json!({"kind":"activity","phase":"drafting","tool":name}));
               }
           }
       }
   }
   ```
   Mapping nom-outil → verbe présent (`Write`/`Edit`→« Édite… », `Bash`→« Exécute… », `Read`→« Lit… », etc.) côté UI, réutilisant la table de verbes déjà utilisée pour les activités Codex si elle existe, sinon une petite table locale.
3. **Frontend** : consommer `{kind:"activity", phase:"drafting", tool}` et l'afficher avec une révélation à 200 ms (si le vrai `tool_use` complet arrive avant 200 ms, ne rien afficher — évite le clignotement pour les tool calls rapides), pattern identique à Hermes Desktop.
4. **Tests** : ajouter un cas dans la suite `claude_parse` (déjà riche en fixtures `stream_event`, cf. L798+) qui rejoue `content_block_start` (input vide) → vérifie l'event `activity/drafting` → puis `content_block_delta`/message `assistant` complet ne doit pas dupliquer l'event.

Effort estimé : petit (une branche de parsing + mapping de verbes + un composant/état UI déjà largement en place pour les autres activités « inProgress »). Pas de changement de spawn, pas de nouveau flag CLI.

## Recommandation

- **Claude : GO.** Signal réel et mesuré (~780 ms d'écart sur cet essai) entre le nom d'outil connu et l'input complet ; flag déjà actif ; coût d'implémentation faible (parsing + mapping de verbe + reveal 200 ms).
- **Codex : NO-GO** pour l'instant — le protocole ACP actuel ne fournit pas de sous-événement « nom d'outil connu avant arguments » ; `item/started` livre déjà l'item complet. Revisiter seulement si Codex introduit un événement de rédaction incrémentale ; en attendant, une mesure live du délai raisonnement→`item/started` resterait informative pour le debug de latence perçue mais ne débloquerait pas ce signal spécifique.

## Implémentation (2026-08-22, Claude livré — autres providers : renoncement documenté)

**Livré (Claude seul)** :
- `claude_parse.rs` : branche `content_block_start` type `tool_use` → event
  éphémère `{kind:"drafting", tool}` ; l'état `drafting_tool` est consommé au
  bloc `assistant` complet (le `tool_update` running le remplace). Test :
  `content_block_start_tool_use_emet_le_verbe_de_redaction`.
- `atelier-harness/kinds.rs` : `drafting` ajouté aux ÉPHÉMÈRES (jamais
  journalisé, même chemin que `delta`).
- Front : `ws.ts` (type), `harnessEvents.ts` (no-op strict dans le fil),
  `App.tsx` (route vers le canal `liveNotes` du tour actif), `turnParts.tsx`
  (révélation `NOTE_REVEAL_MS = 200` dans `Working`), i18n fr/en
  `chat.activity-drafting` (« prépare l'appel {tool}… » / « drafting {tool}
  call… »).

**Renoncement documenté — vérifié par lecture des parseurs le 2026-08-22** :

| Provider | Preuve (ligne) | Constat |
|---|---|---|
| Codex | `codex_parse.rs` (`map_turn_notification`) | `item/started` porte l'item déjà formé (`item.command` présent) — pas de paire (start vide → deltas → complet) |
| Grok | `grok_parse.rs:80-104` | `tool_call` ACP arrive avec `title` + `rawInput` déjà remplis ; émet directement `tool_update` running |
| Kimi | `kimi_map.rs:68` (`acp_map::tool_call_event`) | même chemin ACP partagé que Grok — item complet à l'arrivée |
| OpenCode | `opencode_parse.rs:32-64` | le part `tool` arrive avec son `state` formé (`title`, `input`) |

Ce n'est pas un manque côté Atelier mais une différence d'architecture : le
core Hermes parle directement aux API providers et voit le stream brut des
arguments ; Atelier orchestre des CLIs qui n'exposent ce flux que pour
Claude (`--include-partial-messages`, déjà actif). L'UI étant générique
(event neutre + canal `liveNotes`), le jour où un CLI/protocole expose un
signal amont, une branche de parsing suffit — zéro changement front.

**Cas limite connu, non traité volontairement** : l'état `pending` d'OpenCode
(appel enregistré, exécution non commencée) est transmis comme `running`.
Sémantiquement différent du drafting (l'agent a fini de générer) — à
revisiter seulement si l'usage réel montre l'état traîner à l'écran.
