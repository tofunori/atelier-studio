# Widgets vivants dans le fil — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un agent CLI peut afficher dans le fil du chat un panneau interactif (HTML+JS écrit par le modèle) rendu dans une iframe close, qui survit au scroll et au rechargement de session.

**Architecture:** Un second outil MCP (`atelier_widget`) sur le shim stdio existant envoie le HTML par le pont HTTP local — jamais par la sortie de l'outil. Le runtime Rust valide, enveloppe dans une coquille CSP, écrit `<app_dir>/widgets/<sha256(threadId)>/<id>.html`, et publie un event `widget` léger (id, titre, hauteur) journalisé donc rejoué. Le frontend monte une iframe `srcdoc` en `sandbox="allow-scripts"` seul, à la hauteur déclarée dès le premier rendu.

**Tech Stack:** Rust (axum, serde_json, uuid, sha2, tempfile) · React 18 + TypeScript · Vitest + @testing-library/react · Tauri 2.

**Spec:** [docs/superpowers/specs/2026-08-28-widgets-chat-design.md](../specs/2026-08-28-widgets-chat-design.md)

## Global Constraints

Ces règles s'appliquent à **chaque** tâche ; elles ne sont pas répétées dans les tâches.

- **Rust-first** (CLAUDE.md) : toute logique backend en Rust. Aucun ajout de fonctionnalité dans `sidecar/*.mjs`.
- **Système de design contraignant** (CLAUDE.md) : tailles de texte 10/11/12/13/15 px uniquement ; poids 400/500/600 ; rayons 6 (contrôles) / 10 (cartes) / 999 (pilules) ; espacement multiple de 4 ; **aucun hex en dur** dans un composant — tout passe par les variables CSS ; icônes SVG monochromes stroke 1.3–1.5, **jamais d'emoji** ; transitions 120–150 ms, respect de `prefers-reduced-motion`.
- **Aucun `<button>` nu** hors `src/components/ui/` et `src/components/shadcn/` — utiliser `Button`, `IconButton` ou `RowButton`. Verrouillé par `src/components/ui/css-contract.test.ts`.
- **i18n** : toute chaîne visible passe par `t("clé")`, et **chaque clé doit être ajoutée dans les deux blocs** de `src/lib/i18n.ts` (fr autour de la ligne 522, en autour de la ligne 2066).
- **Portes vertes avant chaque commit** : `npx tsc --noEmit`, `npx vite build`, `npx vitest run <fichier touché>`, `cargo test -p <crate touchée>`. Ignorer `src/test_auto_review*.ts`.
- **Ne jamais pusher** sans demande explicite de Thierry. Commits locaux fréquents et petits (des sessions parallèles écrivent dans le même worktree).
- **Ne pas lancer `npm run tauri dev`** — il ne survit pas à un harness d'agent. La vérification se fait par tests.
- Bornes du domaine, valeurs exactes : `html` ≤ **128 KiB** · `title` ≤ **80** caractères (tronqué, jamais rejeté) · `height` clampé à **[120, 900]** · **8** widgets max par tour · **200** fichiers max par thread · `state` ≤ **4 Ko** · `prompt` ≤ **2000** caractères · délai `ready` **3000 ms**.
- Format d'identifiant, partout : `^w_[0-9a-f]{16}$`.

---

### Task 1: Outil `atelier_widget` dans le shim MCP

**Files:**
- Modify: `rust/crates/atelier-agent-mcp/src/schema.rs`
- Modify: `rust/crates/atelier-agent-mcp/src/server.rs:59-100` (les bras `tools/list` et `tools/call`)
- Test: `rust/crates/atelier-agent-mcp/src/schema.rs` (module `#[cfg(test)]` en fin de fichier)

**Interfaces:**
- Consumes: rien (première tâche).
- Produces:
  - `pub const WIDGET_TOOL_NAME: &str = "atelier_widget";`
  - `pub fn widget_tool_definition() -> serde_json::Value`
  - `pub fn bridge_call_for(tool_name: &str, args: &Value) -> Option<(String, Value)>` — rend `(action, arguments)` à passer à `bridge.call`, ou `None` si l'outil est inconnu. C'est le point testable qui remplace la logique en ligne de la boucle stdio.

- [ ] **Step 1: Write the failing test**

