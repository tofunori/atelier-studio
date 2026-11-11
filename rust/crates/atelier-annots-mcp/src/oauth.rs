//! Connexion OAuth minimale du connecteur distant (`--http`).
//!
//! Claude (claude.ai, Claude Desktop) ajoute un connecteur personnalisé par
//! OAuth 2.1 avec enregistrement dynamique du client (RFC 7591) et PKCE S256.
//! Ici, une seule personne : l'utilisateur prouve qu'il est lui en tapant le
//! code qu'il a choisi une fois sur son Mac (`--set-code`). Rien d'autre.
//!
//! - Seules les adresses de retour de Claude sont acceptées.
//! - Un code d'autorisation sert une fois, pendant deux minutes.
//! - Jetons d'accès : une heure ; jetons de renouvellement : 60 jours,
//!   remplacés à chaque usage. Seule leur empreinte SHA-256 est gardée.
//! - Cinq codes faux d'affilée bloquent la page quinze minutes.
//!
//! État : `$ATELIER_APP_DIR/claude-connector/state.json` (droits 600).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const REDIRECTS: [&str; 2] = [
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
];
const CODE_TTL: u64 = 120;
const ACCESS_TTL: u64 = 3_600;
const REFRESH_TTL: u64 = 60 * 24 * 3_600;
const CLIENTS_MAX: usize = 20;
const FAILURES_MAX: u32 = 5;
const LOCKOUT: u64 = 15 * 60;
pub const SECRET_MIN: usize = 8;

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn sha256_hex(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// PKCE S256 : BASE64URL(SHA256(verifier)) == challenge.
pub fn pkce_ok(verifier: &str, challenge: &str) -> bool {
    if verifier.len() < 43 || verifier.len() > 128 {
        return false;
    }
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())) == challenge
}

struct Grant {
    client_id: String,
    redirect_uri: String,
    challenge: String,
    expires: u64,
}

pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

pub struct OAuth {
    path: PathBuf,
    state: Value,
    grants: HashMap<String, Grant>,
    failures: u32,
    locked_until: u64,
}

pub fn state_path(app_dir: &Path) -> PathBuf {
    app_dir.join("claude-connector").join("state.json")
}

impl OAuth {
    pub fn load(app_dir: &Path) -> Self {
        let path = state_path(app_dir);
        let state = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        OAuth {
            path,
            state,
            grants: HashMap::new(),
            failures: 0,
            locked_until: 0,
        }
    }

