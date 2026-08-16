//! Port de la partie « gbrain » de `sidecar/knowledge.mjs` (plan 065, vague
//! 2, groupe b) : résolution du binaire `gbrain` (hook `ATELIER_TEST_GBRAIN`
//! respecté à l'identique), spawn avec timeout (`GBRAIN_TIMEOUT_MS`), parsing
//! de `gbrain search`, page directe (`buildGbrainPage`/`promotePage`).
//! `gbrain` reste un binaire externe (motif "spawns inchangés" du plan 065) —
//! jamais réimplémenté ici, seulement invoqué comme process.

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use unicode_normalization::UnicodeNormalization;

const GBRAIN_TIMEOUT_MS: u64 = 20_000;
pub const GBRAIN_PREVIEW_MAX: usize = 4000;
pub const GBRAIN_PAGE_MAX: usize = 100_000;

static NOT_FOUND_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^Error \[page_not_found\]").unwrap());
static ERROR_BRACKET_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^Error \[").unwrap());
static SLUG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^[a-z0-9][a-z0-9/_.-]*$").unwrap());

/// `gbrain get <slug-absent>` répond « Error [page_not_found]: … » sur stdout
/// avec exit 0 — miroir de `GBRAIN_NOT_FOUND` (`knowledge.mjs`).
pub fn gbrain_not_found(text: &str) -> bool {
    NOT_FOUND_RE.is_match(text)
}

pub(crate) fn is_error_bracket(text: &str) -> bool {
    ERROR_BRACKET_RE.is_match(text)
}

/// Miroir de `resolveGbrainBin()` : `ATELIER_TEST_GBRAIN` (hook de test)
/// d'abord, puis `which gbrain`, puis les emplacements classiques
/// (`~/.bun/bin` en priorité pratique).
pub fn resolve_gbrain_bin() -> Option<String> {
    if let Ok(test) = std::env::var("ATELIER_TEST_GBRAIN") {
        if !test.is_empty() && Path::new(&test).exists() {
            return Some(test);
        }
    }
    if let Ok(output) = Command::new("which").arg("gbrain").output() {
        if output.status.success() {
            let found = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !found.is_empty() {
                return Some(found);
            }
        }
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    [
        format!("{home}/.bun/bin/gbrain"),
        "/opt/homebrew/bin/gbrain".to_string(),
        "/usr/local/bin/gbrain".to_string(),
        format!("{home}/bin/gbrain"),
        format!("{home}/.local/bin/gbrain"),
    ]
    .into_iter()
    .find(|candidate| Path::new(candidate).exists())
}

pub(crate) enum SpawnOutcome {
    Finished { code: i32, stdout: Vec<u8>, stderr: Vec<u8> },
    TimedOut,
    SpawnError(String),
}

/// Spawn générique avec timeout — miroir de `spawnSync(bin, args, {timeout,
/// input})`. stdout/stderr lus sur des threads dédiés pour ne jamais
/// bloquer sur un pipe plein pendant qu'on écrit stdin ou qu'on attend.
/// Réutilisé par `article.rs` pour les spawns `ssh` (motif "spawns
/// inchangés" du plan 065 — même mécanique de timeout que gbrain).
pub(crate) fn spawn_with_timeout(bin: &str, args: &[&str], input: Option<&str>, timeout: Duration) -> SpawnOutcome {
    let mut cmd = Command::new(bin);
    cmd.args(args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(if input.is_some() { Stdio::piped() } else { Stdio::null() });
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return SpawnOutcome::SpawnError(e.to_string()),
    };

    let stdin_pipe = child.stdin.take();
    let input_owned = input.map(|s| s.to_string());
    let stdin_thread = std::thread::spawn(move || {
        if let (Some(mut stdin), Some(text)) = (stdin_pipe, input_owned) {
            let _ = stdin.write_all(text.as_bytes());
        }
    });

    let stdout_pipe = child.stdout.take();
    let stdout_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut s) = stdout_pipe {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });
    let stderr_pipe = child.stderr.take();
    let stderr_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut s) = stderr_pipe {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(_) => break None,
        }
    };
    let _ = stdin_thread.join();
    let stdout = stdout_thread.join().unwrap_or_default();
    let stderr = stderr_thread.join().unwrap_or_default();
    match status {
        Some(status) => SpawnOutcome::Finished { code: status.code().unwrap_or(-1), stdout, stderr },
        None => SpawnOutcome::TimedOut,
    }
}

