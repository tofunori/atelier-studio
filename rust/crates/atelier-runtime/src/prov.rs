//! Provenance des figures — sidecars `<figure>.prov.json` (spec
//! `docs/superpowers/specs/2026-08-27-provenance-figures-design.md`, sections
//! A et B).
//!
//! Principe : la provenance est un SOUS-PRODUIT du tour d'agent, jamais une
//! instrumentation des scripts de Thierry. Rien à installer côté Python/R —
//! le runtime sait déjà, au `done`, quels fichiers le tour a touchés
//! (`changed_since_stats` contre le snapshot du tour) et quelles commandes
//! l'agent a lancées (les événements outils qui traversent la pompe). Il ne
//! reste qu'à déposer ce contexte à côté de chaque figure produite.
//!
//! Le sidecar voyage avec la figure (rsync, NAS, git) : pas de base centrale,
//! pas d'index à resynchroniser, lisible par n'importe quel outil.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

/// Extensions considérées comme des figures. Le PDF en fait partie : les
/// figures d'article sortent en vectoriel, pas seulement en PNG.
const FIGURE_EXTS: [&str; 3] = ["png", "svg", "pdf"];
/// Extensions des scripts susceptibles d'AVOIR produit la figure. Volontairement
/// large (`.tex` compile un PDF, `.mjs` génère des SVG) : une entrée de trop
/// dans `scripts[]` coûte moins cher qu'un script générateur manquant.
const SCRIPT_EXTS: [&str; 6] = ["py", "r", "jl", "sh", "tex", "mjs"];
/// Plafond de `history` (spec B). Une régénération AJOUTE une entrée en tête ;
/// au-delà, les plus vieilles tombent — le sidecar reste un fichier de quelques
/// kilo-octets même après des centaines de tours sur la même figure.
const HISTORY_MAX: usize = 20;
/// Le prompt sert de phrase de contexte dans le panneau Provenance, pas
/// d'archive : ~500 caractères suffisent, et un prompt collé de 40 ko n'a
/// aucune raison d'être recopié à côté de chaque figure.
const PROMPT_MAX_CHARS: usize = 500;
/// Bornes de sécurité : un tour bavard (des centaines de `ls`) ne doit pas
/// gonfler le sidecar. On garde les PREMIÈRES commandes — celles qui ont
/// généré la figure viennent en général avant les vérifications.
const COMMANDS_MAX: usize = 30;
const COMMAND_MAX_CHARS: usize = 400;
const SCRIPTS_MAX: usize = 20;

/// Noms d'outils qui exécutent réellement un shell, tous providers confondus.
/// Claude émet `Bash`, Codex `Bash` (item `commandExecution`), opencode/kimi
/// `bash`, Grok expose le nom natif via `_meta["x.ai/tool"].name`. La liste
/// reste permissive : un nom inconnu n'entre pas dans `commands[]`, ce qui est
/// le bon défaut (mieux vide que pollué par des lectures de fichiers).
const SHELL_TOOL_NAMES: [&str; 8] = [
    "bash",
    "shell",
    "exec",
    "execute",
    "terminal",
    "run",
    "run_command",
    "runcommand",
];

/// Contexte d'un tour, partagé entre la pompe d'événements (qui accumule les
/// commandes au fil de l'eau) et le point de `done` (qui écrit les sidecars).
///
/// `commands` est derrière un `Arc<Mutex<…>>` parce que le tour a DEUX sorties
/// possibles : le `done` natif du provider, qui passe par la pompe, et le
/// `done` synthétique de repli (providers sans terminal natif), émis depuis une
/// autre tâche. Les deux s'excluent mutuellement — mais chacune doit voir les
/// commandes accumulées.
#[derive(Clone)]
pub struct TurnProvenance {
    thread_id: String,
    thread_title: Option<String>,
    provider: String,
    model: Option<String>,
    prompt: String,
    commands: Arc<Mutex<Vec<String>>>,
}

