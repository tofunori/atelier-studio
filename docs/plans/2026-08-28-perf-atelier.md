# Plan d'implémentation — Performance Atelier

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ramener Atelier à ~0 % CPU au repos, lisser le streaming du chat, récupérer ~650 Mo de disque et arrêter la fuite de processus — sans changer d'architecture.

**Architecture:** Corrections ciblées dans trois couches indépendantes : (A) frontend React (coalescence du streaming, mémoïsation), (B) backend Rust (exclusions de scan, GC vignettes, chemins chauds du streaming, hygiène processus), (C) galerie/éditeurs vendorisés (debounce, gating `document.hidden`, polling léger). Chaque tâche est livrable et testable seule.

**Tech Stack:** React 18 + Vite + LegendList, Rust (tokio/axum/notify), Tauri 2, JS navigateur vanilla (galerie), CodeMirror (studio).

**Spec:** `docs/performance/2026-08-28-audit-perf.md` (audit du 2026-08-28, mesures + fichier:ligne). Le plan argumente depuis cette spec — la lire avant d'exécuter.

## Global Constraints

- **Jamais de push** sans demande explicite de Thierry. Commits petits et fréquents (les auto-commits galerie balaient le worktree — committer tôt).
- `npx tsc --noEmit` et `npx vite build` doivent passer après toute modif frontend (ignorer `src/test_auto_review*.ts`).
- `npx vitest run` (racine) doit rester vert après toute modif `src/`.
- `cargo test --manifest-path rust/Cargo.toml` doit rester vert après toute modif `rust/`.
- **Dès que `gallery/` change** : lire `docs/PIEGES_CONNUS.md` D'ABORD, puis `node gallery/server/tests/diff_suite.mjs` doit afficher « ok » (se fier au « ok », pas au compte).
- Toute modif de `gallery/assets/gallery_template.html` doit être **recopiée dans `src-tauri/gallery-dist/assets/`** (même fichier). La coquille est rendue en mémoire au boot : la modif ne sera visible qu'après relance de l'app (ne PAS relancer soi-même — `docs/PROTOCOLE_RELANCE.md` est réservé à une demande explicite).
- Système de design contraignant (CLAUDE.md) : aucune valeur visuelle inventée ; ces tâches ne doivent introduire AUCUN changement visuel.
- Ne pas toucher : `gallery/assets/diff_versions.js`, les imports lazy existants (mermaid, KaTeX, xterm, CodeMirror), `listExtraData` (ChatTimeline).
- Style de commentaires : français, expliquant la contrainte (pas le « quoi »), comme le code environnant.
- Messages de commit : conventionnels français du dépôt, ex. `fix(galerie): …`, `perf(chat): …`, suffixés `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

# PHASE 1 — Rendement maximal, risque faible

### Task 1: Coalescence rAF du streaming (le throttle mort)

Le lissage « un setState par frame » (`plan 066 L1`) guette `kind === "streaming"`, un kind que le backend Rust n'émet jamais (il émet `delta`/`thinking_delta` ; `streaming` est un kind interne de la liste, fabriqué par le réducteur). Chaque token déclenche donc un re-render complet de App. On coalesce les vrais kinds, en **file** (jamais écraser un delta : chaque delta est un fragment, pas un état complet).

**Files:**
- Create: `src/lib/streamCoalesce.ts`
- Create: `src/lib/streamCoalesce.test.ts`
- Modify: `src/App.tsx` (~1511-1531 `applyThreadEvent`/`flushStreamEvent`, ~1740-1756 branche `streaming`, et la déclaration des refs `pendingStreamEvents`/`streamFrames` — les chercher par nom)

**Interfaces:**
- Produces: `createStreamCoalescer(apply, raf?, caf?) → { push(threadId, ev), flush(threadId), flushAll() }` et `STREAM_COALESCE_KINDS: Set<string>`.
- Consumes: `applyThreadEvent(threadId, event)` existant dans App.tsx (inchangé).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/lib/streamCoalesce.test.ts
import { describe, expect, it, vi } from "vitest";
import { createStreamCoalescer, STREAM_COALESCE_KINDS } from "./streamCoalesce";

describe("streamCoalesce", () => {
  it("connaît les kinds à lisser", () => {
    expect(STREAM_COALESCE_KINDS.has("delta")).toBe(true);
    expect(STREAM_COALESCE_KINDS.has("thinking_delta")).toBe(true);
    expect(STREAM_COALESCE_KINDS.has("streaming")).toBe(false);
  });

  it("applique tous les deltas d'une frame, dans l'ordre, en un seul flush", () => {
    const applied: Array<[string, any]> = [];
    let frameCb: (() => void) | null = null;
    const raf = vi.fn((cb: () => void) => { frameCb = cb; return 1; });
    const c = createStreamCoalescer((id, ev) => applied.push([id, ev]), raf, vi.fn());
    c.push("t1", { kind: "delta", text: "a" });
    c.push("t1", { kind: "delta", text: "b" });
    expect(applied).toEqual([]);           // rien avant la frame
    expect(raf).toHaveBeenCalledTimes(1);  // un seul rAF par fil
    frameCb!();
    expect(applied.map(([, e]) => e.text)).toEqual(["a", "b"]); // ordre préservé
  });

  it("flush synchrone vide la file et annule le rAF", () => {
    const applied: any[] = [];
    const caf = vi.fn();
    const c = createStreamCoalescer((_id, ev) => applied.push(ev), () => 7, caf);
    c.push("t1", { kind: "delta", text: "a" });
    c.flush("t1");
    expect(applied).toHaveLength(1);
    expect(caf).toHaveBeenCalledWith(7);
    c.flush("t1"); // idempotent
    expect(applied).toHaveLength(1);
  });

  it("les fils sont indépendants", () => {
    const applied: Array<[string, any]> = [];
    const frames: Array<() => void> = [];
    const c = createStreamCoalescer((id, ev) => applied.push([id, ev]),
      (cb) => { frames.push(cb); return frames.length; }, () => {});
    c.push("t1", { kind: "delta", text: "a" });
    c.push("t2", { kind: "delta", text: "x" });
    frames[0]!();
    expect(applied).toEqual([["t1", { kind: "delta", text: "a" }]]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/lib/streamCoalesce.test.ts`
Expected: FAIL (module inexistant).

- [ ] **Step 3: Implémenter le module**

```ts
// src/lib/streamCoalesce.ts
// Coalescence par frame des événements de streaming (plan 066 L1, réparé
// 2026-08-28) : les providers émettent "delta"/"thinking_delta" (jamais
// "streaming", qui est un kind INTERNE de la liste fabriqué par le
// réducteur). Chaque delta est un FRAGMENT : on file, on n'écrase jamais —
// écraser perdrait du texte. Tous les deltas d'une frame s'appliquent dans
// l'ordre dans le même callback (React 18 les batch en un seul render).
export const STREAM_COALESCE_KINDS: ReadonlySet<string> = new Set([
  "delta",
  "thinking_delta",
  "stream_set",
]);

type Apply = (threadId: string, event: any) => void;
type Raf = (cb: () => void) => number;
type Caf = (id: number) => void;

export function createStreamCoalescer(
  apply: Apply,
  raf: Raf = (cb) => window.requestAnimationFrame(cb),
  caf: Caf = (id) => window.cancelAnimationFrame(id),
) {
  const queues = new Map<string, any[]>();
  const frames = new Map<string, number>();

  function drain(threadId: string) {
    const pending = queues.get(threadId);
    if (!pending?.length) return;
    queues.delete(threadId);
    for (const ev of pending) apply(threadId, ev);
  }

  return {
    push(threadId: string, event: any) {
      const queue = queues.get(threadId) ?? [];
      queue.push(event);
      queues.set(threadId, queue);
      if (!frames.has(threadId)) {
        frames.set(threadId, raf(() => {
          frames.delete(threadId);
          drain(threadId);
        }));
      }
    },
    // flush immédiat (synchrone) avant tout événement non-stream du même fil,
    // pour ne jamais changer l'ordre d'arrivée.
    flush(threadId: string) {
      const frame = frames.get(threadId);
      if (frame != null) {
        caf(frame);
        frames.delete(threadId);
      }
      drain(threadId);
    },
    flushAll() {
      for (const threadId of [...queues.keys()]) this.flush(threadId);
    },
  };
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run src/lib/streamCoalesce.test.ts`
Expected: PASS.

- [ ] **Step 5: Brancher dans App.tsx**

Dans `src/App.tsx` :
1. Importer : `import { createStreamCoalescer, STREAM_COALESCE_KINDS } from "./lib/streamCoalesce";`
2. Trouver les refs `pendingStreamEvents` et `streamFrames` (déclarées près de `applyThreadEvent`). Les REMPLACER par un seul ref :
```tsx
const streamCoalescer = React.useRef(createStreamCoalescer(applyThreadEvent)).current;
```
   Attention : `applyThreadEvent` est une fonction hissée du composant — vérifier qu'elle est déclarée avant ; sinon passer `(id, ev) => applyThreadEvent(id, ev)`.
3. Réécrire `flushStreamEvent` :
```tsx
function flushStreamEvent(threadId: string) {
  streamCoalescer.flush(threadId);
}
```
4. Remplacer la branche `if (msg.event.kind === "streaming") { … } else { … }` (~1740) par :
```tsx
if (STREAM_COALESCE_KINDS.has(msg.event.kind)) {
  streamCoalescer.push(msg.threadId, msg.event);
} else {
  flushStreamEvent(msg.threadId);
  applyThreadEvent(msg.threadId, msg.event);
}
```
5. Chercher tout autre usage de `pendingStreamEvents`/`streamFrames` dans App.tsx (`grep -n "pendingStreamEvents\|streamFrames" src/App.tsx`) et les migrer vers le coalescer (p.ex. un flush au changement de fil actif → `streamCoalescer.flush(id)` ou `flushAll()`).