Ajouter en fin de `rust/crates/atelier-agent-mcp/src/schema.rs` :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn widget_tool_declares_its_three_required_fields() {
        let def = widget_tool_definition();
        assert_eq!(def["name"], WIDGET_TOOL_NAME);
        let required = def["inputSchema"]["required"].as_array().unwrap();
        assert_eq!(required.len(), 3);
        for field in ["html", "title", "height"] {
            assert!(
                required.iter().any(|v| v == field),
                "champ requis manquant : {field}"
            );
        }
        assert_eq!(def["inputSchema"]["additionalProperties"], json!(false));
    }

    #[test]
    fn widget_call_routes_to_show_widget_verbatim() {
        let args = json!({"html": "<p>x</p>", "title": "t", "height": 200});
        let (action, forwarded) = bridge_call_for(WIDGET_TOOL_NAME, &args).unwrap();
        assert_eq!(action, "show_widget");
        assert_eq!(forwarded, args, "les arguments passent tels quels au pont");
    }

    #[test]
    fn sessions_call_still_routes_by_its_action_field() {
        let args = json!({"action": "current"});
        let (action, _) = bridge_call_for(TOOL_NAME, &args).unwrap();
        assert_eq!(action, "current");
    }

    #[test]
    fn unknown_tool_routes_nowhere() {
        assert!(bridge_call_for("rm_rf", &json!({})).is_none());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p atelier-agent-mcp`
Expected: FAIL — `cannot find function 'widget_tool_definition'`, `cannot find value 'WIDGET_TOOL_NAME'`, `cannot find function 'bridge_call_for'`.

- [ ] **Step 3: Write minimal implementation**

Dans `rust/crates/atelier-agent-mcp/src/schema.rs`, sous `tool_definition()` :

```rust
pub const WIDGET_TOOL_NAME: &str = "atelier_widget";

pub fn widget_tool_definition() -> Value {
    json!({
        "name": WIDGET_TOOL_NAME,
        "description": "Afficher un panneau interactif dans le fil de la conversation. \
HTML autonome : aucun réseau, aucune bibliothèque externe, aucune police distante — \
tout le calcul se fait en JS local. Les couleurs viennent des variables CSS injectées \
(--fg, --muted, --border, --accent) ; n'invente pas de palette. Écris le contenu de la \
page seulement, sans <html>, <head> ni <body>.",
        "inputSchema": {
            "type": "object",
            "required": ["html", "title", "height"],
            "properties": {
                "html": { "type": "string", "description": "Contenu de la page" },
                "title": { "type": "string", "description": "Titre court affiché dans la barre (80 caractères max)" },
                "height": { "type": "integer", "description": "Hauteur du panneau en pixels, de 120 à 900" }
            },
            "additionalProperties": false
        }
    })
}

/// Traduit un `tools/call` en couple (action, arguments) pour le pont.
/// `atelier_sessions` porte son action dans ses arguments ; `atelier_widget`
/// est un outil plat dont l'action est fixe.
pub fn bridge_call_for(tool_name: &str, args: &Value) -> Option<(String, Value)> {
    match tool_name {
        WIDGET_TOOL_NAME => Some(("show_widget".to_string(), args.clone())),
        TOOL_NAME => {
            let action = args.get("action").and_then(|v| v.as_str())?;
            Some((action.to_string(), args.clone()))
        }
        _ => None,
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p atelier-agent-mcp`
Expected: PASS (4 tests).

- [ ] **Step 5: Brancher la boucle stdio sur les deux outils**

Dans `rust/crates/atelier-agent-mcp/src/server.rs`, remplacer le bras `"tools/list"` par :

```rust
"tools/list" => json!({ "tools": [tool_definition(), widget_tool_definition()] }),
```

et remplacer le corps du bras `"tools/call"` (le bloc qui rejette `name != TOOL_NAME` puis lit `action`) par :

```rust
"tools/call" => {
    let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    // `help` reste servi localement : aucun aller-retour vers le pont.
    if name == TOOL_NAME && args.get("action").and_then(|v| v.as_str()) == Some("help") {
        tool_text_result(&mut stdout, &id, help_text(), false).await?;
        continue;
    }

    let Some((action, forwarded)) = bridge_call_for(name, &args) else {
        let msg = if name == TOOL_NAME {
            "missing_action".to_string()
        } else {
            format!("unknown tool: {name}")
        };
        tool_text_result(&mut stdout, &id, json!({ "error": msg }), true).await?;
        continue;
    };

    match bridge.call(&action, &forwarded).await {
        Ok(val) => {
            let is_err = val.get("error").is_some();
            tool_text_result(&mut stdout, &id, val, is_err).await?;
        }
        Err(e) => {
            tool_text_result(
                &mut stdout,
                &id,
                json!({"error":"backend_unavailable","message": e}),
                true,
            )
            .await?;
        }
    }
    continue;
}
```

Ajuster l'import en tête de `server.rs` : `use crate::schema::{bridge_call_for, help_text, tool_definition, widget_tool_definition, TOOL_NAME, WIDGET_TOOL_NAME};` (retirer `WIDGET_TOOL_NAME` de l'import s'il n'est pas utilisé dans ce fichier — le compilateur le dira).

- [ ] **Step 6: Run the full crate build and tests**

Run: `cargo test -p atelier-agent-mcp && cargo clippy -p atelier-agent-mcp -- -D warnings`
Expected: PASS, aucun warning.

- [ ] **Step 7: Commit**

```bash
git add rust/crates/atelier-agent-mcp/src/schema.rs rust/crates/atelier-agent-mcp/src/server.rs
git commit -m "feat(mcp): outil atelier_widget dans le shim stdio"
```

---

### Task 2: Validation, identifiant et coquille (pur, sans I/O)

**Files:**
- Create: `rust/crates/atelier-runtime/src/widgets.rs`
- Modify: `rust/crates/atelier-runtime/src/lib.rs` (ajouter `pub mod widgets;` à côté des autres `mod`)
- Test: dans `widgets.rs`, module `#[cfg(test)]`

**Interfaces:**
- Consumes: rien de la tâche 1 (crates différentes ; le contrat est le nom d'action `show_widget`, chaîne).
- Produces:
  - `pub const HTML_MAX: usize = 128 * 1024;`
  - `pub const TITLE_MAX: usize = 80;`
  - `pub const HEIGHT_MIN: i64 = 120;` / `pub const HEIGHT_MAX: i64 = 900;`
  - `pub struct WidgetInput { pub html: String, pub title: String, pub height: i64 }`
  - `pub fn parse_widget_input(req: &serde_json::Value) -> Result<WidgetInput, String>` — code d'erreur en `Err` (`"widget_html_too_large"`, `"widget_missing_html"`, `"widget_missing_height"`).
  - `pub fn new_widget_id() -> String`
  - `pub fn is_valid_widget_id(id: &str) -> bool`
  - `pub fn wrap_shell(input: &WidgetInput) -> String`

- [ ] **Step 1: Write the failing test**

Créer `rust/crates/atelier-runtime/src/widgets.rs` avec **seulement** ce module de test (l'implémentation vient au step 3) :

```rust
//! Widgets du fil : validation, identifiant, coquille sandboxée.
//! Voir docs/superpowers/specs/2026-08-28-widgets-chat-design.md §B et §D.

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn req(html: &str, title: &str, height: i64) -> serde_json::Value {
        json!({ "html": html, "title": title, "height": height })
    }

    #[test]
    fn height_is_clamped_never_rejected() {
        assert_eq!(parse_widget_input(&req("<p>a</p>", "t", 10)).unwrap().height, HEIGHT_MIN);
        assert_eq!(parse_widget_input(&req("<p>a</p>", "t", 5000)).unwrap().height, HEIGHT_MAX);
        assert_eq!(parse_widget_input(&req("<p>a</p>", "t", 300)).unwrap().height, 300);
    }

    #[test]
    fn title_is_truncated_never_rejected() {
        let long = "é".repeat(200);
        let parsed = parse_widget_input(&req("<p>a</p>", &long, 200)).unwrap();
        assert_eq!(parsed.title.chars().count(), TITLE_MAX);
    }

    #[test]
    fn oversized_html_is_refused_with_a_code_the_model_can_read() {
        let huge = "x".repeat(HTML_MAX + 1);
        assert_eq!(
            parse_widget_input(&req(&huge, "t", 200)).unwrap_err(),
            "widget_html_too_large"
        );
    }

    #[test]
    fn missing_fields_are_refused() {
        assert_eq!(
            parse_widget_input(&json!({"title": "t", "height": 200})).unwrap_err(),
            "widget_missing_html"
        );
        assert_eq!(
            parse_widget_input(&json!({"html": "<p>a</p>", "title": "t"})).unwrap_err(),
            "widget_missing_height"
        );
    }

    #[test]
    fn ids_are_well_formed_and_distinct() {
        let a = new_widget_id();
        let b = new_widget_id();
        assert_ne!(a, b);
        assert!(is_valid_widget_id(&a), "{a} devrait être valide");
        assert_eq!(a.len(), 18); // "w_" + 16 hex
    }

    #[test]
    fn hostile_ids_are_rejected() {
        for bad in [
            "../../etc/passwd",
            "w_../../etc",
            "w_ABCDEF0123456789", // majuscules
            "w_short",
            "w_0123456789abcdef0", // 17 hex
            "",
        ] {
            assert!(!is_valid_widget_id(bad), "{bad} aurait dû être rejeté");
        }
    }

    #[test]
    fn shell_locks_the_sandbox_down() {
        let input = parse_widget_input(&req("<p>salut</p>", "titre", 240)).unwrap();
        let shell = wrap_shell(&input);
        assert!(shell.contains("default-src 'none'"));
        assert!(!shell.contains("connect-src"), "aucun réseau autorisé");
        assert!(!shell.contains("font-src"), "aucune police distante");
        assert!(shell.contains("<p>salut</p>"), "le contenu de l'agent est présent");
        assert!(shell.contains("sendPrompt"), "le pont est injecté");
    }

    #[test]
    fn shell_does_not_let_a_title_break_out_of_the_tag() {
        let input = parse_widget_input(&req("<p>a</p>", "</title><script>boom()</script>", 200)).unwrap();
        let shell = wrap_shell(&input);
        assert!(!shell.contains("<script>boom()</script>"));
        assert!(shell.contains("&lt;/title&gt;"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p atelier-runtime widgets::`
Expected: FAIL — le module ne compile pas (`cannot find function 'parse_widget_input'` etc.).

- [ ] **Step 3: Write minimal implementation**

En tête de `rust/crates/atelier-runtime/src/widgets.rs`, **avant** le `mod tests` :

```rust
use serde_json::Value;
use uuid::Uuid;

pub const HTML_MAX: usize = 128 * 1024;
pub const TITLE_MAX: usize = 80;
pub const HEIGHT_MIN: i64 = 120;
pub const HEIGHT_MAX: i64 = 900;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WidgetInput {
    pub html: String,
    pub title: String,
    pub height: i64,
}

/// Le titre est tronqué et la hauteur clampée : un modèle ne doit jamais
/// perdre un panneau pour un détail de mise en forme. Seule une charge
/// franchement hors gabarit est refusée, avec un code qu'il peut lire.
pub fn parse_widget_input(req: &Value) -> Result<WidgetInput, String> {
    let html = req
        .get("html")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or("widget_missing_html")?;
    if html.len() > HTML_MAX {
        return Err("widget_html_too_large".into());
    }
    let height = req
        .get("height")
        .and_then(|v| v.as_i64())
        .ok_or("widget_missing_height")?;
    let title: String = req
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .chars()
        .take(TITLE_MAX)
        .collect();
    Ok(WidgetInput {
        html: html.to_string(),
        title,
        height: height.clamp(HEIGHT_MIN, HEIGHT_MAX),
    })
}

/// `w_` + 16 hexadécimaux. Tiré ICI : jamais dérivé d'une entrée de l'agent,
/// donc aucune traversée de chemin possible par construction.
pub fn new_widget_id() -> String {
    let hex = Uuid::new_v4().simple().to_string();
    format!("w_{}", &hex[..16])
}

pub fn is_valid_widget_id(id: &str) -> bool {
    id.len() == 18
        && id.starts_with("w_")
        && id[2..].chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

fn escape_html(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// La coquille : CSP, tokens de thème, pont postMessage. L'agent écrit le
/// contenu de la page, jamais sa tête.
pub fn wrap_shell(input: &WidgetInput) -> String {
    format!(
        r#"<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;">
<title>{title}</title>
<style>
  :root {{ color-scheme: light dark; }}
  html, body {{ margin: 0; background: transparent; color: var(--fg, #dadee3);
    font-family: var(--ui-font, -apple-system, system-ui, sans-serif); font-size: 13px; }}
  body {{ padding: 14px; }}
  @media (prefers-reduced-motion: reduce) {{ * {{ animation: none !important; transition: none !important; }} }}
</style>
</head><body>
<script>
(function () {{
  var parentWin = window.parent;
  function post(msg) {{ parentWin.postMessage(msg, "*"); }}
  window.sendPrompt = function (text) {{
    post({{ source: "atelier-widget", type: "prompt", text: String(text == null ? "" : text) }});
  }};
  window.saveState = function (state) {{
    post({{ source: "atelier-widget", type: "state", state: state }});
  }};
  window.addEventListener("message", function (e) {{
    var d = e.data;
    if (!d || d.source !== "atelier-host") return;
    if (d.type === "theme" && d.tokens) {{
      for (var k in d.tokens) document.documentElement.style.setProperty(k, d.tokens[k]);
    }}
    if (d.type === "restore" && typeof window.onRestore === "function") {{
      try {{ window.onRestore(d.state); }} catch (err) {{ }}
    }}
  }});
  window.addEventListener("load", function () {{
    post({{ source: "atelier-widget", type: "ready" }});
  }});
}})();
</script>
{html}
</body></html>"#,
        title = escape_html(&input.title),
        html = input.html,
    )
}
```

Puis déclarer le module dans `rust/crates/atelier-runtime/src/lib.rs`, à côté des `mod` existants :

```rust
pub mod widgets;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p atelier-runtime widgets::`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-runtime/src/widgets.rs rust/crates/atelier-runtime/src/lib.rs
git commit -m "feat(widgets): validation, identifiant et coquille sandboxée"
```

---

### Task 3: Écriture disque et purge

**Files:**
- Modify: `rust/crates/atelier-runtime/src/widgets.rs`
- Test: même fichier, module `#[cfg(test)]`

**Interfaces:**
- Consumes: `WidgetInput`, `new_widget_id()`, `is_valid_widget_id()`, `wrap_shell()` (tâche 2).
- Produces:
  - `pub const FILES_PER_THREAD_MAX: usize = 200;`
  - `pub fn widget_dir(app_dir: &Path, thread_id: &str) -> PathBuf` — `<app_dir>/widgets/<sha256(thread_id) en hex>`
  - `pub fn widget_path(app_dir: &Path, thread_id: &str, id: &str) -> Option<PathBuf>` — `None` si l'id est invalide.
  - `pub fn write_widget(app_dir: &Path, thread_id: &str, id: &str, shell: &str) -> std::io::Result<PathBuf>`
  - `pub fn read_widget(app_dir: &Path, thread_id: &str, id: &str) -> Option<String>`
  - `pub fn purge_oldest(dir: &Path, keep: usize) -> usize` — rend le nombre de fichiers supprimés.

- [ ] **Step 1: Write the failing test**

Ajouter dans le `mod tests` de `widgets.rs` :

```rust
    use std::path::Path;
    use tempfile::tempdir;

    #[test]
    fn path_is_scoped_by_thread_hash_and_refuses_bad_ids() {
        let base = Path::new("/tmp/appdir");
        let good = widget_path(base, "thread-a", "w_0123456789abcdef").unwrap();
        assert!(good.starts_with("/tmp/appdir/widgets/"));
        assert!(good.to_string_lossy().ends_with("/w_0123456789abcdef.html"));

        // deux threads ne partagent jamais un dossier
        let other = widget_path(base, "thread-b", "w_0123456789abcdef").unwrap();
        assert_ne!(good.parent(), other.parent());

        // un id hostile ne construit AUCUN chemin
        assert!(widget_path(base, "thread-a", "../../etc/passwd").is_none());
        assert!(widget_path(base, "thread-a", "w_../../etc").is_none());
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempdir().unwrap();
        let id = new_widget_id();
        let written = write_widget(dir.path(), "t1", &id, "<html>coquille</html>").unwrap();
        assert!(written.exists());
        assert_eq!(
            read_widget(dir.path(), "t1", &id).as_deref(),
            Some("<html>coquille</html>")
        );
        assert_eq!(read_widget(dir.path(), "t1", &new_widget_id()), None);
        assert_eq!(read_widget(dir.path(), "t1", "../../etc/passwd"), None);
    }

    #[test]
    fn purge_keeps_the_newest_and_reports_what_it_removed() {
        let dir = tempdir().unwrap();
        let mut ids = Vec::new();
        for _ in 0..5 {
            let id = new_widget_id();
            write_widget(dir.path(), "t1", &id, "x").unwrap();
            // mtime distinct : le test doit pouvoir ordonner
            std::thread::sleep(std::time::Duration::from_millis(12));
            ids.push(id);
        }
        let target = widget_dir(dir.path(), "t1");
        assert_eq!(purge_oldest(&target, 2), 3);
        assert!(read_widget(dir.path(), "t1", ids.last().unwrap()).is_some());
        assert!(read_widget(dir.path(), "t1", ids.first().unwrap()).is_none());
        assert_eq!(purge_oldest(&target, 2), 0, "purge idempotente");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p atelier-runtime widgets::`
Expected: FAIL — `cannot find function 'widget_path'`, `'write_widget'`, `'read_widget'`, `'purge_oldest'`, `'widget_dir'`.

- [ ] **Step 3: Write minimal implementation**

Dans `widgets.rs`, ajouter aux imports `use sha2::{Digest, Sha256};` et `use std::path::{Path, PathBuf};`, puis :

```rust
pub const FILES_PER_THREAD_MAX: usize = 200;

/// Même convention que `harness-history/` (atelier-store/journal.rs) : le
/// threadId est haché, jamais posé tel quel dans un chemin.
pub fn widget_dir(app_dir: &Path, thread_id: &str) -> PathBuf {
    let mut h = Sha256::new();
    h.update(thread_id.as_bytes());
    app_dir.join("widgets").join(hex::encode(h.finalize()))
}

pub fn widget_path(app_dir: &Path, thread_id: &str, id: &str) -> Option<PathBuf> {
    if !is_valid_widget_id(id) {
        return None;
    }
    Some(widget_dir(app_dir, thread_id).join(format!("{id}.html")))
}

pub fn write_widget(
    app_dir: &Path,
    thread_id: &str,
    id: &str,
    shell: &str,
) -> std::io::Result<PathBuf> {
    let path = widget_path(app_dir, thread_id, id).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "identifiant de widget invalide")
    })?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, shell)?;
    Ok(path)
}

pub fn read_widget(app_dir: &Path, thread_id: &str, id: &str) -> Option<String> {
    let path = widget_path(app_dir, thread_id, id)?;
    std::fs::read_to_string(path).ok()
}

/// Garde les `keep` fichiers les plus récents du dossier, supprime le reste.
pub fn purge_oldest(dir: &Path, keep: usize) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "html"))
        .filter_map(|e| {
            let modified = e.metadata().ok()?.modified().ok()?;
            Some((modified, e.path()))
        })
        .collect();
    if files.len() <= keep {
        return 0;
    }
    files.sort_by_key(|(t, _)| *t); // plus ancien d'abord
    let doomed = files.len() - keep;
    let mut removed = 0;
    for (_, path) in files.into_iter().take(doomed) {
        if std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}
```

Vérifier que `hex` est dans les dépendances de `rust/crates/atelier-runtime/Cargo.toml` (`atelier-store` l'utilise déjà pour le même usage). S'il manque : `hex = "0.4"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p atelier-runtime widgets::`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-runtime/src/widgets.rs rust/crates/atelier-runtime/Cargo.toml
git commit -m "feat(widgets): écriture par thread haché et purge bornée"
```

---

### Task 4: Action `show_widget` et event journalisé

**Files:**
- Modify: `rust/crates/atelier-runtime/src/widgets.rs` (ajouter `action_show_widget`)
- Modify: `rust/crates/atelier-runtime/src/agent_mcp.rs:335-349` (le `match action` de `handle_action`)
- Test: `rust/crates/atelier-runtime/src/widgets.rs`

**Interfaces:**
- Consumes: `parse_widget_input`, `new_widget_id`, `wrap_shell`, `write_widget`, `widget_dir`, `purge_oldest`, `FILES_PER_THREAD_MAX` (tâches 2-3).
- Produces:
  - `pub fn widget_event(thread_id: &str, id: &str, input: &WidgetInput, sequence: u64, event_id: &str, ts: i64) -> serde_json::Value` — l'event durable, pur et testable.
  - `pub async fn action_show_widget(state: &AppState, caller_id: &str, req: &Value) -> Result<Value, String>`

- [ ] **Step 1: Write the failing test**

Ajouter dans le `mod tests` de `widgets.rs` :

```rust
    #[test]
    fn event_carries_only_what_the_timeline_needs() {
        let input = parse_widget_input(&req("<p>lourd</p>", "loi de Student", 420)).unwrap();
        let ev = widget_event("t1", "w_0123456789abcdef", &input, 7, "evt-1", 1_700_000_000_000);

        assert_eq!(ev["kind"], "widget");
        assert_eq!(ev["id"], "w_0123456789abcdef");
        assert_eq!(ev["title"], "loi de Student");
        assert_eq!(ev["height"], 420);
        assert_eq!(ev["meta"]["threadId"], "t1");
        assert_eq!(ev["meta"]["sequence"], 7);
        assert_eq!(ev["meta"]["eventId"], "evt-1");

        // le HTML ne DOIT PAS voyager dans l'event : il gonflerait le JSONL
        // et repasserait dans le contexte du modèle au rejeu.
        let serialized = serde_json::to_string(&ev).unwrap();
        assert!(!serialized.contains("lourd"), "le HTML a fuité dans l'event");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p atelier-runtime widgets::event_carries`
Expected: FAIL — `cannot find function 'widget_event'`.

- [ ] **Step 3: Write minimal implementation**

Dans `widgets.rs` :

```rust
use serde_json::json;

pub fn widget_event(
    thread_id: &str,
    id: &str,
    input: &WidgetInput,
    sequence: u64,
    event_id: &str,
    ts: i64,
) -> Value {
    json!({
        "kind": "widget",
        "id": id,
        "title": input.title,
        "height": input.height,
        "meta": {
            "threadId": thread_id,
            "sequence": sequence,
            "eventId": event_id,
            "ts": ts,
        }
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p atelier-runtime widgets::event_carries`
Expected: PASS.

- [ ] **Step 5: Écrire l'action et la brancher**

Toujours dans `widgets.rs` (le patron d'émission est copié de `agent_mailbox.rs:259-315`) :

```rust
use crate::state::AppState;
use uuid::Uuid;

pub async fn action_show_widget(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let input = parse_widget_input(req)?;
    let id = new_widget_id();
    let shell = wrap_shell(&input);

    write_widget(state.app_dir(), caller_id, &id, &shell).map_err(|e| {
        tracing::warn!("widget non écrit : {e}");
        "widget_write_failed".to_string()
    })?;
    purge_oldest(&widget_dir(state.app_dir(), caller_id), FILES_PER_THREAD_MAX);

    let sequence = state.journal().last_sequence(caller_id) + 1;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let durable = widget_event(
        caller_id,
        &id,
        &input,
        sequence,
        &Uuid::new_v4().to_string(),
        ts,
    );
    let _ = state.journal().append(&durable);
    state.publish(crate::ws_router::json_msg(json!({
        "type": "event",
        "threadId": caller_id,
        "event": durable,
    })));

    Ok(json!({
        "ok": true,
        "widgetId": id,
        "note": "Le panneau est affiché dans le fil. Ne recopie pas le HTML dans ta réponse."
    }))
}
```

Vérifier la visibilité de `json_msg` dans `ws_router.rs` : si elle est privée, la passer en `pub(crate)`. Vérifier de même `AppState::journal()` et `AppState::publish()` (déjà utilisés par `agent_mailbox.rs`, donc accessibles).

Puis dans `rust/crates/atelier-runtime/src/agent_mcp.rs`, ajouter un bras au `match action` de `handle_action`, avant `"" => Err(...)` :

```rust
        "show_widget" => crate::widgets::action_show_widget(state, caller_id, req).await,
```

- [ ] **Step 6: Run tests and clippy**

Run: `cargo test -p atelier-runtime && cargo clippy -p atelier-runtime -- -D warnings`
Expected: PASS, aucun warning.

- [ ] **Step 7: Commit**

```bash
git add rust/crates/atelier-runtime/src/widgets.rs rust/crates/atelier-runtime/src/agent_mcp.rs rust/crates/atelier-runtime/src/ws_router.rs
git commit -m "feat(widgets): action show_widget, event journalisé et publié"
```

---

### Task 5: Route `GET /widgets/:id`

**Files:**
- Modify: `rust/crates/atelier-runtime/src/widgets.rs` (handler axum)
- Modify: `rust/crates/atelier-runtime/src/server.rs:91-100` (le `Router::new()`)
- Test: `rust/crates/atelier-runtime/src/widgets.rs`

**Interfaces:**
- Consumes: `read_widget` (tâche 3).
- Produces: `pub async fn widget_html_handler(State(state), Path((thread_id, id))) -> impl IntoResponse` — route `/widgets/:thread_id/:id`.

> Note d'implémentation : la route porte **aussi** le threadId, parce que le
> fichier est rangé sous le hash du thread. L'id seul ne suffirait pas à
> retrouver le chemin.

- [ ] **Step 1: Write the failing test**

Ajouter dans le `mod tests` de `widgets.rs` :

```rust
    #[test]
    fn served_body_is_the_shell_or_nothing() {
        let dir = tempdir().unwrap();
        let id = new_widget_id();
        write_widget(dir.path(), "t1", &id, "<html>coquille</html>").unwrap();

        // le corps servi est exactement ce qui est sur disque
        assert_eq!(
            serve_body(dir.path(), "t1", &id).as_deref(),
            Some("<html>coquille</html>")
        );
        // fichier absent → rien à servir (le handler rendra un 404)
        assert_eq!(serve_body(dir.path(), "t1", &new_widget_id()), None);
        // id hostile → rien à servir, aucun chemin construit
        assert_eq!(serve_body(dir.path(), "t1", "../../etc/passwd"), None);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p atelier-runtime widgets::served_body`
Expected: FAIL — `cannot find function 'serve_body'`.

- [ ] **Step 3: Write minimal implementation**

Dans `widgets.rs` :

```rust
/// Cœur pur du handler : ce qui est servi, ou rien.
pub fn serve_body(app_dir: &Path, thread_id: &str, id: &str) -> Option<String> {
    read_widget(app_dir, thread_id, id)
}

pub async fn widget_html_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path((thread_id, id)): axum::extract::Path<(String, String)>,
) -> axum::response::Response {
    use axum::http::{header, StatusCode};
    use axum::response::IntoResponse;

    match serve_body(state.app_dir(), &thread_id, &id) {
        Some(body) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            body,
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "widget introuvable").into_response(),
    }
}
```

Dans `rust/crates/atelier-runtime/src/server.rs`, ajouter la route au `Router::new()` **avant** `.layer(cors)` :

```rust
        .route(
            // axum 0.8 : les paramètres s'écrivent {param} — la syntaxe :param
            // fait PANIQUER Router::route, donc tout le serveur (relecture T5).
            "/widgets/{thread_id}/{id}",
            get(crate::widgets::widget_html_handler),
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p atelier-runtime && cargo build -p atelier-runtime`
Expected: PASS et compilation propre du routeur.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-runtime/src/widgets.rs rust/crates/atelier-runtime/src/server.rs
git commit -m "feat(widgets): route GET /widgets/:thread/:id"
```

---

### Task 6: Contrat frontend et carte réservée

**Files:**
- Modify: `src/lib/ws.ts:93` (variantes de `AgentEvent`)
- Create: `src/components/chat/WidgetFrame.tsx`
- Modify: `src/components/chat/ChatTimeline.tsx:1052` (à côté du bras `e.kind === "edit"`)
- Modify: `src/App.css` (après le bloc `.mermaid-*`, vers la ligne 348)
- Modify: `src/lib/i18n.ts` (deux blocs)
- Test: `src/components/chat/WidgetFrame.test.tsx`

**Interfaces:**
- Consumes: le contrat d'event produit par la tâche 4 (`kind: "widget"`, `id`, `title`, `height`).
- Produces:
  - `export type WidgetEvent = Extract<AgentEvent, { kind: "widget" }>;`
  - `export function WidgetFrame(props: { event: WidgetEvent; threadId: string }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Créer `src/components/chat/WidgetFrame.test.tsx` :

```tsx
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetFrame } from "./WidgetFrame";
import type { AgentEvent } from "../../lib/ws";

afterEach(() => cleanup());

const EVENT = {
  kind: "widget",
  id: "w_0123456789abcdef",
  title: "loi de Student — poids des résidus",
  height: 420,
} as Extract<AgentEvent, { kind: "widget" }>;

describe("WidgetFrame — carte réservée", () => {
  it("réserve la hauteur déclarée dès le premier rendu, avant tout chargement", () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    const body = container.querySelector(".widget-body") as HTMLElement;
    expect(body.style.height).toBe("420px");
  });

  it("affiche le titre fourni par l'agent", () => {
    render(<WidgetFrame event={EVENT} threadId="t1" />);
    expect(screen.getByText(EVENT.title)).toBeTruthy();
  });

  it("reprend le châssis de .codeblock", () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    expect(container.querySelector(".codeblock.widget-block")).toBeTruthy();
    expect(container.querySelector(".codeblock-bar")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chat/WidgetFrame.test.tsx`
Expected: FAIL — `Failed to resolve import "./WidgetFrame"`.

- [ ] **Step 3: Write minimal implementation**

Dans `src/lib/ws.ts`, ajouter la variante à l'union `AgentEvent`, juste après la ligne `| { kind: "tool"; name: string; detail?: string }` :

```ts
  | { kind: "widget"; id: string; title: string; height: number; ts?: number }
```

Créer `src/components/chat/WidgetFrame.tsx` :

```tsx
// Widget du fil (spec 2026-08-28) : panneau interactif écrit par un modèle,
// rendu dans une iframe close. Le châssis est celui de .codeblock —
// troisième membre de la famille avec .mermaid-block.
import type { AgentEvent } from "../../lib/ws";

export type WidgetEvent = Extract<AgentEvent, { kind: "widget" }>;

export function WidgetFrame(props: { event: WidgetEvent; threadId: string }) {
  const { event } = props;
  return (
    <div className="codeblock widget-block not-typeset">
      <div className="codeblock-bar">
        <span className="widget-bar-left">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M2 4.5h5M11 4.5h3M2 11.5h3M9 11.5h5" />
            <circle cx="9" cy="4.5" r="1.9" />
            <circle cx="7" cy="11.5" r="1.9" />
          </svg>
          <span className="widget-title">{event.title}</span>
        </span>
      </div>
      {/* la hauteur est posée ICI, dès le premier rendu : LegendList mesure
          la bonne taille avant même que le HTML ne soit chargé */}
      <div className="widget-body" style={{ height: `${event.height}px` }} />
    </div>
  );
}
```

Dans `src/App.css`, après le bloc mermaid (vers la ligne 348) :

```css
/* Widget du fil : châssis de .codeblock, corps à hauteur déclarée. Le titre
   est de la prose (pas un nom de langage) → police d'interface, pas --code-font. */
.widget-block .widget-bar-left { display: flex; align-items: center; gap: 7px; min-width: 0; }
.widget-block .widget-bar-left > svg { flex: none; color: var(--text-disabled); }
.widget-title { font-size: var(--fs-s); color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.widget-body { position: relative; width: 100%; overflow: hidden; }
```

Dans `src/components/chat/ChatTimeline.tsx`, importer le composant puis ajouter le bras juste avant `if (e.kind === "edit") {` :

```tsx
          if (e.kind === "widget") return <WidgetFrame key={e.id} event={e} threadId={threadId} />;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/chat/WidgetFrame.test.tsx && npx tsc --noEmit`
Expected: PASS (3 tests), aucune erreur de types.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ws.ts src/components/chat/WidgetFrame.tsx src/components/chat/WidgetFrame.test.tsx src/components/chat/ChatTimeline.tsx src/App.css
git commit -m "feat(chat): carte widget à hauteur réservée"
```

---

### Task 7: Chargement, iframe sandboxée, états muet et introuvable

**Files:**
- Modify: `src/components/chat/WidgetFrame.tsx`
- Modify: `src/lib/i18n.ts` (deux blocs)
- Test: `src/components/chat/WidgetFrame.test.tsx`

**Interfaces:**
- Consumes: `WidgetFrame` (tâche 6), route `/widgets/:thread_id/:id` (tâche 5).
- Produces: `export const WIDGET_READY_TIMEOUT_MS = 3000;`

Nouvelles clés i18n (à ajouter dans les **deux** blocs de `src/lib/i18n.ts`) :

| clé | fr | en |
|---|---|---|
| `chat.widget-mute` | `Le widget n'a pas démarré` | `The widget did not start` |
| `chat.widget-missing` | `Widget expiré` | `Widget expired` |

- [ ] **Step 1: Write the failing test**

Ajouter dans `src/components/chat/WidgetFrame.test.tsx` :

```tsx
import { act, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { t } from "../../lib/i18n";

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("WidgetFrame — chargement", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("monte une iframe srcdoc verrouillée quand la coquille arrive", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);

    await waitFor(() => {
      expect(container.querySelector("iframe")).toBeTruthy();
    });
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("coquille");
    expect(frame.getAttribute("src")).toBeNull();
  });

  it("retombe sur « expiré » et rend la hauteur quand le fichier a disparu", async () => {
    mockFetch(async () => new Response("nope", { status: 404 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);

    await waitFor(() => {
      expect(screen.getByText(t("chat.widget-missing"))).toBeTruthy();
    });
    const body = container.querySelector(".widget-body") as HTMLElement | null;
    expect(body).toBeNull(); // la hauteur est rendue au fil
  });

  it("passe à « muet » si l'iframe ne dit jamais ready", async () => {
    vi.useFakeTimers();
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    render(<WidgetFrame event={EVENT} threadId="t1" />);

    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(3100); });

    expect(screen.getByText(t("chat.widget-mute"))).toBeTruthy();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chat/WidgetFrame.test.tsx`
Expected: FAIL — aucune `iframe` montée, textes absents.

- [ ] **Step 3: Write minimal implementation**

Remplacer le corps de `WidgetFrame.tsx` par :

```tsx
import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { serverUrl } from "../../lib/ws";

export type WidgetEvent = Extract<AgentEvent, { kind: "widget" }>;
export const WIDGET_READY_TIMEOUT_MS = 3000;

type Phase = "loading" | "live" | "mute" | "missing";

export function WidgetFrame(props: { event: WidgetEvent; threadId: string }) {
  const { event, threadId } = props;
  const [shell, setShell] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Chargement au montage : un widget jamais scrollé n'est jamais lu.
  useEffect(() => {
    let alive = true;
    const url = `${serverUrl()}/widgets/${encodeURIComponent(threadId)}/${event.id}`;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((html) => { if (alive) setShell(html); })
      .catch(() => { if (alive) setPhase("missing"); });
    return () => { alive = false; };
  }, [event.id, threadId]);

  // Filet : une coquille qui ne dit jamais « ready » est déclarée muette.
  useEffect(() => {
    if (shell == null || phase !== "loading") return;
    const timer = setTimeout(() => setPhase((p) => (p === "loading" ? "mute" : p)), WIDGET_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [shell, phase]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.source !== "atelier-widget") return;
      if (e.data.type === "ready") setPhase("live");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const chrome = (
    <div className="codeblock-bar">
      <span className="widget-bar-left">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
             strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <path d="M2 4.5h5M11 4.5h3M2 11.5h3M9 11.5h5" />
          <circle cx="9" cy="4.5" r="1.9" />
          <circle cx="7" cy="11.5" r="1.9" />
        </svg>
        <span className="widget-title">{event.title}</span>
      </span>
    </div>
  );

  // États dégradés : la hauteur est RENDUE au fil, jamais 400 px de vide.
  if (phase === "missing" || phase === "mute") {
    return (
      <div className="codeblock widget-block not-typeset">
        {chrome}
        <div className="widget-note">
          {phase === "missing" ? t("chat.widget-missing") : t("chat.widget-mute")}
        </div>
      </div>
    );
  }

  return (
    <div className="codeblock widget-block not-typeset">
      {chrome}
      <div className="widget-body" style={{ height: `${event.height}px` }}>
        {shell != null && (
          <iframe
            ref={frameRef}
            className={phase === "live" ? "widget-frame live" : "widget-frame"}
            title={event.title}
            sandbox="allow-scripts"
            srcDoc={shell}
          />
        )}
      </div>
    </div>
  );
}
```

Vérifier le nom réel de l'helper d'URL du serveur dans `src/lib/ws.ts` (`serverUrl`, `httpBase`, ou une constante) et l'utiliser tel quel — ne pas en créer un nouveau.

CSS à ajouter dans `src/App.css`, sous le bloc de la tâche 6 :

```css
.widget-frame { width: 100%; height: 100%; border: 0; display: block;
  background: transparent; opacity: 0; transition: opacity 140ms ease; }
.widget-frame.live { opacity: 1; }
.widget-note { padding: 10px 12px; font-size: var(--fs-s); color: var(--text-muted); }
@media (prefers-reduced-motion: reduce) { .widget-frame { transition: none; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/chat/WidgetFrame.test.tsx && npx tsc --noEmit`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/WidgetFrame.tsx src/components/chat/WidgetFrame.test.tsx src/App.css src/lib/i18n.ts
git commit -m "feat(chat): iframe sandboxée, états muet et introuvable"
```

---

### Task 8: Thème rejoué et gel d'état au démontage

**Files:**
- Modify: `src/components/chat/WidgetFrame.tsx`
- Create: `src/components/chat/widgetState.ts`
- Test: `src/components/chat/WidgetFrame.test.tsx`, `src/components/chat/widgetState.test.ts`

**Interfaces:**
- Consumes: `WidgetFrame`, `Phase` (tâche 7).
- Produces (dans `widgetState.ts`) :
  - `export const WIDGET_STATE_MAX_BYTES = 4096;`
  - `export function rememberWidgetState(id: string, state: unknown): boolean` — `false` si la charge dépasse le plafond (elle est alors ignorée).
  - `export function recallWidgetState(id: string): unknown | undefined`
  - `export function clearWidgetStates(): void` — pour les tests.

- [ ] **Step 1: Write the failing test**

Créer `src/components/chat/widgetState.test.ts` :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWidgetStates, recallWidgetState, rememberWidgetState, WIDGET_STATE_MAX_BYTES,
} from "./widgetState";

beforeEach(() => clearWidgetStates());

describe("mémoire d'état des widgets", () => {
  it("rend ce qu'on lui a confié, par identifiant", () => {
    expect(rememberWidgetState("w_a", { nu: 4 })).toBe(true);
    expect(recallWidgetState("w_a")).toEqual({ nu: 4 });
    expect(recallWidgetState("w_b")).toBeUndefined();
  });

  it("ignore une charge au-delà du plafond au lieu de la tronquer", () => {
    const gros = { blob: "x".repeat(WIDGET_STATE_MAX_BYTES + 100) };
    expect(rememberWidgetState("w_a", gros)).toBe(false);
    expect(recallWidgetState("w_a")).toBeUndefined();
  });
});
```

Ajouter dans `src/components/chat/WidgetFrame.test.tsx` :

```tsx
import { rememberWidgetState, clearWidgetStates } from "./widgetState";

describe("WidgetFrame — thème et état", () => {
  it("rejoue le thème sans remonter l'iframe", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const first = container.querySelector("iframe");

    await act(async () => {
      window.dispatchEvent(new CustomEvent("app-theme-changed", { detail: "nuit" }));
    });

    expect(container.querySelector("iframe")).toBe(first);
  });

  it("renvoie l'état gelé au remontage, avant de révéler la frame", async () => {
    clearWidgetStates();
    rememberWidgetState(EVENT.id, { nu: 7 });
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));

    const posted: unknown[] = [];
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: (m: unknown) => posted.push(m) },
    });

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "ready" },
        source: frame.contentWindow as Window,
      }));
    });

    expect(posted).toContainEqual(
      expect.objectContaining({ source: "atelier-host", type: "restore", state: { nu: 7 } }),
    );
  });

  it("ignore un message venu d'une autre fenêtre", async () => {
    clearWidgetStates();
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    render(<WidgetFrame event={EVENT} threadId="t1" />);

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "state", state: { pirate: true } },
        source: window,
      }));
    });

    expect(recallWidgetState(EVENT.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chat/widgetState.test.ts src/components/chat/WidgetFrame.test.tsx`
Expected: FAIL — `Failed to resolve import "./widgetState"`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/components/chat/widgetState.ts` :

```ts
// L'état d'un widget survit au démontage par virtualisation, pas au
// redémarrage de l'app : une Map mémoire, jamais le disque. On n'écrit pas
// sur disque de l'état produit par un LLM.
export const WIDGET_STATE_MAX_BYTES = 4096;
const MAX_ENTRIES = 64;

const states = new Map<string, unknown>();

export function rememberWidgetState(id: string, state: unknown): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(state) ?? "";
  } catch {
    return false;
  }
  if (serialized.length > WIDGET_STATE_MAX_BYTES) return false;
  states.delete(id); // réinsertion = plus récent (LRU d'insertion)
  states.set(id, state);
  if (states.size > MAX_ENTRIES) {
    const oldest = states.keys().next();
    if (!oldest.done) states.delete(oldest.value);
  }
  return true;
}

export function recallWidgetState(id: string): unknown | undefined {
  return states.get(id);
}

export function clearWidgetStates(): void {
  states.clear();
}
```

Dans `WidgetFrame.tsx`, ajouter les imports et remplacer le `useEffect` du gestionnaire de messages :

```tsx
import { recallWidgetState, rememberWidgetState } from "./widgetState";

// tokens poussés au widget : la seule palette qu'il aura
const THEME_TOKENS = ["--fg", "--fg2", "--muted", "--border", "--accent", "--bg-card"] as const;

function currentThemeMessage() {
  const styles = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const name of THEME_TOKENS) tokens[name] = styles.getPropertyValue(name).trim();
  tokens["--ui-font"] = styles.getPropertyValue("font-family").trim();
  return { source: "atelier-host", type: "theme", tokens };
}

// … dans le composant :
  useEffect(() => {
    function post(msg: unknown) {
      frameRef.current?.contentWindow?.postMessage(msg, "*");
    }
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.source !== "atelier-widget") return;
      if (e.data.type === "ready") {
        post(currentThemeMessage());
        const frozen = recallWidgetState(event.id);
        post({ source: "atelier-host", type: "restore", state: frozen });
        setPhase("live");
      }
      if (e.data.type === "state") rememberWidgetState(event.id, e.data.state);
    }
    function onTheme() { post(currentThemeMessage()); }

    window.addEventListener("message", onMessage);
    window.addEventListener("app-theme-changed", onTheme);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("app-theme-changed", onTheme);
    };
  }, [event.id]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/chat/widgetState.test.ts src/components/chat/WidgetFrame.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/widgetState.ts src/components/chat/widgetState.test.ts src/components/chat/WidgetFrame.tsx src/components/chat/WidgetFrame.test.tsx
git commit -m "feat(chat): thème rejoué et gel d'état des widgets"
```

---

### Task 9: `sendPrompt()` vers le composeur

**Files:**
- Modify: `src/components/chat/WidgetFrame.tsx`
- Modify: `src/components/Chat.tsx:596-603` (à côté du `useEffect` d'`injectText`)
- Test: `src/components/chat/WidgetFrame.test.tsx`

**Interfaces:**
- Consumes: le gestionnaire de messages de la tâche 8.
- Produces: l'event navigateur `chat-compose-append`, `detail: { text: string }` — même convention que `chat-open-file` et `permission-answer`.
  - `export const WIDGET_PROMPT_MAX = 2000;`

- [ ] **Step 1: Write the failing test**

Ajouter dans `src/components/chat/WidgetFrame.test.tsx` :

```tsx
describe("WidgetFrame — sendPrompt", () => {
  it("relaie un prompt du widget vers le composeur", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const recu: string[] = [];
    const ecoute = (e: Event) => recu.push((e as CustomEvent).detail.text);
    window.addEventListener("chat-compose-append", ecoute);

    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const frame = container.querySelector("iframe") as HTMLIFrameElement;

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "prompt", text: "refais avec ν = 8" },
        source: frame.contentWindow as Window,
      }));
    });

    window.removeEventListener("chat-compose-append", ecoute);
    expect(recu).toEqual(["refais avec ν = 8"]);
  });

  it("rejette un prompt hors gabarit au lieu de le tronquer", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const recu: string[] = [];
    const ecoute = (e: Event) => recu.push((e as CustomEvent).detail.text);
    window.addEventListener("chat-compose-append", ecoute);

    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const frame = container.querySelector("iframe") as HTMLIFrameElement;

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "prompt", text: "x".repeat(2001) },
        source: frame.contentWindow as Window,
      }));
    });

    window.removeEventListener("chat-compose-append", ecoute);
    expect(recu).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chat/WidgetFrame.test.tsx -t sendPrompt`
Expected: FAIL — aucun event `chat-compose-append` émis.

- [ ] **Step 3: Write minimal implementation**

Dans `WidgetFrame.tsx`, ajouter la constante et le bras dans `onMessage` :

```tsx
export const WIDGET_PROMPT_MAX = 2000;