impl TurnProvenance {
    pub fn new(
        thread_id: String,
        thread_title: Option<String>,
        provider: String,
        model: Option<String>,
        prompt: String,
    ) -> Self {
        Self {
            thread_id,
            thread_title: thread_title.filter(|t| !t.trim().is_empty()),
            provider,
            model: model.filter(|m| !m.trim().is_empty()),
            prompt,
            commands: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Repère les commandes shell dans le flux d'événements du tour.
    ///
    /// Forme réelle constatée (2026-08-27) : le contrat frontend est
    /// `kind:"tool_update"` — `kind:"tool"` ne sert plus qu'aux marqueurs
    /// internes (`__thinking`, `__waiting`, `__steered`, `__codex-error`),
    /// jamais à une commande. La commande complète vit dans `input.command`
    /// (chaîne chez Claude/Codex, parfois tableau argv) ; `detail` n'est qu'un
    /// résumé tronqué — chez Claude c'est même la DESCRIPTION rédigée par le
    /// modèle, donc inutilisable comme commande. `detail` ne sert donc que de
    /// dernier recours quand `input` est absent (Grok/ACP sans `rawInput`).
    pub fn note_event(&self, event: &Value) {
        let kind = event.get("kind").and_then(Value::as_str).unwrap_or("");
        if kind != "tool_update" && kind != "tool" {
            return;
        }
        let name = event.get("name").and_then(Value::as_str).unwrap_or("");
        if name.starts_with("__") || !is_shell_tool(name) {
            return;
        }
        let Some(command) = command_from_tool_event(event) else {
            return;
        };
        let Ok(mut commands) = self.commands.lock() else {
            return;
        };
        // Un même appel d'outil émet plusieurs `tool_update` (running →
        // completed, plus un par delta de sortie chez Codex) : sans cette
        // déduplication, `commands[]` répéterait trente fois la même ligne.
        if commands.iter().any(|c| c == &command) || commands.len() >= COMMANDS_MAX {
            return;
        }
        commands.push(command);
    }

    /// Écrit/complète les sidecars des figures touchées par le tour.
    ///
    /// `changed` = les chemins (relatifs à la racine du dépôt) déjà calculés
    /// pour `filesChanged`/`fileStats` : AUCUN spawn git supplémentaire ici.
    /// Un tour sans figure n'écrit rien du tout.
    pub fn record_done(&self, project_root: &str, snapshot_sha: Option<&str>, changed: &[String]) {
        if project_root.is_empty() || changed.is_empty() {
            return;
        }
        let root = Path::new(project_root);
        let figures: Vec<&String> = changed
            .iter()
            .filter(|rel| is_figure(rel))
            // Une figure SUPPRIMÉE pendant le tour ressort aussi du diff :
            // déposer un sidecar orphelin à côté d'un fichier disparu ne
            // ferait que salir le dossier.
            .filter(|rel| root.join(rel.as_str()).is_file())
            .collect();
        if figures.is_empty() {
            return;
        }
        let entry = self.entry(project_root, snapshot_sha, changed);
        for figure in figures {
            let sidecar = sidecar_path(root, figure);
            if let Err(error) = append_history(&sidecar, figure, &entry) {
                // Contrat : un échec d'écriture ne casse JAMAIS le tour. La
                // provenance est un bonus, l'événement `done` est la mission.
                eprintln!("[prov] écriture impossible pour {figure} : {error}");
            }
        }
    }

    /// Une entrée d'historique (spec B). `reconstructed:false` : cette entrée
    /// est capturée en direct, pas devinée après coup par un agent (le champ
    /// existe pour distinguer les prov.json rétroactifs, section E).
    fn entry(&self, project_root: &str, snapshot_sha: Option<&str>, changed: &[String]) -> Value {
        let scripts: Vec<&String> = changed
            .iter()
            .filter(|rel| is_script(rel))
            .take(SCRIPTS_MAX)
            .collect();
        let commands = self.commands.lock().map(|c| c.clone()).unwrap_or_default();
        let mut entry = json!({
            "ts": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "threadId": self.thread_id,
            "provider": self.provider,
            "prompt": truncate_chars(self.prompt.trim(), PROMPT_MAX_CHARS),
            "scripts": scripts,
            "commands": commands,
            "snapshotSha": snapshot_sha,
            "head": head_sha(Path::new(project_root)),
            "projectRoot": project_root,
            "env": env_snapshot(),
            "reconstructed": false,
        });
        let obj = entry.as_object_mut().expect("entrée objet");
        // Champs omis quand inconnus plutôt que `null` : le panneau galerie
        // teste la présence, pas la nullité (spec B — « threadTitle si
        // accessible sinon omets »).
        if let Some(title) = self.thread_title.as_ref() {
            obj.insert("threadTitle".into(), json!(title));
        }
        if let Some(model) = self.model.as_ref() {
            obj.insert("model".into(), json!(model));
        }
        entry
    }
}

/// Les tests et le panneau lisent le même chemin : `figure.png` →
/// `figure.png.prov.json` (suffixe AJOUTÉ, pas extension remplacée — deux
/// figures `trend.png` et `trend.pdf` gardent chacune sa provenance).
fn sidecar_path(root: &Path, rel_figure: &str) -> PathBuf {
    let abs = root.join(rel_figure);
    let mut name = abs.file_name().unwrap_or_default().to_os_string();
    name.push(".prov.json");
    abs.with_file_name(name)
}

/// Relit le sidecar existant, empile la nouvelle entrée EN TÊTE, plafonne.
/// Un sidecar illisible ou malformé est reparti de zéro : perdre un historique
/// corrompu vaut mieux que refuser d'enregistrer la génération courante.
fn append_history(sidecar: &Path, rel_figure: &str, entry: &Value) -> std::io::Result<()> {
    let mut history: Vec<Value> = std::fs::read_to_string(sidecar)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|value| {
            value
                .get("history")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter(|e| e.is_object()).cloned().collect())
        })
        .unwrap_or_default();
    history.insert(0, entry.clone());
    history.truncate(HISTORY_MAX);
    let document = json!({
        "version": 1,
        "figure": rel_figure,
        "history": history,
    });
    let body = serde_json::to_string_pretty(&document)
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    crate::atomic::write_file_atomic(sidecar, format!("{body}\n"))
}