pub struct GbrainInvocation {
    pub cmd: String,
    pub argv: Vec<String>,
}

/// Hôte ssh par défaut de `gbrainInvocation` — miroir du paramètre par
/// défaut `process.env.ATELIER_GBRAIN_SSH_HOST ?? "nas"` (knowledge.mjs:337).
pub fn default_gbrain_ssh_host() -> String {
    std::env::var("ATELIER_GBRAIN_SSH_HOST").unwrap_or_else(|_| "nas".to_string())
}

/// Miroir de `gbrainInvocation(args, host)` (`sidecar/knowledge.mjs:337-348`,
/// fix(preuves) bb009b2b). Le brain CANONIQUE vit sur le NAS — le binaire
/// gbrain local pointe (souvent) sur un brain PGLite quasi vide, toutes les
/// lectures y échouent en `page_not_found`. Défaut : `ssh -o BatchMode=yes -o
/// ConnectTimeout=8 <host> 'gbrain <args…>'`, arguments échappés en quotes
/// simples (ssh reconcatène en une ligne de shell côté distant). `host` vide
/// (`ATELIER_GBRAIN_SSH_HOST=""`) force le binaire local via
/// `resolve_gbrain_bin` — c'est là, comme côté Node, que le hook de test
/// `ATELIER_TEST_GBRAIN` reprend la main (fixtures kb_parity).
pub fn gbrain_invocation(args: &[&str], host: &str) -> Result<GbrainInvocation, String> {
    if host.is_empty() {
        let bin = resolve_gbrain_bin()
            .ok_or_else(|| "gbrain introuvable (PATH, ~/.bun/bin) — corpus NAS indisponible".to_string())?;
        return Ok(GbrainInvocation { cmd: bin, argv: args.iter().map(|s| s.to_string()).collect() });
    }
    let sq = |value: &str| format!("'{}'", value.replace('\'', r"'\''"));
    let mut parts = vec!["gbrain".to_string()];
    parts.extend(args.iter().map(|a| sq(a)));
    Ok(GbrainInvocation {
        cmd: "ssh".to_string(),
        argv: vec![
            "-o".to_string(),
            "BatchMode=yes".to_string(),
            "-o".to_string(),
            "ConnectTimeout=8".to_string(),
            host.to_string(),
            parts.join(" "),
        ],
    })
}

/// Miroir de `runGbrain(args, {input})` — throw dur si le binaire est
/// introuvable, timeout `GBRAIN_TIMEOUT_MS`, exit ≠ 0 → message borné à 300
/// caractères (stderr, ou stdout à défaut). Aiguillage ssh/local via
/// `gbrain_invocation` (voir sa doc) au lieu d'un spawn direct du binaire
/// local — B1 (plans/065-revue-findings.md) : les écritures partaient dans
/// le mauvais brain (local, quasi vide) faute de suivre `ssh nas` par défaut.
pub fn run_gbrain(args: &[&str], input: Option<&str>) -> Result<String, String> {
    let host = default_gbrain_ssh_host();
    let invocation = gbrain_invocation(args, &host)?;
    let argv_refs: Vec<&str> = invocation.argv.iter().map(String::as_str).collect();
    match spawn_with_timeout(&invocation.cmd, &argv_refs, input, Duration::from_millis(GBRAIN_TIMEOUT_MS)) {
        SpawnOutcome::Finished { code, stdout, stderr } => {
            let stdout = String::from_utf8_lossy(&stdout).into_owned();
            if code != 0 {
                let stderr_s = String::from_utf8_lossy(&stderr).into_owned();
                let combined = if !stderr_s.trim().is_empty() {
                    stderr_s
                } else if !stdout.trim().is_empty() {
                    stdout
                } else {
                    "gbrain: échec".to_string()
                };
                let msg: String = combined.trim().chars().take(300).collect();
                Err(msg)
            } else {
                Ok(stdout)
            }
        }
        SpawnOutcome::TimedOut => Err("gbrain : délai dépassé (NAS injoignable ?)".to_string()),
        SpawnOutcome::SpawnError(e) => Err(format!("gbrain: {e}")),
    }
}