- [ ] **Step 6: Suites complètes**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: tout vert (build : budget d'entrée ≤ 1024 Ko inchangé).

- [ ] **Step 7: Commit**

```bash
git add src/lib/streamCoalesce.ts src/lib/streamCoalesce.test.ts src/App.tsx
git commit -m "perf(chat): le lissage rAF du stream vise delta/thinking_delta — le kind \"streaming\" n'existe pas sur le fil"
```

---

### Task 2: Exclure les répertoires de build du scan et du watcher galerie

64 000 fichiers parcourus par rebuild ici, dont 14 236 sous `rust/target`. `EXCLUDED_DIRECTORIES` ignore `.git`/`node_modules`… mais pas `target`/`dist`/`build`.

**Files:**
- Modify: `rust/crates/atelier-core/src/lib.rs:15-29` (la constante) + tests au même fichier
- Modify: `rust/crates/atelier-gallery/src/main.rs:1978-1990` (boucle watcher)

**Interfaces:**
- Produces: `EXCLUDED_DIRECTORIES` étendu — consommé tel quel par `gallery_builder` et `artifact_snapshot`.

- [ ] **Step 1: Écrire le test qui échoue**

Repérer d'abord comment `EXCLUDED_DIRECTORIES` est consommé : `grep -n "EXCLUDED_DIRECTORIES" rust/crates -r`. Ajouter dans le module de test existant de `atelier-core` (ou créer `#[cfg(test)] mod exclusions_tests` en bas de `lib.rs`) :

```rust
#[cfg(test)]
mod exclusions_tests {
    use super::EXCLUDED_DIRECTORIES;

    #[test]
    fn build_directories_are_excluded() {
        for dir in ["target", "dist", "build", ".next"] {
            assert!(
                EXCLUDED_DIRECTORIES.contains(&dir),
                "{dir} doit être exclu du scan galerie (12 Go / 52k fichiers de target sur ce dépôt)"
            );
        }
    }
}
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cargo test --manifest-path rust/Cargo.toml -p atelier-core build_directories_are_excluded`
Expected: FAIL.

- [ ] **Step 3: Étendre la constante**

Ajouter à `EXCLUDED_DIRECTORIES` (avec le commentaire) :

```rust
    // répertoires de BUILD : jamais des artefacts de science, et target/ seul
    // pèse 12 Go / 52k fichiers sur atelier-studio — le watcher et le scan
    // doivent les ignorer (audit perf 2026-08-28)
    "target",
    "dist",
    "build",
    ".next",
```

- [ ] **Step 4: Vérifier que le test passe + non-régression**

Run: `cargo test --manifest-path rust/Cargo.toml -p atelier-core`
Expected: PASS. Si un test existant liste les exclusions de façon exhaustive, le mettre à jour.

- [ ] **Step 5: Ne plus prendre le lock watcher pour un événement filtré**

Dans `rust/crates/atelier-gallery/src/main.rs`, la branche `Ok(event) if matches!(…)` fait aujourd'hui `pending.extend` + `sort` + `dedup` + `state.watcher.write().await` **même quand `changed` est vide** (pendant un `cargo build`, des milliers de prises de lock inutiles). La remplacer par :

```rust
let changed: Vec<String> = event.paths.iter().filter_map(|path| relevant_change(&root, path)).collect();
if !changed.is_empty() {
    pending.extend(changed);
    pending.sort();
    pending.dedup();
    let mut status = state.watcher.write().await;
    status.last_event_at = Some(now());
    status.last_changed = pending.iter().take(50).cloned().collect();
}
```

- [ ] **Step 6: Suites Rust**

Run: `cargo test --manifest-path rust/Cargo.toml`
Expected: vert.

- [ ] **Step 7: Commit**

```bash
git add rust/crates/atelier-core/src/lib.rs rust/crates/atelier-gallery/src/main.rs
git commit -m "perf(galerie): exclure target/dist/build du scan + zéro lock watcher sur événement filtré"
```

---

### Task 3: GC des vignettes d'images (652 Mo d'orphelins)

Le ramasse-miettes de `.fig_thumbs/` n'accepte que les stems de 32 hex ; les vignettes d'images s'appellent `imgthumb_<32hex>.png` (41 chars) et ne sont **jamais** ni enregistrées comme vivantes ni supprimées. La clé incluant le mtime, chaque réédition orpheline la précédente. Mesuré : 19 126 orphelins / 652 Mo sur le projet Albedo.

**Files:**
- Modify: `rust/crates/atelier-core/src/gallery_builder.rs` (`build_thumbnails`, ~260-336) + tests dans le même fichier
- Verify: `rust/crates/atelier-gallery/src/gallery.rs:~445` (la route `/thumb` écrit aussi des `imgthumb_*` — sa clé doit être LA MÊME)

**Interfaces:**
- Consumes: `image_thumb_key(path, mtime)` et `stable_thumb_key(rel, mtime)` existants.

- [ ] **Step 1: Vérifier la parité de clé avec la route HTTP**

Lire `rust/crates/atelier-gallery/src/gallery.rs` autour de la ligne 445 : la route `/thumb` doit dériver la clé `imgthumb_` du **chemin canonicalisé + mtime + « 480 »** exactement comme `image_thumb_key` de `gallery_builder.rs:223-227`. Si la dérivation diffère, exporter `image_thumb_key` (`pub`) depuis `atelier-core` et l'utiliser dans `gallery.rs` — sinon le GC supprimerait des vignettes valides produites par la route. Documenter le constat dans le commit.

- [ ] **Step 2: Écrire les tests qui échouent**

En bas de `gallery_builder.rs` (module `#[cfg(test)]`, en créer un si absent — `tempfile` est-il déjà en dev-dependency ? sinon l'ajouter à `rust/crates/atelier-core/Cargo.toml` `[dev-dependencies] tempfile = "3"`) :

```rust
#[cfg(test)]
mod thumbs_gc_tests {
    use super::*;

    fn hex32(c: char) -> String { std::iter::repeat(c).take(32).collect() }

    #[test]
    fn gc_reclaims_orphan_image_thumbs() {
        let dir = tempfile::tempdir().unwrap();
        let thumbs = dir.path().join(".fig_thumbs");
        std::fs::create_dir(&thumbs).unwrap();
        let orphan = thumbs.join(format!("imgthumb_{}.png", hex32('a')));
        std::fs::write(&orphan, b"png").unwrap();
        let mut rows: Vec<GalleryRow> = Vec::new();
        build_thumbnails(dir.path(), &mut rows);
        assert!(!orphan.exists(), "une vignette d'image sans figure vivante doit être collectée");
    }

    #[test]
    fn gc_keeps_live_image_thumbs() {
        let dir = tempfile::tempdir().unwrap();
        let thumbs = dir.path().join(".fig_thumbs");
        std::fs::create_dir(&thumbs).unwrap();
        let source = dir.path().join("fig.png");
        std::fs::write(&source, b"png").unwrap();
        let mtime = std::fs::metadata(&source).unwrap().modified().unwrap()
            .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        let canonical = std::fs::canonicalize(&source).unwrap();
        let key = image_thumb_key(&canonical, mtime);
        let live = thumbs.join(format!("imgthumb_{key}.png"));
        std::fs::write(&live, b"png").unwrap();
        // construire la row comme le scan le ferait — adapter les champs à la
        // vraie struct GalleryRow (rel/name/ext/mtime au minimum)
        let mut rows = vec![gallery_row_for_test("fig.png", "png", mtime)];
        build_thumbnails(dir.path(), &mut rows);
        assert!(live.exists(), "la vignette de la figure vivante doit survivre au GC");
    }
}
```

`gallery_row_for_test` : petit constructeur de test à écrire selon la vraie définition de `GalleryRow` (la lire dans le fichier ; ne remplir que les champs requis, `..Default::default()` si dérivé).

- [ ] **Step 3: Vérifier l'échec**

Run: `cargo test --manifest-path rust/Cargo.toml -p atelier-core thumbs_gc`
Expected: `gc_reclaims_orphan_image_thumbs` FAIL (l'orphelin survit) ; `gc_keeps_live_image_thumbs` peut déjà passer (rien ne le supprime aujourd'hui) — c'est le garde-fou anti-régression.

- [ ] **Step 4: Corriger**

Dans `build_thumbnails` :

1. Branche images (`png | jpg | jpeg`), juste après `let key = image_thumb_key(...)` :
```rust
            // le GC ne connaît que `live` : sans cette insertion, TOUTE
            // vignette d'image serait orpheline de naissance (652 Mo mesurés
            // le 2026-08-28 sur le projet Albedo)
            live.insert(format!("imgthumb_{key}"));
```
2. Prédicat du GC — accepter les deux formes de stem :
```rust
                && key.is_some_and(|key| {
                    let hash = key.strip_prefix("imgthumb_").unwrap_or(key);
                    hash.len() == 32
                        && hash.chars().all(|c| c.is_ascii_hexdigit())
                        && !live.contains(key)
                })
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cargo test --manifest-path rust/Cargo.toml -p atelier-core`
Expected: PASS, suite complète verte.

- [ ] **Step 6: Commit**

```bash
git add rust/crates/atelier-core/src/gallery_builder.rs rust/crates/atelier-core/Cargo.toml rust/crates/atelier-gallery/src/gallery.rs
git commit -m "fix(galerie): le GC de .fig_thumbs collecte enfin les imgthumb_* (652 Mo d'orphelins mesurés)"
```

Note : le premier rescan après déploiement purgera les orphelins accumulés — c'est voulu.

---

### Task 4: Ne plus payer un clone + spawn par delta dans make_emit

`make_emit` (sink de TOUS les événements provider) clone chaque événement (jusqu'à 64 Ko) et spawne une tâche tokio pour `record_thread_event`… qui sort immédiatement sauf `done`/`error` (`automations.rs:87-90`).

**Files:**
- Modify: `rust/crates/atelier-runtime/src/send.rs:270-292` (`make_emit`)
- Modify: `rust/crates/atelier-runtime/src/automations.rs:86-90` (commentaire de contrat)

- [ ] **Step 1: Hisser le garde avant le clone**

```rust
fn make_emit(state: AppState, thread_id: String) -> EmitFn {
    Arc::new(move |event: Value| {
        // record_thread_event ne consomme que done/error (automations.rs) :
        // tester ICI évite un clone profond du Value (deltas, tool_result
        // jusqu'à 64 Ko) et un spawn tokio par événement de streaming.
        let kind = event.get("kind").and_then(Value::as_str).unwrap_or("");
        if matches!(kind, "done" | "error") {
            let automation_state = state.clone();
            let automation_thread_id = thread_id.clone();
            let automation_event = event.clone();
            tokio::spawn(async move {
                crate::automations::record_thread_event(
                    &automation_state,
                    &automation_thread_id,
                    &automation_event,
                )
                .await;
            });
        }
        let payload = json!({
            "type": "event",
            "threadId": thread_id,
            "event": event,
        });
        if let Ok(s) = serde_json::to_string(&payload) {
            state.publish(s);
        }
    })
}
```

- [ ] **Step 2: Verrouiller le contrat côté automations**

Au-dessus du garde dans `record_thread_event`, ajouter :

```rust
    // CONTRAT : make_emit (send.rs) filtre sur done/error AVANT de cloner —
    // si cette liste s'allonge, étendre le filtre là-bas aussi.
```

- [ ] **Step 3: Suites Rust**

Run: `cargo test --manifest-path rust/Cargo.toml -p atelier-runtime`
Expected: vert (les tests d'automations existants couvrent le déclenchement sur done/error).

- [ ] **Step 4: Commit**

```bash
git add rust/crates/atelier-runtime/src/send.rs rust/crates/atelier-runtime/src/automations.rs
git commit -m "perf(runtime): make_emit ne clone plus chaque delta pour un record_thread_event qui n'en veut pas"
```

---

### Task 5: Debounce de la recherche galerie

`q.oninput = render` : chaque frappe détruit/recrée jusqu'à 600 cartes.

**Files:**
- Modify: `gallery/assets/gallery_template.html:~2567`
- Modify: `src-tauri/gallery-dist/assets/gallery_template.html` (copie conforme)

- [ ] **Step 1: Lire `docs/PIEGES_CONNUS.md`** (obligatoire avant toute modif galerie).

- [ ] **Step 2: Remplacer le branchement**

Trouver la ligne exacte `document.getElementById('q').oninput=render;` et la remplacer par :

```js
// debounce : render() reconstruit jusqu'à 600 cartes — une frappe rapide ne
// doit payer qu'un rendu, pas un par lettre (audit perf 2026-08-28)
{ let qTimer = 0;
  document.getElementById('q').oninput = () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(render, 120);
  };
}
```

- [ ] **Step 3: Synchroniser la copie servie**

Run: `cp gallery/assets/gallery_template.html src-tauri/gallery-dist/assets/gallery_template.html`
Puis `diff -q` les deux pour confirmer.

- [ ] **Step 4: Suite galerie**

Run: `node gallery/server/tests/diff_suite.mjs`
Expected: « ok ».

- [ ] **Step 5: Commit**

```bash
git add gallery/assets/gallery_template.html src-tauri/gallery-dist/assets/gallery_template.html
git commit -m "perf(galerie): debounce 120 ms sur la recherche — un rendu par frappe rapide, pas 600 cartes par lettre"
```

Note : visible seulement après relance de l'app (coquille rendue en mémoire au boot) — ne pas relancer soi-même.

---

### Task 6: Profils release Rust (LTO + strip)

Aucun `[profile.release]` dans `rust/Cargo.toml` ni `src-tauri/Cargo.toml` (seul `mobile/` en a un). Bundle rust-server ≈ 45 Mo.

**Files:**
- Modify: `rust/Cargo.toml` (racine du workspace)
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Mesurer avant**

Run: `ls -l src-tauri/target/release/bundle/macos/Atelier.app/Contents/Resources/rust-server/ 2>/dev/null || echo "pas de bundle local"`
Noter les tailles dans le message de commit si disponibles.

- [ ] **Step 2: Ajouter le profil au workspace `rust/Cargo.toml`**

En fin de fichier (section workspace racine — un `[profile.release]` dans un membre serait ignoré) :

```toml
[profile.release]
# binaires livrés dans le bundle : LTO thin + strip ≈ -30 à -50 % de taille,
# quelques points de CPU ; le coût est du temps de build release uniquement
lto = "thin"
codegen-units = 1
strip = "symbols"
```

- [ ] **Step 3: Même profil dans `src-tauri/Cargo.toml`**

Même bloc, même commentaire. (Vérifier d'abord que `src-tauri` est bien un workspace/manifeste indépendant : `grep -n "\[workspace\]" src-tauri/Cargo.toml rust/Cargo.toml`.)

- [ ] **Step 4: Vérifier la compilation release des serveurs**

Run: `cargo build --release --manifest-path rust/Cargo.toml -p atelier-gallery -p atelier-runtime 2>&1 | tail -3`
Expected: succès. Comparer `ls -l rust/target/release/atelier-gallery-server` avant/après si le binaire préexistait.

- [ ] **Step 5: Commit**

```bash
git add rust/Cargo.toml src-tauri/Cargo.toml
git commit -m "perf(build): lto thin + codegen-units 1 + strip sur les profils release"
```

---

### Task 7: Nettoyage des .tmp d'écritures atomiques interrompues

9 fichiers `.figures_index.html.<pid>.<nonce>.tmp` (160 Ko chacun) abandonnés à la racine du dépôt — `atomic_write` ne survit pas à un kill entre write et rename, et rien ne balaie.

**Files:**
- Modify: `rust/crates/atelier-core/src/lib.rs` (près de `atomic_write`, ~332-348) + test
- Modify: `rust/crates/atelier-gallery/src/main.rs` (appel au boot — trouver l'init de `main()` avant le premier rebuild)

**Interfaces:**
- Produces: `pub fn clean_stale_tmp(dir: &Path, max_age: Duration)`.

- [ ] **Step 1: Test qui échoue**

```rust
#[cfg(test)]
mod stale_tmp_tests {
    use super::clean_stale_tmp;
    use std::time::Duration;

    #[test]
    fn stale_tmp_files_are_removed_and_content_kept() {
        let dir = tempfile::tempdir().unwrap();
        let stale = dir.path().join(".figures_index.html.1234.9999.tmp");
        let keep = dir.path().join("figures_index.html");
        std::fs::write(&stale, b"x").unwrap();
        std::fs::write(&keep, b"x").unwrap();
        clean_stale_tmp(dir.path(), Duration::ZERO);
        assert!(!stale.exists());
        assert!(keep.exists());
    }
}
```

- [ ] **Step 2: Vérifier l'échec** — `cargo test --manifest-path rust/Cargo.toml -p atelier-core stale_tmp` → FAIL.

- [ ] **Step 3: Implémenter**

```rust
/// Balaye les résidus d'`atomic_write` interrompus (`.<nom>.<pid>.<nonce>.tmp`) :
/// un process tué entre write et rename les abandonne définitivement (9 × 160 Ko
/// constatés le 2026-08-28). `max_age` protège une écriture en cours.
pub fn clean_stale_tmp(dir: &Path, max_age: std::time::Duration) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !(name.starts_with('.') && name.ends_with(".tmp")) {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_none_or(|age| age >= max_age);
        if stale {
            let _ = fs::remove_file(entry.path());
        }
    }
}
```

(`is_none_or` : si le mtime est illisible, supprimer quand même — ajuster à `is_some_and(|age| age >= max_age)` si on préfère conserver dans le doute ; choisir et commenter.)

- [ ] **Step 4: Appeler au boot du serveur galerie**

Dans `main()` de `rust/crates/atelier-gallery/src/main.rs`, après résolution de la racine et avant le premier rebuild :

```rust
    atelier_core::clean_stale_tmp(&root, std::time::Duration::from_secs(3600));
```

- [ ] **Step 5: Suites** — `cargo test --manifest-path rust/Cargo.toml` → vert.

- [ ] **Step 6: Commit**

```bash
git add rust/crates/atelier-core/src/lib.rs rust/crates/atelier-gallery/src/main.rs
git commit -m "fix(galerie): balayer au boot les .tmp d'écritures atomiques interrompues"
```

---

# PHASE 2 — Consommation continue et hygiène des processus

### Task 8: Les serveurs galerie meurent avec l'app

Un `atelier-gallery-server` est spawné détaché **par projet visité** et rien ne le tue jamais (survit à la fermeture de l'app, adopté par launchd, watcher FS actif).

**Files:**
- Create: `src-tauri/src/process_registry.rs`
- Modify: `src-tauri/src/lib.rs` (déclarer le module + hook de sortie — lire d'abord la structure du builder Tauri, ~47-89)
- Modify: `src-tauri/src/atelier.rs` (~238-252, enregistrer le PID après spawn)

**Interfaces:**
- Produces: `process_registry::register(pid: u32)`, `process_registry::kill_all()`.
- Périmètre : gallery-servers SEULEMENT. `atelier-studio-server` (verrou partagé machine) et `atelier-remote-gateway` (accès iPhone) restent volontairement vivants — documenter ce choix en commentaire.

- [ ] **Step 1: Le module registre**

```rust
// src-tauri/src/process_registry.rs
//! Registre des serveurs galerie spawnés par CETTE instance de l'app.
//! Ils sont détachés (un par projet visité) : sans ce registre, ils
//! survivent à la fermeture et s'accumulent, chacun avec son watcher FS
//! récursif (audit perf 2026-08-28). Le studio-server (verrou partagé
//! machine) et le gateway iPhone ne sont PAS enregistrés : leur survie
//! est un choix (reconnexion rapide, accès distant).
use std::sync::Mutex;

static CHILDREN: Mutex<Vec<u32>> = Mutex::new(Vec::new());

pub fn register(pid: u32) {
    if pid == 0 { return; }
    CHILDREN.lock().unwrap().push(pid);
}

pub fn kill_all() {
    for pid in CHILDREN.lock().unwrap().drain(..) {
        // SIGTERM : le serveur ferme proprement (écritures atomiques en cours)
        unsafe { libc::kill(pid as i32, libc::SIGTERM); }
    }
}
```

Vérifier que `libc` est une dépendance de `src-tauri/Cargo.toml` (`grep -n '^libc' src-tauri/Cargo.toml`) ; sinon `libc = "0.2"`.

- [ ] **Step 2: Enregistrer le PID au spawn**

Dans `start_atelier` (`src-tauri/src/atelier.rs`), le `.spawn()` jette aujourd'hui le `Child`. Le capturer :

```rust
    let child = Command::new(&rust_bin)
        /* … args/env inchangés … */
        .spawn()
        .map_err(|e| format!("spawn atelier-gallery-server: {e}"))?;
    crate::process_registry::register(child.id());
```

(Le `Child` est ensuite droppé sans `wait` comme avant — le serveur est un démon, seul le PID nous intéresse.)

- [ ] **Step 3: Le hook de sortie**

Dans `src-tauri/src/lib.rs` : déclarer `mod process_registry;` puis brancher sur l'événement de fin du run loop Tauri. Selon la forme actuelle du builder (la lire !), soit il y a déjà un `.run(|app, event| …)`, soit un `.run(context)` simple à transformer :

```rust
    // forme cible — adapter à l'existant sans rien perdre :
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            process_registry::kill_all();
        }
    });
```

`RunEvent::Exit` (et non `ExitRequested`) : on tue quand la sortie est actée.

- [ ] **Step 4: Compiler**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: succès. (La validation runtime — plus aucun `atelier-gallery-server` après fermeture — se fera à la prochaine relance par Thierry, protocole `docs/PROTOCOLE_RELANCE.md` ; le noter dans le commit.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/process_registry.rs src-tauri/src/lib.rs src-tauri/src/atelier.rs
git commit -m "fix(app): les serveurs galerie spawnés meurent avec l'app (SIGTERM au RunEvent::Exit)"
```

---

### Task 9: Séquence des fils liés sans relire le journal (O(n²) → O(1))

`last_sequence` relit et parse **tout** le JSONL du fil source à chaque événement texte mirroré.

**Files:**
- Modify: `rust/crates/atelier-runtime/src/send.rs` (~1150 : boucle de pompe, à côté de `linked_reply_text`)

- [ ] **Step 1: Vérifier l'exclusivité de l'écrivain**

Run: `grep -rn "last_sequence\|sequence" rust/crates/atelier-runtime/src/send.rs | head -20` et vérifier qu'aucun autre chemin n'append au journal du fil source pendant le tour (le miroir de CETTE pompe est le seul écrivain de `agent_message` séquencés). Si un autre écrivain existe, s'arrêter et le signaler au reviewer.

- [ ] **Step 2: Mettre la séquence en cache local de boucle**

À côté de `let mut linked_reply_text = String::new();` :

```rust
        // séquence du miroir : lue UNE fois du journal puis incrémentée en
        // mémoire — la relecture intégrale du JSONL par événement texte était
        // O(n²) sur la durée du tour (audit perf 2026-08-28). Sûr tant que
        // cette pompe est le seul écrivain séquencé du fil source (vérifié).
        let mut linked_reply_seq: Option<u64> = None;
```

Et remplacer la ligne `let sequence = linked_reply_state.journal().last_sequence(source_thread_id) + 1;` par :

```rust
                    let sequence = match linked_reply_seq {
                        Some(previous) => previous + 1,
                        None => linked_reply_state.journal().last_sequence(source_thread_id) + 1,
                    };
                    linked_reply_seq = Some(sequence);
```

- [ ] **Step 3: Suites** — `cargo test --manifest-path rust/Cargo.toml -p atelier-runtime` → vert.

- [ ] **Step 4: Commit**

```bash
git add rust/crates/atelier-runtime/src/send.rs
git commit -m "perf(runtime): séquence des fils liés en cache de boucle — plus de relecture du journal par delta"
```

---

### Task 10: Cache TTL sur getUsage

Chaque `getUsage` rescanne `~/.codex/sessions` (stat de tout, lecture de 10 rollouts), `~/.grok/logs/unified.jsonl` en entier, et chaque `wire.jsonl` de chaque session Kimi. Appelé toutes les 5 min + rafale de 9 à l'ouverture du popover.

**Files:**
- Modify: `rust/crates/atelier-runtime/src/usage.rs` (`collect_providers`)

- [ ] **Step 1: Renommer et encapsuler**

Lire la signature exacte de `collect_providers` (`grep -n "pub async fn collect_providers" rust/crates/atelier-runtime/src/usage.rs`). Renommer l'actuelle en `collect_providers_uncached` (même signature, visibilité privée) et ajouter :

```rust
use std::sync::OnceLock;
use std::time::{Duration, Instant};

// getUsage rescanne des arborescences entières de logs (codex/grok/kimi) :
// 30 s de fraîcheur suffisent largement à un compteur d'usage, et la rafale
// de 9 appels du popover (UsagePopover.tsx:163-168) devient gratuite.
static USAGE_CACHE: OnceLock<tokio::sync::Mutex<Option<(Instant, Value)>>> = OnceLock::new();

pub async fn collect_providers() -> Value {
    let cache = USAGE_CACHE.get_or_init(|| tokio::sync::Mutex::new(None));
    let mut guard = cache.lock().await;
    if let Some((at, value)) = guard.as_ref() {
        if at.elapsed() < Duration::from_secs(30) {
            return value.clone();
        }
    }
    let fresh = collect_providers_uncached().await;
    *guard = Some((Instant::now(), fresh.clone()));
    fresh
}
```

(Si le type de retour n'est pas `Value`, adapter le tuple du cache au type réel.)

- [ ] **Step 2: Suites** — `cargo test --manifest-path rust/Cargo.toml -p atelier-runtime` → vert.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/atelier-runtime/src/usage.rs
git commit -m "perf(runtime): cache 30 s sur collect_providers — le popover usage ne rescanne plus les logs à chaque appel"
```

---

### Task 11: get_all_ledgers ne parse plus que la queue

Tous les ledgers de tous les projets sont lus ET désérialisés ligne à ligne avant troncature à 500.

**Files:**
- Modify: `rust/crates/atelier-store/src/ledger.rs:71-96` + test dans le module `tests` existant

- [ ] **Step 1: Test qui échoue (comportement, pas perf)**

```rust
    #[test]
    fn get_all_ledgers_keeps_only_the_tail() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("proj.jsonl");
        let lines: Vec<String> = (0..1000).map(|i| format!("{{\"i\":{i}}}")).collect();
        std::fs::write(&file, lines.join("\n")).unwrap();
        let all = get_all_ledgers(dir.path(), 500);
        assert_eq!(all.len(), 500);
        assert_eq!(all.first().unwrap()["i"], 500); // la QUEUE, pas la tête
        assert_eq!(all.last().unwrap()["i"], 999);
    }
```

(Si un test équivalent existe déjà, le conserver — celui-ci verrouille l'ordre.)

- [ ] **Step 2: Le faire passer avec la lecture en queue**

```rust
    for ent in rd.flatten() {
        let path = ent.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        // seules les `max` dernières lignes d'un fichier peuvent survivre à la
        // troncature globale : ne parser qu'elles (les ledgers sont en append
        // pur, sans rotation — des mois d'historique sinon re-désérialisés à
        // chaque getUsage)
        let mut lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
        if lines.len() > max {
            lines = lines.split_off(lines.len() - max);
        }
        for line in lines {
            if let Ok(v) = serde_json::from_str(line) {
                all.push(v);
            }
        }
    }
```

- [ ] **Step 3: Suites** — `cargo test --manifest-path rust/Cargo.toml -p atelier-store` → vert.

- [ ] **Step 4: Commit**

```bash
git add rust/crates/atelier-store/src/ledger.rs
git commit -m "perf(store): get_all_ledgers ne désérialise que la queue utile de chaque ledger"
```

---

### Task 12: Polling des éditeurs via /statfile (mtime seul, plus le texte entier)

Chaque éditeur ouvert retélécharge le texte complet toutes les 2 s pour comparer un mtime. La route `/statfile` (mtime sans lire le fichier) existe déjà (`files.rs:352`).

**Files:**
- Modify: `gallery/src/studio/core/document_session.ts` (~options + `pollOnce`, 110-128)
- Modify: `gallery/src/studio/surfaces/latex.ts` (~407-420 `ensureSession`, ~808-810 interval)
- Modify: `gallery/src/studio/surfaces/code.ts` (~225-227, même motif)
- Modify: `gallery/src/studio/surfaces/markdown.ts` (~157, même motif)

- [ ] **Step 1: Lire `docs/PIEGES_CONNUS.md`** (obligatoire — les éditeurs studio y ont leurs pièges), et lire la réponse exacte de `/statfile` dans `rust/crates/atelier-gallery/src/files.rs:352-370` (nom du champ mtime).

- [ ] **Step 2: Option `stat` dans la session**

Dans le type d'options de `createDocumentSession`, ajouter :

```ts
  /** Sonde légère : mtime seul (route /statfile). Quand fournie, pollOnce ne
   * télécharge le texte complet que si le mtime a réellement bougé. */
  stat?: () => Promise<number | null>;
```

Et en tête de `pollOnce`, après le garde `polling` :

```ts
      if (options.stat) {
        const mtime = await options.stat().catch(() => null);
        // sonde en échec : ne rien conclure, retenter au prochain tick
        if (mtime == null) return false;
        if (Math.abs(mtime - state.mtime) <= epsilon) return false;
      }
```

(Le chemin complet `options.read()` reste ensuite inchangé — `stat` est un court-circuit, pas un remplacement : la comparaison texte/baseline existante garde son rôle.)

- [ ] **Step 3: Brancher les trois surfaces**

Dans `latex.ts` (`ensureSession`, à côté de `read:`), en réutilisant la même construction d'URL/token que le `read` existant de CHAQUE surface (si `read` passe un token, `stat` le passe aussi) :

```ts
      stat: async () => {
        const response = await win.fetch(`/statfile?path=${encodeURIComponent(path)}`);
        const result = await response.json() as { mtime?: number };
        const mtime = Number(result.mtime);
        return Number.isFinite(mtime) ? mtime : null;
      },
```

Répéter dans `code.ts` et `markdown.ts` (adapter `win`/`path` aux noms locaux).

- [ ] **Step 4: Gater l'onglet masqué**

Dans les trois `setInterval(... pollOnce ..., 2000)`, ajouter en tête de callback :

```ts
    if (win.document.hidden) return; // onglet masqué : aucune sonde
```

- [ ] **Step 5: Suite galerie**

Run: `node gallery/server/tests/diff_suite.mjs`
Expected: « ok ». Si la suite couvre `document_session` (chercher `document_session` dans `gallery/server/tests/`), y ajouter un cas : `stat` renvoyant le mtime courant ⇒ `read` jamais appelé ; `stat` renvoyant un mtime plus grand ⇒ `read` appelé.

- [ ] **Step 6: Commit**

```bash
git add gallery/src/studio/core/document_session.ts gallery/src/studio/surfaces/latex.ts gallery/src/studio/surfaces/code.ts gallery/src/studio/surfaces/markdown.ts
git commit -m "perf(studio): le polling 2 s sonde /statfile (mtime) au lieu de retélécharger le document"
```

Note : si les bundles studio sont buildés (chercher un script de build dans `gallery/` — p.ex. les bundles `cm6`), le régénérer et committer le résultat, comme le font les commits existants du dépôt.

---

### Task 13: Mode Lecture LaTeX — debounce au lieu d'un rendu par frappe

`editor.on("change") → rAF(render)` re-rend TOUT le document (8 passes regex + KaTeX + innerHTML) à chaque frappe. Un rAF n'est pas un debounce.

**Files:**
- Modify: `gallery/src/studio/features/latex/reading.ts:783-790`

- [ ] **Step 1: Remplacer le branchement**

```ts
    // un rendu par frappe = 8 passes regex + KaTeX + innerHTML sur tout le
    // document ; 250 ms d'accalmie suffisent au confort de lecture (le mode
    // Lecture n'est pas la frappe : l'utilisateur lit pendant qu'il n'édite pas)
    let renderTimer = 0;
    editor.on("change", () => {
      if (!enabled || editing) return;
      win.clearTimeout(renderTimer);
      renderTimer = win.setTimeout(() => {
        if (enabled && !frame && !editing) frame = win.requestAnimationFrame(render);
      }, 250);
    });
```

(Conserver la variable `frame` et son cycle existant — seul le déclencheur change.)

- [ ] **Step 2: Suite galerie** — `node gallery/server/tests/diff_suite.mjs` → « ok ». Rebuild des bundles studio si applicable (voir note Task 12).

- [ ] **Step 3: Commit**

```bash
git add gallery/src/studio/features/latex/reading.ts
git commit -m "perf(studio): mode Lecture LaTeX débouncé à 250 ms — plus de rendu complet par frappe"
```

---

### Task 14: Pollings de la galerie gatés sur document.hidden

Trois intervals (`/rev` 2,5 s, `/quote` 30 s, `/ping`+menu 60 s) tournent même onglet masqué.

**Files:**
- Modify: `gallery/assets/gallery_template.html` (~2522-2523 et ~2931-2942)
- Modify: `src-tauri/gallery-dist/assets/gallery_template.html` (copie conforme)

- [ ] **Step 1: Lire le code exact des trois intervals** (les numéros de lignes de l'audit peuvent avoir dérivé — chercher `setInterval` dans le fichier).

- [ ] **Step 2: Extraire et gater le poll /rev**

Le corps de l'interval 2 500 ms devient une fonction nommée (p.ex. `checkRev`), l'interval l'appelle avec le garde, et le retour de visibilité rattrape :

```js
// onglet masqué : aucune requête ; au retour, un rattrapage immédiat pour ne
// pas afficher une galerie périmée pendant jusqu'à 2,5 s
setInterval(() => { if (!document.hidden) checkRev(); }, 2500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRev(); });
```

- [ ] **Step 3: Même garde (sans rattrapage) sur `/quote` et `/ping`**

```js
setInterval(() => { if (!document.hidden) quoteCheck(); }, 30000);
setInterval(() => { if (!document.hidden) checkHealth(); }, 60000);
```

- [ ] **Step 4: Synchroniser gallery-dist, suite, commit**

```bash
cp gallery/assets/gallery_template.html src-tauri/gallery-dist/assets/gallery_template.html
node gallery/server/tests/diff_suite.mjs
git add gallery/assets/gallery_template.html src-tauri/gallery-dist/assets/gallery_template.html
git commit -m "perf(galerie): les trois pollings s'arrêtent onglet masqué (rattrapage au retour pour /rev)"
```

---

### Task 15: MutationObserver du contrat shadcn — coalescé

Le MutationObserver global rappelle `applyShadcnGalleryContract` (7 `querySelectorAll`) **par nœud ajouté** ; combiné au re-render de la grille : ~600 × 15 × 7 sélecteurs par frappe.

**Files:**
- Modify: `gallery/assets/gallery_template.html` (~795-812)
- Modify: `src-tauri/gallery-dist/assets/gallery_template.html` (copie conforme)

- [ ] **Step 1: Lire le bloc exact** (observer + `applyShadcnGalleryContract`) avant de toucher.

- [ ] **Step 2: Coalescer par microtâche**

Remplacer le callback par :

```js
// coalescence : un re-render de grille ajoute ~600 cartes d'un coup — appliquer
// le contrat UNE fois par lot de mutations, et sur document.body dès que le lot
// est gros (600 querySelectorAll ciblés coûteraient plus cher qu'un global)
let contractQueued = false;
const contractRoots = new Set();
new MutationObserver((mutations) => {
  for (const mutation of mutations)
    for (const node of mutation.addedNodes)
      if (node.nodeType === 1) contractRoots.add(node);
  if (contractQueued || !contractRoots.size) return;
  contractQueued = true;
  queueMicrotask(() => {
    contractQueued = false;
    const roots = [...contractRoots];
    contractRoots.clear();
    if (roots.length > 20) { applyShadcnGalleryContract(document.body); return; }
    for (const node of roots) if (node.isConnected) applyShadcnGalleryContract(node);
  });
}).observe(document.body, { childList: true, subtree: true });
```

(Garder les options `observe` identiques à l'existant.)

- [ ] **Step 3: Synchroniser, suite, commit**

```bash
cp gallery/assets/gallery_template.html src-tauri/gallery-dist/assets/gallery_template.html
node gallery/server/tests/diff_suite.mjs
git add gallery/assets/gallery_template.html src-tauri/gallery-dist/assets/gallery_template.html
git commit -m "perf(galerie): contrat shadcn appliqué une fois par lot de mutations, pas par nœud"
```

---

### Task 16: Vignette inspecteur — clé de cache stable

`'&inspect='+Date.now()` ⇒ une requête `/thumb` non cachée par frappe quand une carte est sélectionnée.

**Files:**
- Modify: `gallery/assets/gallery_template.html` (~1685) + copie `src-tauri/gallery-dist/…`

- [ ] **Step 1: Lire le contexte** (~1675-1695) : identifier la variable de la figure sélectionnée (elle porte un `mtime` dans `FILES` ; sinon, la variable de révision globale du serveur, souvent `REV`).

- [ ] **Step 2: Remplacer** `+'&inspect='+Date.now()` par `+'&inspect='+(<fig>.mtime || 0)` (ou `REV`) — le cache-bust ne doit changer QUE quand la figure change réellement.

- [ ] **Step 3: Synchroniser, suite, commit**

```bash
cp gallery/assets/gallery_template.html src-tauri/gallery-dist/assets/gallery_template.html
node gallery/server/tests/diff_suite.mjs
git add gallery/assets/gallery_template.html src-tauri/gallery-dist/assets/gallery_template.html
git commit -m "perf(galerie): la vignette de l'inspecteur se cache-buste au mtime, plus à chaque render"
```

---

### Task 17: Fingerprint du binaire galerie en cache + zombies moissonnés

(a) `file_fingerprint` relit et hashe le binaire de 7,7 Mo à chaque `start_atelier`. (b) `host.rs` fait `std::mem::forget(child)` sur chaque `open` ⇒ un zombie par ouverture de fichier externe.

**Files:**
- Modify: `src-tauri/src/atelier.rs:142-145`
- Modify: `rust/crates/atelier-gallery/src/host.rs:92-97`

- [ ] **Step 1: Cache du fingerprint (clé = chemin + mtime + taille)**

```rust
fn file_fingerprint(path: &Path) -> Result<String, String> {
    use std::collections::HashMap;
    use std::sync::Mutex;
    // le binaire ne change qu'à un redéploiement : re-hasher 7,7 Mo à chaque
    // ouverture de galerie est du pur gaspillage (clé = chemin+mtime+taille)
    static CACHE: Mutex<Option<HashMap<(std::path::PathBuf, u64, u64), String>>> = Mutex::new(None);
    let meta = std::fs::metadata(path).map_err(|e| format!("stat {}: {e}", path.display()))?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let key = (path.to_path_buf(), mtime, meta.len());
    let mut guard = CACHE.lock().unwrap();
    let cache = guard.get_or_insert_with(HashMap::new);
    if let Some(hash) = cache.get(&key) {
        return Ok(hash.clone());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("hash {}: {e}", path.display()))?;
    let hash = format!("{:x}", md5::compute(bytes));
    cache.insert(key, hash.clone());
    Ok(hash)
}
```

- [ ] **Step 2: Moissonner le process `open`**

Dans `host.rs`, remplacer `std::mem::forget(child);` par :

```rust
                // `open` se termine aussitôt : le moissonner dans un thread
                // jetable au lieu de le forget (un zombie par ouverture sinon,
                // accumulés pour la vie du serveur galerie)
                std::thread::spawn(move || {
                    let mut child = child;
                    let _ = child.wait();
                });
```

(Adapter au binding réel : si `pid` était extrait avant le forget, le lire AVANT le move.)

- [ ] **Step 3: Compiler et tester** — `cargo check --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path rust/Cargo.toml -p atelier-gallery` → vert.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/atelier.rs rust/crates/atelier-gallery/src/host.rs
git commit -m "perf(app): fingerprint binaire en cache + zombies open moissonnés"
```

---

### Task 18: append_log — handle ouvert + rotation

`append_log` (log CLI Claude) fait open/write/close **par ligne de stderr**, sans rotation ni plafond.

**Files:**
- Modify: `rust/crates/atelier-providers/src/claude.rs` (~839-847 `append_log`) + test

- [ ] **Step 1: Lire `append_log` et ses appelants** (`grep -n "append_log" rust/crates/atelier-providers/src/claude.rs`).

- [ ] **Step 2: Réécrire avec handle persistant et rotation 10 Mo**

```rust
use std::sync::Mutex;

// handle ouvert une fois (3 syscalls/ligne sinon) ; rotation à 10 Mo vers
// `claude-cli.log.old` — le log n'était borné par rien (audit 2026-08-28)
static LOG_SINK: Mutex<Option<(std::path::PathBuf, std::fs::File)>> = Mutex::new(None);
const LOG_ROTATE_BYTES: u64 = 10 * 1024 * 1024;

fn append_log(dir: &Path, line: &str) -> std::io::Result<()> {
    use std::io::Write;
    let path = dir.join("claude-cli.log");
    let mut guard = LOG_SINK.lock().unwrap();
    let reopen = match guard.as_ref() {
        Some((cached, file)) => {
            cached != &path || file.metadata().map(|m| m.len() >= LOG_ROTATE_BYTES).unwrap_or(true)
        }
        None => true,
    };
    if reopen {
        std::fs::create_dir_all(dir)?;
        if std::fs::metadata(&path).map(|m| m.len() >= LOG_ROTATE_BYTES).unwrap_or(false) {
            let _ = std::fs::rename(&path, dir.join("claude-cli.log.old"));
        }
        let file = std::fs::OpenOptions::new().create(true).append(true).open(&path)?;
        *guard = Some((path, file));
    }
    let (_, file) = guard.as_mut().expect("sink initialisé ci-dessus");
    writeln!(file, "{line}")
}
```

(Conserver la signature d'origine ; si elle renvoyait autre chose que `io::Result`, adapter les appelants `let _ = append_log(…)` restent valides.)

- [ ] **Step 3: Test de rotation**

```rust
    #[test]
    fn append_log_rotates_at_cap() {
        let dir = tempfile::tempdir().unwrap();
        append_log(dir.path(), "a").unwrap();
        // gonfler artificiellement puis forcer la relecture du handle
        let path = dir.path().join("claude-cli.log");
        {
            use std::io::Write;
            let mut f = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
            f.write_all(&vec![b'x'; (super::LOG_ROTATE_BYTES as usize) + 1]).unwrap();
        }
        append_log(dir.path(), "b").unwrap();
        assert!(dir.path().join("claude-cli.log.old").exists());
        assert!(std::fs::metadata(&path).unwrap().len() < 1024);
    }
```

(Le sink statique est partagé entre tests — si un autre test écrit des logs, sérialiser avec un lock de test ou un nom de fichier par tempdir, ce que le `cached != &path` gère déjà.)

- [ ] **Step 4: Suites** — `cargo test --manifest-path rust/Cargo.toml -p atelier-providers` → vert.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-providers/src/claude.rs
git commit -m "perf(providers): claude-cli.log en handle persistant avec rotation 10 Mo"
```

---

# PHASE 3 — Chemin de rendu du chat (gains fins, plus de soin)

### Task 19: Rangées virtuelles stables + itemsAreEqual sur LegendList

`virtualItems` reconstruit des objets neufs à chaque render ; LegendList re-rend alors TOUTES les rangées visibles (≥12 avec `alwaysRender bottom:12`) à chaque frame. Le réducteur réutilise les objets `event` inchangés — on peut donc réutiliser les objets rangée.

**Files:**
- Modify: `src/components/chat/ChatTimeline.tsx` (~271-281 `virtualItems`, ~681+ props LegendList)
- Create: `src/components/chat/virtualRows.ts` + `src/components/chat/virtualRows.test.ts`

**Interfaces:**
- Produces: `stabilizeVirtualRows(prev: Map<string, TimelineVirtualItem>, next: TimelineVirtualItem[]) → TimelineVirtualItem[]` (réutilise l'objet précédent quand type identique et item shallow-égal) et `sameVirtualRow(a, b)`.

- [ ] **Step 1: Test qui échoue**

```ts
// src/components/chat/virtualRows.test.ts
import { describe, expect, it } from "vitest";
import { stabilizeVirtualRows } from "./virtualRows";

const row = (key: string, item?: Record<string, unknown>) =>
  ({ type: item ? "rendered" : "working", key, item } as any);

describe("stabilizeVirtualRows", () => {
  it("réutilise l'objet précédent quand l'item est shallow-égal", () => {
    const ev = { kind: "text", text: "a" };
    const prev = new Map([["k1", row("k1", { type: "event", index: 0, event: ev })]]);
    const [stable] = stabilizeVirtualRows(prev, [row("k1", { type: "event", index: 0, event: ev })]);
    expect(stable).toBe(prev.get("k1"));
  });
  it("rend le nouvel objet quand l'item a changé", () => {
    const prev = new Map([["k1", row("k1", { type: "event", index: 0, event: { text: "a" } })]]);
    const next = row("k1", { type: "event", index: 0, event: { text: "b" } });
    const [stable] = stabilizeVirtualRows(prev, [next]);
    expect(stable).toBe(next);
  });
  it("les rangées sans item se réutilisent sur la clé seule", () => {
    const prev = new Map([["w", row("w")]]);
    const [stable] = stabilizeVirtualRows(prev, [row("w")]);
    expect(stable).toBe(prev.get("w"));
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run src/components/chat/virtualRows.test.ts` → FAIL.

- [ ] **Step 3: Implémenter**

```ts
// src/components/chat/virtualRows.ts
// LegendList re-rend une rangée dès que l'IDENTITÉ de son item change
// (Object.is) — or virtualItems reconstruit des objets neufs à chaque render.
// Le réducteur réutilisant les objets event inchangés, un shallow-equal
// suffit à réutiliser l'objet rangée précédent, et les deltas du stream ne
// coûtent plus qu'UNE rangée re-rendue (la bulle en cours) au lieu de ≥12.
import type { TimelineVirtualItem } from "./ChatTimeline"; // adapter si le type vit ailleurs

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

export function sameVirtualRow(a: TimelineVirtualItem, b: TimelineVirtualItem): boolean {
  if (a.type !== b.type) return false;
  const ia = (a as { item?: Record<string, unknown> }).item;
  const ib = (b as { item?: Record<string, unknown> }).item;
  if (!ia || !ib) return ia === ib;
  return shallowEqual(ia, ib);
}

export function stabilizeVirtualRows(
  prev: Map<string, TimelineVirtualItem>,
  next: TimelineVirtualItem[],
): TimelineVirtualItem[] {
  return next.map((rowItem) => {
    const old = prev.get(rowItem.key);
    return old && sameVirtualRow(old, rowItem) ? old : rowItem;
  });
}
```

(Si `TimelineVirtualItem` n'est pas exporté de ChatTimeline, l'exporter — changement de type pur.)

- [ ] **Step 4: Brancher dans ChatTimeline**

Dans le `useMemo` de `virtualItems`, après la construction de `rows` :

```tsx
  const prevRowsRef = React.useRef(new Map<string, TimelineVirtualItem>());
  // …dans le useMemo, remplacer `return rows;` par :
    const stable = stabilizeVirtualRows(prevRowsRef.current, rows);
    prevRowsRef.current = new Map(stable.map((r) => [r.key, r]));
    return stable;
```

Et sur `<LegendList …>` ajouter :

```tsx
        // sans itemsAreEqual, LegendList updateData() même à identité égale
        itemsAreEqual={(a, b) => a === b}
```

- [ ] **Step 5: Suites + banc**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: vert. Noter dans le commit que la validation visuelle du scroll (banc `#chatbench-livestream`, `ChatBench.tsx`) reste à faire par Thierry — les filets de scroll sont sensibles (mémoire `atelier-legendlist-scroll`).

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/virtualRows.ts src/components/chat/virtualRows.test.ts src/components/chat/ChatTimeline.tsx
git commit -m "perf(chat): rangées virtuelles stables + itemsAreEqual — un delta ne re-rend plus que la bulle en cours"
```

---

### Task 20: Résolution des marques en cache incrémental

`deriveMargeEntries` refait `findIndex(includes)` sur tout le fil, par marque, par render (jusqu'à ~20 M de comparaisons par token avec des passages annotés).

**Files:**
- Modify: `src/lib/marge.ts` (+ export nouveau)
- Create: `src/lib/margeMarkCache.test.ts`
- Modify: `src/components/chat/ChatTimeline.tsx` (~320, le useMemo `margeEntries`)

**Interfaces:**
- Produces: `createMarkIndexCache() → { reset(), resolve(events, passage) → number }`.
- Modifie: `deriveMargeEntries(events, pins, marks, options)` gagne `options.resolveMark?: (events, passage) => number` (défaut = comportement actuel).

- [ ] **Step 1: Tests qui échouent**

```ts
// src/lib/margeMarkCache.test.ts
import { describe, expect, it } from "vitest";
import { createMarkIndexCache } from "./marge";

const ev = (text: string) => ({ kind: "text", text }) as any;

describe("createMarkIndexCache", () => {
  it("résout puis sert du cache tant que l'événement porte encore le passage", () => {
    const cache = createMarkIndexCache();
    const events = [ev("bonjour"), ev("le névé sale")];
    expect(cache.resolve(events, "névé")).toBe(1);
    expect(cache.resolve(events, "névé")).toBe(1); // hit
  });
  it("un passage introuvable est re-cherché seulement dans le nouveau texte", () => {
    const cache = createMarkIndexCache();
    const events = [ev("a"), ev("b")];
    expect(cache.resolve(events, "zzz")).toBe(-1);
    // le passage apparaît dans un événement AJOUTÉ ensuite
    expect(cache.resolve([...events, ev("zzz enfin")], "zzz")).toBe(2);
  });
  it("le dernier événement (potentiellement en croissance) est toujours re-scanné", () => {
    const cache = createMarkIndexCache();
    const growing = [ev("a"), ev("début…")];
    expect(cache.resolve(growing, "fin")).toBe(-1);
    expect(cache.resolve([ev("a"), ev("début… fin")], "fin")).toBe(1);
  });
  it("reset vide tout (changement de fil)", () => {
    const cache = createMarkIndexCache();
    expect(cache.resolve([ev("x")], "x")).toBe(0);
    cache.reset();
    expect(cache.resolve([ev("y")], "x")).toBe(-1);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run src/lib/margeMarkCache.test.ts` → FAIL.

- [ ] **Step 3: Implémenter dans marge.ts**

```ts
type MarkHit = { index: number; scannedTo: number };

/** Cache incrémental de résolution passage→index. Le fil ne fait que grandir
 * pendant un tour ; un passage déjà résolu se re-valide en un `includes` sur
 * SON événement, et un passage introuvable ne re-scanne que le texte nouveau.
 * Le dernier événement reste toujours re-scanné : c'est la bulle en cours,
 * son texte grandit. Reset au changement de fil ou au rejeu d'historique. */
export function createMarkIndexCache() {
  const hits = new Map<string, MarkHit>();
  return {
    reset() {
      hits.clear();
    },
    resolve(events: MargeEvent[], passage: string): number {
      const hit = hits.get(passage);
      if (
        hit && hit.index >= 0 && hit.index < events.length
        && (events[hit.index].text ?? "").includes(passage)
      ) return hit.index;
      const from = hit && hit.index < 0 ? Math.min(hit.scannedTo, Math.max(0, events.length - 1)) : 0;
      for (let i = from; i < events.length; i += 1) {
        if ((events[i].text ?? "").includes(passage)) {
          hits.set(passage, { index: i, scannedTo: i + 1 });
          return i;
        }
      }
      hits.set(passage, { index: -1, scannedTo: Math.max(0, events.length - 1) });
      return -1;
    },
  };
}
```

Puis dans `deriveMargeEntries`, remplacer la résolution inline par :

```ts
  const resolveMark = options.resolveMark
    ?? ((evts: MargeEvent[], passage: string) =>
      evts.findIndex((event) => (event.text ?? "").includes(passage)));
  // …
    const index = resolveMark(events, passage);
```

(et ajouter `resolveMark?` au type `MargeOptions`).

- [ ] **Step 4: Brancher dans ChatTimeline**

Près du useMemo `margeEntries` (~320) :

```tsx
  const markCacheRef = React.useRef(createMarkIndexCache());
  const prevEventsLenRef = React.useRef(0);
  React.useEffect(() => {
    // rejeu d'historique ou changement de fil : le fil a RACCOURCI → tout
    // index caché est suspect
    if (events.length < prevEventsLenRef.current) markCacheRef.current.reset();
    prevEventsLenRef.current = events.length;
  }, [threadId, events.length]);
```

et passer `resolveMark: markCacheRef.current.resolve` dans les options de `deriveMargeEntries`. Reset aussi sur `threadId` (ajouter `markCacheRef.current.reset()` dans un effect dédié `[threadId]` si l'effect ci-dessus ne suffit pas).

- [ ] **Step 5: Suites** — `npx vitest run` (les tests marge existants doivent rester verts) + `npx tsc --noEmit` → vert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/marge.ts src/lib/margeMarkCache.test.ts src/components/chat/ChatTimeline.tsx
git commit -m "perf(chat): résolution des passages annotés en cache incrémental — plus de scan du fil complet par delta"
```

---

### Task 21: ToolOutputLine mémoïsé

`stripAnsi` (2 regex sur ≤64 Ko) + `JSON.parse` (≤6 Ko) refaits à chaque render de chaque ligne d'outil visible.

**Files:**
- Modify: `src/components/chat/toolPresentation.tsx` (~171-189)

- [ ] **Step 1: Envelopper et mémoïser**

```tsx
export const ToolOutputLine = memo(function ToolOutputLine(
  { event }: { event: Extract<AgentEvent, { kind: "tool_update" }> },
) {
  // event est réutilisé tel quel par le réducteur tant que l'outil n'émet
  // rien : memo + useMemo évitent stripAnsi (regex sur ≤64 Ko) et JSON.parse
  // à chaque frame de streaming
  const cleanOutput = useMemo(() => stripAnsi(event.output), [event.output]);
  const output = useMemo(() => truncateToolOutput(cleanOutput), [cleanOutput]);
  // … le reste du corps inchangé, puis :
  const trimmedOutput = output.trim();
  const isJsonOutput = useMemo(
    () => cleanOutput.length <= 6000
      && (trimmedOutput.startsWith("{") || trimmedOutput.startsWith("["))
      && isJsonText(trimmedOutput),
    [cleanOutput.length, trimmedOutput],
  );
  // …
});
```

Vérifier les imports (`memo`, `useMemo` depuis react) et que l'export nommé reste compatible avec les usages (`grep -rn "ToolOutputLine" src/`).

- [ ] **Step 2: Suites** — `npx tsc --noEmit && npx vitest run` → vert.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/toolPresentation.tsx
git commit -m "perf(chat): ToolOutputLine mémoïsé — stripAnsi/JSON.parse une fois par sortie, pas par frame"
```

---

### Task 22: Le bloc de code en croissance ne pollue plus le cache highlight

Pendant le stream d'un bloc de code, chaque frame insère une entrée neuve (clé `lang+raw`) dans le LRU 300 ⇒ éviction de tout l'historique déjà coloré.

**Files:**
- Modify: `src/components/chat/md.tsx` (~353 `highlightCode`, ~390 le CodeBlock, et la définition de `MD_COMPONENTS_STREAMING`)

- [ ] **Step 1: Paramètre transient**

```ts
export function highlightCode(raw: string, lang: string, opts?: { transient?: boolean }): string {
  const key = `${lang} ${raw}`;
  const cached = highlightCache.get(key);
  if (cached !== undefined) return cached;
  // … calcul inchangé …
  // un bloc en cours de stream produit une clé NEUVE par frame : l'insérer
  // éviderait le cache de l'historique (LRU 300) pour des entrées mortes
  if (!opts?.transient) highlightCache.set(key, result);
  return result;
}
```

(Adapter à la forme réelle : si l'insertion actuelle est `highlightCache.set(key, result)` en fin de fonction, la conditionner.)

- [ ] **Step 2: Propager depuis la variante streaming**

Lire comment `MD_COMPONENTS_STREAMING` diffère de `MD_COMPONENTS` (dans md.tsx). Donner au composant CodeBlock une prop `transient?: boolean` (défaut false), la passer à `highlightCode(raw, lang, { transient })`, et faire que la variante STREAMING rende `<CodeBlock transient …>`. Seul le DERNIER bloc re-rend pendant le stream (MdBlock est mémoïsé), donc l'historique garde son cache.

- [ ] **Step 3: Suites** — `npx tsc --noEmit && npx vitest run src/components/chat/` → vert (dont `md.languages.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/md.tsx
git commit -m "perf(chat): le bloc de code en stream n'insère plus une entrée LRU par frame"
```

---

### Task 23: Le filet de suivi du scroll ne tourne que pendant un tour

Interval 300 ms avec 3 lectures de géométrie (reflow forcé) dès que `autoFollow`, même sans streaming ni contenu nouveau.

**Files:**
- Modify: `src/components/chat/ChatTimeline.tsx` (~508-522)

**ATTENTION** : les filets de scroll sont un champ de mines documenté (mémoires `atelier-legendlist-scroll`, `atelier-marge-pins-pieges`). Changement minimal, comportement pendant un tour STRICTEMENT identique.

- [ ] **Step 1: Gater sur le tour actif**

```tsx
  React.useEffect(() => {
    if (!autoFollow) return;
    // le filet rattrape les tassements de layout PENDANT qu'un tour écrit ;
    // au repos, rien ne bouge — 3 reflows forcés × 3,3/s pour rien (audit
    // 2026-08-28). workingSince couvre aussi la fin de tour : l'effect se
    // rejoue à sa disparition et fait une dernière passe avant de s'arrêter.
    if (workingSince == null) return;
    let lastScrollHeight = -1;
    const id = window.setInterval(() => {
      /* corps inchangé */
    }, 300);
    return () => window.clearInterval(id);
  }, [autoFollow, messagesRef, workingSince]);
```

(`workingSince` est déjà une prop du composant — vérifier son nom exact dans la signature.)

- [ ] **Step 2: Suites + note banc**

Run: `npx tsc --noEmit && npx vitest run` → vert. Noter dans le commit : validation au banc `#chatbench-livestream` par Thierry avant de considérer la tâche fermée (images chargées tard hors tour ne seront plus rattrapées — tradeoff accepté, réversible).

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatTimeline.tsx
git commit -m "perf(chat): le filet de suivi 300 ms ne tourne que pendant un tour actif"
```

---

### Task 24: splitCodeSegments par tranches (plus de += caractère par caractère)

`splitCodeSegments` (`src/lib/markdown.ts:~50`) construit ses segments par `buf += text[i]` sur TOUT le texte révélé, à chaque frame du typewriter (~1,2 M concaténations/s sur un long message).

**Files:**
- Modify: `src/lib/markdown.ts`
- Create: `src/lib/markdown.parity.test.ts`

- [ ] **Step 1: Lire la fonction actuelle EN ENTIER** (elle définit la sémantique exacte : fences ```, inline backticks, échappements ?). La copier dans le test sous le nom `splitCodeSegmentsReference`.

- [ ] **Step 2: Test de parité qui échoue**

```ts
// src/lib/markdown.parity.test.ts
import { describe, expect, it } from "vitest";
import { splitCodeSegments } from "./markdown";
// copie verbatim de l'ancienne implémentation :
function splitCodeSegmentsReference(text: string) { /* … collée ici … */ }

const FIXTURES = [
  "",
  "du texte simple",
  "avant `inline` après",
  "```py\nprint(1)\n```",
  "texte ```js\nlet a=1;\n``` suite ```non fermé",
  "`` double `` et ```\nfence sans langue\n```",
  "backtick seul ` au milieu",
  "\\`échappé` selon la sémantique de l'original",
  "long " + "x".repeat(50_000) + " ```c\nint x;\n``` fin",
];

describe("splitCodeSegments — parité ancienne/nouvelle", () => {
  for (const [i, fixture] of FIXTURES.entries()) {
    it(`fixture ${i}`, () => {
      expect(splitCodeSegments(fixture)).toEqual(splitCodeSegmentsReference(fixture));
    });
  }
});
```

(Compléter les FIXTURES d'après ce que l'ancienne implémentation gère réellement — chaque branche de son automate mérite une fixture.)

- [ ] **Step 3: Réécrire par tranches**

Réécriture guidée : conserver l'automate (états texte/inline/fence) mais avancer par `indexOf`/`slice` au lieu de caractère par caractère — chaque segment devient un `text.slice(start, end)` unique. Squelette :

```ts
export function splitCodeSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  while (pos < text.length) {
    const fence = text.indexOf("```", pos);
    /* …selon la sémantique relevée à l'étape 1 : découper texte/fence par
       slices, gérer inline et fence non fermé exactement comme l'original… */
  }
  return out;
}
```

Le test de parité est l'arbitre : itérer jusqu'à parité parfaite.

- [ ] **Step 4: Suites** — `npx vitest run` (parité + tous les tests markdown/md existants) → vert.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.ts src/lib/markdown.parity.test.ts
git commit -m "perf(chat): splitCodeSegments par slices — parité verrouillée par fixtures"
```

---

### Task 25: Sous-arbres racine mémoïsés (TopBar, Rail)

Après la Task 1, App re-rend au plus une fois par frame pendant le stream — mais chaque render recrée TopBar/Rail/Sidebar entiers. On fige les deux plus gros.

**Files:**
- Modify: `src/App.tsx` (~3827 `topBarNode`, ~3869 `railNode`, + les handlers concernés)

**ATTENTION** : tâche mécanique mais délicate (dépendances de hooks). Un oubli de dep = bug d'UI figée. Faire UN composant à la fois, suites entre les deux.

- [ ] **Step 1: TopBar**

1. Lire le JSX de `topBarNode` et lister chaque prop non primitive (fonctions, objets, tableaux).
2. Chaque fonction inline devient un `useCallback` nommé au-dessus, avec les deps EXACTES que son corps lit (vérifier avec la règle : toute variable du scope composant lue dans le corps est une dep).
3. Chaque objet/tableau construit inline devient un `useMemo`.
4. Envelopper : `const TopBarMemo = React.memo(TopBar);` près des imports, et utiliser `<TopBarMemo …/>`.

- [ ] **Step 2: Vérifier** — `npx tsc --noEmit && npx vitest run` → vert. Contrôler qu'aucun avertissement eslint react-hooks n'apparaît si le lint est configuré (`npx eslint src/App.tsx` si disponible).

- [ ] **Step 3: Rail** — même procédure exactement.

- [ ] **Step 4: Suites complètes + build** — `npx tsc --noEmit && npx vitest run && npx vite build` → vert.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "perf(chat): TopBar et Rail mémoïsés — un delta de stream ne re-rend plus la coquille"
```

---

### Task 26: PDF LaTeX — rendu paresseux des pages

`pdf_sync.ts` rend TOUTES les pages en canvas au chargement (~14 Mo/page en 2×, plusieurs centaines de Mo pour un article), rechargées à chaque compilation. Le viewer autonome (`pdf_viewer.html:395-485`) montre le bon motif : gabarits sans canvas, rendu des pages visibles d'abord.

**Files:**
- Modify: `gallery/src/studio/features/latex/pdf_sync.ts` (~160-200 la boucle de rendu)

- [ ] **Step 1: Lire `docs/PIEGES_CONNUS.md` + tout `pdf_sync.ts`** — en particulier le mapping clic→ligne SyncTeX (les coordonnées doivent viser le conteneur de page, pas le canvas).

- [ ] **Step 2: Remplacer la boucle intégrale par gabarits + IntersectionObserver**

Motif cible (adapter aux noms locaux : `container`, `loaded`, `devicePixelRatio`, `intent`) :

```ts
  // Gabarits d'abord : un div dimensionné par page (viewport connu sans rendu),
  // le canvas n'existe que pour les pages proches du viewport, et il est évincé
  // au-delà de MAX_LIVE_PAGES — un article de 40 pages ne garde plus des
  // centaines de Mo de canvas résidents (audit perf 2026-08-28)
  const MAX_LIVE_PAGES = 6;
  const shells = new Map<number, HTMLDivElement>();
  const liveCanvases = new Map<number, HTMLCanvasElement>();

  for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber += 1) {
    const page = await loaded.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const shell = doc.createElement("div");
    shell.className = "pdf-page-shell";
    shell.dataset.page = String(pageNumber);
    shell.style.width = `${viewport.width}px`;
    shell.style.height = `${viewport.height}px`;
    container.appendChild(shell);
    shells.set(pageNumber, shell);
  }

  async function renderPage(pageNumber: number) {
    if (liveCanvases.has(pageNumber)) return;
    const shell = shells.get(pageNumber);
    if (!shell) return;
    const page = await loaded.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = doc.createElement("canvas");
    canvas.width = Math.floor(viewport.width * win.devicePixelRatio);
    canvas.height = Math.floor(viewport.height * win.devicePixelRatio);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    await page.render({
      canvasContext: canvas.getContext("2d")!,
      viewport,
      transform: [win.devicePixelRatio, 0, 0, win.devicePixelRatio, 0, 0],
    }).promise;
    shell.replaceChildren(canvas);
    liveCanvases.set(pageNumber, canvas);
    if (liveCanvases.size > MAX_LIVE_PAGES) evictFarthest(pageNumber);
  }

  function evictFarthest(anchor: number) {
    let victim = -1;
    let distance = -1;
    for (const pageNumber of liveCanvases.keys()) {
      const d = Math.abs(pageNumber - anchor);
      if (d > distance) { distance = d; victim = pageNumber; }
    }
    if (victim < 0) return;
    liveCanvases.delete(victim);
    shells.get(victim)?.replaceChildren(); // le gabarit garde sa taille
  }

  const io = new win.IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      void renderPage(Number((entry.target as HTMLElement).dataset.page));
    }
  }, { root: container, rootMargin: "150% 0%" });
  for (const shell of shells.values()) io.observe(shell);
```

Conserver l'`intent: "print"` de l'original s'il y était (le reporter dans `page.render`). Vérifier que le style `.pdf-page-shell` reprend les classes/marges du conteneur de page actuel (aucun changement visuel). Le rechargement à la compilation détruit tout et reconstruit — s'assurer que `io.disconnect()` est appelé dans le chemin de nettoyage existant.

- [ ] **Step 3: SyncTeX** — vérifier que le clic→source lit ses coordonnées sur le gabarit (`shell`) et non sur un canvas supposé présent ; adapter le listener si besoin.

- [ ] **Step 4: Suite + rebuild bundles** — `node gallery/server/tests/diff_suite.mjs` → « ok » ; rebuild des bundles studio si applicable. Validation manuelle par Thierry (compilation d'un long .tex, scroll, clic SyncTeX) à noter dans le commit.

- [ ] **Step 5: Commit**

```bash
git add gallery/src/studio/features/latex/pdf_sync.ts
git commit -m "perf(studio): pages PDF rendues à la demande avec éviction — plus de canvas résidents pour tout l'article"
```

---

# Backlog documenté (hors périmètre de ce plan)

À traiter dans un plan ultérieur — notés ici pour ne pas les perdre :

- **`events` non borné en mémoire** (App.tsx:530) : garder l'intégralité de tous les fils visités coûte cher en session longue ; demande un design (éviction par fil inactif + rechargement depuis le journal). Toucher après les tasks 1/19.
- **App.css 356 Ko d'un bloc** + `base-ui` 271 Ko au boot + `SettingsSheet` importé statiquement : découpage/lazy — gains de démarrage, pas de CPU.
- **Règles `:has()` sur les rangées virtualisées** (App.css:216-217) : le fichier interdit lui-même le motif (ligne ~366) ; remplacer par une classe posée en JS.
- **threads.json pretty réécrit à chaque upsert** + broadcast complet : débouncer, mais le contrat de diffusion doit être examiné.
- **`linked_reply_text` re-mirror le texte complet** par événement texte (send.rs:1165-1171) : O(n²) en octets ; demande un choix de protocole (delta de miroir).
- **Vignettes séquentielles au build** (gallery_builder.rs:260-320) : paralléliser avec le même sémaphore que la route HTTP ; et remplacer le busy-wait 50 ms de `command_success_with_timeout` par un vrai wait.
- **`canonicalize` par image par scan** : la clé inclut le chemin canonique — le hisser change la clé (régénération totale) ; à faire avec une migration de clé.
- **JSON.stringify de l'historique agent 2×/2,5 s** (App.tsx:1845-1848) : comparer sur la longueur + dernier eventId.
- **BrowserTab interval 1,2 s** (BrowserTab.tsx:489-502) : sortir la garde `visible` HORS du callback (ne pas armer le timer).
- **Terminaux** : `cursorBlink` + WebGL vivants masqués (Terminal.tsx) ; suspendre à l'onglet caché.
- **grok/kimi : échéance sèche 600 s** → filet d'inactivité comme codex (mémoire `atelier-timeout-inactivite`) — fiabilité plus que perf.
- **`sidecar/` mort en prod** : retirer `test:sidecar` de `verify`, purger les docs (`AGENTS.md` donne encore des `pkill` du sidecar) — coût CI/confusion. `parity.rs` inclut encore `router.mjs` : décision à prendre avant suppression.
- **Auto-compile LaTeX 3 s** : délai à exposer en réglage (choix produit, pas un bug).
- **getUsage rafale popover** (UsagePopover.tsx:163-168) : la Task 10 la rend inoffensive ; simplifier quand même le retry côté UI un jour.