fn is_shell_tool(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SHELL_TOOL_NAMES.contains(&lower.as_str())
        // Grok/ACP préfixent parfois le nom natif (`shell_command`,
        // `bash_tool`) : un préfixe suffit à trancher.
        || lower.starts_with("bash")
        || lower.starts_with("shell")
        || lower.starts_with("run_terminal")
}

/// La commande brute, quelle que soit la forme du provider.
fn command_from_tool_event(event: &Value) -> Option<String> {
    let raw = event.get("input").and_then(|input| {
        input
            .get("command")
            .or_else(|| input.get("cmd"))
            .or_else(|| input.get("script"))
    });
    let text = match raw {
        Some(Value::String(s)) => s.clone(),
        // Forme argv (`["bash","-lc","python3 plot.py"]`) : recoller avec des
        // espaces donne une ligne lisible et rejouable à l'œil.
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(" "),
        _ => event
            .get("detail")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
    };
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    Some(truncate_chars(text, COMMAND_MAX_CHARS))
}

fn extension_lower(rel: &str) -> Option<String> {
    Path::new(rel)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

/// Exclusions communes : tout ce qui vit dans un dossier caché (`.git`,
/// `.fig_thumbs`, `.venv`) n'est pas du matériel de thèse.
fn in_hidden_dir(rel: &str) -> bool {
    Path::new(rel)
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .any(|part| part.starts_with('.') && part != "." && part != "..")
}

fn is_figure(rel: &str) -> bool {
    if in_hidden_dir(rel) {
        return false;
    }
    let path = Path::new(rel);
    // `annotations/` = les captures annotées de la galerie (une figure
    // DÉRIVÉE, dont la provenance est le tour d'annotation, pas le script) ;
    // `_view_*.png` = captures d'écran du viewer, jamais des figures.
    if path
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .any(|part| part == "annotations")
    {
        return false;
    }
    if path
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with("_view_"))
    {
        return false;
    }
    extension_lower(rel).is_some_and(|ext| FIGURE_EXTS.contains(&ext.as_str()))
}