    fn save(&self) -> Result<(), String> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(
            &tmp,
            serde_json::to_vec_pretty(&self.state).unwrap_or_default(),
        )
        .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
        }
        std::fs::rename(&tmp, &self.path).map_err(|e| e.to_string())
    }

    fn table(&mut self, key: &str) -> &mut Map<String, Value> {
        if !self.state[key].is_object() {
            self.state[key] = json!({});
        }
        self.state[key].as_object_mut().expect("objet")
    }

    pub fn has_secret(&self) -> bool {
        self.state["secret"]["hash"].is_string()
    }

    /// `--set-code` : choisit le code (seulement sur le Mac). Les connexions
    /// déjà accordées sont retirées.
    pub fn set_secret(&mut self, secret: &str) -> Result<(), String> {
        let secret = secret.trim();
        if secret.chars().count() < SECRET_MIN {
            return Err(format!(
                "le code doit avoir au moins {SECRET_MIN} caractères"
            ));
        }
        let salt = random_token();
        self.state["secret"] =
            json!({"salt": salt, "hash": sha256_hex(&format!("{salt}{secret}"))});
        self.state["tokens"] = json!({});
        self.save()
    }

    /// `--disconnect` (bouton « Déconnecter Claude » d'Atelier) : retire
    /// les clients et les jetons ; le code reste. Claude devra se relier.
    pub fn disconnect(&mut self) -> Result<(), String> {
        self.state["clients"] = json!({});
        self.state["tokens"] = json!({});
        self.save()
    }

    /// `--status` : ce que la page « Claude » d'Atelier affiche. Relié = un
    /// jeton de renouvellement encore valable.
    pub fn summary(&self) -> Value {
        let t = now();
        let mut linked: Option<(String, u64)> = None;
        if let Some(tokens) = self.state["tokens"].as_object() {
            for entry in tokens.values() {
                if entry["kind"] != "refresh" || entry["expires"].as_u64().unwrap_or(0) <= t {
                    continue;
                }
                let client = &self.state["clients"][entry["client"].as_str().unwrap_or("")];
                let name = client["name"].as_str().unwrap_or("Claude").to_string();
                let since = client["created"].as_u64().unwrap_or(0);
                if linked.as_ref().map(|(_, s)| since < *s).unwrap_or(true) {
                    linked = Some((name, since));
                }
            }
        }
        json!({
            "codeSet": self.has_secret(),
            "linked": linked.is_some(),
            "client": linked.as_ref().map(|(n, _)| n.clone()),
            "linkedSince": linked.map(|(_, s)| s),
        })
    }

    pub fn register(&mut self, body: &Value) -> Result<Value, String> {
        let uris: Vec<String> = body["redirect_uris"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        if uris.is_empty() || !uris.iter().all(|u| REDIRECTS.contains(&u.as_str())) {
            return Err(
                "redirect_uris : seules les adresses de retour de Claude sont acceptées".into(),
            );
        }
        let name = body["client_name"]
            .as_str()
            .unwrap_or("Claude")
            .chars()
            .take(80)
            .collect::<String>();
        let client_id = random_token();
        let created = now();
        let clients = self.table("clients");
        clients.insert(
            client_id.clone(),
            json!({"redirect_uris": uris, "name": name, "created": created}),
        );
        while clients.len() > CLIENTS_MAX {
            let oldest = clients
                .iter()
                .min_by_key(|(_, c)| c["created"].as_u64().unwrap_or(0))
                .map(|(k, _)| k.clone());
            match oldest {
                Some(k) => clients.remove(&k),
                None => break,
            };
        }
        self.save()?;
        Ok(json!({
            "client_id": client_id,
            "client_id_issued_at": created,
            "client_name": name,
            "redirect_uris": uris,
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        }))
    }

    /// Vérifie la demande d'autorisation (avant d'afficher la page).
    pub fn check_request(
        &self,
        client_id: &str,
        redirect_uri: &str,
        challenge: &str,
        method: &str,
    ) -> Result<(), String> {
        let client = &self.state["clients"][client_id];
        if !client.is_object() {
            return Err(
                "client inconnu : retire le connecteur dans Claude et ajoute-le de nouveau".into(),
            );
        }
        let known = client["redirect_uris"]
            .as_array()
            .is_some_and(|a| a.iter().any(|u| u == redirect_uri));
        if !known {
            return Err("adresse de retour inconnue".into());
        }
        if method != "S256" || challenge.len() < 43 {
            return Err("PKCE S256 exigé".into());
        }
        if !self.has_secret() {
            return Err(
                "aucun code n'est encore choisi sur le Mac (atelier-annots-mcp --set-code)".into(),
            );
        }
        Ok(())
    }

    pub fn locked(&self) -> bool {
        now() < self.locked_until
    }

    /// Le code tapé ; en cas de succès, un code d'autorisation à usage unique.
    pub fn authorize(
        &mut self,
        client_id: &str,
        redirect_uri: &str,
        challenge: &str,
        method: &str,
        secret: &str,
    ) -> Result<String, String> {
        self.check_request(client_id, redirect_uri, challenge, method)?;
        if self.locked() {
            return Err("trop d'essais : réessaie dans quinze minutes".into());
        }
        let salt = self.state["secret"]["salt"].as_str().unwrap_or("");
        let expected = self.state["secret"]["hash"].as_str().unwrap_or("");
        if sha256_hex(&format!("{salt}{}", secret.trim())) != expected {
            self.failures += 1;
            if self.failures >= FAILURES_MAX {
                self.failures = 0;
                self.locked_until = now() + LOCKOUT;
            }
            return Err("code incorrect".into());
        }
        self.failures = 0;
        let t = now();
        self.grants.retain(|_, g| g.expires > t);
        let code = random_token();
        self.grants.insert(
            code.clone(),
            Grant {
                client_id: client_id.into(),
                redirect_uri: redirect_uri.into(),
                challenge: challenge.into(),
                expires: t + CODE_TTL,
            },
        );
        Ok(code)
    }

    fn issue(&mut self, client_id: &str) -> Result<Tokens, String> {
        let t = now();
        let access = random_token();
        let refresh = random_token();
        let tokens = self.table("tokens");
        tokens.retain(|_, v| v["expires"].as_u64().unwrap_or(0) > t);
        tokens.insert(
            sha256_hex(&access),
            json!({"kind": "access", "client": client_id, "expires": t + ACCESS_TTL}),
        );
        tokens.insert(
            sha256_hex(&refresh),
            json!({"kind": "refresh", "client": client_id, "expires": t + REFRESH_TTL}),
        );
        self.save()?;
        Ok(Tokens {
            access_token: access,
            refresh_token: refresh,
            expires_in: ACCESS_TTL,
        })
    }

    pub fn exchange_code(
        &mut self,
        code: &str,
        client_id: &str,
        redirect_uri: &str,
        verifier: &str,
    ) -> Result<Tokens, String> {
        let grant = self
            .grants
            .remove(code)
            .ok_or("code inconnu ou déjà utilisé")?;
        if grant.expires <= now() {
            return Err("code expiré".into());
        }
        if grant.client_id != client_id || grant.redirect_uri != redirect_uri {
            return Err("code émis pour un autre client".into());
        }
        if !pkce_ok(verifier, &grant.challenge) {
            return Err("code_verifier invalide".into());
        }
        self.issue(client_id)
    }

    pub fn refresh(&mut self, refresh_token: &str, client_id: &str) -> Result<Tokens, String> {
        let key = sha256_hex(refresh_token);
        let entry = self
            .table("tokens")
            .remove(&key)
            .ok_or("jeton de renouvellement inconnu")?;
        if entry["kind"] != "refresh" || entry["expires"].as_u64().unwrap_or(0) <= now() {
            self.save()?;
            return Err("jeton de renouvellement expiré".into());
        }
        if !client_id.is_empty() && entry["client"] != client_id {
            self.save()?;
            return Err("jeton émis pour un autre client".into());
        }
        let client = entry["client"].as_str().unwrap_or("").to_string();
        self.issue(&client)
    }

    pub fn access_ok(&self, token: &str) -> bool {
        let entry = &self.state["tokens"][sha256_hex(token)];
        entry["kind"] == "access" && entry["expires"].as_u64().unwrap_or(0) > now()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn challenge_of(verifier: &str) -> String {
        URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
    }

    #[test]
    fn status_shows_the_link_and_disconnect_removes_it() {
        let dir = tempfile::tempdir().unwrap();
        let mut auth = OAuth::load(dir.path());
        assert_eq!(auth.summary()["codeSet"], false);
        auth.set_secret("glacier-albedo-2026").unwrap();
        let client = auth
            .register(&json!({"redirect_uris": [REDIRECTS[0]], "client_name": "claude.ai"}))
            .unwrap();
        let id = client["client_id"].as_str().unwrap().to_string();
        let verifier = "v".repeat(50);
        let challenge = challenge_of(&verifier);
        assert_eq!(auth.summary()["linked"], false);
        let code = auth
            .authorize(&id, REDIRECTS[0], &challenge, "S256", "glacier-albedo-2026")
            .unwrap();
        let tokens = auth
            .exchange_code(&code, &id, REDIRECTS[0], &verifier)
            .unwrap();
        let summary = OAuth::load(dir.path()).summary();
        assert_eq!(summary["codeSet"], true);
        assert_eq!(summary["linked"], true);
        assert_eq!(summary["client"], "claude.ai");
        assert!(summary["linkedSince"].as_u64().unwrap() > 0);
        OAuth::load(dir.path()).disconnect().unwrap();
        let after = OAuth::load(dir.path());
        assert!(!after.access_ok(&tokens.access_token));
        assert_eq!(after.summary()["linked"], false);
        // Le code reste : Claude peut se relier avec lui.
        assert_eq!(after.summary()["codeSet"], true);
    }

    #[test]
    fn full_flow_with_pkce_and_refresh() {
        let dir = tempfile::tempdir().unwrap();
        let mut auth = OAuth::load(dir.path());
        let client = auth
            .register(&json!({"redirect_uris": [REDIRECTS[0]], "client_name": "Claude"}))
            .unwrap();
        let id = client["client_id"].as_str().unwrap().to_string();
        let verifier = "v".repeat(50);
        let challenge = challenge_of(&verifier);
        // Pas de code choisi : rien n'est accordé.
        assert!(auth
            .check_request(&id, REDIRECTS[0], &challenge, "S256")
            .is_err());
        assert!(auth.set_secret("court").is_err());
        auth.set_secret("glacier-albedo-2026").unwrap();
        assert!(auth
            .check_request(&id, REDIRECTS[0], &challenge, "S256")
            .is_ok());
        assert!(auth
            .check_request(&id, "https://evil.example/cb", &challenge, "S256")
            .is_err());
        assert!(auth
            .check_request(&id, REDIRECTS[0], &challenge, "plain")
            .is_err());
        assert!(auth
            .authorize(&id, REDIRECTS[0], &challenge, "S256", "faux")
            .is_err());
        let code = auth
            .authorize(&id, REDIRECTS[0], &challenge, "S256", "glacier-albedo-2026")
            .unwrap();
        assert!(auth
            .exchange_code(&code, &id, REDIRECTS[0], &"x".repeat(50))
            .is_err());
        // Le code a été consommé par l'essai raté : il faut recommencer.
        let code = auth
            .authorize(&id, REDIRECTS[0], &challenge, "S256", "glacier-albedo-2026")
            .unwrap();
        let tokens = auth
            .exchange_code(&code, &id, REDIRECTS[0], &verifier)
            .unwrap();
        assert!(auth
            .exchange_code(&code, &id, REDIRECTS[0], &verifier)
            .is_err());
        assert!(auth.access_ok(&tokens.access_token));
        assert!(!auth.access_ok(&tokens.refresh_token));
        // L'état survit à un redémarrage.
        let mut again = OAuth::load(dir.path());
        assert!(again.access_ok(&tokens.access_token));
        let renewed = again.refresh(&tokens.refresh_token, &id).unwrap();
        assert!(again.refresh(&tokens.refresh_token, &id).is_err());
        assert!(again.access_ok(&renewed.access_token));
        // Changer le code retire les connexions accordées.
        again.set_secret("nouveau-code-2026").unwrap();
        assert!(!again.access_ok(&renewed.access_token));
    }

    #[test]
    fn only_claude_redirects_and_lockout() {
        let dir = tempfile::tempdir().unwrap();
        let mut auth = OAuth::load(dir.path());
        assert!(auth
            .register(&json!({"redirect_uris": ["https://evil.example/cb"]}))
            .is_err());
        assert!(auth.register(&json!({})).is_err());
        let id = auth
            .register(&json!({"redirect_uris": [REDIRECTS[1]]}))
            .unwrap()["client_id"]
            .as_str()
            .unwrap()
            .to_string();
        auth.set_secret("glacier-albedo-2026").unwrap();
        let challenge = challenge_of(&"v".repeat(50));
        for _ in 0..FAILURES_MAX {
            assert!(auth
                .authorize(&id, REDIRECTS[1], &challenge, "S256", "faux-code")
                .is_err());
        }
        assert!(auth.locked());
        let err = auth
            .authorize(&id, REDIRECTS[1], &challenge, "S256", "glacier-albedo-2026")
            .unwrap_err();
        assert!(err.contains("quinze minutes"), "{err}");
    }
}
