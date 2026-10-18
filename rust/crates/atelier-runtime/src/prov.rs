//! Provenance et recette des fichiers produits — sidecars `<fichier>.prov.json`
//! (spec `docs/superpowers/specs/2026-08-27-provenance-figures-design.md`,
//! étendue par le chantier 2 du rattrapage Claude Science, 2026-10-18).
//!
//! Principe : la provenance est un SOUS-PRODUIT du tour d'agent, jamais une
//! instrumentation des scripts de Thierry. Rien à installer côté Python/R —
//! le runtime sait déjà, au `done`, quels fichiers le tour a touchés
//! (`changed_since_stats` contre le snapshot du tour) et quelles commandes
//! l'agent a lancées (les événements outils qui traversent la pompe).
//!
//! Depuis le chantier 2 :
//! - chaque tour terminé laisse une entrée dans le journal des tours
//!   (`ledger/<projet>--<hash>.jsonl`) : demande, commandes, fichiers lus et
//!   écrits, état Git, fournisseur et modèle (lot 2a) ;
//! - la recette couvre les figures, les PDF, les tableaux (CSV…), le LaTeX et
//!   le Markdown, et garde le script avec son empreinte, la commande exacte,
//!   les entrées avec leur empreinte et l'environnement (lot 2b,
//!   `recipe.rs`) ;
//! - tout s'écrit APRÈS le terminal du tour, hors du chemin du chat : le
//!   calcul des empreintes ne retarde jamais la réponse.
//!
//! Le sidecar voyage avec le fichier (rsync, NAS, git) : pas de base
//! centrale, pas d'index à resynchroniser, lisible par n'importe quel outil.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

/// Fichiers qui reçoivent une recette, par famille. Le PDF en fait partie : les
/// figures d'article sortent en vectoriel, et `latexmk` en produit aussi.
const FIGURE_EXTS: [&str; 5] = ["png", "svg", "jpg", "jpeg", "pdf"];
const TABLE_EXTS: [&str; 4] = ["csv", "tsv", "xlsx", "parquet"];
const DOCUMENT_EXTS: [&str; 2] = ["tex", "md"];
/// Fichiers d'instructions pour agents : ce ne sont pas des résultats.
const NOT_RESULTS: [&str; 3] = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];
/// Plafond de `history` (spec B). Une régénération AJOUTE une entrée en tête ;
/// au-delà, les plus vieilles tombent — le sidecar reste un fichier de quelques
/// kilo-octets même après des centaines de tours sur le même fichier.
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
const READS_MAX: usize = 50;
const TOOLS_MAX: usize = 40;
/// Une recette par fichier au plus pour cette quantité de fichiers : un tour
/// qui régénère 300 vignettes n'écrit pas 300 recettes.
const RECIPES_MAX: usize = 60;

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
/// Outils qui LISENT un fichier (journal : « fichiers lus »).
const READ_TOOL_NAMES: [&str; 6] = ["read", "read_file", "readfile", "view", "notebookread", "open_file"];

/// Les écritures de sidecars passent une à une : deux tours qui finissent en
/// même temps sur la même figure ne se volent pas leur entrée d'historique.
static SIDECAR_LOCK: Mutex<()> = Mutex::new(());

/// Ce que la pompe d'événements accumule pendant le tour.
#[derive(Default)]
struct TurnLog {
    commands: Vec<String>,
    reads: Vec<String>,
    tools: Vec<(String, Option<String>)>,
    usage: Option<Value>,
    done_ok: Option<bool>,
    changed: Option<Vec<String>>,
}

/// Contexte d'un tour, partagé entre la pompe d'événements (qui accumule les
/// commandes au fil de l'eau), le point de `done` (qui relève les fichiers du
/// tour) et la finalisation (qui écrit le journal et les recettes).
///
/// Le journal est derrière un `Arc<Mutex<…>>` parce que le tour a DEUX sorties
/// possibles : le `done` natif du provider, qui passe par la pompe, et le
/// `done` synthétique de repli (providers sans terminal natif), émis depuis une
/// autre tâche. Les deux s'excluent mutuellement — mais chacune doit voir la
/// même matière.
#[derive(Clone)]
pub struct TurnProvenance {
    thread_id: String,
    thread_title: Option<String>,
    turn_id: Option<String>,
    provider: String,
    model: Option<String>,
    effort: Option<String>,
    prompt: String,
    started_at: String,
    recipes: bool,
    log: Arc<Mutex<TurnLog>>,
}