pub struct GbrainHit {
    pub slug: String,
    pub snippet: String,
}

/// Miroir de `parseGbrainSearch` : lignes `[score] slug -- extrait…`, extraits
/// parfois multi-lignes (rallongés tant que < 180 caractères) ; « No
/// results. » = liste vide.
pub fn parse_gbrain_search(output: &str) -> Vec<GbrainHit> {
    static LINE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\[\d+(?:\.\d+)?\]\s+(\S+)\s+--\s*(.*)$").unwrap());
    static LEADING_HASH_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^#+\s*").unwrap());
    let mut results: Vec<GbrainHit> = Vec::new();
    let mut current: Option<usize> = None;
    for line in output.split('\n') {
        if let Some(caps) = LINE_RE.captures(line) {
            let slug = caps[1].to_string();
            let snippet_raw = &caps[2];
            let snippet = LEADING_HASH_RE.replace(snippet_raw, "").trim().to_string();
            results.push(GbrainHit { slug, snippet });
            current = Some(results.len() - 1);
        } else if let Some(idx) = current {
            if !line.trim().is_empty() && results[idx].snippet.chars().count() < 180 {
                let appended = format!("{} {}", results[idx].snippet, line.trim());
                results[idx].snippet = appended.trim().to_string();
            }
        }
    }
    results
}

fn is_combining_diacritic(c: char) -> bool {
    ('\u{0300}'..='\u{036f}').contains(&c)
}

/// Miroir de `slugifyTitle` : NFKD, retrait diacritiques, minuscule,
/// non-alphanum -> `-` (collapsé), trim des tirets, 60 caractères max
/// (re-trimmé après troncature), défaut `"page"`.
pub fn slugify_title(title: &str) -> String {
    let decomposed: String = title.nfkd().collect();
    let stripped: String = decomposed.chars().filter(|c| !is_combining_diacritic(*c)).collect();
    let lower = stripped.to_lowercase();
    let mut collapsed = String::new();
    let mut last_dash = false;
    for c in lower.chars() {
        if c.is_ascii_alphanumeric() {
            collapsed.push(c);
            last_dash = false;
        } else if !last_dash {
            collapsed.push('-');
            last_dash = true;
        }
    }
    let trimmed = collapsed.trim_matches('-');
    let sliced: String = trimmed.chars().take(60).collect();
    let base = sliced.trim_end_matches('-');
    if base.is_empty() {
        "page".to_string()
    } else {
        base.to_string()
    }
}

fn strip_single_quote_ends(s: &str) -> String {
    let mut chars: Vec<char> = s.chars().collect();
    if matches!(chars.first(), Some('"') | Some('\'')) {
        chars.remove(0);
    }
    if matches!(chars.last(), Some('"') | Some('\'')) {
        chars.pop();
    }
    chars.into_iter().collect()
}

/// Miroir de `gbrainTitle` : front-matter `title:` (inline ou plié `>-`),
/// sinon premier titre markdown, sinon le slug.
pub fn gbrain_title(markdown: &str, slug: &str) -> String {
    static FM_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?s)^---\n(.*?)\n---").unwrap());
    static FOLDED_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^title:\s*>-?\s*\n((?:[ \t]+\S.*\n?)+)").unwrap());
    static INLINE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^title:\s*(\S.*)$").unwrap());
    static HEADING_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^#\s+(.+)$").unwrap());

    if let Some(caps) = FM_RE.captures(markdown) {
        let fm = &caps[1];
        let raw = if let Some(fc) = FOLDED_RE.captures(fm) {
            fc[1].lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ")
        } else if let Some(ic) = INLINE_RE.captures(fm) {
            ic[1].trim().to_string()
        } else {
            String::new()
        };
        let clean = strip_single_quote_ends(&raw).trim().to_string();
        if !clean.is_empty() && !clean.starts_with('>') {
            return clean;
        }
    }
    if let Some(h) = HEADING_RE.captures(markdown) {
        return h[1].trim().to_string();
    }
    slug.to_string()
}