// … dans onMessage, après le bras "state" :
      if (e.data.type === "prompt") {
        const text = typeof e.data.text === "string" ? e.data.text.trim() : "";
        if (!text || text.length > WIDGET_PROMPT_MAX) return;
        window.dispatchEvent(new CustomEvent("chat-compose-append", { detail: { text } }));
      }
```

Dans `src/components/Chat.tsx`, à côté du `useEffect` d'`injectText` (vers la ligne 596) :

```tsx
  // Un widget du fil propose un message : on PRÉ-REMPLIT le composeur et on
  // rend la main. Un widget ne déclenche jamais un tour tout seul, et il
  // n'écrase pas ce qui est déjà tapé.
  useEffect(() => {
    function onAppend(e: Event) {
      const text = (e as CustomEvent).detail?.text;
      if (typeof text !== "string" || !text) return;
      setText((cur) => (cur.trim() ? `${cur.replace(/\s+$/, "")}\n${text}` : text));
      taRef.current?.focus();
    }
    window.addEventListener("chat-compose-append", onAppend);
    return () => window.removeEventListener("chat-compose-append", onAppend);
  }, [setText]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/chat/WidgetFrame.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/WidgetFrame.tsx src/components/chat/WidgetFrame.test.tsx src/components/Chat.tsx
git commit -m "feat(chat): sendPrompt pré-remplit le composeur sans écraser"
```

---

### Task 10: Actions de barre et sortie clavier

**Files:**
- Modify: `src/components/chat/WidgetFrame.tsx`
- Modify: `src/App.css`
- Modify: `src/lib/i18n.ts` (deux blocs)
- Test: `src/components/chat/WidgetFrame.test.tsx`

**Interfaces:**
- Consumes: `WidgetFrame` complet (tâches 6-9).
- Produces: rien pour les tâches suivantes (dernière tâche).

Nouvelles clés i18n (dans les **deux** blocs) :

| clé | fr | en |
|---|---|---|
| `chat.widget-view-source` | `source` | `source` |
| `chat.widget-view-panel` | `panneau` | `panel` |
| `chat.widget-expand` | `Afficher le widget en plein écran` | `View widget fullscreen` |
| `chat.widget-fullscreen-title` | `Widget en plein écran` | `Fullscreen widget` |

- [ ] **Step 1: Write the failing test**

Ajouter dans `src/components/chat/WidgetFrame.test.tsx` :

```tsx
import { fireEvent } from "@testing-library/react";

describe("WidgetFrame — actions de barre", () => {
  it("bascule vers la source lisible et revient au panneau", async () => {
    mockFetch(async () => new Response("<html>coquille lisible</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-view-source") }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain("coquille lisible");

    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-view-panel") }));
    expect(container.querySelector("iframe")).toBeTruthy();
  });

  it("rend le focus à la timeline sur Échap", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());

    const card = container.querySelector(".widget-block") as HTMLElement;
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    frame.focus();
    fireEvent.keyDown(card, { key: "Escape" });

    expect(document.activeElement).not.toBe(frame);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chat/WidgetFrame.test.tsx -t "actions de barre"`
Expected: FAIL — aucun bouton `source` dans la barre.

- [ ] **Step 3: Write minimal implementation**

Dans `WidgetFrame.tsx` — reprendre **exactement** le patron de `MermaidBlock.tsx:263-350` (bascule source, `Dialog` plein écran, bouton copie) :

```tsx
import { Maximize2Icon } from "lucide-react";
import { Button, IconButton } from "../ui";
import { CopyIcon } from "../icons";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../shadcn/dialog";
import { highlightCode } from "./md";

// … dans le composant :
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
```

Barre — remplacer le contenu de `chrome` par le libellé à gauche **plus** :

```tsx
      <div className="codeblock-bar-actions">
        <Button
          variant="ghost"
          className="mermaid-toggle"
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? t("chat.widget-view-panel") : t("chat.widget-view-source")}
        </Button>
        {!showSource && (
          <IconButton
            className="codeblock-copy"
            label={t("chat.widget-expand")}
            title={t("chat.widget-expand")}
            onClick={() => setExpanded(true)}
          >
            <Maximize2Icon size={12} />
          </IconButton>
        )}
        <IconButton
          className={`codeblock-copy${copied ? " copied" : ""}`}
          label={t("chat.output-copy")}
          title={copied ? t("chat.output-copied") : t("chat.output-copy")}
          onClick={() => {
            void navigator.clipboard.writeText(shell ?? "").then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          <CopyIcon size={12} />
        </IconButton>
      </div>
```

Corps — quand `showSource` est vrai, rendre le HTML au lieu de l'iframe :

```tsx
      {showSource ? (
        <pre>
          <code
            className="hljs language-html"
            dangerouslySetInnerHTML={{ __html: highlightCode(shell ?? "", "html") }}
          />
        </pre>
      ) : (
        <div className="widget-body" style={{ height: `${event.height}px` }}>
          {/* … iframe … */}
        </div>
      )}
```

Sortie clavier — poser `ref={cardRef}` et le gestionnaire sur la carte :

```tsx
    <div
      ref={cardRef}
      className="codeblock widget-block not-typeset"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          // sinon l'iframe est un piège à clavier
          (document.activeElement as HTMLElement | null)?.blur();
          cardRef.current?.focus();
        }
      }}
      tabIndex={-1}
    >
```

Plein écran — reprendre le `Dialog` de `MermaidBlock.tsx:316-350` en remplaçant le canvas SVG par une iframe de mêmes attributs (`sandbox="allow-scripts"`, `srcDoc={shell}`), et le libellé de toolbar par `event.title`.

CSS, dans `src/App.css` sous le bloc de la tâche 7 :

```css
.widget-block:focus-within { outline: 1px solid var(--accent); outline-offset: -1px; }
.widget-fullscreen-frame { width: 100%; height: 100%; border: 0; background: transparent; }
```

- [ ] **Step 4: Run the full gate**

Run:
```bash
npx vitest run src/components/chat/ && npx tsc --noEmit && npx vite build && cargo test
```
Expected: tout PASS, y compris `css-contract.test.ts` (aucun `<button>` nu, aucun hex en dur).

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/WidgetFrame.tsx src/components/chat/WidgetFrame.test.tsx src/App.css src/lib/i18n.ts
git commit -m "feat(chat): actions de barre du widget et sortie clavier"
```

---

## Vérification manuelle finale (Thierry, hors harness)

Le plan ne peut pas lancer l'app (`npm run tauri dev` ne survit pas à un harness d'agent). À la fin des 10 tâches, la boucle complète se vérifie ainsi :

