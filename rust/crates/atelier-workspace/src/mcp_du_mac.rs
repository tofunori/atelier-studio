//! Serveurs MCP configurés sur le Mac (spécialistes, plan
//! specialistes-2026-10-18) : un fil qui porte un spécialiste ne branche que
//! les connecteurs de sa fiche. On les retrouve ici PAR LEUR NOM dans les
//! configurations que lisent déjà les CLI : Claude Code (`.mcp.json` du
//! projet, `~/.claude.json` portée projet puis utilisateur), Claude Desktop
//! (`claude_desktop_config.json`) et Codex (`~/.codex/config.toml`).
//!
//! Lecture seule : rien n'est jamais écrit dans ces fichiers.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::Path;

/// Serveur MCP au format `mcpServers` de Claude (`command`/`args`/`env`, ou
/// `type` + `url`).
#[derive(Debug, Clone, PartialEq)]
pub struct ServeurMcp {
    pub nom: String,
    pub source: &'static str,
    pub definition: Value,
}

/// Nom de serveur tel que l'interface l'affiche, avec ses sources.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct McpDuMac {
    pub nom: String,
    pub sources: Vec<String>,
}

/// Clé de comparaison d'un nom de connecteur : minuscules, lettres et
/// chiffres seulement (« Scholar Sidekick » = « scholar-sidekick »).
pub fn cle_mcp(nom: &str) -> String {
    nom.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn lire_json(chemin: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(chemin).ok()?).ok()
}

fn serveurs_de(objet: Option<&Value>, source: &'static str, sortie: &mut Vec<ServeurMcp>) {
    let Some(map) = objet.and_then(Value::as_object) else { return };
    for (nom, definition) in map {
        let utilisable = definition.get("command").and_then(Value::as_str).is_some()
            || definition.get("url").and_then(Value::as_str).is_some();
        if !utilisable || definition.get("disabled").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        if sortie.iter().any(|s| cle_mcp(&s.nom) == cle_mcp(nom)) {
            continue;
        }
        sortie.push(ServeurMcp { nom: nom.clone(), source, definition: definition.clone() });
    }
}

/// Serveurs MCP visibles d'un fil Claude, du plus prioritaire au moins
/// prioritaire (le premier nom trouvé gagne).
pub fn serveurs_mcp_claude(home: &Path, cwd: Option<&Path>) -> Vec<ServeurMcp> {
    let mut sortie = Vec::new();
    let config_claude = lire_json(&home.join(".claude.json"));
    if let Some(cwd) = cwd {
        if let Some(projet) = lire_json(&cwd.join(".mcp.json")) {
            serveurs_de(projet.get("mcpServers"), "projet", &mut sortie);
        }
        let cle_projet = cwd.to_string_lossy();
        let local = config_claude
            .as_ref()
            .and_then(|c| c.get("projects"))
            .and_then(|p| p.get(cle_projet.as_ref()))
            .and_then(|p| p.get("mcpServers"));
        serveurs_de(local, "claude-code", &mut sortie);
    }
    serveurs_de(config_claude.as_ref().and_then(|c| c.get("mcpServers")), "claude-code", &mut sortie);
    let desktop = lire_json(&home.join("Library/Application Support/Claude/claude_desktop_config.json"));
    serveurs_de(desktop.as_ref().and_then(|c| c.get("mcpServers")), "claude-desktop", &mut sortie);
    sortie
}

/// Noms des serveurs MCP de `config.toml` (Codex). Pas de dépendance TOML :
/// les en-têtes `[mcp_servers.<nom>]` (ou `[mcp_servers."<nom>"]`, sous-tables
/// comprises) et les entrées `<nom> = { … }` de la table `[mcp_servers]`.
pub fn noms_mcp_codex(codex_home: &Path) -> Vec<String> {
    let Ok(texte) = std::fs::read_to_string(codex_home.join("config.toml")) else {
        return Vec::new();
    };
    let mut noms: Vec<String> = Vec::new();
    let mut dans_table = false;
    let mut ajouter = |nom: &str| {
        let nom = nom.trim().trim_matches('"').trim_matches('\'');
        if !nom.is_empty() && !noms.iter().any(|n| n == nom) {
            noms.push(nom.to_string());
        }
    };
    for ligne in texte.lines() {
        let ligne = ligne.trim();
        if ligne.starts_with('#') || ligne.is_empty() {
            continue;
        }
        if let Some(entete) = ligne.strip_prefix('[').and_then(|l| l.split(']').next()) {
            let entete = entete.trim().trim_start_matches('[');
            dans_table = entete == "mcp_servers";
            if let Some(reste) = entete.strip_prefix("mcp_servers.") {
                let nom = if let Some(cite) = reste.strip_prefix('"') {
                    cite.split('"').next().unwrap_or("")
                } else {
                    reste.split('.').next().unwrap_or("")
                };
                ajouter(nom);
            }
            continue;
        }
        if dans_table {
            if let Some((nom, valeur)) = ligne.split_once('=') {
                if valeur.trim_start().starts_with('{') {
                    ajouter(nom);
                }
            }
        }
    }
    noms
}

/// Définition Codex (`config.mcp_servers.<nom>`) d'un serveur décrit au
/// format Claude. `None` pour un transport que Codex ne sait pas lancer (SSE).
pub fn definition_codex(definition: &Value) -> Option<Value> {
    if let Some(command) = definition.get("command").and_then(Value::as_str) {
        return Some(json!({
            "command": command,
            "args": definition.get("args").cloned().unwrap_or_else(|| json!([])),
            "env": definition.get("env").cloned().unwrap_or_else(|| json!({})),
        }));
    }
    let url = definition.get("url").and_then(Value::as_str)?;
    if definition.get("type").and_then(Value::as_str) == Some("sse") {
        return None;
    }
    let mut serveur = json!({ "url": url });
    if let Some(entetes) = definition.get("headers").filter(|h| h.is_object()) {
        serveur["http_headers"] = entetes.clone();
    }
    Some(serveur)
}