fn is_script(rel: &str) -> bool {
    if in_hidden_dir(rel) {
        return false;
    }
    extension_lower(rel).is_some_and(|ext| SCRIPT_EXTS.contains(&ext.as_str()))
}

fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let head: String = text.chars().take(max).collect();
    format!("{head}…")
}

/// HEAD du dépôt, lu à même `.git` — PAS de `git rev-parse` : la contrainte du
/// tour est « zéro spawn supplémentaire », et une lecture de fichier coûte
/// mille fois moins qu'un process. Gère le worktree (`.git` fichier qui pointe
/// vers un `gitdir:`) et le HEAD détaché (sha écrit en clair).
fn head_sha(root: &Path) -> Option<String> {
    let dot_git = root.join(".git");
    let git_dir = if dot_git.is_dir() {
        dot_git
    } else {
        let pointer = std::fs::read_to_string(&dot_git).ok()?;
        let target = pointer.trim().strip_prefix("gitdir:")?.trim();
        let target = Path::new(target);
        if target.is_absolute() {
            target.to_path_buf()
        } else {
            root.join(target)
        }
    };
    let head = std::fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    let Some(reference) = head.strip_prefix("ref:").map(str::trim) else {
        return is_sha(head).then(|| head.to_string());
    };
    // Ref non empaquetée d'abord, puis `packed-refs` (dépôt fraîchement cloné
    // ou après un `git gc`).
    if let Ok(direct) = std::fs::read_to_string(git_dir.join(reference)) {
        let direct = direct.trim();
        if is_sha(direct) {
            return Some(direct.to_string());
        }
    }
    let packed = std::fs::read_to_string(git_dir.join("packed-refs")).ok()?;
    packed.lines().find_map(|line| {
        let (sha, name) = line.split_once(' ')?;
        (name.trim() == reference && is_sha(sha)).then(|| sha.to_string())
    })
}

