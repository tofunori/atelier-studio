//! Connecteur distant (`atelier-annots-mcp --http`) : le même serveur MCP,
//! joignable par claude.ai en « Streamable HTTP », pour que Claude affiche
//! les cartes d'Atelier (lecteur LaTeX, propositions) et son panneau latéral.
//!
//! Il écoute seulement sur 127.0.0.1 ; l'adresse publique vient d'un tunnel
//! (Tailscale Funnel) qui lui transmet les requêtes. Protections :
//! - OAuth (`oauth.rs`) : rien ne passe sans un jeton obtenu avec le code
//!   choisi sur le Mac ;
//! - seuls les outils LaTeX, sur des fichiers sous `ATELIER_CONNECTOR_ROOTS`
//!   (défaut `~/Documents`) ;
//! - les appels de Claude (`/mcp`, `/token`, `/register`) doivent venir des
//!   adresses d'Anthropic (`ATELIER_CONNECTOR_ALLOW`, défaut
//!   `160.79.104.0/21`) quand le tunnel donne l'adresse d'origine.

use crate::library::Config;
use crate::oauth::OAuth;
use crate::server::{handle_in, Session};
use axum::body::Bytes;
use axum::extract::{Form, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub const DEFAULT_PORT: u16 = 8791;
const SESSIONS_MAX: usize = 50;

pub struct Connector {
    config: Config,
    oauth: Mutex<OAuth>,
    sessions: Mutex<HashMap<String, Session>>,
    /// `ATELIER_CONNECTOR_ROOTS` ; absent, les dossiers sont relus dans
    /// `claude-connector/config.json` à chaque requête (réglage d'Atelier).
    roots_env: Option<Vec<PathBuf>>,
    base_url: Option<String>,
    allow: Option<Vec<(u32, u32)>>,
}

/// `a.b.c.d/n` → (réseau, masque).
fn parse_cidr(text: &str) -> Option<(u32, u32)> {
    let (ip, bits) = text.trim().split_once('/').unwrap_or((text.trim(), "32"));
    let ip: Ipv4Addr = ip.parse().ok()?;
    let bits: u32 = bits.parse().ok().filter(|b| *b <= 32)?;
    let mask = if bits == 0 {
        0
    } else {
        u32::MAX << (32 - bits)
    };
    Some((u32::from(ip) & mask, mask))
}

/// Dossiers ouverts au connecteur, d'après le réglage d'Atelier
/// (`{"roots": ["~/Documents/These", …]}`). Pas de fichier, ou pas de
/// dossier : aucun fichier n'est servi.
pub fn config_roots(app_dir: &std::path::Path) -> Vec<PathBuf> {
    let Ok(raw) = std::fs::read(app_dir.join("claude-connector/config.json")) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_slice::<Value>(&raw) else {
        return Vec::new();
    };
    value["roots"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(Value::as_str)
                .map(crate::revision::expand_home)
                .filter(|p| p.is_absolute())
                .collect()
        })
        .unwrap_or_default()
}

impl Connector {
    fn roots(&self) -> Vec<PathBuf> {
        self.roots_env
            .clone()
            .unwrap_or_else(|| config_roots(&self.config.app_dir))
    }

    pub fn from_env(config: Config) -> Self {
        let roots_env = std::env::var("ATELIER_CONNECTOR_ROOTS")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(|v| {
                v.split(':')
                    .filter(|p| !p.is_empty())
                    .map(PathBuf::from)
                    .collect()
            });
        let allow = match std::env::var("ATELIER_CONNECTOR_ALLOW")
            .ok()
            .as_deref()
            .map(str::trim)
        {
            Some("*") => None,
            Some(list) if !list.is_empty() => {
                Some(list.split(',').filter_map(parse_cidr).collect())
            }
            _ => Some(vec![parse_cidr("160.79.104.0/21").expect("cidr")]),
        };
        let base_url = std::env::var("ATELIER_CONNECTOR_URL")
            .ok()
            .map(|u| u.trim().trim_end_matches('/').to_string())
            .filter(|u| !u.is_empty());
        Connector {
            oauth: Mutex::new(OAuth::load(&config.app_dir)),
            config,
            sessions: Mutex::new(HashMap::new()),
            roots_env,
            base_url,
            allow,
        }
    }

    /// Adresse publique : `ATELIER_CONNECTOR_URL`, sinon celle que le tunnel
    /// annonce dans ses en-têtes.
    fn base(&self, headers: &HeaderMap) -> String {
        if let Some(url) = &self.base_url {
            return url.clone();
        }
        let get = |name: &str| {
            headers
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(str::to_string)
        };
        let host = get("x-forwarded-host")
            .or_else(|| get("host"))
            .unwrap_or_else(|| "127.0.0.1".into());
        let local = host.starts_with("127.") || host.starts_with("localhost");
        let proto = get("x-forwarded-proto").unwrap_or_else(|| {
            if local {
                "http".into()
            } else {
                "https".into()
            }
        });
        format!("{proto}://{host}")
    }