/// Tous les serveurs MCP du Mac, pour la fiche d'un spécialiste.
pub fn mcp_du_mac(home: &Path, codex_home: &Path) -> Vec<McpDuMac> {
    let mut liste: Vec<McpDuMac> = Vec::new();
    let mut noter = |nom: &str, source: &str| {
        match liste.iter_mut().find(|m| cle_mcp(&m.nom) == cle_mcp(nom)) {
            Some(m) if !m.sources.iter().any(|s| s == source) => m.sources.push(source.into()),
            Some(_) => {}
            None => liste.push(McpDuMac { nom: nom.into(), sources: vec![source.into()] }),
        }
    };
    for serveur in serveurs_mcp_claude(home, None) {
        noter(&serveur.nom, serveur.source);
    }
    for nom in noms_mcp_codex(codex_home) {
        noter(&nom, "codex");
    }
    liste.sort_by_key(|m| cle_mcp(&m.nom));
    liste
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ecrire(chemin: &Path, texte: &str) {
        std::fs::create_dir_all(chemin.parent().unwrap()).unwrap();
        std::fs::write(chemin, texte).unwrap();
    }

    #[test]
    fn la_cle_ignore_casse_et_ponctuation() {
        assert_eq!(cle_mcp("Scholar Sidekick"), cle_mcp("scholar-sidekick"));
        assert_ne!(cle_mcp("scholar"), cle_mcp("ragdoc"));
    }

    #[test]
    fn claude_lit_projet_puis_utilisateur_puis_desktop() {
        let home = tempfile::tempdir().unwrap();
        let projet = tempfile::tempdir().unwrap();
        let cwd = projet.path().to_string_lossy().to_string();
        ecrire(&projet.path().join(".mcp.json"), r#"{"mcpServers":{"scholar":{"command":"projet-scholar"}}}"#);
        ecrire(
            &home.path().join(".claude.json"),
            &json!({
                "mcpServers": {"scholar": {"command": "user-scholar"}, "gbrain": {"type": "http", "url": "https://g"}},
                "projects": {cwd: {"mcpServers": {"ragdoc": {"command": "ragdoc"}}}},
            })
            .to_string(),
        );
        ecrire(
            &home.path().join("Library/Application Support/Claude/claude_desktop_config.json"),
            r#"{"mcpServers":{"Context7":{"command":"npx","args":["c7"]},"gbrain":{"command":"autre"},"vide":{}}}"#,
        );
        let serveurs = serveurs_mcp_claude(home.path(), Some(projet.path()));
        let noms: Vec<_> = serveurs.iter().map(|s| (s.nom.as_str(), s.source)).collect();
        assert_eq!(noms, [("scholar", "projet"), ("ragdoc", "claude-code"), ("gbrain", "claude-code"), ("Context7", "claude-desktop")]);
        assert_eq!(serveurs[0].definition["command"], "projet-scholar");
        assert_eq!(serveurs[2].definition["url"], "https://g");
    }

    #[test]
    fn codex_lit_les_entetes_et_la_table_en_ligne() {
        let codex = tempfile::tempdir().unwrap();
        ecrire(
            &codex.path().join("config.toml"),
            "model = \"x\"\n[mcp_servers.gbrain]\ncommand = \"g\"\n[mcp_servers.gbrain.env]\nA = \"1\"\n[mcp_servers.\"scholar-sidekick\"]\ncommand = \"s\"\n# [mcp_servers.commente]\n[mcp_servers]\nragdoc = { command = \"r\" }\n[profiles.x]\nautre = { a = 1 }\n",
        );
        assert_eq!(noms_mcp_codex(codex.path()), ["gbrain", "scholar-sidekick", "ragdoc"]);
        assert!(noms_mcp_codex(Path::new("/nulle/part")).is_empty());
    }

    #[test]
    fn conversion_vers_codex() {
        assert_eq!(
            definition_codex(&json!({"command": "c", "args": ["a"]})),
            Some(json!({"command": "c", "args": ["a"], "env": {}}))
        );
        assert_eq!(
            definition_codex(&json!({"type": "http", "url": "https://u", "headers": {"X": "1"}})),
            Some(json!({"url": "https://u", "http_headers": {"X": "1"}}))
        );
        assert_eq!(definition_codex(&json!({"type": "sse", "url": "https://u"})), None);
    }

    #[test]
    fn la_liste_du_mac_fusionne_les_sources() {
        let home = tempfile::tempdir().unwrap();
        let codex = tempfile::tempdir().unwrap();
        ecrire(&home.path().join(".claude.json"), r#"{"mcpServers":{"Scholar":{"command":"s"}}}"#);
        ecrire(&codex.path().join("config.toml"), "[mcp_servers.scholar]\ncommand = \"s\"\n[mcp_servers.gbrain]\ncommand = \"g\"\n");
        assert_eq!(
            mcp_du_mac(home.path(), codex.path()),
            [
                McpDuMac { nom: "gbrain".into(), sources: vec!["codex".into()] },
                McpDuMac { nom: "Scholar".into(), sources: vec!["claude-code".into(), "codex".into()] },
            ]
        );
    }
}