1. Relancer l'app en suivant `docs/PROTOCOLE_RELANCE.md` **à la lettre**.
2. Dans un fil claude, demander : « affiche-moi un widget avec un curseur qui fait varier ν de 1 à 30 et montre le poids d'un résidu à 6 σ ».
3. Attendre : le panneau apparaît à la fin du tour (jamais pendant le streaming), le curseur répond, l'orange du curseur est celui du thème.
4. Remonter le fil au-delà de la fenêtre puis redescendre : la position du curseur est conservée.
5. Basculer clair/sombre : le widget suit **sans se recharger**.
6. Recharger la session : le widget revient.
7. Cliquer « source » : le HTML est lisible.

---

## Auto-revue du plan

**Couverture de la spec** — §A → tâche 1 · §B → tâches 2-4 · §B/Service → tâche 5 · §C → tâches 4 et 6 · §D coquille → tâche 2, protocole → tâches 7-9 · §E hauteur → tâche 6, gel → tâche 8, quatre états → tâches 6-7 · §F châssis → tâche 6, actions et clavier → tâche 10 · §G → tâche 9 · §H → tests de chaque tâche · §I hors périmètre : rien à faire, par construction (aucune tâche n'ouvre le réseau ni le disque au widget).

**Écarts assumés par rapport à la spec, découverts en écrivant le plan :**

1. La route est `/widgets/:thread_id/:id`, pas `/widgets/:id` : le fichier est rangé sous le hash du thread, l'id seul ne suffit pas à retrouver le chemin.
2. La spec listait `virtualRows.ts` dans les fichiers touchés. Il ne l'est pas : ce module stabilise l'identité des rangées, pas leur hauteur. La réservation se fait par le style inline de `.widget-body` (tâche 6), corrigé dans la spec.
3. Le plafond `html` est passé de 512 à 128 KiB : le pont impose `REQUEST_BODY_MAX = 256 KiB` (`agent_link.rs:160`) et l'échappement JSON gonfle la charge. Corrigé dans la spec.

**Deux points à vérifier au moment d'exécuter** (le plan les signale à l'endroit voulu, ils ne bloquent aucune tâche) : le nom réel de l'helper d'URL serveur dans `src/lib/ws.ts` (tâche 7) et la visibilité de `ws_router::json_msg` (tâche 4).
