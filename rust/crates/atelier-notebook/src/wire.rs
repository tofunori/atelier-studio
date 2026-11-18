//! Protocole de messagerie Jupyter v5.3 sur trames multipart ZeroMQ :
//! `[identités…, b"<IDS|MSG>", hmac_sha256_hex, header, parent_header, metadata, content, buffers…]`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};

pub const DELIMITER: &[u8] = b"<IDS|MSG>";
pub const PROTOCOL_VERSION: &str = "5.3";

static NEXT_MSG_SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionFile {
    pub transport: String,
    pub ip: String,
    pub shell_port: u16,
    pub iopub_port: u16,
    pub stdin_port: u16,
    pub control_port: u16,
    pub hb_port: u16,
    pub signature_scheme: String,
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kernel_name: Option<String>,
}

impl ConnectionFile {
    pub fn shell_addr(&self) -> String {
        format!("{}:{}", self.ip, self.shell_port)
    }
    pub fn iopub_addr(&self) -> String {
        format!("{}:{}", self.ip, self.iopub_port)
    }
    pub fn stdin_addr(&self) -> String {
        format!("{}:{}", self.ip, self.stdin_port)
    }
    pub fn control_addr(&self) -> String {
        format!("{}:{}", self.ip, self.control_port)
    }
    pub fn hb_addr(&self) -> String {
        format!("{}:{}", self.ip, self.hb_port)
    }
}

/// HMAC-SHA256 conforme RFC 2104 (sur `sha2::Sha256`, sans crate externe).
pub fn hmac_sha256(key: &[u8], chunks: &[&[u8]]) -> [u8; 32] {
    let mut k_block = [0u8; 64];
    if key.len() > 64 {
        let mut h = Sha256::new();
        h.update(key);
        let hashed = h.finalize();
        k_block[..32].copy_from_slice(&hashed);
    } else {
        k_block[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= k_block[i];
        opad[i] ^= k_block[i];
    }

    let mut inner = Sha256::new();
    inner.update(ipad);
    for chunk in chunks {
        inner.update(chunk);
    }
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_digest);
    let final_digest = outer.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&final_digest);
    out
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[derive(Debug, Clone)]
pub struct JupyterMessage {
    pub identities: Vec<Vec<u8>>,
    pub header: Value,
    pub parent_header: Value,
    pub metadata: Value,
    pub content: Value,
    pub buffers: Vec<Vec<u8>>,
}

impl JupyterMessage {
    pub fn new_request(session: &str, msg_type: &str, content: Value) -> Self {
        let seq = NEXT_MSG_SEQ.fetch_add(1, Ordering::Relaxed);
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Micros, true);
        let msg_id = format!("{session}-{seq}");
        Self {
            identities: Vec::new(),
            header: json!({
                "msg_id": msg_id,
                "username": "atelier",
                "session": session,
                "date": now,
                "msg_type": msg_type,
                "version": PROTOCOL_VERSION,
            }),
            parent_header: json!({}),
            metadata: json!({}),
            content,
            buffers: Vec::new(),
        }
    }

    pub fn msg_id(&self) -> &str {
        self.header
            .get("msg_id")
            .and_then(Value::as_str)
            .unwrap_or("")
    }

    pub fn parent_msg_id(&self) -> Option<&str> {
        self.parent_header
            .get("msg_id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
    }

    pub fn msg_type(&self) -> &str {
        self.header
            .get("msg_type")
            .and_then(Value::as_str)
            .unwrap_or("")
    }

    pub fn encode(&self, hmac_key: &[u8]) -> Vec<Vec<u8>> {
        let hdr = serde_json::to_vec(&self.header).unwrap_or_else(|_| b"{}".to_vec());
        let parent = serde_json::to_vec(&self.parent_header).unwrap_or_else(|_| b"{}".to_vec());
        let meta = serde_json::to_vec(&self.metadata).unwrap_or_else(|_| b"{}".to_vec());
        let body = serde_json::to_vec(&self.content).unwrap_or_else(|_| b"{}".to_vec());

        let sig_hex = if hmac_key.is_empty() {
            Vec::new()
        } else {
            let mac = hmac_sha256(hmac_key, &[&hdr, &parent, &meta, &body]);
            hex::encode(mac).into_bytes()
        };

        let mut frames = Vec::with_capacity(self.identities.len() + 6 + self.buffers.len());
        frames.extend(self.identities.iter().cloned());
        frames.push(DELIMITER.to_vec());
        frames.push(sig_hex);
        frames.push(hdr);
        frames.push(parent);
        frames.push(meta);
        frames.push(body);
        frames.extend(self.buffers.iter().cloned());
        frames
    }

    pub fn decode(frames: &[Vec<u8>], hmac_key: &[u8]) -> Result<Self, String> {
        let delim_pos = frames
            .iter()
            .position(|f| f.as_slice() == DELIMITER)
            .ok_or_else(|| "délimiteur <IDS|MSG> introuvable".to_string())?;

        if frames.len() < delim_pos + 6 {
            return Err("message Jupyter incomplet (< 5 trames après délimiteur)".into());
        }

        let sig = &frames[delim_pos + 1];
        let hdr_bytes = &frames[delim_pos + 2];
        let parent_bytes = &frames[delim_pos + 3];
        let meta_bytes = &frames[delim_pos + 4];
        let content_bytes = &frames[delim_pos + 5];

        if !hmac_key.is_empty() {
            let expected = hex::encode(hmac_sha256(
                hmac_key,
                &[hdr_bytes, parent_bytes, meta_bytes, content_bytes],
            ));
            if !constant_time_eq(sig, expected.as_bytes()) {
                return Err("signature HMAC-SHA256 Jupyter invalide".into());
            }
        }

        let header: Value =
            serde_json::from_slice(hdr_bytes).map_err(|e| format!("header JSON : {e}"))?;
        let parent_header: Value = serde_json::from_slice(parent_bytes)
            .map_err(|e| format!("parent_header JSON : {e}"))?;
        let metadata: Value =
            serde_json::from_slice(meta_bytes).map_err(|e| format!("metadata JSON : {e}"))?;
        let content: Value =
            serde_json::from_slice(content_bytes).map_err(|e| format!("content JSON : {e}"))?;

        Ok(Self {
            identities: frames[..delim_pos].to_vec(),
            header,
            parent_header,
            metadata,
            content,
            buffers: frames[(delim_pos + 6)..].to_vec(),
        })
    }
}