fn is_sha(value: &str) -> bool {
    value.len() >= 7 && value.len() <= 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// Environnement best-effort (spec A.4) : la version de `python3` du PATH et
/// l'env conda actif. Aucun gel complet en v1 — juste de quoi savoir, six mois
/// plus tard, sous quel interpréteur la figure est sortie.
///
/// La version python est mémoïsée POUR TOUT LE PROCESSUS : un tour ne doit pas
/// payer un spawn de plus, et l'interpréteur du PATH ne change pas sous les
/// pieds du serveur.
fn env_snapshot() -> Value {
    let mut env = serde_json::Map::new();
    if let Some(python) = python_version() {
        env.insert("python".into(), json!(python));
    }
    if let Ok(conda) = std::env::var("CONDA_DEFAULT_ENV") {
        if !conda.is_empty() {
            env.insert("conda".into(), json!(conda));
        }
    }
    Value::Object(env)
}

fn python_version() -> Option<String> {
    static PYTHON: OnceLock<Option<String>> = OnceLock::new();
    PYTHON
        .get_or_init(|| {
            let out = std::process::Command::new("python3")
                .arg("--version")
                .output()
                .ok()?;
            let text = if out.stdout.is_empty() {
                String::from_utf8_lossy(&out.stderr).to_string()
            } else {
                String::from_utf8_lossy(&out.stdout).to_string()
            };
            // « Python 3.12.4 » → « 3.12.4 »
            let version = text.trim().split_whitespace().last()?.to_string();
            (!version.is_empty()).then_some(version)
        })
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn turn() -> TurnProvenance {
        TurnProvenance::new(
            "th-1".into(),
            Some("Tendance albédo".into()),
            "codex".into(),
            Some("gpt-5.4".into()),
            "mets l'axe y en log".into(),
        )
    }

    fn touch(root: &Path, rel: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"x").unwrap();
    }

    fn read_prov(root: &Path, rel: &str) -> Value {
        let text = std::fs::read_to_string(sidecar_path(root, rel)).unwrap();
        serde_json::from_str(&text).unwrap()
    }

    #[test]
    fn tour_avec_figure_et_script_ecrit_un_prov_complet() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "figures/albedo_trend.png");
        touch(root, "scripts/plot_albedo_trend.py");
        let prov = turn();
        prov.note_event(&json!({
            "kind": "tool_update",
            "name": "Bash",
            "detail": "trace la tendance",
            "input": {"command": "python3 scripts/plot_albedo_trend.py --region sask"},
            "status": "running",
        }));
        // Même appel, second update : la commande ne doit apparaître qu'UNE fois.
        prov.note_event(&json!({
            "kind": "tool_update",
            "name": "Bash",
            "input": {"command": "python3 scripts/plot_albedo_trend.py --region sask"},
            "status": "completed",
        }));
        // Marqueur interne : jamais une commande.
        prov.note_event(&json!({"kind": "tool", "name": "__thinking-step", "detail": "Plan"}));
        // Outil non-shell : ignoré.
        prov.note_event(&json!({
            "kind": "tool_update",
            "name": "Read",
            "input": {"file_path": "scripts/plot_albedo_trend.py"},
        }));

        prov.record_done(
            root.to_str().unwrap(),
            Some("abc1234"),
            &[
                "figures/albedo_trend.png".into(),
                "scripts/plot_albedo_trend.py".into(),
                "notes/journal.md".into(),
            ],
        );

        let doc = read_prov(root, "figures/albedo_trend.png");
        assert_eq!(doc["version"], 1);
        assert_eq!(doc["figure"], "figures/albedo_trend.png");
        let entry = &doc["history"][0];
        assert_eq!(entry["threadId"], "th-1");
        assert_eq!(entry["threadTitle"], "Tendance albédo");
        assert_eq!(entry["provider"], "codex");
        assert_eq!(entry["model"], "gpt-5.4");
        assert_eq!(entry["prompt"], "mets l'axe y en log");
        assert_eq!(entry["snapshotSha"], "abc1234");
        assert_eq!(entry["projectRoot"], root.to_str().unwrap());
        assert_eq!(entry["reconstructed"], false);
        assert_eq!(
            entry["scripts"],
            json!(["scripts/plot_albedo_trend.py"]),
            "le .md ne doit pas passer pour un script générateur"
        );
        assert_eq!(
            entry["commands"],
            json!(["python3 scripts/plot_albedo_trend.py --region sask"])
        );
        assert!(entry["ts"].as_str().unwrap().ends_with('Z'));
        assert!(entry["env"].is_object());
    }

    #[test]
    fn tour_sans_figure_n_ecrit_rien() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "scripts/plot.py");
        turn().record_done(
            root.to_str().unwrap(),
            Some("abc1234"),
            &["scripts/plot.py".into(), "README.md".into()],
        );
        assert!(!root.join("scripts/plot.py.prov.json").exists());
        // Aucun sidecar nulle part : le dossier ne contient que ce qu'on y a mis.
        assert_eq!(std::fs::read_dir(root.join("scripts")).unwrap().count(), 1);
    }

    #[test]
    fn regeneration_empile_sans_ecraser_et_plafonne_a_vingt() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "fig.png");
        for i in 0..25 {
            let prov = TurnProvenance::new(
                format!("th-{i}"),
                None,
                "claude".into(),
                None,
                format!("tour {i}"),
            );
            prov.record_done(root.to_str().unwrap(), None, &["fig.png".into()]);
        }
        let doc = read_prov(root, "fig.png");
        let history = doc["history"].as_array().unwrap();
        assert_eq!(history.len(), HISTORY_MAX, "history plafonne à 20");
        assert_eq!(history[0]["threadId"], "th-24", "la plus récente en tête");
        assert_eq!(history[19]["threadId"], "th-5");
        // Titre absent → clé omise, pas `null`.
        assert!(history[0].get("threadTitle").is_none());
        assert!(history[0].get("model").is_none());
    }

    #[test]
    fn figures_exclues_vue_annotation_et_dossier_cache() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "_view_capture.png");
        touch(root, "annotations/fig_annotee.png");
        touch(root, ".fig_thumbs/thumb.png");
        touch(root, "figures/vrai.svg");
        turn().record_done(
            root.to_str().unwrap(),
            None,
            &[
                "_view_capture.png".into(),
                "annotations/fig_annotee.png".into(),
                ".fig_thumbs/thumb.png".into(),
                "figures/vrai.svg".into(),
            ],
        );
        assert!(!root.join("_view_capture.png.prov.json").exists());
        assert!(!root.join("annotations/fig_annotee.png.prov.json").exists());
        assert!(!root.join(".fig_thumbs/thumb.png.prov.json").exists());
        assert!(root.join("figures/vrai.svg.prov.json").exists());
    }

    #[test]
    fn figure_supprimee_pendant_le_tour_ne_recoit_pas_de_sidecar() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        turn().record_done(root.to_str().unwrap(), None, &["figures/partie.png".into()]);
        assert!(!root.join("figures/partie.png.prov.json").exists());
    }

    #[test]
    fn commande_en_argv_et_repli_sur_detail() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "fig.pdf");
        let prov = turn();
        prov.note_event(&json!({
            "kind": "tool_update",
            "name": "bash",
            "input": {"command": ["bash", "-lc", "Rscript trace.R"]},
        }));
        // ACP/Grok sans rawInput : `detail` est la seule trace de la commande.
        prov.note_event(&json!({
            "kind": "tool_update",
            "name": "shell",
            "detail": "latexmk -pdf figure.tex",
        }));
        prov.record_done(root.to_str().unwrap(), None, &["fig.pdf".into()]);
        let doc = read_prov(root, "fig.pdf");
        assert_eq!(
            doc["history"][0]["commands"],
            json!(["bash -lc Rscript trace.R", "latexmk -pdf figure.tex"])
        );
    }

    #[test]
    fn sidecar_corrompu_ne_bloque_pas_l_enregistrement() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "fig.png");
        std::fs::write(root.join("fig.png.prov.json"), b"{pas du json").unwrap();
        turn().record_done(root.to_str().unwrap(), None, &["fig.png".into()]);
        let doc = read_prov(root, "fig.png");
        assert_eq!(doc["history"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn head_sha_lit_le_dossier_git_sans_spawn() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".git/refs/heads")).unwrap();
        std::fs::write(root.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        std::fs::write(
            root.join(".git/refs/heads/main"),
            "0123456789abcdef0123456789abcdef01234567\n",
        )
        .unwrap();
        assert_eq!(
            head_sha(root).as_deref(),
            Some("0123456789abcdef0123456789abcdef01234567")
        );
        // HEAD détaché.
        std::fs::write(
            root.join(".git/HEAD"),
            "89abcdef0123456789abcdef0123456789abcdef\n",
        )
        .unwrap();
        assert_eq!(
            head_sha(root).as_deref(),
            Some("89abcdef0123456789abcdef0123456789abcdef")
        );
    }

    #[test]
    fn prompt_tronque_a_cinq_cents_caracteres() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "fig.png");
        let long = "é".repeat(900);
        TurnProvenance::new("th".into(), None, "claude".into(), None, long).record_done(
            root.to_str().unwrap(),
            None,
            &["fig.png".into()],
        );
        let doc = read_prov(root, "fig.png");
        let prompt = doc["history"][0]["prompt"].as_str().unwrap();
        assert_eq!(
            prompt.chars().count(),
            PROMPT_MAX_CHARS + 1,
            "500 + l'ellipse"
        );
        assert!(prompt.ends_with('…'));
    }
}
