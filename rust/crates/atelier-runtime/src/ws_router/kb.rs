//! Messages KB du routeur WebSocket : base de connaissances in-process,
//! gbrain, articles (import, DOI, brouillons), épingles de passages et
//! ragdoc. Extrait de `ws_router.rs` ; `route_ws` y dispatche.

use super::*;

/// Base de connaissances (plan 049 T2, puis 065 phase C) : la crate
/// `atelier-kb` est appelée IN-PROCESS (aucun spawn). Le moteur Node
/// (`kb_cli.mjs`, spawn de process) a quitté la production le 2026-08-22 et
/// le dépôt le 2026-09-14 ; son contrat argv/stdin -> JSON survit dans les
/// fixtures `gallery/tests/kb_parity/` rejouées contre `atelier-kb-rs`.

/// `add --kind <kind>` : le kind ajouté, s'il s'agit bien d'une commande
/// `add` (sinon `None`). Utilisé par `kb_cli_run` pour aiguiller
/// Exécute une commande du CLI kb (in-process, `atelier_kb::cli::run`).
/// `stdin_text` non vide correspond à un `--text -` ajouté par l'appelant.
/// `_server_dir` reste dans la signature : les appelants le passent encore,
/// il servait à localiser `kb_cli.mjs` du temps du moteur Node.
pub(super) fn kb_cli_run(
    _server_dir: &str,
    app_dir: &std::path::Path,
    args: &[&str],
    stdin_text: &str,
) -> Result<Value, String> {
    kb_cli_run_rust(app_dir, args, stdin_text)
}

/// Variante asynchrone de `kb_cli_run` — délègue au pool bloquant tokio.
/// B5 (plans/065-revue-findings.md, KBS-02) : sans ça, un appel KB (fetch
/// web ~20 s, scan de dossier, spawn `node`, extraction PDF) gèle le thread
/// du routeur ws qui le traite — chat compris, tant que l'opération dure.
/// Miroir du motif déjà en place pour `article_cli` (import/write).
pub(super) async fn kb_cli_run_async(
    server_dir: String,
    app_dir: std::path::PathBuf,
    args: Vec<String>,
    stdin_text: String,
) -> Result<Value, String> {
    crate::ws_dispatch::blocking(move || {
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        kb_cli_run(&server_dir, &app_dir, &refs, &stdin_text)
    })
    .await
    .unwrap_or_else(|e| Err(format!("kb: tâche interrompue ({e})")))
}

/// Moteur `rust` : appel in-process de `atelier_kb::cli::run`, aucun spawn.
/// `--dir` est ajouté explicitement (miroir de `defaultKnowledgeDir()` côté
/// Node : `$ATELIER_APP_DIR/knowledge`) plutôt que de muter une variable
/// d'environnement globale du process serveur. `--text -` est remplacé par
/// le texte réel : la limite ARG_MAX ne s'applique pas à un appel in-process.
pub(super) fn kb_cli_run_rust(
    app_dir: &std::path::Path,
    args: &[&str],
    stdin_text: &str,
) -> Result<Value, String> {
    let owned = kb_rust_args(app_dir, args, stdin_text);
    atelier_kb::cli::run(&owned)
}

pub(super) fn kb_rust_args(app_dir: &std::path::Path, args: &[&str], stdin_text: &str) -> Vec<String> {
    let mut owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    if !stdin_text.is_empty() {
        if let Some(pos) = owned.iter().position(|a| a == "--text") {
            if owned.get(pos + 1).map(String::as_str) == Some("-") {
                owned[pos + 1] = stdin_text.to_string();
            }
        }
    }
    owned.push("--dir".to_string());
    owned.push(app_dir.join("knowledge").to_string_lossy().into_owned());
    owned
}

/// Variante bavarde de `kb_cli_run` (voir `kb_cli_run`). Seul appelant réel : `article-import --progress`
/// (`handle_article_import`).
pub(super) fn kb_cli_stream(
    _server_dir: &str,
    app_dir: &std::path::Path,
    args: &[&str],
    on_progress: impl FnMut(Value),
) -> Result<Value, String> {
    kb_cli_stream_rust(app_dir, args, on_progress)
}

