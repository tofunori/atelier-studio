# Consignes de réponse — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'activer sur un fil de conversation une consigne de ton/forme réutilisable, réémise à chaque tour, éditable dans les réglages.

**Architecture:** Le catalogue des consignes vit dans les réglages frontend (`Settings`). Le fil porte une **copie** du texte actif dans `Thread.extra.consigne`. Le runtime lit cette copie et la pose sur `SendRequest.consigne`; l'adaptateur claude la passe en `--append-system-prompt`, l'adaptateur codex l'injecte en tête des items d'entrée; les trois autres l'ignorent.

**Tech Stack:** Rust (axum/tokio, crates `atelier-providers`, `atelier-runtime`, `atelier-store`), React + TypeScript (Vite), tests `cargo test` et `vitest`.

**Spec:** `docs/superpowers/specs/2026-09-01-consignes-reponse-design.md`

## Global Constraints

- **Rust-first** : tout backend en Rust. Aucun ajout dans `sidecar/*.mjs`.
- **Système de design contraignant** (`CLAUDE.md`) : tailles de texte 10/11/12/13/15 px ; poids 400/500/600 ; rayons 6/10/999 ; espacements multiples de 4 ; couleurs uniquement via variables CSS, jamais de hex en dur ; icônes SVG monochromes `stroke-width` 1.3–1.5 ; aucun emoji ; transitions 120–150 ms.
- **Pas de `<button>` nu** hors `src/components/ui/` et `src/components/shadcn/` — utiliser `Button`, `IconButton` ou `RowButton`. Verrouillé par `src/components/ui/css-contract.test.ts`.
- **L'état actif de la consigne n'utilise aucune couleur d'accent** : fond plein `--bg-ctl`. (Décision produit du 2026-09-01, contre l'usage habituel de l'app.)
- **Largeur de la pilule plafonnée à 132 px**, `text-overflow: ellipsis`.
- **Nom d'une consigne : 24 caractères maximum.**
- Après toute modification : `npx tsc --noEmit` et `npx vite build` doivent passer (ignorer `src/test_auto_review*.ts`).
- Ne pas pusher. Commits locaux uniquement.
- Langue du code et des commentaires : français, comme le reste des crates.

---

### Task 1 : le champ `consigne` sur `SendRequest`, et claude qui l'envoie

Ajoute le canal de transport et le premier consommateur. Les 20 autres sites de construction de `SendRequest` reçoivent `consigne: None` — c'est mécanique, mais le compilateur les impose tous.

**Files:**
- Modify: `rust/crates/atelier-providers/src/traits.rs:22-51`
- Modify: `rust/crates/atelier-providers/src/claude.rs:211-340` (`build_args`)
- Test: `rust/crates/atelier-providers/src/claude.rs` (module `mod tests`, près de `build_args`)
- Modify (mécanique, `consigne: None`) : `claude.rs:902`, `claude.rs:1091`, `claude.rs:1254`, `codex.rs:1244`, `codex.rs:1525`, `grok.rs:1820`, `grok.rs:2020`, `kimi.rs:1511`, `kimi.rs:1819`, `kimi.rs:1902`, `kimi.rs:2076`, `opencode.rs:1036`, `fake.rs:104`, `atelier-runtime/src/send.rs:1110`, `send.rs:1422`, `ws_router.rs:3466`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: `SendRequest.consigne: Option<String>` — texte brut de la consigne, sans balise, `None` si aucune consigne active. Consommé par les tâches 2, 3 et 4.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `rust/crates/atelier-providers/src/claude.rs`, module `mod tests` (celui qui contient `fn req`), ajouter :

```rust
    /// La consigne de fil part en prompt système : invisible dans le fil,
    /// et présente AUSSI sur un tour de reprise — un `--resume` qui perdrait
    /// la consigne serait un bogue silencieux (le ton change sans raison
    /// visible au deuxième message).
    #[test]
    fn la_consigne_part_en_prompt_systeme_y_compris_sur_une_reprise() {
        let mut r = req(Some(SESSION), false);
        r.consigne = Some("Réponds directement, sans préambule.".into());
        let args = build_args(&r, None);

        let i = args
            .iter()
            .position(|a| a == "--append-system-prompt")
            .expect(&format!("drapeau absent — {args:?}"));
        assert_eq!(args[i + 1], "Réponds directement, sans préambule.");
        assert!(
            args.contains(&"--resume".to_string()),
            "ce tour est bien une reprise — {args:?}",
        );
    }

    /// Pas de consigne, pas de drapeau : un `--append-system-prompt` vide
    /// écraserait le comportement par défaut du CLI.
    #[test]
    fn sans_consigne_aucun_prompt_systeme() {
        let args = build_args(&req(None, false), None);
        assert!(!args.iter().any(|a| a == "--append-system-prompt"), "{args:?}");
    }

    /// Une consigne blanche vaut pas de consigne.
    #[test]
    fn une_consigne_blanche_est_ignoree() {
        let mut r = req(None, false);
        r.consigne = Some("   \n ".into());
        let args = build_args(&r, None);
        assert!(!args.iter().any(|a| a == "--append-system-prompt"), "{args:?}");
    }
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
cd rust && cargo test -p atelier-providers consigne 2>&1 | tail -20
```

Attendu : erreur de compilation `no field 'consigne' on type 'SendRequest'`.

- [ ] **Step 3: Ajouter le champ à la structure**

Dans `rust/crates/atelier-providers/src/traits.rs`, à la fin de `pub struct SendRequest` (juste avant `pub atelier_mcp`) :

```rust
    /// Consigne du fil : instruction de ton/forme choisie par l'utilisateur,
    /// RÉÉMISE À CHAQUE TOUR. Aucun CLI ne la retient d'un tour à l'autre.
    /// Texte brut, sans balise — chaque adaptateur choisit son enveloppe.
    /// `None` = aucune consigne active sur ce fil.
    pub consigne: Option<String>,
```

- [ ] **Step 4: Réparer les 16 sites de construction**

Le compilateur les liste. Ajouter `consigne: None,` dans chacun (ordre : juste avant `atelier_mcp`). Sites attendus :

```
claude.rs:902  claude.rs:1091  claude.rs:1254
codex.rs:1244  codex.rs:1525
grok.rs:1820   grok.rs:2020
kimi.rs:1511   kimi.rs:1819   kimi.rs:1902   kimi.rs:2076
opencode.rs:1036   fake.rs:104
send.rs:1110   send.rs:1422   ws_router.rs:3466
```

Vérifier qu'aucun n'a été oublié :

```bash
cd rust && cargo check --workspace 2>&1 | tail -5
```

- [ ] **Step 5: Implémenter dans `build_args`**

Dans `rust/crates/atelier-providers/src/claude.rs`, à l'intérieur de `build_args`, juste après le bloc qui pousse `--effort` (vers la ligne 267, avant le bloc `--resume`) :

```rust
    // Consigne du fil : prompt système ajouté, pas substitué — le préréglage
    // `claude_code` du CLI reste en place.
    if let Some(consigne) = req
        .consigne
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty())
    {
        args.push("--append-system-prompt".into());
        args.push(consigne.to_string());
    }
```

- [ ] **Step 6: Lancer les tests, vérifier qu'ils passent**

```bash
cd rust && cargo test -p atelier-providers 2>&1 | tail -15
```

Attendu : `test result: ok`, les trois nouveaux tests inclus.

- [ ] **Step 7: Commit**

```bash
git add rust/crates/atelier-providers rust/crates/atelier-runtime
git commit -m "feat(consignes): champ consigne sur SendRequest, claude en prompt système"
```