/// Valide le slug CIBLE d'une écriture (`promote-page --slug`,
/// `article-write --slug`) — miroir exact de `GBRAIN_SLUG_RE`
/// (`sidecar/knowledge.mjs`/`article.mjs`). Public (plutôt que `pub(crate)`)
/// pour permettre le test-frontière `atelier-runtime` qui le confronte à
/// `evidence::is_valid_gbrain_slug` — voir la note à côté de ce dernier :
/// CE N'EST PAS le même validateur (écriture vs lecture d'un lien de
/// passage), ne jamais les fusionner sans re-vérifier la parité Node.
pub fn is_valid_gbrain_slug(target: &str) -> bool {
    SLUG_RE.is_match(target) && !target.chars().any(char::is_whitespace)
}

fn take_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Compose la page markdown (front-matter traçable) depuis le texte stocké —
/// miroir de `buildGbrainPage`. `full_text` est fourni par l'appelant
/// (`store.full_text(id)`) pour ne pas coupler ce module à `KnowledgeStore`.
pub fn build_gbrain_page(entry: &Value, full_text: &str) -> String {
    let scalars_len = full_text.chars().count();
    let body = if scalars_len > GBRAIN_PAGE_MAX {
        let truncated: String = take_chars(full_text, GBRAIN_PAGE_MAX);
        format!("{truncated}\n[…tronqué]")
    } else {
        full_text.to_string()
    };
    let title = entry.get("title").and_then(Value::as_str).unwrap_or("");
    let origin = entry
        .get("origin")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| entry.get("kind").and_then(Value::as_str).unwrap_or("").to_string());
    let captured = chrono::Utc::now().format("%Y-%m-%d").to_string();
    format!(
        "---\ntitle: {}\norigin: {}\ncaptured: {captured}\nfrom: atelier\n---\n\n{body}\n",
        serde_json::to_string(title).unwrap(),
        serde_json::to_string(&origin).unwrap(),
    )
}