/// Moteur `rust` : appelle `atelier_kb::article::import_article` directement
/// (plutôt que `atelier_kb::cli::run`, dont le relais de progression imprime
/// sur le VRAI stdout du process serveur — inutilisable ici) pour que chaque
/// étape arrive sur `on_progress` sans jamais toucher stdout. Seule commande
/// couverte : `article-import --path <p> [--progress]`, l'unique usage réel
/// de `kb_cli_stream`.
pub(super) fn kb_cli_stream_rust(
    app_dir: &std::path::Path,
    args: &[&str],
    mut on_progress: impl FnMut(Value),
) -> Result<Value, String> {
    if args.first() != Some(&"article-import") {
        return Err(format!(
            "kb_cli_stream (moteur rust): commande non supportée: {args:?}"
        ));
    }
    let path = args
        .windows(2)
        .find(|w| w[0] == "--path")
        .map(|w| w[1])
        .ok_or("article-import: --path requis")?;
    let dir = app_dir.join("knowledge");
    let store = atelier_kb::store::KnowledgeStore::open(dir);
    // B4 (plans/065-revue-findings.md) : convert_pdf émet désormais les
    // étapes MinerU (upload/converting/download/figures/ocr) en plus des
    // étapes meta/duplicates d'import_article — même callback JSON riche
    // qu'onProgress côté Node, plus besoin d'un wrapper stage: &str ici.
    let mut result = atelier_kb::ragdoc::import_pdf_with_converter(path, &store.dir, args.windows(2).find(|w| w[0] == "--converter").map(|w|w[1]), &mut on_progress)?;
    if let Some(zotero) = args.windows(2).find(|w|w[0]=="--zotero").and_then(|w|serde_json::from_str::<Value>(w[1]).ok()).filter(|v|v.is_object() && result["duplicate"] != true) {
        atelier_kb::ragdoc::apply_zotero_metadata(&store.dir, &mut result, &zotero)?;
    }
    Ok(result)
}

pub(super) fn kb_error(message: String) -> Vec<String> {
    vec![json_msg(json!({"type": "kbError", "message": message}))]
}

/// Résout le binaire gbrain (PATH Finder minimal → repl. usuels).
/// Échappement shell en quotes simples pour la commande distante : ssh
/// reconcatène ses arguments en une ligne de shell côté NAS.
pub(super) fn shell_squote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

pub(super) fn gbrain_bin() -> Option<std::path::PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_TEST_GBRAIN") {
        let pb = std::path::PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    if let Ok(out) = std::process::Command::new("which").arg("gbrain").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(std::path::PathBuf::from(p));
            }
        }
    }
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    let mut candidates = vec![
        std::path::PathBuf::from("/opt/homebrew/bin/gbrain"),
        std::path::PathBuf::from("/usr/local/bin/gbrain"),
    ];
    if let Some(home) = home {
        candidates.push(home.join("bin/gbrain"));
        candidates.push(home.join(".local/bin/gbrain"));
        // installation bun (cas réel de Thierry) : jamais dans le PATH GUI
        candidates.push(home.join(".bun/bin/gbrain"));
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// Promotion d'une source vers le corpus gbrain (plan 049 T7) — miroir du
/// routeur Node : titre + origine + extrait (700 scalaires), timeout 15 s.
pub(super) async fn handle_kb_promote(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return kb_error("kbPromote: id requis".into());
    }
    let knowledge_dir = state.app_dir().join("knowledge");
    let Some((title, origin, kind)) = crate::kb_block::source_meta(&knowledge_dir, id) else {
        return kb_error(format!("Source inconnue: {id}"));
    };
    let mut text = format!("{title} — {}", origin.unwrap_or(kind));
    if let Some(excerpt) = crate::kb_block::cache_excerpt(&knowledge_dir, id, 700) {
        if !excerpt.is_empty() {
            text.push_str("\n\n");
            text.push_str(&excerpt);
        }
    }
    // Aiguillage NAS (miroir de gbrainInvocation, sidecar/knowledge.mjs) : le
    // brain canonique vit sur le NAS ; le binaire local pointe sur un brain
    // PGLite local quasi vide — capturer dedans perdrait la page (vécu
    // 2026-08-16). ATELIER_TEST_GBRAIN (tests) garde le binaire local ;
    // ATELIER_GBRAIN_SSH_HOST="" aussi ; défaut : ssh nas.
    let ssh_host = if std::env::var("ATELIER_TEST_GBRAIN").is_ok() {
        String::new()
    } else {
        std::env::var("ATELIER_GBRAIN_SSH_HOST").unwrap_or_else(|_| "nas".into())
    };
    let run = if ssh_host.is_empty() {
        let Some(gbrain) = gbrain_bin() else {
            return kb_error("gbrain indisponible: introuvable sur le PATH".into());
        };
        tokio::process::Command::new(gbrain)
            .arg("capture")
            .arg(&text)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
    } else {
        tokio::process::Command::new("ssh")
            .args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", &ssh_host])
            .arg(format!("gbrain capture {}", shell_squote(&text)))
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
    };
    match tokio::time::timeout(std::time::Duration::from_secs(15), run).await {
        Err(_) => kb_error("gbrain: délai dépassé (NAS injoignable ?)".into()),
        Ok(Err(e)) => kb_error(format!("gbrain indisponible: {e}")),
        Ok(Ok(out)) if !out.status.success() => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let message = if !stderr.is_empty() { stderr } else { stdout };
            kb_error(if message.is_empty() {
                "gbrain capture: échec".into()
            } else {
                message
            })
        }
        Ok(Ok(_)) => vec![json_msg(json!({"type": "kbPromoted", "id": id}))],
    }
}

