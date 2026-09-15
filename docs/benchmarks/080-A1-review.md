# Plan 080 — dossier A1 (implémenté à vérifier)

Grok, 2026-09-14. Statut du lot : **implémenté à vérifier**. Pas DONE.

## 1. Contexte

- **HEAD :** `b8845a2fb22503fb4eab19d22f3a8dbd4155491b`
- **Fichiers de ce lot :**
  - `rust/crates/atelier-runtime/src/review.rs` (nouveau)
  - `rust/crates/atelier-runtime/src/lib.rs`
  - `rust/crates/atelier-runtime/src/ws_router.rs`
  - `src/components/chat/ChatTimeline.tsx`
  - `src/components/chat/ChatTimeline.review.test.tsx` (nouveau)
  - `src/components/chat/turns.tsx`
  - `src/components/Chat.tsx`
  - `src/lib/i18n.ts`
  - `src/App.css`
- **Modifications initiales préservées :** aucun autre fichier du worktree n’a été repris. Le dépôt avait déjà des fichiers non suivis hors 080 ; ils restent intacts.
- **Instance ouverte :** `tauri-app` tourne (`Atelier.app` du worktree). Pas d’arrêt, pas de rebuild.

### Décisions par rapport à l’annexe

- `review.rs` est créé dès A1, uniquement pour classer le chemin natif actuel. L’annexe le place à A2 : A2 l’étendra (store, session isolée, file). Pas de store, pas de `getReviews`, pas de trait `review()`.
- `reviewResult` gagne deux champs additifs : `mode: "git"` et `text` (prose native). `error` reste une chaîne, comme aujourd’hui.
- Une sortie native non structurée, y compris un vrai constat Git, n’est plus projetée en `issues`. `issues` affichait « incohérence(s) » et « Corriger ces problèmes », ce qui attribue une revue de claims. Le texte est conservé ; le verdict est `inconclusive`.
- Le chemin `requestReview` force encore Codex et ignore `autoReview`. A2/A3.

## 2. Scénarios

| Commande | Tests sélectionnés | Résultat |
| --- | --- | --- |
| `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime review` | `review::tests::empty_native_review_is_inconclusive_without_issues` | ok |
| idem | `review::tests::whitespace_native_review_is_inconclusive_without_issues` | ok |
| idem | `review::tests::missing_review_field_is_inconclusive` | ok |
| idem | `review::tests::no_findings_substring_is_not_ok` | ok |
| idem | `review::tests::french_aucun_probleme_is_not_ok` | ok |
| idem | `review::tests::mixed_no_findings_and_error_is_not_ok` | ok |
| idem | `review::tests::unstructured_native_text_is_preserved_and_inconclusive` | ok |
| idem | `review::tests::provider_error_keeps_reason_and_is_not_ok` | ok |
| idem | `review::tests::native_git_review_never_emits_ok` | ok |
| idem | `review::tests::review_running_is_not_a_terminal_verdict` | ok |
| idem | `send::tests::acp_plan_review_garde_l_ordre_et_les_ids` (filtre `review`, hors A1) | ok |
| `npx vitest run src/components/chat/ChatTimeline.review.test.tsx` | 7 cas non-ok (vide, espaces, unparseable, unavailable, erreur provider, no findings mixte, inconclusive sans issue) : bandeau + détail + compact | 10/10 ok |
| idem | verdict `ok` explicite : bandeau et détail restent une validation | ok |
| idem | `issues.length === 0` + verdict `issues` ≠ `ok-detail` | ok |
| idem | ResultCapsule sans badge de revue | ok |
| `npx vitest run src/components/chat/ChatTimeline.characterization.test.tsx` | 21 tests, dont association review/usage au dernier `done` | 21/21 ok |
| `git diff --check` (fichiers du lot) | — | propre |

`cargo test … review` : 11 passed, 0 failed, 231 filtered. Le filtre n’a pas renvoyé zéro test.

## 3. Contrats produits

Succès natif non structuré :

