//! Pairing codes + per-device tokens (hashed at rest).

use crate::scopes::{all_mvp_scopes, scopes_from_strings, scopes_to_strings, Scope};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const PAIRING_TTL_SECS: u64 = 120;
const PAIRING_MAX_ATTEMPTS: u32 = 5;
const TOKEN_BYTES: usize = 32;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn hash_token(token: &str) -> String {
    let mut h = Sha256::new();
    h.update(token.as_bytes());
    hex::encode(h.finalize())
}

fn random_hex(n_bytes: usize) -> String {
    let mut buf = vec![0u8; n_bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

/// Short human pairing code (8 chars, Crockford-ish without ambiguous glyphs).
fn random_pairing_code() -> String {
    const ALPH: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let mut out = String::with_capacity(8);
    for _ in 0..8 {
        let i = (rng.next_u32() as usize) % ALPH.len();
        out.push(ALPH[i] as char);
    }
    out
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRecord {
    pub device_id: String,
    pub name: String,
    /// SHA-256 hex of the bearer token (never store plaintext).
    pub token_hash: String,
    pub scopes: Vec<String>,
    pub created_at: u64,
    pub last_seen_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revoked_at: Option<u64>,
    /// Rotation: previous hash accepted until expires.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_token_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_token_expires_at: Option<u64>,
}

impl DeviceRecord {
    pub fn is_revoked(&self) -> bool {
        self.revoked_at.is_some()
    }

    pub fn scope_set(&self) -> BTreeSet<Scope> {
        scopes_from_strings(&self.scopes)
    }

    pub fn matches_token_hash(&self, hash: &str) -> bool {
        if self.is_revoked() {
            return false;
        }
        if self.token_hash == hash {
            return true;
        }
        if let (Some(prev), Some(exp)) = (
            self.previous_token_hash.as_ref(),
            self.previous_token_expires_at,
        ) {
            if prev == hash && now_secs() < exp {
                return true;
            }
        }
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingSession {
    pub code: String,
    pub expires_at: u64,
    pub attempts: u32,
    pub created_at: u64,
    #[serde(default)]
    pub device_name_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthStoreFile {
    pub devices: Vec<DeviceRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pairing: Option<PairingSession>,
    /// Admin token for loopback Mac UI (plaintext only in process; hash on disk).
    #[serde(default)]
    pub admin_token_hash: String,
}

#[derive(Debug)]
pub struct AuthStore {
    path: PathBuf,
    data: AuthStoreFile,
    /// Plain admin token kept in memory for this process (returned once at start).
    admin_token_plain: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PairingStart {
    pub code: String,
    pub expires_at: u64,
    pub expires_in_secs: u64,
}

#[derive(Debug, Clone)]
pub struct PairingComplete {
    pub device_id: String,
    pub token: String,
    pub scopes: Vec<String>,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct AuthDevice {
    pub device_id: String,
    pub name: String,
    pub scopes: BTreeSet<Scope>,
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("pairing_expired")]
    PairingExpired,
    #[error("pairing_invalid")]
    PairingInvalid,
    #[error("pairing_locked")]
    PairingLocked,
    #[error("no_pairing")]
    NoPairing,
    #[error("device_not_found")]
    DeviceNotFound,
    #[error("io: {0}")]
    Io(String),
}

impl AuthStore {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, AuthError> {
        let path = path.into();
        let mut data = if path.exists() {
            let text = std::fs::read_to_string(&path).map_err(|e| AuthError::Io(e.to_string()))?;
            serde_json::from_str(&text).unwrap_or_default()
        } else {
            AuthStoreFile::default()
        };

        let mut admin_token_plain = None;
        if data.admin_token_hash.is_empty() {
            let tok = random_hex(TOKEN_BYTES);
            data.admin_token_hash = hash_token(&tok);
            admin_token_plain = Some(tok);
        }

        let store = Self {
            path,
            data,
            admin_token_plain,
        };
        store.persist()?;
        Ok(store)
    }

    pub fn admin_token_plain(&self) -> Option<&str> {
        self.admin_token_plain.as_deref()
    }

    pub fn admin_token_hash(&self) -> &str {
        &self.data.admin_token_hash
    }

    /// Rotate admin token (returns new plaintext once).
    pub fn rotate_admin_token(&mut self) -> Result<String, AuthError> {
        let tok = random_hex(TOKEN_BYTES);
        self.data.admin_token_hash = hash_token(&tok);
        self.admin_token_plain = Some(tok.clone());
        self.persist()?;
        Ok(tok)
    }

    fn persist(&self) -> Result<(), AuthError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| AuthError::Io(e.to_string()))?;
        }
        let json =
            serde_json::to_string_pretty(&self.data).map_err(|e| AuthError::Io(e.to_string()))?;
        atelier_store::write_file_atomic(&self.path, json).map_err(|e| AuthError::Io(e.to_string()))
    }

    pub fn start_pairing(
        &mut self,
        device_name_hint: Option<String>,
    ) -> Result<PairingStart, AuthError> {
        let code = random_pairing_code();
        let created = now_secs();
        let expires_at = created + PAIRING_TTL_SECS;
        self.data.pairing = Some(PairingSession {
            code: code.clone(),
            expires_at,
            attempts: 0,
            created_at: created,
            device_name_hint,
        });
        self.persist()?;
        Ok(PairingStart {
            code,
            expires_at,
            expires_in_secs: PAIRING_TTL_SECS,
        })
    }

    pub fn cancel_pairing(&mut self) -> Result<(), AuthError> {
        self.data.pairing = None;
        self.persist()
    }

    pub fn complete_pairing(
        &mut self,
        code: &str,
        device_name: &str,
    ) -> Result<PairingComplete, AuthError> {
        let now = now_secs();
        let pairing = self.data.pairing.as_mut().ok_or(AuthError::NoPairing)?;
        if now > pairing.expires_at {
            self.data.pairing = None;
            let _ = self.persist();
            return Err(AuthError::PairingExpired);
        }
        if pairing.attempts >= PAIRING_MAX_ATTEMPTS {
            self.data.pairing = None;
            let _ = self.persist();
            return Err(AuthError::PairingLocked);
        }
        // Constant-time-ish compare for short codes
        let ok = pairing.code.eq_ignore_ascii_case(code.trim());
        if !ok {
            pairing.attempts += 1;
            let attempts = pairing.attempts;
            let _ = self.persist();
            if attempts >= PAIRING_MAX_ATTEMPTS {
                self.data.pairing = None;
                let _ = self.persist();
                return Err(AuthError::PairingLocked);
            }
            return Err(AuthError::PairingInvalid);
        }

        let token = random_hex(TOKEN_BYTES);
        let device_id = uuid::Uuid::new_v4().to_string();
        let scopes = all_mvp_scopes();
        let name = if device_name.trim().is_empty() {
            pairing
                .device_name_hint
                .clone()
                .unwrap_or_else(|| "iPhone".into())
        } else {
            device_name.trim().to_string()
        };

        let rec = DeviceRecord {
            device_id: device_id.clone(),
            name: name.clone(),
            token_hash: hash_token(&token),
            scopes: scopes_to_strings(&scopes),
            created_at: now,
            last_seen_at: now,
            revoked_at: None,
            previous_token_hash: None,
            previous_token_expires_at: None,
        };
        self.data.devices.push(rec);
        self.data.pairing = None;
        self.persist()?;

        Ok(PairingComplete {
            device_id,
            token,
            scopes: scopes_to_strings(&scopes),
            name,
        })
    }

    pub fn authenticate_token(&mut self, token: &str) -> Option<AuthDevice> {
        let hash = hash_token(token);
        let now = now_secs();
        for d in &mut self.data.devices {
            if d.matches_token_hash(&hash) {
                d.last_seen_at = now;
                let auth = AuthDevice {
                    device_id: d.device_id.clone(),
                    name: d.name.clone(),
                    scopes: d.scope_set(),
                };
                let _ = self.persist();
                return Some(auth);
            }
        }
        None
    }

    /// Authenticate without mutating last_seen (for tests / read-only checks).
    pub fn lookup_token(&self, token: &str) -> Option<AuthDevice> {
        let hash = hash_token(token);
        self.data
            .devices
            .iter()
            .find(|d| d.matches_token_hash(&hash))
            .map(|d| AuthDevice {
                device_id: d.device_id.clone(),
                name: d.name.clone(),
                scopes: d.scope_set(),
            })
    }

    pub fn revoke_device(&mut self, device_id: &str) -> Result<(), AuthError> {
        let d = self
            .data
            .devices
            .iter_mut()
            .find(|d| d.device_id == device_id)
            .ok_or(AuthError::DeviceNotFound)?;
        d.revoked_at = Some(now_secs());
        d.previous_token_hash = None;
        d.previous_token_expires_at = None;
        // Invalidate current hash by re-hashing random junk (token never recoverable)
        d.token_hash = hash_token(&random_hex(TOKEN_BYTES));
        self.persist()
    }

    pub fn rotate_device_token(&mut self, device_id: &str) -> Result<String, AuthError> {
        let d = self
            .data
            .devices
            .iter_mut()
            .find(|d| d.device_id == device_id && !d.is_revoked())
            .ok_or(AuthError::DeviceNotFound)?;
        let new_token = random_hex(TOKEN_BYTES);
        d.previous_token_hash = Some(d.token_hash.clone());
        d.previous_token_expires_at = Some(now_secs() + 300);
        d.token_hash = hash_token(&new_token);
        self.persist()?;
        Ok(new_token)
    }

    pub fn list_devices(&self) -> Vec<DeviceRecord> {
        self.data.devices.clone()
    }

    pub fn pairing_status(&self) -> Option<&PairingSession> {
        self.data.pairing.as_ref()
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Reload from disk (after restart simulation in tests / multi-process).
    pub fn reload(&mut self) -> Result<(), AuthError> {
        let text = std::fs::read_to_string(&self.path).map_err(|e| AuthError::Io(e.to_string()))?;
        self.data = serde_json::from_str(&text).unwrap_or_default();
        self.admin_token_plain = None;
        Ok(())
    }
}

pub fn pairing_ttl() -> Duration {
    Duration::from_secs(PAIRING_TTL_SECS)
}

pub fn pairing_max_attempts() -> u32 {
    PAIRING_MAX_ATTEMPTS
}

/// Track idempotent clientRequestId to reject replay of send/interaction.
#[derive(Debug, Default)]
pub struct IdempotencyCache {
    /// request_id -> (device_id, response_fingerprint)
    seen: HashMap<String, (String, String)>,
}

impl IdempotencyCache {
    pub fn check_or_insert(
        &mut self,
        client_request_id: &str,
        device_id: &str,
        fingerprint: &str,
    ) -> IdempotencyResult {
        if client_request_id.is_empty() {
            return IdempotencyResult::MissingId;
        }
        match self.seen.get(client_request_id) {
            Some((dev, fp)) if dev == device_id && fp == fingerprint => {
                IdempotencyResult::ReplaySame
            }
            Some(_) => IdempotencyResult::ReplayConflict,
            None => {
                self.seen.insert(
                    client_request_id.to_string(),
                    (device_id.to_string(), fingerprint.to_string()),
                );
                // Bound size simply
                if self.seen.len() > 10_000 {
                    self.seen.clear();
                }
                IdempotencyResult::Fresh
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum IdempotencyResult {
    Fresh,
    ReplaySame,
    ReplayConflict,
    MissingId,
}