    /// Les appels de Claude viennent des adresses d'Anthropic. Sans adresse
    /// d'origine (appel local), on laisse passer : le jeton reste exigé.
    fn origin_ok(&self, headers: &HeaderMap) -> bool {
        let Some(allow) = &self.allow else {
            return true;
        };
        let Some(first) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(str::trim)
        else {
            return true;
        };
        match first.parse::<Ipv4Addr>() {
            Ok(ip) => {
                let ip = u32::from(ip);
                ip >> 24 == 127 || allow.iter().any(|(net, mask)| ip & mask == *net)
            }
            Err(_) => false,
        }
    }
}

type Shared = Arc<Connector>;

pub fn router(connector: Shared) -> Router {
    Router::new()
        .route("/mcp", post(mcp_post).get(mcp_get).delete(mcp_delete))
        .route(
            "/.well-known/oauth-protected-resource",
            get(resource_metadata),
        )
        .route(
            "/.well-known/oauth-protected-resource/mcp",
            get(resource_metadata),
        )
        .route(
            "/.well-known/oauth-authorization-server",
            get(server_metadata),
        )
        .route(
            "/.well-known/oauth-authorization-server/mcp",
            get(server_metadata),
        )
        .route("/.well-known/openid-configuration", get(server_metadata))
        .route("/register", post(register))
        .route("/authorize", get(authorize_page).post(authorize_submit))
        .route("/token", post(token))
        .route("/", get(|| async { "Atelier : connecteur pour Claude." }))
        .with_state(connector)
}