/// Recherche du corpus gbrain (plan 050 P3) — relais du CLI `atelier-kb
/// gbrain-search`. Échec (NAS coupé, binaire absent) = `gbrainResults` avec
/// `error`, jamais un kbError générique : la section du panneau l'affiche en
/// place sans polluer le flux d'épinglage.
pub(super) async fn handle_gbrain_search(state: &AppState, msg: &Value) -> Vec<String> {
    let ragdoc = msg["type"] == "ragdocSearch";
    let response = if ragdoc { "ragdocResults" } else { "gbrainResults" };
    let query = msg
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if query.is_empty() {
        return vec![json_msg(
            json!({"type": response, "query": "", "results": [], "error": "requête vide"}),
        )];
    }
    let limit = msg
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(12)
        .clamp(1, 25)
        .to_string();
    let args = vec![
        if ragdoc { "ragdoc-search" } else { "gbrain-search" }.to_string(),
        "--query".to_string(),
        query.clone(),
        "--limit".to_string(),
        limit,
    ];
    match kb_cli_run_async(
        state.server_dir().to_string(),
        state.app_dir().to_path_buf(),
        args,
        String::new(),
    )
    .await
    {
        Ok(v) => vec![json_msg(json!({
            "type": response,
            "query": v.get("query").cloned().unwrap_or_else(|| json!(query)),
            "results": v.get("results").cloned().unwrap_or_else(|| json!([])),
        }))],
        Err(e) => vec![json_msg(
            json!({"type": response, "query": query, "results": [], "error": e}),
        )],
    }
}

/// Page directe gbrain (plan 050 P4) — relais du CLI `promote-page` :
/// aperçu sans `--write`, écriture uniquement sur confirmation UI.
pub(super) async fn handle_kb_promote_page(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return kb_error("kbPromotePage: id requis".into());
    }
    let slug = msg.get("slug").and_then(|v| v.as_str()).unwrap_or("");
    let write = msg.get("write").and_then(Value::as_bool).unwrap_or(false);
    let mut args = vec![
        if msg["type"] == "kbRagdocPromote" { "ragdoc-promote" } else { "promote-page" }.to_string(),
        "--id".to_string(),
        id.to_string(),
    ];
    if !slug.is_empty() {
        args.push("--slug".to_string());
        args.push(slug.to_string());
    }
    if write {
        args.push("--write".to_string());
    }
    match kb_cli_run_async(
        state.server_dir().to_string(),
        state.app_dir().to_path_buf(),
        args,
        String::new(),
    )
    .await
    {
        Ok(v) if v.get("written").and_then(Value::as_bool) == Some(true) => {
            vec![json_msg(json!({
                "type": "kbPageWritten",
                "id": v.get("id").cloned().unwrap_or(json!(id)),
                "slug": v.get("slug").cloned().unwrap_or(json!(null)),
                "updated": v.get("updated").cloned().unwrap_or(json!(false)),
            }))]
        }
        Ok(v) => vec![json_msg(json!({
            "type": "kbPagePreview",
            "id": v.get("id").cloned().unwrap_or(json!(id)),
            "slug": v.get("slug").cloned().unwrap_or(json!(null)),
            "exists": v.get("exists").cloned().unwrap_or(json!(false)),
        "duplicate": v.get("duplicate").cloned().unwrap_or(json!(false)),
            "title": v.get("title").cloned().unwrap_or(json!(null)),
            "chars": v.get("chars").cloned().unwrap_or(json!(null)),
            "preview": v.get("preview").cloned().unwrap_or(json!("")),
        }))],
        Err(e) => kb_error(e),
    }
}

/// Import d'article (plan 053) — relais du CLI `article-import` /
/// `article-write`. La conversion MinerU dure des minutes : elle part sur le
/// pool bloquant, sinon tout le routeur ws (chat compris) reste figé.
pub(super) async fn article_cli(state: &AppState, args: Vec<String>) -> Result<Value, String> {
    kb_cli_run_async(
        state.server_dir().to_string(),
        state.app_dir().to_path_buf(),
        args,
        String::new(),
    )
    .await
}

pub(super) fn article_error(request_id: &Value, message: String) -> Vec<String> {
    vec![json_msg(json!({
        "type": "articleError",
        "requestId": request_id,
        "message": message,
    }))]
}

