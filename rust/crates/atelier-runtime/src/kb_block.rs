//! Bloc `<atelier-kb>` (plan 049 T4) — miroir OCTET-POUR-OCTET de
//! `sidecar/kb_prompt.mjs` (+ `kbBlockEntries` de `knowledge.mjs`, en lecture
//! seule : registre + caches ; pas d'extraction ni de refresh mtime côté
//! Rust — le refresh vit dans les chemins Node/CLI). Toute modification de
//! format doit être répliquée des deux côtés (test `kb_block_parity_node`).

use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub const KB_INLINE_MAX: u64 = 8000;
pub const KB_FORCED_MAX: usize = 100_000;

pub struct KbEntry {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub chars: u64,
    /// `Some(texte)` = injecté en intégral ; `None` = fiche.
    pub text: Option<String>,
}

fn fmt_chars(chars: u64) -> String {
    if chars < 1000 {
        format!("{chars} car.")
    } else {
        format!("{}k car.", ((chars as f64) / 1000.0).round() as i64)
    }
}

fn one_line(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Échappe le fermant dans le corps d'une source (casse fixe, comme le mjs).
fn sanitize_body(text: &str) -> String {
    const NEEDLE: &[u8] = b"</atelier-kb";
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + NEEDLE.len() <= bytes.len() && bytes[i..i + NEEDLE.len()].eq_ignore_ascii_case(NEEDLE)
        {
            out.push_str("<\\/atelier-kb");
            i += NEEDLE.len();
        } else {
            let len = match bytes[i] {
                b if b < 0x80 => 1,
                b if b >= 0xF0 => 4,
                b if b >= 0xE0 => 3,
                _ => 2,
            };
            out.push_str(&text[i..i + len]);
            i += len;
        }
    }
    out
}

/// Plafond en scalaires Unicode (parité avec `Array.from(...).slice` JS).
fn cap_scalars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let capped: String = text.chars().take(max).collect();
    format!("{capped}\n[…tronqué]")
}

fn read_registry(knowledge_dir: &Path) -> Vec<Value> {
    let Ok(raw) = std::fs::read_to_string(knowledge_dir.join("knowledge.json")) else {
        return Vec::new();
    };
    serde_json::from_str::<Value>(&raw)
        .ok()
        .and_then(|v| v.get("sources").and_then(Value::as_array).cloned())
        .unwrap_or_default()
}