pub fn run(config: Config, port: u16) -> Result<(), String> {
    let connector = Arc::new(Connector::from_env(config));
    if !connector
        .oauth
        .lock()
        .map(|o| o.has_secret())
        .unwrap_or(false)
    {
        eprintln!(
            "atelier-annots-mcp: aucun code choisi : lance d'abord `atelier-annots-mcp --set-code`"
        );
    }
    eprintln!(
        "atelier-annots-mcp: connecteur sur http://127.0.0.1:{port}/mcp, dossiers ouverts : {}",
        connector
            .roots()
            .iter()
            .map(|r| r.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async move {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
            .await
            .map_err(|e| format!("port {port} : {e}"))?;
        axum::serve(listener, router(connector))
            .await
            .map_err(|e| e.to_string())
    })
}

fn oauth_error(status: StatusCode, error: &str, description: &str) -> Response {
    (
        status,
        Json(json!({"error": error, "error_description": description})),
    )
        .into_response()
}

fn forbidden() -> Response {
    oauth_error(StatusCode::FORBIDDEN, "access_denied", "origine refusée")
}

async fn resource_metadata(State(c): State<Shared>, headers: HeaderMap) -> Json<Value> {
    let base = c.base(&headers);
    Json(json!({
        "resource": format!("{base}/mcp"),
        "authorization_servers": [base],
        "bearer_methods_supported": ["header"],
        "resource_name": "Atelier",
    }))
}

async fn server_metadata(State(c): State<Shared>, headers: HeaderMap) -> Json<Value> {
    let base = c.base(&headers);
    Json(json!({
        "issuer": base,
        "authorization_endpoint": format!("{base}/authorize"),
        "token_endpoint": format!("{base}/token"),
        "registration_endpoint": format!("{base}/register"),
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": ["atelier"],
    }))
}

async fn register(State(c): State<Shared>, headers: HeaderMap, body: Bytes) -> Response {
    if !c.origin_ok(&headers) {
        return forbidden();
    }
    let body: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let result = c
        .oauth
        .lock()
        .map_err(|e| e.to_string())
        .and_then(|mut o| o.register(&body));
    match result {
        Ok(client) => (StatusCode::CREATED, Json(client)).into_response(),
        Err(e) => oauth_error(StatusCode::BAD_REQUEST, "invalid_redirect_uri", &e),
    }
}

fn esc(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn pct(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

const PAGE: &str = include_str!("../view/authorize.html");
const KEYS: [&str; 6] = [
    "client_id",
    "redirect_uri",
    "code_challenge",
    "code_challenge_method",
    "state",
    "resource",
];

fn page(params: &HashMap<String, String>, error: Option<&str>, blocked: bool) -> Html<String> {
    let hidden: String = KEYS
        .iter()
        .filter_map(|k| {
            params
                .get(*k)
                .map(|v| format!("<input type=\"hidden\" name=\"{k}\" value=\"{}\">", esc(v)))
        })
        .collect();
    let error = error
        .map(|e| format!("<p class=\"err\" role=\"alert\">{}</p>", esc(e)))
        .unwrap_or_default();
    Html(
        PAGE.replace("{{hidden}}", &hidden)
            .replace("{{error}}", &error)
            .replace("{{form_hidden}}", if blocked { "hidden" } else { "" }),
    )
}

fn param<'a>(params: &'a HashMap<String, String>, key: &str) -> &'a str {
    params.get(key).map(String::as_str).unwrap_or("")
}

async fn authorize_page(
    State(c): State<Shared>,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if param(&params, "response_type") != "code" {
        return page(&params, Some("Demande invalide (response_type)."), true).into_response();
    }
    let checked = c.oauth.lock().map_err(|e| e.to_string()).and_then(|o| {
        o.check_request(
            param(&params, "client_id"),
            param(&params, "redirect_uri"),
            param(&params, "code_challenge"),
            param(&params, "code_challenge_method"),
        )
    });
    match checked {
        Ok(()) => page(&params, None, false).into_response(),
        Err(e) => page(&params, Some(&format!("Demande refusée : {e}.")), true).into_response(),
    }
}

async fn authorize_submit(
    State(c): State<Shared>,
    Form(params): Form<HashMap<String, String>>,
) -> Response {
    let redirect = param(&params, "redirect_uri").to_string();
    let result = c.oauth.lock().map_err(|e| e.to_string()).and_then(|mut o| {
        o.authorize(
            param(&params, "client_id"),
            &redirect,
            param(&params, "code_challenge"),
            param(&params, "code_challenge_method"),
            param(&params, "secret"),
        )
    });
    match result {
        Ok(code) => {
            let mut location = format!("{redirect}?code={}", pct(&code));
            if let Some(state) = params.get("state") {
                location.push_str(&format!("&state={}", pct(state)));
            }
            let mut response = StatusCode::FOUND.into_response();
            if let Ok(value) = HeaderValue::from_str(&location) {
                response.headers_mut().insert(header::LOCATION, value);
            }
            response
        }
        Err(e) => {
            let blocked = c.oauth.lock().map(|o| o.locked()).unwrap_or(true);
            let mut message = e;
            if let Some(first) = message.get(..1) {
                message = first.to_uppercase() + &message[1..];
            }
            (
                StatusCode::UNAUTHORIZED,
                page(&params, Some(&format!("{message}.")), blocked),
            )
                .into_response()
        }
    }
}

async fn token(
    State(c): State<Shared>,
    headers: HeaderMap,
    Form(params): Form<HashMap<String, String>>,
) -> Response {
    if !c.origin_ok(&headers) {
        return forbidden();
    }
    let result = c.oauth.lock().map_err(|e| e.to_string()).and_then(|mut o| {
        match param(&params, "grant_type") {
            "authorization_code" => o.exchange_code(
                param(&params, "code"),
                param(&params, "client_id"),
                param(&params, "redirect_uri"),
                param(&params, "code_verifier"),
            ),
            "refresh_token" => {
                o.refresh(param(&params, "refresh_token"), param(&params, "client_id"))
            }
            other => Err(format!("grant_type non pris en charge : {other}")),
        }
    });
    match result {
        Ok(t) => {
            let mut response = Json(json!({
                "access_token": t.access_token,
                "token_type": "Bearer",
                "expires_in": t.expires_in,
                "refresh_token": t.refresh_token,
                "scope": "atelier",
            }))
            .into_response();
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            response
        }
        Err(e) => oauth_error(StatusCode::BAD_REQUEST, "invalid_grant", &e),
    }
}

fn unauthorized(c: &Connector, headers: &HeaderMap) -> Response {
    let base = c.base(headers);
    let challenge =
        format!("Bearer resource_metadata=\"{base}/.well-known/oauth-protected-resource/mcp\"");
    let mut response = oauth_error(
        StatusCode::UNAUTHORIZED,
        "invalid_token",
        "connexion requise",
    );
    if let Ok(value) = HeaderValue::from_str(&challenge) {
        response
            .headers_mut()
            .insert(header::WWW_AUTHENTICATE, value);
    }
    response
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            v.strip_prefix("Bearer ")
                .or_else(|| v.strip_prefix("bearer "))
        })
        .map(str::trim)
}