/// Issue d'un tour, telle que la finalisation la reçoit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TurnEnd {
    Done,
    Error,
    Interrupted,
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
            turn_id: None,
            provider,
            model: model.filter(|m| !m.trim().is_empty()),
            effort: None,
            prompt,
            started_at: now_iso(),
            recipes: true,
            log: Arc::new(Mutex::new(TurnLog::default())),
        }
    }

    /// Identité du tour dans le journal du harnais, et effort demandé.
    pub fn with_turn(mut self, turn_id: &str, effort: Option<String>) -> Self {
        self.turn_id = Some(turn_id.to_string()).filter(|t| !t.is_empty());
        self.effort = effort.filter(|e| !e.trim().is_empty());
        self
    }

    /// Interrupteur « Recette des fichiers produits » (Réglages › Atelier,
    /// allumé par défaut). Coupé, aucun sidecar n'est écrit dans le projet ;
    /// le journal des tours, lui, reste tenu (il vit hors du projet).
    pub fn with_recipes(mut self, enabled: bool) -> Self {
        self.recipes = enabled;
        self
    }

    /// Repère les commandes shell, les fichiers lus et les outils dans le
    /// flux d'événements du tour.
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
        if kind == "done" {
            if let Ok(mut log) = self.log.lock() {
                log.done_ok = Some(event.get("ok").and_then(Value::as_bool).unwrap_or(true));
                if let Some(usage) = event.get("usage").filter(|u| u.is_object()) {
                    log.usage = Some(usage.clone());
                }
            }
            return;
        }
        if kind != "tool_update" && kind != "tool" {
            return;
        }
        let name = event.get("name").and_then(Value::as_str).unwrap_or("");
        if name.is_empty() || name.starts_with("__") {
            return;
        }
        let Ok(mut log) = self.log.lock() else {
            return;
        };
        let status = event.get("status").and_then(Value::as_str).map(str::to_string);
        if let Some(slot) = log.tools.iter_mut().find(|(n, _)| n == name) {
            if status.is_some() {
                slot.1 = status;
            }
        } else if log.tools.len() < TOOLS_MAX {
            log.tools.push((name.to_string(), status));
        }
        if is_read_tool(name) {
            if let Some(path) = read_path_from_tool_event(event) {
                if !log.reads.contains(&path) && log.reads.len() < READS_MAX {
                    log.reads.push(path);
                }
            }
            return;
        }
        if !is_shell_tool(name) {
            return;
        }
        let Some(command) = command_from_tool_event(event) else {
            return;
        };
        // Un même appel d'outil émet plusieurs `tool_update` (running →
        // completed, plus un par delta de sortie chez Codex) : sans cette
        // déduplication, `commands[]` répéterait trente fois la même ligne.
        if log.commands.iter().any(|c| c == &command) || log.commands.len() >= COMMANDS_MAX {
            return;
        }
        log.commands.push(command);
    }

    /// Relève les fichiers touchés par le tour, au `done`.
    ///
    /// `changed` = les chemins (relatifs à la racine du dépôt) déjà calculés
    /// pour `filesChanged`/`fileStats` : AUCUN spawn git supplémentaire ici, et
    /// aucune écriture — le journal et les recettes partent à la
    /// finalisation, une fois la réponse rendue au chat.
    pub fn record_done(&self, _project_root: &str, _snapshot_sha: Option<&str>, changed: &[String]) {
        if let Ok(mut log) = self.log.lock() {
            log.changed = Some(changed.to_vec());
        }
    }

    /// Finalisation du tour, une seule fois, après son terminal : écrit les
    /// recettes (tour réussi, interrupteur allumé) puis l'entrée du journal.
    /// Les échecs sont journalisés, jamais remontés : le chat a déjà sa
    /// réponse.
    pub fn finish(
        &self,
        project_root: &str,
        snapshot_sha: Option<&str>,
        ledger_dir: &Path,
        end: TurnEnd,
    ) {
        let (changed, done_ok) = {
            let log = self.log.lock().ok();
            (
                log.as_ref().and_then(|l| l.changed.clone()),
                log.as_ref().and_then(|l| l.done_ok),
            )
        };
        let end = if end == TurnEnd::Done && done_ok == Some(false) {
            TurnEnd::Error
        } else {
            end
        };
        // Un tour en erreur ou interrompu ne passe pas par `done` : ses
        // fichiers se relèvent ici, hors du chemin du chat.
        let changed = changed.unwrap_or_else(|| {
            snapshot_sha
                .filter(|_| !project_root.is_empty())
                .and_then(|sha| atelier_workspace::changed_since_stats(project_root, sha).ok())
                .map(|stats| stats.into_iter().map(|s| s.path).collect())
                .unwrap_or_default()
        });
        let recipes = if end == TurnEnd::Done && self.recipes {
            self.write_recipes(project_root, snapshot_sha, &changed)
        } else {
            Vec::new()
        };
        if project_root.is_empty() {
            return;
        }
        let entry = self.ledger_entry(project_root, snapshot_sha, &changed, &recipes, end);
        if let Err(error) = atelier_store::append_ledger(ledger_dir, project_root, &entry) {
            tracing::warn!(%error, thread_id = %self.thread_id, "journal des tours : écriture impossible");
        }
    }

    /// Écrit/complète les recettes des fichiers produits par le tour et rend
    /// la liste des fichiers qui en ont reçu une. Un tour sans fichier
    /// produit n'écrit rien.
    pub fn write_recipes(
        &self,
        project_root: &str,
        snapshot_sha: Option<&str>,
        changed: &[String],
    ) -> Vec<String> {
        if project_root.is_empty() || changed.is_empty() {
            return Vec::new();
        }
        let root = Path::new(project_root);
        let targets: Vec<&String> = changed
            .iter()
            .filter(|rel| recipe_kind(rel).is_some())
            // Un fichier SUPPRIMÉ pendant le tour ressort aussi du diff :
            // déposer un sidecar orphelin à côté d'un fichier disparu ne
            // ferait que salir le dossier.
            .filter(|rel| root.join(rel.as_str()).is_file())
            .take(RECIPES_MAX)
            .collect();
        if targets.is_empty() {
            return Vec::new();
        }
        let commands_text = self.log.lock().map(|l| l.commands.clone()).unwrap_or_default();
        let commands: Vec<crate::recipe::CommandFacts> = commands_text
            .iter()
            .map(|c| crate::recipe::command_facts(root, c))
            .collect();
        let changed_scripts: Vec<String> = changed
            .iter()
            .filter(|rel| is_script(rel))
            .take(SCRIPTS_MAX)
            .cloned()
            .collect();
        let base = self.base_entry(project_root, snapshot_sha, &commands_text);
        let mut fingerprints = crate::recipe::Fingerprints::default();
        let mut written = Vec::new();
        for rel in targets {
            let recipe = crate::recipe::build(root, rel, &commands, &changed_scripts, &mut fingerprints);
            let mut entry = base.clone();
            let obj = entry.as_object_mut().expect("entrée objet");
            obj.insert("kind".into(), json!(recipe_kind(rel)));
            obj.insert("scripts".into(), json!(recipe.scripts));
            obj.insert("scriptVersions".into(), json!(recipe.script_versions));
            obj.insert("command".into(), json!(recipe.command));
            obj.insert("inputs".into(), json!(recipe.inputs));
            obj.insert("env".into(), merge_env(env_snapshot(), recipe.env));
            let sidecar = sidecar_path(root, rel);
            let _guard = SIDECAR_LOCK.lock().unwrap_or_else(|p| p.into_inner());
            match append_history(&sidecar, rel, &entry) {
                Ok(()) => written.push(rel.clone()),
                // Contrat : un échec d'écriture ne casse JAMAIS le tour. La
                // provenance est un bonus, l'événement `done` est la mission.
                Err(error) => eprintln!("[prov] écriture impossible pour {rel} : {error}"),
            }
        }
        written
    }

    /// Champs communs à toutes les recettes du tour (spec B). `reconstructed:
    /// false` : cette entrée est capturée en direct, pas devinée après coup
    /// par un agent (le champ existe pour distinguer les prov.json
    /// rétroactifs, section E).
    fn base_entry(&self, project_root: &str, snapshot_sha: Option<&str>, commands: &[String]) -> Value {
        let mut entry = json!({
            "ts": now_iso(),
            "threadId": self.thread_id,
            "provider": self.provider,
            "prompt": truncate_chars(self.prompt.trim(), PROMPT_MAX_CHARS),
            "commands": commands,
            "snapshotSha": snapshot_sha,
            "head": head_sha(Path::new(project_root)),
            "projectRoot": project_root,
            "reconstructed": false,
        });
        let obj = entry.as_object_mut().expect("entrée objet");
        // Champs omis quand inconnus plutôt que `null` : le panneau galerie
        // teste la présence, pas la nullité (spec B — « threadTitle si
        // accessible sinon omets »).
        if let Some(turn) = self.turn_id.as_ref() {
            obj.insert("turnId".into(), json!(turn));
        }
        if let Some(title) = self.thread_title.as_ref() {
            obj.insert("threadTitle".into(), json!(title));
        }
        if let Some(model) = self.model.as_ref() {
            obj.insert("model".into(), json!(model));
        }
        if let Some(effort) = self.effort.as_ref() {
            obj.insert("effort".into(), json!(effort));
        }
        entry
    }

    /// Entrée du journal des tours (plan 048, Run Ledger v2). Jamais de
    /// sortie d'outil, d'environnement complet ni de prompt entier.
    fn ledger_entry(
        &self,
        project_root: &str,
        snapshot_sha: Option<&str>,
        changed: &[String],
        recipes: &[String],
        end: TurnEnd,
    ) -> Value {
        let (commands, reads, tools, usage) = self
            .log
            .lock()
            .map(|l| (l.commands.clone(), l.reads.clone(), l.tools.clone(), l.usage.clone()))
            .unwrap_or_default();
        let root = Path::new(project_root);
        let reads: Vec<String> = reads
            .iter()
            .map(|p| {
                let path = Path::new(p);
                if path.is_absolute() {
                    crate::recipe::display_path(root, path)
                } else {
                    p.clone()
                }
            })
            .collect();
        let mut files_changed = changed.to_vec();
        files_changed.sort();
        files_changed.dedup();
        let ended = now_iso();
        json!({
            "schemaVersion": 2,
            "projectId": atelier_store::project_id(project_root),
            "projectRoot": project_root,
            "ts": ended,
            "startedAt": self.started_at,
            "endedAt": ended,
            "status": match end {
                TurnEnd::Done => "done",
                TurnEnd::Error => "error",
                TurnEnd::Interrupted => "interrupted",
            },
            "threadId": self.thread_id,
            "turnId": self.turn_id,
            "threadTitle": self.thread_title,
            "provider": self.provider,
            "model": self.model,
            "effort": self.effort,
            "promptExcerpt": truncate_chars(self.prompt.trim(), PROMPT_MAX_CHARS),
            "usage": usage,
            "tools": tools.iter().map(|(name, status)| json!({"name": name, "status": status})).collect::<Vec<_>>(),
            "commands": commands,
            "filesRead": reads,
            "filesChanged": files_changed,
            "recipes": recipes,
            "snapshotSha": snapshot_sha,
            "head": head_sha(root),
        })
    }
}