/// Aperçu (`write=false`) puis écriture (`write=true`) d'une page directe —
/// miroir de `promotePage`. JAMAIS d'écrasement silencieux : l'existence du
/// slug cible est vérifiée par un `get` préalable et retournée à l'appelant.
pub fn promote_page(entry: &Value, full_text: &str, slug: Option<&str>, write: bool) -> Result<Value, String> {
    let markdown = build_gbrain_page(entry, full_text);
    let title = entry.get("title").and_then(Value::as_str).unwrap_or("");
    let id = entry.get("id").and_then(Value::as_str).unwrap_or("");
    let chars = entry.get("chars").cloned().unwrap_or(json!(0));
    let target = slug
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("atelier/{}", slugify_title(title)));
    if !is_valid_gbrain_slug(&target) {
        return Err(format!("Slug invalide: {target}"));
    }
    let probe = run_gbrain(&["get", &target], None)?;
    let probe = probe.trim().to_string();
    let exists = !probe.is_empty() && !gbrain_not_found(&probe);
    if !write {
        let preview = if markdown.chars().count() > GBRAIN_PREVIEW_MAX {
            format!("{}\n[…]", take_chars(&markdown, GBRAIN_PREVIEW_MAX))
        } else {
            markdown
        };
        return Ok(json!({
            "ok": true, "id": id, "slug": target, "exists": exists,
            "title": title, "chars": chars, "preview": preview,
        }));
    }
    let out = run_gbrain(&["put", &target], Some(&markdown))?;
    if gbrain_not_found(&out) || is_error_bracket(&out) {
        return Err(take_chars(out.trim(), 300));
    }
    Ok(json!({"ok": true, "id": id, "slug": target, "written": true, "updated": exists}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_title_translitere_et_tronque() {
        assert_eq!(slugify_title("Page NAS test"), "page-nas-test");
        assert_eq!(slugify_title("Météo & Climat"), "meteo-climat");
        assert_eq!(slugify_title(""), "page");
    }

    #[test]
    fn parse_gbrain_search_lit_les_lignes_et_no_results() {
        let hits = parse_gbrain_search("[0.91] atelier/page-fixture -- Contenu de la page NAS pour fixture.\n");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].slug, "atelier/page-fixture");
        assert_eq!(hits[0].snippet, "Contenu de la page NAS pour fixture.");
        assert!(parse_gbrain_search("No results.\n").is_empty());
    }

    #[test]
    fn gbrain_title_lit_le_front_matter_inline() {
        let md = "---\ntitle: \"Page NAS test\"\n---\n\nContenu.";
        assert_eq!(gbrain_title(md, "atelier/x"), "Page NAS test");
        assert_eq!(gbrain_title("pas de front-matter", "atelier/x"), "atelier/x");
    }

    #[test]
    fn gbrain_not_found_reconnait_le_motif() {
        assert!(gbrain_not_found("Error [page_not_found]: atelier/absent\n"));
        assert!(!gbrain_not_found("markdown normal"));
        // le CLI NAS préfixe sa bannière de mise à jour ET sort en code non
        // nul : le motif doit matcher au début de LIGNE, pas de chaîne
        // (fix probe_exists 2026-08-16 — l'écriture d'un article NEUF
        // recevait cette forme via le Err de run_gbrain)
        assert!(gbrain_not_found(
            "UPGRADE_AVAILABLE 0.42.40.0 0.46.2.0\ngbrain 0.42.40.0 -> 0.46.2.0 available. Run: gbrain self-upgrade\nError [page_not_found]: Page not found: zhao_2023",
        ));
    }

    // Miroir de `describe("gbrainInvocation — aiguillage NAS (fix
    // 2026-08-16)")` (sidecar/knowledge.test.mjs:732-749) — B1
    // (plans/065-revue-findings.md).
    #[test]
    fn gbrain_invocation_defaut_ssh_avec_arguments_echappes() {
        let inv = gbrain_invocation(&["get", "papers/acp-19-1393-2019"], "nas").unwrap();
        assert_eq!(inv.cmd, "ssh");
        assert_eq!(&inv.argv[0..4], &["-o", "BatchMode=yes", "-o", "ConnectTimeout=8"]);
        assert_eq!(inv.argv[4], "nas");
        assert_eq!(inv.argv[5], "gbrain 'get' 'papers/acp-19-1393-2019'");
    }

    #[test]
    fn gbrain_invocation_apostrophe_ne_casse_pas_la_ligne_shell() {
        let inv = gbrain_invocation(&["search", "l'albédo des glaciers"], "nas").unwrap();
        assert_eq!(inv.argv[5], "gbrain 'search' 'l'\\''albédo des glaciers'");
    }

    #[test]
    fn gbrain_invocation_host_vide_utilise_le_binaire_local() {
        let tmp = std::env::temp_dir().join("atelier-kb-gbrain-invocation-test-fake-bin");
        std::fs::write(&tmp, b"#!/bin/sh\nexit 0\n").unwrap();
        std::env::set_var("ATELIER_TEST_GBRAIN", &tmp);
        let inv = gbrain_invocation(&["get", "slug"], "").unwrap();
        std::env::remove_var("ATELIER_TEST_GBRAIN");
        let _ = std::fs::remove_file(&tmp);
        assert_ne!(inv.cmd, "ssh");
        assert_eq!(inv.argv, vec!["get".to_string(), "slug".to_string()]);
    }

    #[test]
    fn default_gbrain_ssh_host_utilise_nas_par_defaut() {
        std::env::remove_var("ATELIER_GBRAIN_SSH_HOST");
        assert_eq!(default_gbrain_ssh_host(), "nas");
        std::env::set_var("ATELIER_GBRAIN_SSH_HOST", "");
        assert_eq!(default_gbrain_ssh_host(), "");
        std::env::remove_var("ATELIER_GBRAIN_SSH_HOST");
    }
}