/// Expression Python évaluée silencieusement via `user_expressions` sur `execute_request`
/// (`silent: true`, `store_history: false`) afin d'inspecter les variables en mémoire
/// sans incrémenter `In [n]` ni polluer `Out [n]`.
pub const PYTHON_VARIABLES_EXPR: &str = r#"__import__('json').dumps([{"name": _k, "type": type(_v).__name__, "shape": (f"{_v.shape[0]} × {_v.shape[1]}" if hasattr(_v, "shape") and isinstance(getattr(_v, "shape", None), tuple) and len(_v.shape) == 2 else (str(tuple(_v.shape)) if hasattr(_v, "shape") and isinstance(getattr(_v, "shape", None), tuple) else (f"{len(_v)} élém." if isinstance(_v, (list, dict, tuple, set)) else ""))), "sizeBytes": (int(_v.nbytes) if hasattr(_v, "nbytes") and isinstance(getattr(_v, "nbytes", None), int) else int(__import__('sys').getsizeof(_v))), "preview": repr(_v)[:120]} for _k, _v in list(globals().items()) if not _k.startswith('_') and _k not in ('In', 'Out', 'get_ipython', 'exit', 'quit', 'open') and not isinstance(_v, type(__import__('sys'))) and not callable(_v)][:80])"#;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveVariable {
    pub name: String,
    #[serde(rename = "type")]
    pub var_type: String,
    #[serde(default)]
    pub shape: String,
    #[serde(default)]
    pub size_bytes: u64,
    #[serde(default)]
    pub preview: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc4231_hmac_sha256_vector_2() {
        // RFC 4231 Test Case 2 : key = "Jefe", data = "what do ya want for nothing?"
        let mac = hmac_sha256(b"Jefe", &[b"what do ya ", b"want for nothing?"]);
        assert_eq!(
            hex::encode(mac),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn jupyter_message_roundtrip_and_tamper_rejection() {
        let key = b"secret-session-key";
        let msg = JupyterMessage::new_request(
            "sess-1",
            "execute_request",
            json!({ "code": "x = 1 + 1", "silent": false }),
        );
        let mut frames = msg.encode(key);
        let decoded = JupyterMessage::decode(&frames, key).unwrap();
        assert_eq!(decoded.msg_type(), "execute_request");
        assert_eq!(decoded.content["code"], "x = 1 + 1");

        // Toute altération d'un octet du corps doit être rejetée par HMAC.
        let last = frames.len() - 1;
        frames[last].push(b' ');
        assert!(JupyterMessage::decode(&frames, key).is_err());
    }
}