fn read_cache_text(knowledge_dir: &Path, id: &str) -> Option<String> {
    let raw = std::fs::read_to_string(knowledge_dir.join("cache").join(format!("{id}.json"))).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    if v.get("version").and_then(Value::as_u64) != Some(1) {
        return None;
    }
    let pages = v.get("pages")?.as_array()?;
    Some(
        pages
            .iter()
            .filter_map(|page| page.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n\n"),
    )
}

/// Prépare les entrées (miroir de `kbBlockEntries`) : id inconnu ignoré,
/// cache illisible → fiche, `"gbrain"` géré par l'appelant.
pub fn kb_block_entries(
    knowledge_dir: &Path,
    source_ids: &[String],
    full_content: &[String],
) -> Vec<KbEntry> {
    let registry = read_registry(knowledge_dir);
    let mut entries = Vec::new();
    for id in source_ids {
        if id == "gbrain" {
            continue;
        }
        let Some(known) = registry
            .iter()
            .find(|s| s.get("id").and_then(Value::as_str) == Some(id.as_str()))
        else {
            continue;
        };
        let chars = known.get("chars").and_then(Value::as_u64).unwrap_or(0);
        let want_inline = chars <= KB_INLINE_MAX || full_content.iter().any(|x| x == id);
        let text = if want_inline {
            read_cache_text(knowledge_dir, id)
        } else {
            None
        };
        entries.push(KbEntry {
            id: id.clone(),
            title: known
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Sans titre")
                .to_string(),
            kind: known
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("file")
                .to_string(),
            chars,
            text,
        });
    }
    entries
}

pub fn with_kb_block(prompt: String, tool_path: &Path, entries: &[KbEntry], gbrain: bool) -> String {
    if entries.is_empty() && !gbrain {
        return prompt;
    }
    let mut block = String::from(
        "<atelier-kb>\nSources attachées par l'utilisateur (base de connaissances Atelier).\n\n",
    );
    for entry in entries {
        let Some(text) = &entry.text else { continue };
        block.push_str(&format!(
            "[kb:{}] {} — {}, {} — texte intégral :\n",
            entry.id,
            one_line(&entry.title),
            entry.kind,
            fmt_chars(entry.chars)
        ));
        block.push_str(&format!(
            "{}\n\n",
            sanitize_body(&cap_scalars(text, KB_FORCED_MAX))
        ));
    }
    let mut fiches = 0;
    for entry in entries {
        if entry.text.is_some() {
            continue;
        }
        fiches += 1;
        block.push_str(&format!(
            "[kb:{}] {} — {}, {} — fiche.\n",
            entry.id,
            one_line(&entry.title),
            entry.kind,
            fmt_chars(entry.chars)
        ));
    }
    if fiches > 0 {
        block.push_str("\nPour un passage précis d'une source en fiche, appelle le terminal exactement :\n");
        block.push_str(&format!(
            "{} search --id <id> --query \"<question>\" --limit 5\n",
            serde_json::to_string(&tool_path.to_string_lossy()).unwrap_or_default()
        ));
        block.push_str("Lis le JSON (stdout) : chaque passage porte quote, location et cite. Reproduis la quote exactement et termine chaque citation par son champ cite. N'invente jamais un passage.\n\n");
    }
    if gbrain {
        block.push_str("[kb:gbrain] Corpus thèse (gbrain) — outil NAS.\n");
        block.push_str("Pour la littérature de thèse (glaciologie, albédo, feux), appelle : gbrain query \"<question>\" et cite les pages retournées. Si le NAS est injoignable, dis-le et continue avec les autres sources.\n\n");
    }
    block.push_str("Règle : toute affirmation tirée d'une source attachée est citée [kb:<id> · page/fichier/mm:ss]. N'invente jamais un passage.\n</atelier-kb>");
    format!("{prompt}\n\n{block}")
}

/// Câblage send : lit `kbSourceIds`/`kbFullContent` dans l'`extra` du thread.
/// La KB ne bloque jamais un envoi — tout état illisible dégrade en prompt
/// inchangé ou en fiche.
pub fn with_kb_block_for_thread(
    prompt: String,
    app_dir: &Path,
    server_dir: &str,
    extra: Option<&HashMap<String, Value>>,
) -> String {
    let Some(extra) = extra else { return prompt };
    let read_list = |key: &str| -> Vec<String> {
        extra
            .get(key)
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default()
    };
    let ids = read_list("kbSourceIds");
    if ids.is_empty() {
        return prompt;
    }
    let full = read_list("kbFullContent");
    let knowledge_dir = app_dir.join("knowledge");
    let gbrain = ids.iter().any(|x| x == "gbrain");
    let entries = kb_block_entries(&knowledge_dir, &ids, &full);
    with_kb_block(
        prompt,
        &Path::new(server_dir).join("atelier-kb"),
        &entries,
        gbrain,
    )
}

/// Strip symétrique (miroir de `stripKbBlock`).
pub fn strip_kb_block(text: &str) -> String {
    let mut out = text.to_string();
    let open = "<atelier-kb";
    let close = "</atelier-kb>";
    while let Some(start) = out.find(open) {
        let Some(relative_end) = out[start..].find(close) else { break };
        let end = start + relative_end + close.len();
        let remove_from = out[..start].trim_end_matches(['\r', '\n']).len();
        out.replace_range(remove_from..end, "");
    }
    out.trim_end().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    fn write_fixture(dir: &Path) {
        let knowledge = dir.join("knowledge");
        std::fs::create_dir_all(knowledge.join("cache")).unwrap();
        std::fs::write(
            knowledge.join("knowledge.json"),
            serde_json::to_string_pretty(&json!({
                "version": 1,
                "sources": [
                    { "id": "aaaa1111", "kind": "note", "title": "Décisions chap. 2",
                      "origin": null, "chars": 74, "addedAt": "2026-07-17T10:00:00.000Z",
                      "updatedAt": "2026-07-17T10:00:00.000Z", "meta": {} },
                    { "id": "bbbb2222", "kind": "pdf", "title": "Cuffey & Paterson ch. 5",
                      "origin": "/nulle/part.pdf", "chars": 118432,
                      "addedAt": "2026-07-17T10:01:00.000Z",
                      "updatedAt": "2026-07-17T10:01:00.000Z", "meta": { "pages": 2 } }
                ]
            }))
            .unwrap(),
        )
        .unwrap();
        std::fs::write(
            knowledge.join("cache/aaaa1111.json"),
            serde_json::to_string(&json!({
                "version": 1,
                "pages": [{ "page": 1, "text": "La troncature de septembre borne la fenêtre de fonte estivale." }]
            }))
            .unwrap(),
        )
        .unwrap();
        std::fs::write(
            knowledge.join("cache/bbbb2222.json"),
            serde_json::to_string(&json!({
                "version": 1,
                "pages": [
                    { "page": 1, "text": "Abstract. Wildfire carbon on glacier surfaces." },
                    { "page": 2, "text": "Results. Albedo decreases by 2.4 percent in August." }
                ]
            }))
            .unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn compose_inline_fiche_gbrain_et_strip() {
        let dir = tempdir().unwrap();
        write_fixture(dir.path());
        let mut extra = HashMap::new();
        extra.insert(
            "kbSourceIds".to_string(),
            json!(["aaaa1111", "bbbb2222", "inconnu", "gbrain"]),
        );
        extra.insert("kbFullContent".to_string(), json!([]));
        let out = with_kb_block_for_thread(
            "Question de départ".into(),
            dir.path(),
            "/srv/rust-server",
            Some(&extra),
        );
        assert!(out.starts_with("Question de départ\n\n<atelier-kb>"));
        assert!(out.contains("[kb:aaaa1111] Décisions chap. 2 — note, 74 car. — texte intégral :"));
        assert!(out.contains("fenêtre de fonte estivale."));
        assert!(out.contains("[kb:bbbb2222] Cuffey & Paterson ch. 5 — pdf, 118k car. — fiche."));
        assert!(out.contains("\"/srv/rust-server/atelier-kb\" search --id <id>"));
        assert!(out.contains("[kb:gbrain] Corpus thèse (gbrain) — outil NAS."));
        assert!(!out.contains("inconnu"));
        assert!(out.ends_with("</atelier-kb>"));
        assert_eq!(strip_kb_block(&out), "Question de départ");
    }

    #[test]
    fn kb_absente_ou_vide_laisse_le_prompt_intact() {
        let dir = tempdir().unwrap();
        let out = with_kb_block_for_thread("Prompt".into(), dir.path(), "/srv", None);
        assert_eq!(out, "Prompt");
        let mut extra = HashMap::new();
        extra.insert("kbSourceIds".to_string(), json!([]));
        let out = with_kb_block_for_thread("Prompt".into(), dir.path(), "/srv", Some(&extra));
        assert_eq!(out, "Prompt");
        // ids inconnus seulement → aucun bloc
        let mut extra = HashMap::new();
        extra.insert("kbSourceIds".to_string(), json!(["disparu"]));
        let out = with_kb_block_for_thread("Prompt".into(), dir.path(), "/srv", Some(&extra));
        assert_eq!(out, "Prompt");
    }

    #[test]
    fn corps_contenant_le_fermant_est_echappe() {
        let entries = vec![KbEntry {
            id: "x1".into(),
            title: "Piège".into(),
            kind: "note".into(),
            chars: 30,
            text: Some("avant </atelier-kb> après".into()),
        }];
        let out = with_kb_block("P".into(), Path::new("/srv/atelier-kb"), &entries, false);
        assert!(out.contains("avant <\\/atelier-kb> après"));
        assert_eq!(strip_kb_block(&out), "P");
    }

    #[test]
    fn kb_block_parity_node() {
        // Parité octet-pour-octet avec sidecar/kb_prompt.mjs + kbBlockEntries.
        let node = match crate::ws_router::kb_node_bin_for_tests() {
            Some(node) => node,
            None => return,
        };
        let sidecar = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../sidecar");
        if !sidecar.join("kb_prompt.mjs").is_file() {
            return;
        }
        let dir = tempdir().unwrap();
        write_fixture(dir.path());
        let knowledge_dir = dir.path().join("knowledge");
        let ids = vec![
            "aaaa1111".to_string(),
            "bbbb2222".to_string(),
            "gbrain".to_string(),
        ];
        let full: Vec<String> = vec![];
        let entries = kb_block_entries(&knowledge_dir, &ids, &full);
        let rust_out = with_kb_block(
            "PROMPT".into(),
            Path::new("/srv/atelier-kb"),
            &entries,
            true,
        );

        let script = r#"
const { pathToFileURL } = require("node:url");
(async () => {
  const kbPrompt = await import(pathToFileURL(process.env.SIDECAR + "/kb_prompt.mjs").href);
  const knowledge = await import(pathToFileURL(process.env.SIDECAR + "/knowledge.mjs").href);
  const store = new knowledge.KnowledgeStore(process.env.KDIR);
  const entries = knowledge.kbBlockEntries(store, ["aaaa1111", "bbbb2222", "gbrain"], []);
  process.stdout.write(kbPrompt.withKbBlock("PROMPT", {
    toolPath: "/srv/atelier-kb", entries, gbrain: true,
  }));
})().catch((e) => { console.error(e); process.exit(1); });
"#;
        let out = std::process::Command::new(node)
            .arg("-e")
            .arg(script)
            .env("SIDECAR", sidecar.as_os_str())
            .env("KDIR", knowledge_dir.as_os_str())
            .output()
            .expect("node exécutable");
        assert!(
            out.status.success(),
            "script node en échec: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        let node_out = String::from_utf8(out.stdout).unwrap();
        assert_eq!(rust_out, node_out, "bloc <atelier-kb> divergent mjs vs rs");
    }
}