/// Valeur de métadonnée en argument CLI : les nombres (année) comptent aussi.
pub(super) fn meta_arg(meta: &Value, key: &str) -> Option<String> {
    match meta.get(key) {
        Some(Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

/// Fiche de référence par DOI — réponse identique à l'import PDF, pour que
/// l'UI n'ait qu'un seul chemin de retour à connaître.
pub(super) async fn handle_article_doi(state: &AppState, msg: &Value) -> Vec<String> {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let doi = msg.get("doi").and_then(|v| v.as_str()).unwrap_or("");
    if doi.is_empty() {
        return article_error(&request_id, "articleImportDoi: doi requis".into());
    }
    let args = vec![
        "ragdoc-doi".to_string(),
        "--doi".to_string(),
        doi.to_string(),
    ];
    match article_cli(state, args).await {
        Ok(v) => vec![article_imported_msg(&request_id, doi, &v)],
        Err(e) => article_error(&request_id, e),
    }
}

/// Réponse `articleImported`, partagée par l'import PDF et l'import DOI.
pub(super) fn article_imported_msg(request_id: &Value, path: &str, v: &Value) -> String {
    json_msg(json!({
        "type": "articleImported",
        "requestId": request_id,
        "draftId": v.get("draftId").cloned().unwrap_or(Value::Null),
        "path": v.get("path").cloned().unwrap_or(json!(path)),
        "meta": v.get("meta").cloned().unwrap_or(json!({})),
        "slug": v.get("slug").cloned().unwrap_or(Value::Null),
        "exists": v.get("exists").cloned().unwrap_or(json!(false)),
        "duplicate": v.get("duplicate").cloned().unwrap_or(json!(false)),
        "chars": v.get("chars").cloned().unwrap_or(Value::Null),
        "preview": v.get("preview").cloned().unwrap_or(json!("")),
        "converter": v.get("converter").cloned().unwrap_or(Value::Null),
        "duplicates": v.get("duplicates").cloned().unwrap_or(json!([])),
        "metaSource": v.get("metaSource").cloned().unwrap_or(Value::Null),
        "warning": v.get("warning").cloned().unwrap_or(Value::Null),
    }))
}

pub(super) async fn handle_article_import(state: &AppState, msg: &Value) -> Vec<String> {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let path = msg.get("path").and_then(|v| v.as_str()).unwrap_or("");
    if path.is_empty() {
        return article_error(&request_id, "articleImport: path requis".into());
    }
    // Les étapes partent sur le bus au fil de l'eau : l'utilisateur voit
    // « envoi », « conversion (42 s) », « téléchargement », « métadonnées »,
    // « doublons » au lieu d'un compteur muet.
    let publisher = state.clone();
    let progress_id = request_id.clone();
    let server_dir = state.server_dir().to_string();
    let app_dir = state.app_dir().to_path_buf();
    let path_owned = path.to_string();
    let converter = msg["converter"].as_str().unwrap_or("mistral").to_string();
    let zotero = msg["zotero"].to_string();
    let streamed = crate::ws_dispatch::blocking(move || {
        let refs = vec![
            "article-import",
            "--path",
            path_owned.as_str(),
            "--converter",
            converter.as_str(),
            "--zotero", zotero.as_str(),
            "--progress",
        ];
        kb_cli_stream(&server_dir, &app_dir, &refs, |step| {
            publisher.publish(json_msg(json!({
                "type": "articleProgress",
                "requestId": progress_id,
                "stage": step.get("stage").cloned().unwrap_or(Value::Null),
                "seconds": step.get("seconds").cloned().unwrap_or(Value::Null),
                "count": step.get("count").cloned().unwrap_or(Value::Null),
            })));
        })
    })
    .await
    .unwrap_or_else(|e| Err(format!("article: tâche interrompue ({e})")));
    match streamed {
        Ok(v) => vec![json_msg(json!({
            "type": "articleImported",
            "requestId": request_id,
            "draftId": v.get("draftId").cloned().unwrap_or(Value::Null),
            "path": v.get("path").cloned().unwrap_or(json!(path)),
            "meta": v.get("meta").cloned().unwrap_or(json!({})),
            "slug": v.get("slug").cloned().unwrap_or(Value::Null),
            "exists": v.get("exists").cloned().unwrap_or(json!(false)),
        "duplicate": v.get("duplicate").cloned().unwrap_or(json!(false)),
            "chars": v.get("chars").cloned().unwrap_or(Value::Null),
            "preview": v.get("preview").cloned().unwrap_or(json!("")),
            "converter": v.get("converter").cloned().unwrap_or(Value::Null),
            "duplicates": v.get("duplicates").cloned().unwrap_or(json!([])),
            "metaSource": v.get("metaSource").cloned().unwrap_or(Value::Null),
            "warning": v.get("warning").cloned().unwrap_or(Value::Null),
        }))],
        Err(e) => article_error(&request_id, e),
    }
}

/// Articles déjà écrits dans le corpus. En mode automatique, c'est le seul
/// endroit qui dit ce qui est entré — un échec de liste ne doit donc jamais
/// rester muet : il voyage dans le champ `error` de la réponse.
pub(super) async fn handle_article_list(state: &AppState, msg: &Value) -> Vec<String> {
    let limit = msg
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(20)
        .clamp(1, 100)
        .to_string();
    let args = vec!["ragdoc-list".to_string(), "--limit".to_string(), limit, "--offset".into(), msg["offset"].as_u64().unwrap_or(0).to_string(), "--query".into(), msg["query"].as_str().unwrap_or("").to_string()];
    match article_cli(state, args).await {
        Ok(v) => vec![json_msg(json!({
            "type": "articleListed", "offset": msg["offset"], "query": msg["query"], "total":v["total"], "nextOffset":v["nextOffset"],
            "articles": v.get("articles").cloned().unwrap_or(json!([])),
        }))],
        Err(e) => vec![json_msg(json!({
            "type": "articleListed",
            "articles": [],
            "error": e,
        }))],
    }
}

/// Texte complet du brouillon — la fiche n'affiche qu'un aperçu tronqué.
pub(super) async fn handle_article_draft(state: &AppState, msg: &Value) -> Vec<String> {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let draft = msg.get("draftId").and_then(|v| v.as_str()).unwrap_or("");
    if draft.is_empty() {
        return article_error(&request_id, "articleDraft: draftId requis".into());
    }
    let args = vec![
        "article-draft".to_string(),
        "--draft".to_string(),
        draft.to_string(),
    ];
    match article_cli(state, args).await {
        Ok(v) => vec![json_msg(json!({
            "type": "articleDraftText",
            "requestId": request_id,
            "draftId": v.get("draftId").cloned().unwrap_or(json!(draft)),
            "chars": v.get("chars").cloned().unwrap_or(Value::Null),
            "markdown": v.get("markdown").cloned().unwrap_or(json!("")),
        }))],
        Err(e) => article_error(&request_id, e),
    }
}

pub(super) async fn handle_article_write(state: &AppState, msg: &Value) -> Vec<String> {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let draft = msg.get("draftId").and_then(|v| v.as_str()).unwrap_or("");
    let slug = msg.get("slug").and_then(|v| v.as_str()).unwrap_or("");
    if draft.is_empty() {
        return article_error(&request_id, "articleWrite: draftId requis".into());
    }
    if slug.is_empty() {
        return article_error(&request_id, "articleWrite: slug requis".into());
    }
    let mut args = vec![
        "ragdoc-write".to_string(),
        "--draft".to_string(),
        draft.to_string(),
        "--slug".to_string(),
        slug.to_string(),
    ];
    let meta = msg.get("meta").cloned().unwrap_or(json!({}));
    for (flag, key) in [
        ("--title", "title"),
        ("--authors", "authors"),
        ("--year", "year"),
        ("--journal", "journal"),
        ("--doi", "doi"),
    ] {
        if let Some(value) = meta_arg(&meta, key) {
            args.push(flag.to_string());
            args.push(value);
        }
    }
    for (flag, key) in [("--origin", "path"), ("--converter", "converter")] {
        if let Some(value) = meta_arg(msg, key) {
            args.push(flag.to_string());
            args.push(value);
        }
    }
    if msg.get("ragdoc").and_then(Value::as_bool) == Some(true) {
        args.push("--ragdoc".to_string());
    }
    match article_cli(state, args).await {
        Ok(v) => vec![json_msg(json!({
            "type": "articleWritten",
            "requestId": request_id,
            "slug": v.get("slug").cloned().unwrap_or(json!(slug)),
            "updated": v.get("updated").cloned().unwrap_or(json!(false)),
            "ragdoc": v.get("ragdoc").cloned().unwrap_or(Value::Null),
        }))],
        Err(e) => article_error(&request_id, e),
    }
}

/// Texte stocké d'une source de la base — ce que l'agent lit réellement.
/// La réponse passe telle quelle : un dossier rend `files`, le reste `text`.
pub(super) async fn handle_kb_source_text(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return vec![json_msg(json!({
            "type": "sourceText", "id": "", "text": "", "error": "kbSourceText: id requis",
        }))];
    }
    let args = vec!["kb-text".to_string(), "--id".to_string(), id.to_string()];
    match kb_cli_run_async(
        state.server_dir().to_string(),
        state.app_dir().to_path_buf(),
        args,
        String::new(),
    )
    .await
    {
        Ok(mut v) => {
            if let Some(obj) = v.as_object_mut() {
                obj.insert("type".into(), json!("sourceText"));
            }
            vec![json_msg(v)]
        }
        Err(e) => vec![json_msg(json!({
            "type": "sourceText", "id": id, "text": "", "error": e,
        }))],
    }
}

/// Lecture seule d'une page du dépôt gbrain. Rien n'entre dans la base au
/// passage : épingler reste un geste distinct, côté interface.
pub(super) async fn handle_kb_gbrain_page(state: &AppState, msg: &Value) -> Vec<String> {
    let ragdoc = msg["type"] == "kbRagdocPage";
    let response = if ragdoc { "ragdocPage" } else { "gbrainPage" };
    let slug = msg.get("slug").and_then(|v| v.as_str()).unwrap_or("");
    if slug.is_empty() {
        return vec![json_msg(json!({
            "type": response, "slug": "", "markdown": "",
            "error": "kbGbrainPage: slug requis",
        }))];
    }
    let args = vec![
        if ragdoc { "ragdoc-page" } else { "gbrain-page" }.to_string(),
        "--slug".to_string(),
        slug.to_string(),
    ];
    match kb_cli_run_async(
        state.server_dir().to_string(),
        state.app_dir().to_path_buf(),
        args,
        String::new(),
    )
    .await
    {
        Ok(v) => vec![json_msg(json!({
            "type": response,
            "slug": v.get("slug").cloned().unwrap_or(json!(slug)),
            "chars": v.get("chars").cloned().unwrap_or(Value::Null),
            "markdown": v.get("markdown").cloned().unwrap_or(json!("")),
        }))],
        Err(e) => vec![json_msg(json!({
            "type": response, "slug": slug, "markdown": "", "error": e,
        }))],
    }
}

/// Payload `pin` de `pinPassage` — champs optionnels absents tolérés (pas de
/// `#[serde(default)]` sur `EvidencePin` elle-même pour `quote`/`cite_label`,
/// qui restent stricts pour le stockage sur disque).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PinPassageInput {
    #[serde(default = "evidence::default_source")]
    source: String,
    #[serde(default)]
    quote: String,
    #[serde(default)]
    zotero_key: String,
    #[serde(default)]
    pdf_key: String,
    #[serde(default)]
    pdf_file: String,
    #[serde(default)]
    page: u32,
    #[serde(default)]
    cite_label: String,
    #[serde(default)]
    gbrain_slug: Option<String>,
    #[serde(default)]
    supports: Option<evidence::EvidenceSupports>,
    #[serde(default)]
    thread_id: Option<String>,
    #[serde(default)]
    provider: Option<String>,
}

pub(super) fn evidence_pins_error(project_root: &str, message: impl Into<String>) -> Vec<String> {
    vec![json_msg(json!({
        "type": "evidencePins",
        "projectRoot": project_root,
        "pins": [],
        "error": message.into(),
    }))]
}

/// `pinPassage { projectRoot, pin: {...} }` — épingle un passage cité. Quand
/// `pin.supports` est absent, tente de le compléter via la sélection Lecture
/// courante (`~/.claude/fig-selection.json`, fraîcheur 900s).
pub(super) fn handle_pin_passage(state: &AppState, msg: &Value) -> Vec<String> {
    let project_root = msg.get("projectRoot").and_then(Value::as_str).unwrap_or("");
    if project_root.is_empty() {
        return evidence_pins_error("", "pinPassage: projectRoot requis");
    }
    let Some(raw_pin) = msg.get("pin").cloned() else {
        return evidence_pins_error(project_root, "pinPassage: pin requis");
    };
    let input: PinPassageInput = match serde_json::from_value(raw_pin) {
        Ok(p) => p,
        Err(e) => {
            return evidence_pins_error(project_root, format!("pinPassage: pin invalide: {e}"))
        }
    };
    // Validation PAR SOURCE (tâche 6) : Zotero garde ses exigences d'origine
    // (quote/zoteroKey/pdfKey/pdfFile/citeLabel/page) — un passage cité sans
    // cette métadonnée est inutilisable pour rouvrir le PDF à la bonne page.
    // gbrain n'a ni PDF ni page : seuls gbrainSlug/quote/citeLabel comptent,
    // les champs zotero absents sont tolérés (défaut vide côté struct).
    let is_gbrain = input.source == "gbrain" || input.source == "ragdoc";
    if is_gbrain {
        // Même règle que parseGbrainPassageRef côté TypeScript (md.tsx) : le
        // backend n'accepte jamais un slug que le frontend refuserait — pas
        // seulement "non vide", mais bien FORME valide (garde anti-traversée).
        let slug_ok = input
            .gbrain_slug
            .as_deref()
            .is_some_and(evidence::is_valid_gbrain_slug);
        if input.quote.is_empty() || !slug_ok || input.cite_label.is_empty() {
            return evidence_pins_error(
                project_root,
                "pinPassage: gbrainSlug/quote/citeLabel requis",
            );
        }
    } else if input.quote.is_empty()
        || input.zotero_key.is_empty()
        || input.pdf_key.is_empty()
        || input.pdf_file.is_empty()
        || input.cite_label.is_empty()
        || input.page == 0
    {
        return evidence_pins_error(
            project_root,
            "pinPassage: quote/zoteroKey/pdfKey/pdfFile/citeLabel/page requis",
        );
    }
    let supports = input
        .supports
        .or_else(|| evidence::fig_selection_supports(900));
    let pin = evidence::EvidencePin {
        id: String::new(),
        ts: 0,
        quote: input.quote,
        source: if is_gbrain {
            input.source.clone()
        } else {
            "zotero".to_string()
        },
        zotero_key: input.zotero_key,
        pdf_key: input.pdf_key,
        pdf_file: input.pdf_file,
        page: input.page,
        cite_label: input.cite_label,
        gbrain_slug: input.gbrain_slug,
        supports,
        thread_id: input.thread_id,
        provider: input.provider,
    };
    match evidence::add_pin(state.app_dir(), project_root, pin) {
        Ok(pins) => vec![json_msg(json!({
            "type": "evidencePins",
            "projectRoot": project_root,
            "pins": pins,
        }))],
        Err(e) => evidence_pins_error(project_root, e.to_string()),
    }
}

/// `listPins { projectRoot }`.
pub(super) fn handle_list_pins(state: &AppState, msg: &Value) -> Vec<String> {
    let project_root = msg.get("projectRoot").and_then(Value::as_str).unwrap_or("");
    if project_root.is_empty() {
        return evidence_pins_error("", "listPins: projectRoot requis");
    }
    let pins = evidence::list_pins(state.app_dir(), project_root);
    vec![json_msg(json!({
        "type": "evidencePins",
        "projectRoot": project_root,
        "pins": pins,
    }))]
}

/// `unpinPassage { projectRoot, pinId }`.
pub(super) fn handle_unpin_passage(state: &AppState, msg: &Value) -> Vec<String> {
    let project_root = msg.get("projectRoot").and_then(Value::as_str).unwrap_or("");
    if project_root.is_empty() {
        return evidence_pins_error("", "unpinPassage: projectRoot requis");
    }
    let pin_id = msg.get("pinId").and_then(Value::as_str).unwrap_or("");
    match evidence::remove_pin(state.app_dir(), project_root, pin_id) {
        Ok(pins) => vec![json_msg(json!({
            "type": "evidencePins",
            "projectRoot": project_root,
            "pins": pins,
        }))],
        Err(e) => evidence_pins_error(project_root, e.to_string()),
    }
}

pub(super) async fn handle_kb_add(state: &AppState, msg: &Value) -> Vec<String> {
    let get = |key: &str| msg.get(key).and_then(|v| v.as_str()).unwrap_or("");
    let (kind, origin, title, text) = (get("kind"), get("origin"), get("title"), get("text"));
    if kind.is_empty() {
        return kb_error("kbAdd: kind requis".into());
    }
    let mut args = vec!["add".to_string(), "--kind".to_string(), kind.to_string()];
    if !origin.is_empty() {
        args.push("--origin".to_string());
        args.push(origin.to_string());
    }
    if !title.is_empty() {
        args.push("--title".to_string());
        args.push(title.to_string());
    }
    if !text.is_empty() {
        args.push("--text".to_string());
        args.push("-".to_string());
    }
    match kb_cli_run_async(
        state.server_dir().to_string(),
        state.app_dir().to_path_buf(),
        args,
        text.to_string(),
    )
    .await
    {
        Ok(v) => {
            let mut out = json!({
                "type": "kbAdded",
                "source": v.get("source").cloned().unwrap_or(Value::Null),
                "refreshed": v.get("refreshed").cloned().unwrap_or(Value::Bool(false)),
            });
            if let Some(warning) = v.get("warning") {
                out["warning"] = warning.clone();
            }
            vec![json_msg(out)]
        }
        Err(message) => {
            // échec du repli fetch alors que l'utilisateur vient DÉJÀ du
            // bouton livre : message non circulaire (miroir router.mjs)
            let via_browser = msg.get("via").and_then(|v| v.as_str()) == Some("browser");
            if via_browser && message.contains("bloque le téléchargement direct") {
                kb_error("La capture du texte n'a rien donné et le site bloque le téléchargement direct — recharge la page, attends la fin du chargement, puis reclique le livre.".into())
            } else {
                kb_error(message)
            }
        }
    }
}

pub(super) fn kb_sources_msg(v: &Value) -> Vec<String> {
    let mut out = json!({
        "type": "kbSources",
        "sources": v.get("sources").cloned().unwrap_or(json!([])),
        "collections": v.get("collections").cloned().unwrap_or(json!([])),
        "archivedCount": v.get("archivedCount").cloned().unwrap_or(json!(0)),
        "archivedSources": v.get("archivedSources").cloned().unwrap_or(json!([])),
    });
    if let Some(warning) = v.get("warning") {
        out["warning"] = warning.clone();
    }
    vec![json_msg(out)]
}

pub(super) fn handle_kb_list(state: &AppState) -> Vec<String> {
    // Plan 051 P3 : lecture native du registre (~1 ms) — plus de spawn Node
    // pour lister. Les mutations continuent de passer par le CLI puis
    // reviennent ici pour la liste fraîche.
    let knowledge_dir = std::path::Path::new(state.app_dir()).join("knowledge");
    let mut payload = crate::kb_block::kb_list_payload(&knowledge_dir);
    payload.insert("type".into(), json!("kbSources"));
    vec![json_msg(Value::Object(payload))]
}

// Organisation de la base (plan 051 P1) : mutation via le CLI (une seule
// implémentation d'écriture) puis liste complète relue.
pub(super) fn ids_arg(msg: &Value) -> Option<String> {
    let ids: Vec<String> = msg
        .get("ids")?
        .as_array()?
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect();
    if ids.is_empty() {
        None
    } else {
        Some(ids.join(","))
    }
}

pub(super) async fn handle_kb_organize(state: &AppState, msg_type: &str, msg: &Value) -> Vec<String> {
    let arg = |k: &str| {
        msg.get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let off = msg.get("off").and_then(Value::as_bool).unwrap_or(false);
    let mut args: Vec<String> = Vec::new();
    match msg_type {
        "kbCollection" => {
            args.push("collection".into());
            match arg("op").as_str() {
                "add" => {
                    args.push("--add".into());
                    args.push(arg("title"));
                }
                "rename" => {
                    args.push("--rename".into());
                    args.push(arg("slug"));
                    args.push("--title".into());
                    args.push(arg("title"));
                }
                "remove" => {
                    args.push("--remove".into());
                    args.push(arg("slug"));
                }
                other => return kb_error(format!("kbCollection: op inconnue {other}")),
            }
        }
        "kbTag" => {
            args.push("tag".into());
            match ids_arg(msg) {
                Some(ids) => {
                    args.push("--ids".into());
                    args.push(ids);
                }
                None => {
                    args.push("--id".into());
                    args.push(arg("id"));
                }
            }
            args.push("--collection".into());
            args.push(arg("collection"));
            if off {
                args.push("--off".into());
            }
        }
        _ => {
            args.push("archive".into());
            match ids_arg(msg) {
                Some(ids) => {
                    args.push("--ids".into());
                    args.push(ids);
                }
                None => {
                    args.push("--id".into());
                    args.push(arg("id"));
                }
            }
            if off {
                args.push("--off".into());
            }
        }
    }
    if let Err(message) = kb_cli_run_async(
        state.server_dir().to_string(),
        state.app_dir().to_path_buf(),
        args,
        String::new(),
    )
    .await
    {
        return kb_error(message);
    }
    handle_kb_list(state)
}

pub(super) async fn handle_kb_remove(state: &AppState, msg: &Value) -> Vec<String> {
    // Suppression en lot (redesign de la base) : `ids` prime sur `id`. Le CLI
    // n'est spawné qu'une fois — sinon une sélection de vingt sources relit et
    // réécrit le registre vingt fois.
    let batch = ids_arg(msg);
    let ids: Vec<String> = match &batch {
        Some(joined) => joined.split(',').map(str::to_string).collect(),
        None => {
            let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() {
                return kb_error("kbRemove: id ou ids requis".into());
            }
            vec![id.to_string()]
        }
    };
    let args = match &batch {
        Some(joined) => vec!["remove".to_string(), "--ids".to_string(), joined.clone()],
        None => vec!["remove".to_string(), "--id".to_string(), ids[0].clone()],
    };
    if let Err(message) = kb_cli_run_async(
        state.server_dir().to_string(),
        state.app_dir().to_path_buf(),
        args,
        String::new(),
    )
    .await
    {
        return kb_error(message);
    }
    let mut out = handle_kb_list(state);
    // purge des références dans les threads (miroir du routeur Node) — sinon
    // les conversations non actives gardent des pilules orphelines
    let strip = |value: Option<&Value>| -> (Vec<String>, bool) {
        let items: Vec<String> = value
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        let had = items.iter().any(|x| ids.contains(x));
        (
            items.into_iter().filter(|x| !ids.contains(x)).collect(),
            had,
        )
    };
    let patches: Vec<Value> = {
        let store = state.threads().lock().await;
        store
            .list()
            .iter()
            .filter_map(|thread| {
                let raw = serde_json::to_value(thread).ok()?;
                let (ids, had_ids) = strip(raw.get("kbSourceIds"));
                let (full, had_full) = strip(raw.get("kbFullContent"));
                if !had_ids && !had_full {
                    return None;
                }
                Some(json!({
                    "id": raw.get("id").cloned().unwrap_or(Value::Null),
                    "kbSourceIds": ids,
                    "kbFullContent": full,
                }))
            })
            .collect()
    };
    if !patches.is_empty() {
        {
            let mut store = state.threads().lock().await;
            for patch in patches {
                let _ = store.upsert(patch, true);
            }
        }
        out.extend(broadcast_threads(state).await);
    }
    out
}

pub(super) async fn handle_ragdoc_workspace(state: &AppState, msg: &Value) -> Vec<String> {
    let kind = msg["type"].as_str().unwrap_or("").to_string();
    let response = match kind.as_str() { "articleReview" => "articleReview", "ragdocZotero" => "ragdocZotero", _ => "ragdocStatus" };
    let request_id = msg["requestId"].clone();
    let draft = msg["draftId"].as_str().unwrap_or("").to_string();
    let dir = state.app_dir().join("knowledge");
    let check_indexed = msg["checkIndexed"].as_bool().unwrap_or(false);
    let result = crate::ws_dispatch::blocking(move || match kind.as_str() {
        "articleReview" => atelier_kb::ragdoc_review::review(&dir, &draft),
        "ragdocZotero" => if check_indexed { atelier_kb::ragdoc_review::zotero_with_status() } else { atelier_kb::ragdoc_review::zotero() },
        _ => atelier_kb::ragdoc::call(json!({"operation":"status"})),
    }).await.unwrap_or_else(|e|Err(e.to_string()));
    let mut value = match result { Ok(v) => v, Err(e) => json!({"error":e}) };
    value["type"] = json!(response);
    value["requestId"] = request_id;
    vec![json_msg(value)]
}