async fn mcp_post(State(c): State<Shared>, headers: HeaderMap, body: Bytes) -> Response {
    if !c.origin_ok(&headers) {
        return forbidden();
    }
    let authorized = bearer(&headers)
        .map(|t| c.oauth.lock().map(|o| o.access_ok(t)).unwrap_or(false))
        .unwrap_or(false);
    if !authorized {
        return unauthorized(&c, &headers);
    }
    let message: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"jsonrpc": "2.0", "id": null,
                "error": {"code": -32700, "message": format!("JSON invalide : {e}")}})),
            )
                .into_response()
        }
    };
    let messages = match &message {
        Value::Array(list) => list.clone(),
        single => vec![single.clone()],
    };
    let initializing = messages.iter().any(|m| m["method"] == "initialize");
    let session_id = match headers.get("mcp-session-id").and_then(|v| v.to_str().ok()) {
        Some(id) if !initializing => id.to_string(),
        _ => crate::oauth::random_token(),
    };
    // La session est copiée hors du verrou, et l'appel tourne hors du
    // runtime : une compilation LaTeX (des dizaines de secondes) ne bloque ni
    // les autres requêtes ni les autres conversations.
    let mut session = {
        let mut sessions = match c.sessions.lock() {
            Ok(s) => s,
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
        if !sessions.contains_key(&session_id) && sessions.len() >= SESSIONS_MAX {
            sessions.clear();
        }
        let roots = c.roots();
        let session = sessions
            .entry(session_id.clone())
            .or_insert_with(|| Session::remote(roots.clone()));
        // Un dossier ajouté ou retiré dans Atelier vaut dès la requête suivante.
        session.remote_roots = Some(roots);
        session.clone()
    };
    let worker = c.clone();
    let handled = tokio::task::spawn_blocking(move || {
        let replies: Vec<Value> = messages
            .iter()
            .filter_map(|m| {
                let reply = handle_in(&mut session, &worker.config, m);
                // `initialize` lit les capacités du client ; à distance, les
                // outils LaTeX restent offerts dans tous les cas.
                session.ui = true;
                reply
            })
            .collect();
        (replies, session)
    })
    .await;
    let Ok((replies, session)) = handled else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if let Ok(mut sessions) = c.sessions.lock() {
        sessions.insert(session_id.clone(), session);
    }
    let mut response = if replies.is_empty() {
        StatusCode::ACCEPTED.into_response()
    } else if message.is_array() {
        Json(Value::Array(replies)).into_response()
    } else {
        Json(replies.into_iter().next().unwrap_or(Value::Null)).into_response()
    };
    if initializing {
        if let Ok(value) = HeaderValue::from_str(&session_id) {
            response.headers_mut().insert("mcp-session-id", value);
        }
    }
    response
}

async fn mcp_get() -> Response {
    (StatusCode::METHOD_NOT_ALLOWED, "flux SSE non proposé").into_response()
}

async fn mcp_delete(State(c): State<Shared>, headers: HeaderMap) -> Response {
    let authorized = bearer(&headers)
        .map(|t| c.oauth.lock().map(|o| o.access_ok(t)).unwrap_or(false))
        .unwrap_or(false);
    if !authorized {
        return unauthorized(&c, &headers);
    }
    if let Some(id) = headers.get("mcp-session-id").and_then(|v| v.to_str().ok()) {
        if let Ok(mut sessions) = c.sessions.lock() {
            sessions.remove(id);
        }
    }
    StatusCode::OK.into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthropic_range_and_forwarded_origin() {
        let cidr = parse_cidr("160.79.104.0/21").unwrap();
        let inside = u32::from("160.79.110.7".parse::<Ipv4Addr>().unwrap());
        let outside = u32::from("160.79.112.1".parse::<Ipv4Addr>().unwrap());
        assert_eq!(inside & cidr.1, cidr.0);
        assert_ne!(outside & cidr.1, cidr.0);
        assert!(parse_cidr("nope").is_none());
    }

    #[test]
    fn folders_come_from_atelier_settings_and_default_to_none() {
        let dir = tempfile::tempdir().unwrap();
        assert!(
            config_roots(dir.path()).is_empty(),
            "sans réglage : aucun dossier"
        );
        std::fs::create_dir_all(dir.path().join("claude-connector")).unwrap();
        std::fs::write(
            dir.path().join("claude-connector/config.json"),
            r#"{"enabled": true, "roots": ["/Users/t/These", "relatif", 3]}"#,
        )
        .unwrap();
        assert_eq!(
            config_roots(dir.path()),
            vec![PathBuf::from("/Users/t/These")]
        );
    }

    #[test]
    fn percent_encoding_keeps_tokens_and_escapes_state() {
        assert_eq!(pct("abc-_.~XYZ09"), "abc-_.~XYZ09");
        assert_eq!(pct("a b&c=d"), "a%20b%26c%3Dd");
    }
}