```json
{
  "type": "reviewResult",
  "threadId": "t1",
  "status": "done",
  "verdict": "inconclusive",
  "mode": "git",
  "issues": [],
  "text": "no findings dans X, mais erreur dans Y"
}
```

Texte vide / espaces / champ absent : même forme, `text` absent. Erreur provider : `verdict: "error"`, `error` conservé, `issues: []`. `running` n’a pas de `verdict`.

Relecture après restart : **non exercée**. Preuve limitée aux tests déterministes.

## 4. Défaut avant / après

Avant, dans `ws_router.rs` `requestReview` :

- `review` vide, ou sous-chaîne `no findings` / `aucun problème` → `verdict: "ok"`, `issues: []`
- « no findings dans X, mais erreur dans Y » → `ok`
- dans `ChatTimeline`, `issues.length === 0` → `review.ok-detail` même si le verdict n’était pas `ok`

Après : ce chemin n’émet plus `ok`. Le détail n’affiche `review.ok-detail` que si `verdict === "ok"`. La revue Git est nommée dans le détail. ResultCapsule n’a pas récupéré de badge.

Preuve : tests listés ci-dessus. Pas de reproduction dans le bundle ouvert.

## 5. Bundle

**En attente.** `tauri-app` est ouvert sur `src-tauri/target/release/bundle/macos/Atelier.app`. AGENTS.md et la procédure runtime interdisent l’arrêt/rebuild sans autorisation. Les contrôles hors relance sont faits.

Limites restantes pour Codex :

- A1 ne restaure ni `autoReview`, ni session isolée, ni déclenchement à la clôture (A2/A3).
- Pas d’essai provider réel.
- Le filtre cargo a aussi exécuté un test `send` dont le nom contient `review`.
- `turnAnatomy.test.tsx` a un échec `page: null` sur l’ouverture d’un fichier édité ; hors périmètre A1 (fichier non modifié ici).

## 6. Revue Codex — 2026-09-14

**Verdict : code A1 conforme ; clôture du lot en attente de livraison reproductible
et de validation dans le bundle.** Aucun défaut fonctionnel introduit identifié
dans le périmètre A1 après examen du diff et seconde lecture indépendante.
Les travaux A2/A3 ne sont pas exigés pour ce verdict.

État revu : `ada57b47b94859975d875a79de76db6709967258`, complété par les nouveaux
fichiers présents dans le worktree. Codex a relancé les contrôles suivants :

| Commande | Résultat observé |
| --- | --- |
| `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime review` | 11 passed : 10 du module review et 1 test send ; aucun échec |
| `./node_modules/.bin/vitest run src/components/chat/ChatTimeline.review.test.tsx src/components/chat/ChatTimeline.characterization.test.tsx` | 31 passed, 2 fichiers ; aucun échec |
| `npm run typecheck` | code retour 0 |
| `git diff --check ada57b47^ ada57b47 --` suivi des sept fichiers suivis du lot | aucune erreur de whitespace |

**Point de livraison à corriger :** le commit automatique `ada57b47` ajoute
`pub mod review;` à `atelier-runtime/src/lib.rs`, mais son arbre Git ne contient
pas `atelier-runtime/src/review.rs`. Ce fichier et
`src/components/chat/ChatTimeline.review.test.tsx` sont encore non suivis.
Les tests ci-dessus valident donc le worktree complet, pas un checkout de ce
commit. Inclure ces fichiers dans la livraison versionnée lorsqu'elle est autorisée ;
Codex n'a ni stagé ni committé de fichiers pendant la revue.

**Limite runtime :** l'instance observée utilise
`/Users/tofunori/Documents/atelier-studio/src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app`.
Aucun arrêt, rebuild ou essai provider réel n'a été effectué. La session n'autorise
pas l'arrêt/remplacement de cette instance ; appliquer la procédure runtime quand
cette autorisation sera donnée. Les tests DOM ne prouvent pas le comportement du
bundle actuellement ouvert, ni l'aller-retour complet `requestReview`/provider.