/// L'env vu par le serveur (python du PATH, `$CONDA_DEFAULT_ENV`) sert de
/// repli ; celui lu dans la commande et le script a le dernier mot.
fn merge_env(base: Value, specific: Value) -> Value {
    let mut out = base.as_object().cloned().unwrap_or_default();
    if let Some(specific) = specific.as_object() {
        for (key, value) in specific {
            out.insert(key.clone(), value.clone());
        }
    }
    Value::Object(out)
}

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
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
/// Un sidecar illisible (vide, tronqué, sans `history`) n'est PAS lu comme
/// vide puis écrasé : ses octets sont d'abord mis de côté en
/// `<figure>.prov.json.corrupt-<horodatage>`, puis l'historique repart de la
/// génération courante. Exception assumée à « illisible = écriture refusée » :
/// refuser priverait de provenance toutes les générations suivantes de la
/// figure sans que personne le voie (le tour n'affiche pas cette erreur),
/// alors que la copie garde l'ancien historique intact. Si la copie échoue,
/// rien n'est écrit. Pas de sauvegarde du jour ici : un dossier `backups/`
/// dans chaque dossier de figures serait du bruit chez l'utilisateur.
/// Version 2 : mêmes champs que la v1, plus la recette (`command`,
/// `scriptVersions`, `inputs`, `env.packages`) ; un lecteur v1 l'ignore.
fn append_history(sidecar: &Path, rel_figure: &str, entry: &Value) -> std::io::Result<()> {
    let parsed = atelier_store::durable::load_with(sidecar, |bytes| {
        let value: Value = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
        value
            .get("history")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter(|e| e.is_object()).cloned().collect::<Vec<Value>>())
            .ok_or_else(|| "pas de liste « history »".to_string())
    });
    let mut history = match parsed {
        Ok(history) => history.unwrap_or_default(),
        Err(atelier_store::durable::StoreError::Unreadable { copy: Some(_), .. }) => Vec::new(),
        Err(error) => return Err(error.into()),
    };
    history.insert(0, entry.clone());
    history.truncate(HISTORY_MAX);
    let document = json!({
        "version": 2,
        "figure": rel_figure,
        "history": history,
    });
    let body = serde_json::to_string_pretty(&document)
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    atelier_store::durable::write_durable(sidecar, format!("{body}\n").as_bytes())
}