---

### Task 2 : codex — la consigne en tête des items d'entrée

**Piège central de cette tâche.** `build_input` n'utilise `prompt` que dans sa branche de repli : si `req.inputs` est non vide (image, mention, skill), un préfixe posé sur `req.prompt` disparaîtrait sans bruit. On change donc la signature pour qu'elle prenne `&SendRequest` — les quatre sites d'appel héritent alors de la consigne **par construction**, et il devient impossible d'en oublier un.

**Files:**
- Modify: `rust/crates/atelier-providers/src/codex.rs:265-300` (`build_input`)
- Modify: `rust/crates/atelier-providers/src/codex.rs:790`, `:815`, `:849`, `:1030` (sites d'appel)
- Test: `rust/crates/atelier-providers/src/codex.rs` (module de tests)

**Interfaces:**
- Consumes: `SendRequest.consigne: Option<String>` (Task 1).
- Produces: `fn build_input(req: &SendRequest) -> Value` — signature réduite à un seul paramètre. Aucune autre tâche n'en dépend.

- [ ] **Step 1: Écrire le test qui échoue**

Dans le module de tests de `codex.rs` (celui qui contient `fn request(effort: &str, fast_mode: bool)`) :

```rust
    /// La consigne doit survivre à la présence d'`inputs` : `build_input`
    /// ignore `prompt` dès qu'il y a une image, une mention ou un skill.
    /// Un préfixe posé sur le prompt disparaîtrait dans ce cas — silencieusement.
    #[test]
    fn la_consigne_est_en_tete_avec_et_sans_inputs() {
        let mut sans = request("medium", false);
        sans.prompt = "salut".into();
        sans.inputs = None;
        sans.consigne = Some("Réponds directement.".into());
        let items = build_input(&sans);
        let items = items.as_array().expect("tableau d'items");
        assert_eq!(items.len(), 2, "consigne + message — {items:?}");
        assert!(
            items[0]["text"]
                .as_str()
                .unwrap()
                .contains("<consigne-atelier>"),
            "la consigne vient en premier — {items:?}",
        );
        assert_eq!(items[1]["text"], "salut");

        let mut avec = request("medium", false);
        avec.prompt = "ignoré quand inputs est plein".into();
        avec.inputs = Some(vec![serde_json::json!({
            "type": "mention", "name": "note.md", "path": "/tmp/note.md",
        })]);
        avec.consigne = Some("Réponds directement.".into());
        let items = build_input(&avec);
        let items = items.as_array().expect("tableau d'items");
        assert!(
            items[0]["text"]
                .as_str()
                .unwrap_or_default()
                .contains("Réponds directement."),
            "consigne perdue dès qu'il y a des inputs — {items:?}",
        );
        assert_eq!(items[1]["type"], "mention");
    }

    /// Sans consigne, la charge utile est exactement celle d'avant.
    #[test]
    fn sans_consigne_les_items_sont_inchanges() {
        let mut r = request("medium", false);
        r.prompt = "salut".into();
        r.inputs = None;
        r.consigne = None;
        let items = build_input(&r);
        assert_eq!(
            items,
            serde_json::json!([{ "type": "text", "text": "salut", "text_elements": [] }]),
        );
    }
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
cd rust && cargo test -p atelier-providers consigne 2>&1 | tail -20
```

Attendu : erreur de compilation — `build_input` prend encore deux arguments.

- [ ] **Step 3: Changer la signature et injecter la consigne**

Remplacer l'en-tête et la fin de `build_input` (`codex.rs:265` et `:294-299`). L'en-tête devient :

```rust
/// Items d'entrée d'un tour codex. Prend la requête entière (et non
/// `prompt` + `inputs`) pour que la consigne du fil ne puisse pas être
/// oubliée sur l'un des quatre sites d'appel : le compilateur l'impose.
fn build_input(req: &SendRequest) -> Value {
    let prompt = req.prompt.as_str();
    let inputs = req.inputs.as_deref();
```

Le corps intermédiaire (la chaîne `filter_map` sur `clean`) ne change pas. La fin devient :

```rust
    let mut items = if clean.is_empty() {
        vec![json!({ "type": "text", "text": prompt, "text_elements": [] })]
    } else {
        clean
    };
    // codex n'a pas d'équivalent d'`--append-system-prompt` : la consigne
    // voyage en tête des items, balisée pour rester lisible dans le rollout.
    if let Some(texte) = req
        .consigne
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty())
    {
        items.insert(
            0,
            json!({
                "type": "text",
                "text": format!("<consigne-atelier>\n{texte}\n</consigne-atelier>"),
                "text_elements": [],
            }),
        );
    }
    Value::Array(items)
}
```

- [ ] **Step 4: Réparer les quatre sites d'appel**

Aux lignes 790, 815, 849 et 1030, remplacer `build_input(&req.prompt, req.inputs.as_deref())` par `build_input(&req)`.

```bash
cd rust && grep -n "build_input(" crates/atelier-providers/src/codex.rs
```

Attendu : la définition plus quatre appels, tous en `build_input(&req)`.

- [ ] **Step 5: Lancer les tests, vérifier qu'ils passent**

```bash
cd rust && cargo test -p atelier-providers 2>&1 | tail -15
```

Attendu : `test result: ok`.

- [ ] **Step 6: Commit**

```bash
git add rust/crates/atelier-providers/src/codex.rs
git commit -m "feat(consignes): codex reçoit la consigne en tête des items d'entrée"
```

---

### Task 3 : les trois autres CLIs ne fuient rien

grok, kimi et opencode n'ont pas de mécanisme prévu. Le contrat est qu'une consigne posée sur `SendRequest` **ne modifie rien** chez eux — plutôt que d'être injectée au hasard dans un prompt.

**Files:**
- Test: `rust/crates/atelier-providers/src/grok.rs` (module de tests), `kimi.rs`, `opencode.rs`

**Interfaces:**
- Consumes: `SendRequest.consigne` (Task 1).
- Produces: rien.

- [ ] **Step 1: Trouver le point de mesure dans chaque adaptateur**

Pour chaque fichier, repérer la fonction **pure** qui construit la charge
utile envoyée au CLI (celle qui rend un `Value` ou une `String` à partir de
la `SendRequest`, sans I/O). C'est le seul endroit où une fuite serait
observable en test.

```bash
cd rust && grep -n "fn .*(req: &SendRequest\|fn .*(req: &crate::traits::SendRequest" \
  crates/atelier-providers/src/grok.rs \
  crates/atelier-providers/src/kimi.rs \
  crates/atelier-providers/src/kimi_map.rs \
  crates/atelier-providers/src/opencode.rs
```

Noter le nom et la signature retenus pour chaque fichier. **Si un fichier
n'expose aucune fonction pure**, ne pas le refactorer pour l'occasion :
l'écrire dans le message de commit et passer au suivant.

- [ ] **Step 2: Écrire un test par adaptateur couvert**

Modèle, à instancier avec la fonction réellement trouvée à l'étape 1
(ici `construire_charge` et le helper de requête local du fichier) :

```rust
    /// grok n'a pas de mécanisme de consigne en v1 : une consigne posée sur
    /// la requête ne doit modifier AUCUNE charge utile — plutôt qu'être
    /// injectée au hasard dans un prompt. Le jour où on l'implémente, ce
    /// test tombe : c'est le signal d'écrire le vrai.
    #[test]
    fn une_consigne_ne_fuit_pas_dans_la_charge_grok() {
        let sans = request(/* mêmes arguments que les tests voisins */);
        let mut avec = request(/* idem */);
        avec.consigne = Some("Réponds directement.".into());
        assert_eq!(
            construire_charge(&sans),
            construire_charge(&avec),
            "la consigne a fui dans la charge grok",
        );
    }
```

Répéter pour `kimi` et `opencode` en adaptant le nom de la fonction et du
helper de requête.

- [ ] **Step 3: Lancer les tests**

```bash
cd rust && cargo test -p atelier-providers fuit 2>&1 | tail -10
```

Attendu : PASS d'emblée — ce sont des tests de non-régression, verts dès
l'écriture. **Si l'un échoue**, c'est qu'un adaptateur lit déjà `consigne` :
s'arrêter et le signaler, ne pas « réparer » en modifiant le test.

- [ ] **Step 4: Commit**

```bash
git add rust/crates/atelier-providers
git commit -m "test(consignes): verrouiller l'absence de fuite chez grok/kimi/opencode"
```

---

### Task 4 : le runtime lit la consigne portée par le fil

**Files:**
- Modify: `rust/crates/atelier-runtime/src/send.rs` (nouvelle fonction + les deux sites `SendRequest`, `:1110` et `:1422`)
- Test: `rust/crates/atelier-runtime/src/send.rs` (module de tests)

**Interfaces:**
- Consumes: `SendRequest.consigne` (Task 1) ; `Thread.extra` (`atelier-store`).
- Produces: `fn consigne_du_fil(previous: Option<&atelier_store::Thread>) -> Option<String>` — lit `extra.consigne.texte`, rend `None` si absent, vide ou blanc.

- [ ] **Step 1: Écrire le test qui échoue**

Dans le module de tests de `send.rs` :

```rust
    fn fil_avec(extra: serde_json::Value) -> atelier_store::Thread {
        let mut base = serde_json::json!({
            "id": "t1", "projectRoot": "/tmp", "provider": "claude",
            "title": "essai", "status": "idle",
            "updatedAt": "2026-09-01T00:00:00Z", "createdAt": "2026-09-01T00:00:00Z",
        });
        let (serde_json::Value::Object(base_map), serde_json::Value::Object(extra_map)) =
            (&mut base, extra)
        else {
            panic!("objets attendus");
        };
        base_map.extend(extra_map);
        serde_json::from_value(base).expect("Thread désérialisable")
    }

    #[test]
    fn la_consigne_du_fil_est_lue_depuis_extra() {
        let fil = fil_avec(serde_json::json!({
            "consigne": { "id": "concis", "texte": "Réponds directement." },
        }));
        assert_eq!(
            consigne_du_fil(Some(&fil)).as_deref(),
            Some("Réponds directement."),
        );
    }

    #[test]
    fn un_fil_sans_consigne_ou_avec_un_texte_vide_ne_donne_rien() {
        assert_eq!(consigne_du_fil(None), None);
        assert_eq!(consigne_du_fil(Some(&fil_avec(serde_json::json!({})))), None);
        let vide = fil_avec(serde_json::json!({
            "consigne": { "id": "concis", "texte": "  " },
        }));
        assert_eq!(consigne_du_fil(Some(&vide)), None);
    }
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
cd rust && cargo test -p atelier-runtime consigne 2>&1 | tail -20
```

Attendu : `cannot find function 'consigne_du_fil'`.

- [ ] **Step 3: Implémenter la lecture**

Dans `rust/crates/atelier-runtime/src/send.rs`, à côté des autres helpers de lecture d'`extra` (près de la fonction qui lit `forkPending`) :

```rust
/// Consigne portée par le fil (`extra.consigne.texte`). Le fil stocke une
/// COPIE du texte, pas seulement l'identifiant : modifier ou supprimer une
/// consigne du catalogue ne doit pas réécrire le sens d'une conversation
/// déjà en cours. Le frontend rafraîchit cette copie à chaque envoi.
fn consigne_du_fil(previous: Option<&atelier_store::Thread>) -> Option<String> {
    previous?
        .extra
        .get("consigne")?
        .get("texte")?
        .as_str()
        .map(str::trim)
        .filter(|texte| !texte.is_empty())
        .map(str::to_string)
}
```

- [ ] **Step 4: Câbler les deux sites de construction**

Dans le `SendRequest` du tour normal (`send.rs:1422`), remplacer `consigne: None,` par :

```rust
            consigne: consigne_du_fil(previous.as_ref()),
```

Dans le `SendRequest` du chemin steer (`send.rs:1110`), même remplacement :

```rust
                consigne: consigne_du_fil(previous.as_ref()),
```

(Le steer claude n'y passe pas — il est intercepté vers le tour normal en `send.rs:1063-1077` — mais les autres providers oui, et le champ doit être juste partout.)

- [ ] **Step 5: Lancer les tests, vérifier qu'ils passent**

```bash
cd rust && cargo test -p atelier-runtime 2>&1 | tail -15
```

Attendu : `test result: ok`.

- [ ] **Step 6: Commit**

```bash
git add rust/crates/atelier-runtime/src/send.rs
git commit -m "feat(consignes): le runtime lit extra.consigne et la pose sur la requête"
```

---

### Task 5 : `upsertThread` persiste la consigne sans écraser le reste

Le frontend écrira `extra.consigne` par le message WebSocket `upsertThread`. La fusion est *shallow* au niveau racine et `extra` est `#[serde(flatten)]` : ce test le prouve pour la consigne, sur le modèle de `upsert_thread_persiste_les_champs_kb`.

**Files:**
- Test: `rust/crates/atelier-runtime/src/ws_router.rs` (module de tests, à côté de `upsert_thread_persiste_les_champs_kb:4326`)

**Interfaces:**
- Consumes: le message WS `upsertThread` existant.
- Produces: contrat vérifié — `{"type":"upsertThread","thread":{"id":…,"consigne":{"id":…,"texte":…}}}` persiste, et un patch ultérieur portant d'autres champs ne l'efface pas.

- [ ] **Step 1: Écrire le test**

```rust
    #[tokio::test]
    async fn upsert_thread_persiste_la_consigne_et_survit_a_un_patch_partiel() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        let msg = json!({"type": "upsertThread", "thread": {
            "id": "t-consigne", "provider": "claude",
            "consigne": { "id": "concis", "texte": "Réponds directement." },
        }});
        route_ws(&s, &msg.to_string()).await;

        // Patch sans rapport : la consigne doit survivre au merge.
        let rename = json!({"type": "upsertThread", "thread": {
            "id": "t-consigne", "title": "Renommé",
        }});
        let out = route_ws(&s, &rename.to_string()).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        let thread = v["threads"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["id"] == "t-consigne")
            .expect("thread présent");
        assert_eq!(thread["title"], "Renommé");
        assert_eq!(thread["consigne"]["texte"], "Réponds directement.");

        // Retrait explicite : null efface.
        let retrait = json!({"type": "upsertThread", "thread": {
            "id": "t-consigne", "consigne": null,
        }});
        let out = route_ws(&s, &retrait.to_string()).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        let thread = v["threads"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["id"] == "t-consigne")
            .unwrap();
        assert!(
            thread["consigne"].is_null(),
            "le retrait doit effacer la consigne — {thread}",
        );
    }
```

- [ ] **Step 2: Lancer le test**

```bash
cd rust && cargo test -p atelier-runtime upsert_thread_persiste_la_consigne 2>&1 | tail -20
```

Attendu : PASS. **Si le troisième bloc échoue** (le `null` n'efface pas), c'est que la fusion ignore les valeurs nulles : adapter le frontend de la Task 7 pour écrire `{"consigne": null}` ou un objet vide selon ce que le merge accepte réellement, et corriger l'assertion pour décrire le comportement réel. Ne pas modifier `upsert` — d'autres champs en dépendent.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/atelier-runtime/src/ws_router.rs
git commit -m "test(consignes): upsertThread persiste extra.consigne"
```

---

### Task 6 : le catalogue dans les réglages frontend

`saveSettings` écrase `settings.json` avec le miroir typé complet : une clé absente du type `Settings` serait effacée au premier enregistrement. Le catalogue vit donc côté TypeScript.

**Files:**
- Modify: `src/lib/settings.ts` (type `Settings`, `DEFAULT_SETTINGS`)
- Create: `src/lib/consignes.ts`
- Test: `src/lib/consignes.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type Consigne = { id: string; nom: string; description: string; texte: string; livree?: boolean }`
  - `CONSIGNES_LIVREES: Consigne[]` (quatre entrées)
  - `NOM_MAX = 24`
  - `normaliserNom(nom: string): string` — coupe à 24 caractères
  - `nouvelId(existants: Consigne[]): string` — identifiant libre, forme `c1`, `c2`, …
  - `Settings.consignes: Consigne[]`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/consignes.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { CONSIGNES_LIVREES, NOM_MAX, normaliserNom, nouvelId } from "./consignes";
import { DEFAULT_SETTINGS } from "./settings";

describe("consignes", () => {
  it("livre quatre consignes, toutes marquées livree", () => {
    expect(CONSIGNES_LIVREES).toHaveLength(4);
    expect(CONSIGNES_LIVREES.every((c) => c.livree)).toBe(true);
    expect(CONSIGNES_LIVREES.map((c) => c.id)).toEqual([
      "concis",
      "pedagogique",
      "rigueur",
      "quebecois",
    ]);
  });

  it("garde les noms sous le plafond d'affichage de la pilule", () => {
    for (const c of CONSIGNES_LIVREES) {
      expect(c.nom.length).toBeLessThanOrEqual(NOM_MAX);
      expect(c.texte.trim()).not.toBe("");
      expect(c.description.trim()).not.toBe("");
    }
  });

  it("coupe un nom trop long au lieu de le refuser", () => {
    expect(normaliserNom("  Rigueur scientifique appliquée  ")).toBe(
      "Rigueur scientifique app",
    );
    expect(normaliserNom("Concis")).toBe("Concis");
  });

  it("choisit un identifiant libre", () => {
    expect(nouvelId([])).toBe("c1");
    expect(nouvelId([{ id: "c1", nom: "a", description: "", texte: "x" }])).toBe("c2");
  });

  it("expose les consignes livrées comme défaut des réglages", () => {
    expect(DEFAULT_SETTINGS.consignes).toEqual(CONSIGNES_LIVREES);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/lib/consignes.test.ts 2>&1 | tail -15
```

Attendu : `Failed to resolve import "./consignes"`.

- [ ] **Step 3: Créer le module**

Créer `src/lib/consignes.ts` :

```ts
/** Instruction de ton/forme réutilisable, activable sur un fil. */
export type Consigne = {
  id: string;
  nom: string;
  description: string;
  texte: string;
  /** Livrée avec l'app : modifiable, non supprimable. */
  livree?: boolean;
};

/** Ce que le fil retient : l'identifiant ET une copie du texte envoyé. */
export type ConsigneDuFil = { id: string; texte: string };

/** Plafond du nom — la pilule du composeur est bornée à 132 px. */
export const NOM_MAX = 24;

export function normaliserNom(nom: string): string {
  return nom.trim().slice(0, NOM_MAX);
}

export function nouvelId(existants: Consigne[]): string {
  const pris = new Set(existants.map((c) => c.id));
  for (let n = 1; ; n += 1) {
    const id = `c${n}`;
    if (!pris.has(id)) return id;
  }
}

export const CONSIGNES_LIVREES: Consigne[] = [
  {
    id: "concis",
    nom: "Concis",
    description: "Réponse directe, sans préambule ni récapitulatif.",
    texte: [
      "Réponds directement à la question posée.",
      "Pas de préambule, pas de reformulation de la demande, pas de récapitulatif final.",
      "Une phrase suffit quand une phrase suffit.",
    ].join("\n"),
    livree: true,
  },
  {
    id: "pedagogique",
    nom: "Pédagogique",
    description: "Décompose du concret vers le technique, comme un prof.",
    texte: [
      "Décompose le sujet en morceaux simples, puis monte du très concret vers le technique.",
      "Définis chaque terme la première fois qu'il apparaît.",
      "Donne un exemple chiffré avant la formule générale.",
    ].join("\n"),
    livree: true,
  },
  {
    id: "rigueur",
    nom: "Rigueur scientifique",
    description: "Chiffre, cite, distingue mesuré de supposé.",
    texte: [
      "Distingue toujours ce qui est mesuré de ce qui est supposé.",
      "Donne les incertitudes quand elles existent.",
      "Ne présente jamais une corrélation comme une cause.",
      "Si une affirmation vient d'une source, nomme-la.",
    ].join("\n"),
    livree: true,
  },
  {
    id: "quebecois",
    nom: "Français québécois",
    description: "Norme OQLF, typographie canadienne-française.",
    texte: [
      "Écris en français québécois selon la norme de l'OQLF.",
      "Évite les anglicismes et les calques de l'anglais.",
      "Applique la typographie canadienne-française : pas d'espace avant les deux-points en usage courant, guillemets français.",
    ].join("\n"),
    livree: true,
  },
];
```

- [ ] **Step 4: Brancher sur les réglages**

Dans `src/lib/settings.ts`, en tête du fichier :

```ts
import { CONSIGNES_LIVREES, type Consigne } from "./consignes";
```

Dans le type `Settings`, à la fin (après `railMoreOpen`) :

```ts
  /** Catalogue des consignes de réponse (le fil actif en porte une copie). */
  consignes: Consigne[];
```

Dans `DEFAULT_SETTINGS`, à la fin :

```ts
  consignes: CONSIGNES_LIVREES,
```

- [ ] **Step 5: Lancer les tests et le typage**

```bash
npx vitest run src/lib/consignes.test.ts 2>&1 | tail -10 && npx tsc --noEmit 2>&1 | grep -v test_auto_review | tail -10
```

Attendu : tests verts, aucune erreur de typage.

- [ ] **Step 6: Commit**

```bash
git add src/lib/consignes.ts src/lib/consignes.test.ts src/lib/settings.ts
git commit -m "feat(consignes): catalogue et quatre consignes livrées dans les réglages"
```

---

### Task 7 : le déclencheur, le menu et la pilule dans le composeur

**Files:**
- Create: `src/components/chat/ConsigneMenu.tsx`
- Create: `src/components/chat/ConsigneMenu.test.tsx`
- Modify: `src/components/ui/DropdownMenuSurface.tsx` (prop `footer`)
- Modify: `src/components/chat/ComposerControls.tsx` (groupe de gauche)
- Modify: `src/App.css` (styles `.consigne-*`)
- Test: `src/components/ui/css-contract.test.ts`

**Interfaces:**
- Consumes: `Consigne`, `ConsigneDuFil`, `CONSIGNES_LIVREES` (Task 6) ; `DropdownMenuSurface`.
- Produces: composant

```tsx
ConsigneMenu(props: {
  consignes: Consigne[];
  actif: ConsigneDuFil | null;
  provider: string;
  onChoisir: (choix: ConsigneDuFil | null) => void;
  onOuvrirReglages: () => void;
})
```

  et la constante exportée `PROVIDERS_AVEC_CONSIGNE = ["claude", "codex"]`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/chat/ConsigneMenu.test.tsx` :

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsigneMenu } from "./ConsigneMenu";
import { CONSIGNES_LIVREES } from "../../lib/consignes";

const base = {
  consignes: CONSIGNES_LIVREES,
  provider: "claude",
  onChoisir: () => {},
  onOuvrirReglages: () => {},
};

describe("ConsigneMenu", () => {
  it("n'affiche aucun libellé tant qu'aucune consigne n'est active", () => {
    render(<ConsigneMenu {...base} actif={null} />);
    expect(screen.queryByText("Concis")).toBeNull();
  });

  it("affiche le nom de la consigne active dans la pilule", () => {
    render(<ConsigneMenu {...base} actif={{ id: "concis", texte: "x" }} />);
    expect(screen.getByText("Concis")).toBeTruthy();
  });

  it("envoie l'identifiant ET une copie du texte au choix", () => {
    const onChoisir = vi.fn();
    render(<ConsigneMenu {...base} actif={null} onChoisir={onChoisir} />);
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    fireEvent.click(screen.getByText("Rigueur scientifique"));
    expect(onChoisir).toHaveBeenCalledWith({
      id: "rigueur",
      texte: CONSIGNES_LIVREES[2].texte,
    });
  });

  it("rend null quand le fil retire la consigne", () => {
    const onChoisir = vi.fn();
    render(
      <ConsigneMenu {...base} actif={{ id: "concis", texte: "x" }} onChoisir={onChoisir} />,
    );
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    fireEvent.click(screen.getByText("Aucune"));
    expect(onChoisir).toHaveBeenCalledWith(null);
  });

  it("garde le fil fonctionnel quand la consigne a disparu du catalogue", () => {
    render(<ConsigneMenu {...base} actif={{ id: "disparue", texte: "x" }} />);
    expect(screen.getByText("(supprimée)")).toBeTruthy();
  });

  it("est éteint sur un CLI sans mécanisme prévu", () => {
    render(<ConsigneMenu {...base} provider="grok" actif={null} />);
    expect(screen.getByLabelText("Consigne du fil")).toHaveAttribute("disabled");
  });

  it("dit comment la consigne est appliquée sur le CLI courant", () => {
    const { rerender } = render(<ConsigneMenu {...base} actif={null} />);
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    expect(screen.getByText(/invisible dans le fil/)).toBeTruthy();
    rerender(<ConsigneMenu {...base} provider="codex" actif={null} />);
    expect(screen.getByText(/en tête de chaque message/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/components/chat/ConsigneMenu.test.tsx 2>&1 | tail -12
```

Attendu : `Failed to resolve import "./ConsigneMenu"`.

- [ ] **Step 3: Ajouter la prop `footer` au menu partagé**

Dans `src/components/ui/DropdownMenuSurface.tsx`, ajouter à la signature des props :

```tsx
  /** Ligne de pied non cliquable — contexte, jamais une action. */
  footer?: ReactNode
```

et la rendre après la liste des items, dans le même conteneur que `header`, avec la classe `dropdown-surface-footer`.

- [ ] **Step 4: Écrire le composant**

Créer `src/components/chat/ConsigneMenu.tsx` :

```tsx
import { useState } from "react";
import { DropdownMenuSurface } from "../ui/DropdownMenuSurface";
import { RowButton } from "../ui/RowButton";
import type { Consigne, ConsigneDuFil } from "../../lib/consignes";

/** CLIs qui savent porter une consigne (plan du 2026-09-01). */
export const PROVIDERS_AVEC_CONSIGNE = ["claude", "codex"];

const PIEDS: Record<string, string> = {
  claude: "Sur claude : appliquée en système, invisible dans le fil.",
  codex: "Sur codex : ajoutée en tête de chaque message.",
};

function GlypheConsigne() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
         strokeLinecap="round" aria-hidden="true">
      <circle cx="5" cy="7" r="1.4" />
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="5" cy="17" r="1.4" />
      <path d="M9.5 7H19M9.5 12H19M9.5 17H15" />
    </svg>
  );
}

export function ConsigneMenu(p: {
  consignes: Consigne[];
  actif: ConsigneDuFil | null;
  provider: string;
  onChoisir: (choix: ConsigneDuFil | null) => void;
  onOuvrirReglages: () => void;
}) {
  const [open, setOpen] = useState(false);
  const supporte = PROVIDERS_AVEC_CONSIGNE.includes(p.provider);
  const connue = p.actif ? p.consignes.find((c) => c.id === p.actif?.id) : undefined;
  // Une consigne retirée du catalogue laisse le fil fonctionnel : on le dit
  // au lieu d'afficher un nom vide ou de perdre l'état.
  const nom = p.actif ? (connue?.nom ?? "(supprimée)") : "";

  const items = [
    {
      key: "aucune",
      label: <span className="consigne-nom">Aucune</span>,
      onSelect: () => p.onChoisir(null),
    },
    ...p.consignes.map((c) => ({
      key: c.id,
      label: (
        <span className="consigne-option">
          <span className="consigne-nom">{c.nom}</span>
          <span className="consigne-desc">{c.description}</span>
        </span>
      ),
      onSelect: () => p.onChoisir({ id: c.id, texte: c.texte }),
    })),
    {
      key: "reglages",
      separatorBefore: true,
      label: <span className="consigne-lien">Modifier les consignes…</span>,
      onSelect: p.onOuvrirReglages,
    },
  ];

  return (
    <DropdownMenuSurface
      open={open}
      onOpenChange={setOpen}
      label="Consigne du fil"
      footer={PIEDS[p.provider]}
      align="start"
      items={items}
      trigger={
        <RowButton
          className={p.actif ? "consigne-pilule" : "consigne-trigger"}
          aria-label="Consigne du fil"
          title={
            supporte
              ? (connue?.nom ?? "Consigne du fil")
              : "Consigne : pas encore supportée sur ce CLI"
          }
          disabled={!supporte}>
          <GlypheConsigne />
          {p.actif ? <span className="consigne-pilule-nom">{nom}</span> : null}
        </RowButton>
      }
    />
  );
}
```

- [ ] **Step 5: Écrire les styles**

Dans `src/App.css`, à la suite des styles du composeur :

```css
/* Consigne du fil — l'état actif se lit au REMPLISSAGE, jamais à l'accent :
   décision produit 2026-09-01 (l'orange criait sur une barre déjà chargée).
   Un fond tient dans les deux thèmes, là où une bordure seule disparaît. */
.consigne-trigger { color: var(--muted); border-radius: 6px; }
.consigne-pilule {
  display: inline-flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 8px 0 7px;
  border-radius: 999px;
  background: var(--bg-ctl); color: var(--fg);
  font-size: 12px; font-weight: 500;
  max-width: 132px;
  transition: background 130ms ease;
}
.consigne-pilule-nom { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.consigne-option { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.consigne-nom { font-size: 13px; font-weight: 500; color: var(--fg); }
.consigne-desc { font-size: 11px; color: var(--muted); line-height: 1.35; }
.consigne-lien { font-size: 13px; color: var(--fg2); }

@media (max-width: 720px) {
  .consigne-pilule-nom { display: none; }
  .consigne-pilule { padding: 0 7px; }
}
```

- [ ] **Step 6: Brancher dans le composeur**

Dans `src/components/chat/ComposerControls.tsx`, dans le groupe de gauche, après l'`IconButton` de la base de connaissances (vers la ligne 291) :

```tsx
              <ConsigneMenu
                consignes={p.settings.consignes}
                actif={p.consigneDuFil}
                provider={p.provider}
                onChoisir={p.onChoisirConsigne}
                onOuvrirReglages={p.onOuvrirReglagesConsignes}
              />
```

Les quatre nouvelles props remontent jusqu'à `Chat.tsx`, qui écrit l'état du fil via le message WebSocket `upsertThread` :

```ts
  const onChoisirConsigne = (choix: ConsigneDuFil | null) => {
    // Le fil garde une COPIE du texte : si la consigne change ou disparaît
    // du catalogue, la conversation en cours ne change pas de sens.
    envoyer({ type: "upsertThread", thread: { id: threadId, consigne: choix } });
  };
```

Et **au moment de l'envoi d'un tour**, rafraîchir la copie depuis le catalogue si l'identifiant existe encore — c'est ce qui fait qu'une consigne modifiée s'applique au tour suivant :

```ts
  const consigneAJour = (actif: ConsigneDuFil | null): ConsigneDuFil | null => {
    if (!actif) return null;
    const c = settings.consignes.find((x) => x.id === actif.id);
    return c ? { id: c.id, texte: c.texte } : actif;
  };
```

- [ ] **Step 7: Verrouiller l'absence d'accent**

Dans `src/components/ui/css-contract.test.ts`, sur le modèle du test « les tabs Atelier restent compacts et neutres, sans accent de marque » (`css-contract.test.ts:684`) :

```ts
  it("la consigne active se lit au remplissage, jamais à l'accent de marque", () => {
    const bloc = appCss.match(/\.consigne-pilule \{[^}]*\}/)?.[0] ?? "";
    expect(bloc).toContain("var(--bg-ctl)");
    expect(bloc).not.toContain("--accent");
    expect(bloc).toContain("max-width: 132px");
  });
```

- [ ] **Step 8: Lancer les tests**

```bash
npx vitest run src/components/chat/ConsigneMenu.test.tsx src/components/ui/css-contract.test.ts src/components/ui/surfaces.test.tsx 2>&1 | tail -15
```

Attendu : tout vert.

- [ ] **Step 9: Vérifier le typage et le build**

```bash
npx tsc --noEmit 2>&1 | grep -v test_auto_review | tail -10 && npx vite build 2>&1 | tail -5
```

- [ ] **Step 10: Commit**

```bash
git add src/components/chat/ConsigneMenu.tsx src/components/chat/ConsigneMenu.test.tsx \
        src/components/chat/ComposerControls.tsx src/components/chat/Chat.tsx \
        src/components/ui/DropdownMenuSurface.tsx src/components/ui/css-contract.test.ts src/App.css
git commit -m "feat(consignes): déclencheur, menu et pilule dans le composeur"
```

---

### Task 8 : le rappel dans l'en-tête du fil

En remontant une conversation, on doit pouvoir expliquer pourquoi les réponses ont ce ton.

**Files:**
- Modify: `src/components/chat/ChatHeader.tsx`
- Test: `src/components/chat/ChatHeader.test.tsx`

**Interfaces:**
- Consumes: `ConsigneDuFil`, `Consigne[]` (Task 6).
- Produces: rien.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `src/components/chat/ChatHeader.test.tsx` :

```tsx
  it("rappelle la consigne active du fil", () => {
    render(<ChatHeader {...propsDeBase} consigneDuFil={{ id: "concis", texte: "x" }} />);
    expect(screen.getByTitle("Consigne du fil : Concis")).toBeTruthy();
  });

  it("n'affiche rien quand le fil n'a pas de consigne", () => {
    render(<ChatHeader {...propsDeBase} consigneDuFil={null} />);
    expect(screen.queryByText(/Consigne du fil/)).toBeNull();
  });
```

**Note :** reprendre le nom réel de l'objet de props de base du fichier de test existant à la place de `propsDeBase`.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/components/chat/ChatHeader.test.tsx 2>&1 | tail -12
```

- [ ] **Step 3: Implémenter**

Dans `ChatHeader.tsx`, ajouter les props `consigneDuFil: ConsigneDuFil | null` et `consignes: Consigne[]`, puis, à côté des autres marqueurs d'état du fil :

```tsx
      {p.consigneDuFil ? (
        <span
          className="chat-header-consigne"
          title={`Consigne du fil : ${
            p.consignes.find((c) => c.id === p.consigneDuFil?.id)?.nom ?? "(supprimée)"
          }`}>
          {p.consignes.find((c) => c.id === p.consigneDuFil?.id)?.nom ?? "(supprimée)"}
        </span>
      ) : null}
```

Style dans `App.css` :

```css
.chat-header-consigne { font-size: 11px; color: var(--muted); }
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/components/chat/ChatHeader.test.tsx 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatHeader.tsx src/components/chat/ChatHeader.test.tsx src/App.css
git commit -m "feat(consignes): rappel de la consigne dans l'en-tête du fil"
```

---

### Task 9 : l'éditeur dans les réglages

**Files:**
- Create: `src/components/settings/sections/Consignes.tsx`
- Create: `src/components/settings/sections/Consignes.test.tsx`
- Modify: `src/components/settings/sections.ts:6-13`
- Modify: le fichier de traductions (clé `settings.consignes`)
- Test: `src/components/settings/sections.test.ts`

**Interfaces:**
- Consumes: `Consigne`, `normaliserNom`, `nouvelId` (Task 6).
- Produces: section de réglages `consignes`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/settings/sections/Consignes.test.tsx` :

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Consignes } from "./Consignes";
import { CONSIGNES_LIVREES } from "../../../lib/consignes";

describe("réglages — consignes", () => {
  it("liste les consignes du catalogue", () => {
    render(<Consignes consignes={CONSIGNES_LIVREES} onChange={() => {}} />);
    expect(screen.getByText("Concis")).toBeTruthy();
    expect(screen.getByText("Français québécois")).toBeTruthy();
  });

  it("interdit de supprimer une consigne livrée", () => {
    render(<Consignes consignes={CONSIGNES_LIVREES} onChange={() => {}} />);
    fireEvent.click(screen.getByText("Concis"));
    expect(screen.queryByText("Supprimer")).toBeNull();
  });

  it("permet de supprimer une consigne personnelle", () => {
    const onChange = vi.fn();
    const mienne = { id: "c1", nom: "Ma règle", description: "d", texte: "t" };
    render(<Consignes consignes={[...CONSIGNES_LIVREES, mienne]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Ma règle"));
    fireEvent.click(screen.getByText("Supprimer"));
    expect(onChange).toHaveBeenCalledWith(CONSIGNES_LIVREES);
  });

  it("coupe un nom trop long à la saisie", () => {
    const onChange = vi.fn();
    const mienne = { id: "c1", nom: "Ma règle", description: "d", texte: "t" };
    render(<Consignes consignes={[mienne]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Ma règle"));
    fireEvent.change(screen.getByLabelText("Nom"), {
      target: { value: "Un nom vraiment beaucoup trop long" },
    });
    expect(onChange.mock.calls.at(-1)?.[0][0].nom).toBe("Un nom vraiment beaucoup");
  });

  it("crée une consigne vide avec un identifiant libre", () => {
    const onChange = vi.fn();
    render(<Consignes consignes={CONSIGNES_LIVREES} onChange={onChange} />);
    fireEvent.click(screen.getByText("Nouvelle consigne"));
    const ajoutee = onChange.mock.calls.at(-1)?.[0].at(-1);
    expect(ajoutee.id).toBe("c1");
    expect(ajoutee.livree).toBeUndefined();
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/components/settings/sections/Consignes.test.tsx 2>&1 | tail -12
```

- [ ] **Step 3: Écrire le composant**

Créer `src/components/settings/sections/Consignes.tsx` : deux panneaux (liste `196px` + formulaire), en suivant la structure et les primitives d'une section existante de `src/components/settings/sections/` — **lire d'abord une section voisine et en reprendre les primitives et les classes**, ne pas inventer de nouveaux styles de formulaire. Points imposés :

- liste : un `RowButton` par consigne, `RowButton` « Nouvelle consigne » en bas ;
- une consigne `livree` affiche un cadenas (SVG monochrome, stroke 1.4) et **pas** de bouton « Supprimer » ;
- champs `Nom` (via `normaliserNom` à chaque frappe), `Description`, `Consigne` (zone de texte) ;
- sauvegarde continue : chaque frappe appelle `onChange(nouveauTableau)`, aucun bouton « Enregistrer » ;
- `onChange` reçoit toujours le tableau complet — c'est lui qui part dans `saveSettings`.

- [ ] **Step 4: Déclarer la section**

Dans `src/components/settings/sections.ts` : ajouter `"consignes"` à l'union `SectionId` et une entrée dans `SECTIONS` (avec sa clé `I18nKey`), en suivant le commentaire d'en-tête du fichier. Ajouter la traduction correspondante.

- [ ] **Step 5: Lancer les tests**

```bash
npx vitest run src/components/settings 2>&1 | tail -12
```

Attendu : `Consignes.test.tsx` et `sections.test.ts` verts.

- [ ] **Step 6: Vérifier le typage et le build**

```bash
npx tsc --noEmit 2>&1 | grep -v test_auto_review | tail -10 && npx vite build 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src/components/settings
git commit -m "feat(consignes): éditeur de consignes dans les réglages"
```

---

### Task 10 : Reformuler, sur le modèle choisi par l'utilisateur

Un tour unique, calqué sur `commit_message` (`claude.rs:759`) : args
construits en dur hors `build_args`, `--system-prompt`, timeout 60 s. Le
modèle n'est **pas** figé — il vient d'un réglage, sur le modèle exact du
sélecteur `autoReview` (`src/components/settings/sections/Atelier.tsx:141`).

Le mécanisme est générique : une méthode du trait `Provider` avec une
implémentation par défaut qui rend `None`, comme `title_conversation` et
`commit_message` (`traits.rs:133-146`). **Seul claude l'implémente dans ce
plan** ; un provider qui ne l'implémente pas répond « indisponible » et le
bouton s'éteint avec sa raison. Ajouter codex plus tard = implémenter une
méthode, sans toucher au reste.

**Files:**
- Modify: `rust/crates/atelier-providers/src/traits.rs:133-146` (méthode de trait)
- Modify: `rust/crates/atelier-providers/src/claude.rs` (prompts + implémentation)
- Modify: `rust/crates/atelier-runtime/src/ws_router.rs` (message `reformulerConsigne`)
- Modify: `src/lib/settings.ts` (réglage `consignesAssist`)
- Modify: `src/components/settings/sections/Consignes.tsx`
- Test: `rust/crates/atelier-providers/src/claude.rs`, `src/components/settings/sections/Consignes.test.tsx`

**Interfaces:**
- Consumes: `Consigne` (Task 6), le composant `Consignes` (Task 9).
- Produces:
  - Rust : `fn prompts_reformulation(nom: &str, description: &str, texte: &str) -> (String, String)` (système, utilisateur)
  - Trait : `async fn reformuler_consigne(&self, nom: &str, description: &str, texte: &str, model: &str) -> Option<String>` — défaut `None`
  - Réglage : `Settings.consignesAssist: { provider: string; model: string }`, défaut `{ provider: "claude", model: "claude-haiku-4-5-20251001" }`
  - WS : `{"type":"reformulerConsigne","nom":…,"description":…,"texte":…,"provider":…,"model":…}` → `{"type":"consigneReformulee","texte":…}` (`texte: null` si indisponible)

- [ ] **Step 1: Écrire le test Rust qui échoue**

Dans le module de tests de `claude.rs` :

```rust
    /// Le prompt de reformulation n'emporte QUE les trois champs de
    /// l'éditeur : ni le fil, ni les fichiers du projet, ni CLAUDE.md.
    #[test]
    fn la_reformulation_n_emporte_que_les_champs_de_l_editeur() {
        let (systeme, utilisateur) = prompts_reformulation(
            "Rigueur scientifique",
            "Chiffre, cite.",
            "sois rigoureux stp",
        );
        assert!(systeme.contains("impératif"), "{systeme}");
        assert!(utilisateur.contains("Rigueur scientifique"));
        assert!(utilisateur.contains("Chiffre, cite."));
        assert!(utilisateur.contains("sois rigoureux stp"));
    }

    /// Champ vide : on rédige un premier jet à partir du nom et de la
    /// description — le verbe du bouton change, le chemin est le même.
    #[test]
    fn un_texte_vide_demande_une_redaction() {
        let (systeme, _) = prompts_reformulation("Concis", "Réponse directe.", "");
        assert!(systeme.contains("Rédige"), "{systeme}");
    }

    /// Le modèle vient du réglage, jamais d'une constante : c'est
    /// l'utilisateur qui choisit ce qui reformule ses consignes.
    #[tokio::test]
    async fn le_modele_de_reformulation_vient_de_l_appelant() {
        let dir = std::env::temp_dir().join(format!("claude-reform-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let bin = dir.join("fake-claude");
        // Faux CLI : recrache ses arguments, pour observer --model.
        std::fs::write(&bin, "#!/bin/sh\necho \"$@\" >&2\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        // Reprendre ici le mécanisme d'injection du faux binaire utilisé par
        // les tests voisins du fichier (`ATELIER_CLAUDE_BIN` ou le champ de
        // configuration de la struct — suivre le test d'interruption
        // existant, `claude.rs:1240` et suivants, et NE PAS muter l'env :
        // `env::set_var` crée une course entre tests).
    }
```

**Note à l'implémenteur :** si les tests voisins n'offrent aucun moyen
d'injecter un faux binaire sans muter l'environnement, supprimer ce
troisième test et se contenter des deux premiers, plus l'assertion de la
Step 3 : la fonction prend `model: &str` en paramètre, ce que le
compilateur garantit déjà. Ne pas introduire `env::set_var` dans les tests.

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

```bash
cd rust && cargo test -p atelier-providers reformulation 2>&1 | tail -15
```

Attendu : `cannot find function 'prompts_reformulation'`.

- [ ] **Step 3: Implémenter côté Rust**

Dans `claude.rs`, à côté de `commit_message_prompts` :

```rust
/// Prompts de l'assistance « Reformuler » de l'éditeur de consignes.
/// N'emporte que les trois champs du formulaire — jamais le fil, les
/// fichiers du projet ou CLAUDE.md.
pub fn prompts_reformulation(nom: &str, description: &str, texte: &str) -> (String, String) {
    let vide = texte.trim().is_empty();
    let verbe = if vide {
        "Rédige une consigne à partir du nom et de la description fournis."
    } else {
        "Reformule la consigne fournie : resserre-la, mets-la à l'impératif, coupe le flou."
    };
    let systeme = format!(
        "Tu écris des consignes destinées à un assistant de programmation. {verbe} \
         Écris à l'impératif, en français, une instruction par ligne, cinq lignes au maximum. \
         Ne commente pas, ne justifie pas : renvoie uniquement le texte de la consigne."
    );
    let utilisateur =
        format!("Nom : {nom}\nDescription : {description}\nConsigne actuelle :\n{texte}");
    (systeme, utilisateur)
}
```

Dans `traits.rs`, à côté de `commit_message` (`traits.rs:138`) :

```rust
    /// Reformule une consigne de l'éditeur. `model` vient du réglage
    /// `consignesAssist` : l'utilisateur choisit ce qui réécrit ses textes.
    /// Défaut `None` = ce CLI n'a pas de tour un-coup exploitable ; l'UI
    /// éteint le bouton au lieu d'inventer un chemin.
    async fn reformuler_consigne(
        &self,
        _nom: &str,
        _description: &str,
        _texte: &str,
        _model: &str,
    ) -> Option<String> {
        None
    }
```

Puis l'implémentation dans `impl Provider for ClaudeProvider`, copie de
`commit_message` (`claude.rs:759-800`) : mêmes args en dur, `--system-prompt`
avec le prompt système, `--model` avec le **paramètre `model`** (jamais une
constante), même timeout 60 s, rend `Option<String>`.

- [ ] **Step 4: Lancer les tests Rust**

```bash
cd rust && cargo test -p atelier-providers 2>&1 | tail -12
```

- [ ] **Step 5: Router le message WebSocket**

Dans `ws_router.rs`, ajouter la branche `reformulerConsigne` sur le modèle
des autres branches à réponse unique : résoudre le provider par son id dans
le registre, appeler `reformuler_consigne` avec le `model` du message,
répondre `{"type":"consigneReformulee","texte":…}` — ou
`{"type":"consigneReformulee","texte":null}` quand le provider rend `None`
(non implémenté, ou CLI absent).

- [ ] **Step 6: Ajouter le réglage**

Dans `src/lib/settings.ts`, dans le type `Settings` :

```ts
  /** Modèle qui reformule les consignes (bouton de l'éditeur). */
  consignesAssist: { provider: string; model: string };
```

et dans `DEFAULT_SETTINGS` :

```ts
  consignesAssist: { provider: "claude", model: "claude-haiku-4-5-20251001" },
```

- [ ] **Step 7: Écrire le test frontend qui échoue**

Dans `src/components/settings/sections/Consignes.test.tsx` :

```tsx
  it("propose Rédiger quand le champ est vide et Reformuler sinon", () => {
    const vide = { id: "c1", nom: "Ma règle", description: "d", texte: "" };
    const { rerender } = render(<Consignes consignes={[vide]} onChange={() => {}} />);
    fireEvent.click(screen.getByText("Ma règle"));
    expect(screen.getByText("Rédiger")).toBeTruthy();
    rerender(
      <Consignes consignes={[{ ...vide, texte: "un texte" }]} onChange={() => {}} />,
    );
    expect(screen.getByText("Reformuler")).toBeTruthy();
  });

  it("garde le texte original derrière Rétablir jusqu'à la frappe suivante", async () => {
    const mienne = { id: "c1", nom: "Ma règle", description: "d", texte: "original" };
    const onChange = vi.fn();
    render(
      <Consignes consignes={[mienne]} onChange={onChange} reformuler={async () => "reformulé"} />,
    );
    fireEvent.click(screen.getByText("Ma règle"));
    fireEvent.click(screen.getByText("Reformuler"));
    expect(await screen.findByText("Rétablir")).toBeTruthy();
    fireEvent.click(screen.getByText("Rétablir"));
    expect(onChange.mock.calls.at(-1)?.[0][0].texte).toBe("original");
  });

  it("éteint le bouton quand le modèle choisi ne sait pas reformuler", () => {
    const mienne = { id: "c1", nom: "Ma règle", description: "d", texte: "t" };
    render(<Consignes consignes={[mienne]} onChange={() => {}} reformuler={null} />);
    fireEvent.click(screen.getByText("Ma règle"));
    expect(screen.getByText("Reformuler").closest("button")).toHaveAttribute("disabled");
  });

  it("laisse choisir le modèle qui reformule", () => {
    const save = vi.fn();
    render(
      <Consignes
        consignes={[]}
        onChange={() => {}}
        assist={{ provider: "claude", model: "claude-haiku-4-5-20251001" }}
        onChangeAssist={save}
      />,
    );
    fireEvent.change(screen.getByLabelText("Modèle de reformulation"), {
      target: { value: "claude:claude-sonnet-5" },
    });
    expect(save).toHaveBeenCalledWith({ provider: "claude", model: "claude-sonnet-5" });
  });
```

- [ ] **Step 8: Implémenter le bouton et le sélecteur**

Dans `Consignes.tsx` :

1. Props ajoutées : `reformuler: ((c: Consigne) => Promise<string | null>) | null`,
   `assist: { provider: string; model: string }`, `onChangeAssist: (a: { provider: string; model: string }) => void`.
2. Dans l'en-tête du champ *Consigne*, un `RowButton` dont le libellé suit
   l'état : `texte` vide → « Rédiger » ; texte présent → « Reformuler » ;
   juste après une reformulation → « Rétablir ». L'original est gardé dans un
   `useState` et **effacé à la première frappe** dans la zone de texte.
3. En bas de la section, un `Select` « Modèle de reformulation », copie du
   sélecteur `autoReview` (`sections/Atelier.tsx:141-154`) : `value` de la
   forme `provider:model`, liste d'options en dur — même parti pris que
   `autoReview`, aucun état de catalogue à porter.

```tsx
            options={[
              { value: "claude:claude-haiku-4-5-20251001", label: "Haiku 4.5 · rapide" },
              { value: "claude:claude-sonnet-5", label: "Sonnet 5" },
              { value: "claude:claude-opus-5", label: "Opus 5" },
            ]}
```

**Ne pas offrir de provider dont `reformuler_consigne` rend encore `None`** :
un choix qui éteint le bouton sans l'expliquer serait pire que pas de choix.
Quand un provider est implémenté plus tard, son option s'ajoute ici.

- [ ] **Step 9: Lancer les tests**

```bash
npx vitest run src/components/settings 2>&1 | tail -12
```

- [ ] **Step 10: Vérifier le typage, le build et la suite complète**

```bash
npx tsc --noEmit 2>&1 | grep -v test_auto_review | tail -5 \
  && npx vite build 2>&1 | tail -3 \
  && cd rust && cargo test --workspace 2>&1 | tail -8
```

- [ ] **Step 11: Commit**

```bash
git add rust/crates src/components/settings src/lib/settings.ts
git commit -m "feat(consignes): Reformuler sur le modèle choisi dans les réglages"
```

---

## Vérification finale

- [ ] `cd rust && cargo test --workspace` — vert
- [ ] `npx vitest run` — vert
- [ ] `npx tsc --noEmit` (hors `test_auto_review*`) — silencieux
- [ ] `npx vite build` — vert
- [ ] `git log --oneline` montre dix commits, un par tâche

**La galerie n'est pas touchée** par ce plan : `node gallery/server/tests/diff_suite.mjs` n'est pas requis. Si une tâche finit par modifier `gallery/`, c'est un signe de dérive — s'arrêter et le signaler.

**Relance de l'app :** hors périmètre de ce plan. Seul Thierry lance `npm run tauri dev`, depuis son terminal (`docs/PROTOCOLE_RELANCE.md`).