fn is_read_tool(name: &str) -> bool {
    READ_TOOL_NAMES.contains(&name.to_ascii_lowercase().as_str())
}

fn read_path_from_tool_event(event: &Value) -> Option<String> {
    let input = event.get("input")?;
    ["file_path", "path", "filePath", "notebook_path"]
        .iter()
        .find_map(|key| input.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|p| !p.is_empty() && p.len() <= 1024)
        .map(str::to_string)
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
    Some(truncate_chars(&crate::recipe::redact_command(text), COMMAND_MAX_CHARS))
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

/// Famille d'un fichier qui reçoit une recette, `None` sinon.
fn recipe_kind(rel: &str) -> Option<&'static str> {
    if in_hidden_dir(rel) {
        return None;
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
        return None;
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name.starts_with("_view_") || NOT_RESULTS.contains(&name) {
        return None;
    }
    let ext = extension_lower(rel)?;
    if FIGURE_EXTS.contains(&ext.as_str()) {
        Some(if ext == "pdf" { "pdf" } else { "figure" })
    } else if TABLE_EXTS.contains(&ext.as_str()) {
        Some("table")
    } else if DOCUMENT_EXTS.contains(&ext.as_str()) {
        Some(if ext == "tex" { "latex" } else { "markdown" })
    } else {
        None
    }
}

fn is_script(rel: &str) -> bool {
    if in_hidden_dir(rel) {
        return false;
    }
    crate::recipe::is_script_path(rel)
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

        prov.write_recipes(
            root.to_str().unwrap(),
            Some("abc1234"),
            &[
                "figures/albedo_trend.png".into(),
                "scripts/plot_albedo_trend.py".into(),
                "notes/journal.md".into(),
            ],
        );

        let doc = read_prov(root, "figures/albedo_trend.png");
        assert_eq!(doc["version"], 2);
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
        assert_eq!(
            entry["command"],
            "python3 scripts/plot_albedo_trend.py --region sask"
        );
        assert_eq!(entry["kind"], "figure");
        assert_eq!(entry["scriptVersions"][0]["path"], "scripts/plot_albedo_trend.py");
        assert_eq!(
            entry["scriptVersions"][0]["sha256"],
            "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
            "empreinte du script tel qu'il était à la fin du tour"
        );
        assert!(entry["ts"].as_str().unwrap().ends_with('Z'));
        assert!(entry["env"].is_object());
    }

    #[test]
    fn tour_sans_fichier_produit_n_ecrit_rien() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "scripts/plot.py");
        turn().write_recipes(
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
            prov.write_recipes(root.to_str().unwrap(), None, &["fig.png".into()]);
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
        turn().write_recipes(
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
        turn().write_recipes(root.to_str().unwrap(), None, &["figures/partie.png".into()]);
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
        prov.write_recipes(root.to_str().unwrap(), None, &["fig.pdf".into()]);
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
        for (label, raw) in atelier_store::durable::UNREADABLE_SAMPLES {
            let sidecar = root.join("fig.png.prov.json");
            std::fs::write(&sidecar, raw).unwrap();
            turn().write_recipes(root.to_str().unwrap(), None, &["fig.png".into()]);
            let doc = read_prov(root, "fig.png");
            assert_eq!(doc["history"].as_array().unwrap().len(), 1, "{label}");
            assert_eq!(
                atelier_store::durable::corrupt_copies_of(&sidecar, raw.as_bytes()),
                1,
                "{label} : l'ancien historique est mis de côté avant la réécriture"
            );
        }
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
        TurnProvenance::new("th".into(), None, "claude".into(), None, long).write_recipes(
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

    #[test]
    fn tableaux_latex_et_markdown_recoivent_une_recette() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        for rel in ["out/stats.csv", "these/chap1.tex", "notes/bilan.md", "CLAUDE.md", "data/raw.nc"] {
            touch(root, rel);
        }
        let written = turn().write_recipes(
            root.to_str().unwrap(),
            None,
            &[
                "out/stats.csv".into(),
                "these/chap1.tex".into(),
                "notes/bilan.md".into(),
                "CLAUDE.md".into(),
                "data/raw.nc".into(),
            ],
        );
        assert_eq!(written, vec!["out/stats.csv", "these/chap1.tex", "notes/bilan.md"]);
        assert_eq!(read_prov(root, "out/stats.csv")["history"][0]["kind"], "table");
        assert_eq!(read_prov(root, "these/chap1.tex")["history"][0]["kind"], "latex");
        assert_eq!(read_prov(root, "notes/bilan.md")["history"][0]["kind"], "markdown");
        assert!(!root.join("CLAUDE.md.prov.json").exists());
        assert!(!root.join("data/raw.nc.prov.json").exists());
    }

    #[test]
    fn finalisation_ecrit_le_journal_et_les_recettes() {
        let dir = tempdir().unwrap();
        let ledger = tempdir().unwrap();
        let root = dir.path();
        touch(root, "fig.png");
        let prov = turn().with_turn("turn-7", Some("high".into()));
        prov.note_event(&json!({"kind":"tool_update","name":"Read","input":{"file_path": root.join("data.csv").to_str().unwrap()},"status":"completed"}));
        prov.note_event(&json!({"kind":"tool_update","name":"Bash","input":{"command":"API_TOKEN=s3cret python3 plot.py"},"status":"running"}));
        prov.note_event(&json!({"kind":"tool_update","name":"Bash","input":{"command":"API_TOKEN=s3cret python3 plot.py"},"status":"completed"}));
        prov.note_event(&json!({"kind":"done","ok":true,"usage":{"output":12,"cost":0.5}}));
        prov.record_done(root.to_str().unwrap(), Some("abc1234"), &["fig.png".into()]);
        prov.finish(root.to_str().unwrap(), Some("abc1234"), ledger.path(), TurnEnd::Done);

        let entries = atelier_store::get_ledger(ledger.path(), root.to_str().unwrap(), 10);
        assert_eq!(entries.len(), 1);
        let entry = &entries[0];
        assert_eq!(entry["schemaVersion"], 2);
        assert_eq!(entry["status"], "done");
        assert_eq!(entry["turnId"], "turn-7");
        assert_eq!(entry["effort"], "high");
        assert_eq!(entry["filesChanged"], json!(["fig.png"]));
        assert_eq!(entry["filesRead"], json!(["data.csv"]));
        assert_eq!(entry["recipes"], json!(["fig.png"]));
        assert_eq!(entry["commands"], json!(["API_TOKEN=*** python3 plot.py"]));
        assert_eq!(entry["tools"], json!([{"name":"Read","status":"completed"},{"name":"Bash","status":"completed"}]));
        assert_eq!(entry["usage"]["cost"], 0.5);
        let text = std::fs::read_to_string(root.join("fig.png.prov.json")).unwrap();
        assert!(!text.contains("s3cret"), "le secret ne quitte pas la commande");
        assert_eq!(read_prov(root, "fig.png")["history"][0]["turnId"], "turn-7");
    }

    #[test]
    fn interrupteur_coupe_et_tour_en_erreur_n_ecrivent_pas_de_recette() {
        let dir = tempdir().unwrap();
        let ledger = tempdir().unwrap();
        let root = dir.path();
        touch(root, "fig.png");
        let off = turn().with_turn("t-off", None).with_recipes(false);
        off.record_done(root.to_str().unwrap(), None, &["fig.png".into()]);
        off.finish(root.to_str().unwrap(), None, ledger.path(), TurnEnd::Done);
        assert!(!root.join("fig.png.prov.json").exists());

        let failed = turn().with_turn("t-err", None);
        failed.note_event(&json!({"kind":"done","ok":false,"result":"boom"}));
        failed.record_done(root.to_str().unwrap(), None, &["fig.png".into()]);
        failed.finish(root.to_str().unwrap(), None, ledger.path(), TurnEnd::Done);
        assert!(!root.join("fig.png.prov.json").exists());

        let stopped = turn().with_turn("t-stop", None);
        stopped.finish(root.to_str().unwrap(), None, ledger.path(), TurnEnd::Interrupted);

        let entries = atelier_store::get_ledger(ledger.path(), root.to_str().unwrap(), 10);
        let status: Vec<_> = entries.iter().map(|e| (e["turnId"].clone(), e["status"].clone())).collect();
        assert_eq!(status.len(), 3);
        assert!(status.contains(&(json!("t-off"), json!("done"))));
        assert!(status.contains(&(json!("t-err"), json!("error"))));
        assert!(status.contains(&(json!("t-stop"), json!("interrupted"))));
    }
}
