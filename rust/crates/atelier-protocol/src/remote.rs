//! Remote/mobile wire envelopes (plan 034 jalon B).
//! Shared semantics with `packages/atelier-protocol` (TypeScript).
//! The desktop sidecar may ignore these until the gateway (jalon C) mounts them.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Wire protocol version (distinct from harness meta `schemaVersion`).
pub const PROTOCOL_VERSION: u32 = 1;
pub const MIN_PROTOCOL_VERSION: u32 = 1;
pub const MAX_PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientHello {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub protocol_version: u32,
    pub client_instance_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerHello {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub protocol_version: u32,
    pub min_protocol_version: u32,
    pub max_protocol_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service: Option<String>,
}

impl ServerHello {
    pub fn new(backend: impl Into<String>) -> Self {
        Self {
            msg_type: "serverHello".into(),
            protocol_version: PROTOCOL_VERSION,
            min_protocol_version: MIN_PROTOCOL_VERSION,
            max_protocol_version: MAX_PROTOCOL_VERSION,
            backend: Some(backend.into()),
            service: Some("atelier-remote".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolError {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_protocol_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_protocol_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_version: Option<u32>,
}

impl ProtocolError {
    pub fn version_unsupported(client_version: u32) -> Self {
        Self {
            msg_type: "error".into(),
            code: "protocol_version_unsupported".into(),
            message: format!(
                "client protocolVersion={client_version} hors plage [{MIN_PROTOCOL_VERSION}, {MAX_PROTOCOL_VERSION}]"
            ),
            thread_id: None,
            min_protocol_version: Some(MIN_PROTOCOL_VERSION),
            max_protocol_version: Some(MAX_PROTOCOL_VERSION),
            client_version: Some(client_version),
        }
    }

    pub fn missing_field(field: &str) -> Self {
        Self {
            msg_type: "error".into(),
            code: "missing_field".into(),
            message: format!("champ obligatoire absent: {field}"),
            thread_id: None,
            min_protocol_version: None,
            max_protocol_version: None,
            client_version: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum NegotiateResult {
    Ok { negotiated: u32 },
    Unsupported { client_version: u32 },
}

pub fn negotiate_protocol_version(client_version: u32) -> NegotiateResult {
    if client_version < MIN_PROTOCOL_VERSION || client_version > MAX_PROTOCOL_VERSION {
        NegotiateResult::Unsupported { client_version }
    } else {
        NegotiateResult::Ok {
            negotiated: client_version,
        }
    }
}

/// Harness event meta schema v1 (plan 025) — camelCase on the wire.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HarnessEventMeta {
    pub schema_version: u32,
    pub event_id: String,
    pub provider: String,
    pub thread_id: String,
    pub turn_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
    pub sequence: u64,
    pub ts: i64,
    pub durable: bool,
    pub origin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GetHistory {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after_sequence: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub thread_id: String,
    pub events: Vec<Value>,
    pub from_sequence: u64,
    pub to_sequence: u64,
    pub complete: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot_required: Option<bool>,
}

/// Validate required meta fields on a JSON event object.
pub fn validate_event_meta(event: &Value) -> Result<HarnessEventMeta, ProtocolError> {
    let meta = event
        .get("meta")
        .ok_or_else(|| ProtocolError::missing_field("meta"))?;
    serde_json::from_value::<HarnessEventMeta>(meta.clone()).map_err(|e| ProtocolError {
        msg_type: "error".into(),
        code: "invalid_payload".into(),
        message: format!("meta invalide: {e}"),
        thread_id: None,
        min_protocol_version: None,
        max_protocol_version: None,
        client_version: None,
    })
}

/// Idempotent set of eventIds + contiguous last_sequence tracking.
#[derive(Debug, Default, Clone)]
pub struct SequenceCursor {
    pub last_sequence: u64,
    pub seen_event_ids: std::collections::HashSet<String>,
}

pub struct ApplyBatchResult {
    pub cursor: SequenceCursor,
    pub applied: usize,
    pub duplicates: usize,
    pub gaps: Vec<u64>,
}

pub fn apply_event_batch(mut cursor: SequenceCursor, events: &[Value]) -> ApplyBatchResult {
    let mut duplicates = 0usize;
    let mut applied = 0usize;
    let mut seqs: Vec<u64> = Vec::new();

    for ev in events {
        if let Some(meta) = ev.get("meta") {
            if let Some(id) = meta.get("eventId").and_then(|v| v.as_str()) {
                if !cursor.seen_event_ids.insert(id.to_string()) {
                    duplicates += 1;
                    continue;
                }
            }
            if let Some(seq) = meta.get("sequence").and_then(|v| v.as_u64()) {
                seqs.push(seq);
            }
        }
        applied += 1;
    }

    seqs.sort_unstable();
    let max = seqs.last().copied().unwrap_or(cursor.last_sequence);
    let mut gaps = Vec::new();
    for s in (cursor.last_sequence + 1)..=max {
        if !seqs.contains(&s) {
            gaps.push(s);
        }
    }

    // Contiguous advance
    let mut last = cursor.last_sequence;
    for s in &seqs {
        if *s == last + 1 {
            last = *s;
        } else if *s > last + 1 {
            break;
        }
    }
    if gaps.is_empty() && !seqs.is_empty() {
        last = max;
    }
    cursor.last_sequence = last;

    ApplyBatchResult {
        cursor,
        applied,
        duplicates,
        gaps,
    }
}

/// Filter events with sequence > after_sequence.
pub fn slice_after(events: &[Value], after_sequence: u64) -> Vec<Value> {
    let mut out: Vec<Value> = events
        .iter()
        .filter(|ev| {
            ev.get("meta")
                .and_then(|m| m.get("sequence"))
                .and_then(|s| s.as_u64())
                .map(|s| s > after_sequence)
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    out.sort_by_key(|ev| {
        ev.get("meta")
            .and_then(|m| m.get("sequence"))
            .and_then(|s| s.as_u64())
            .unwrap_or(0)
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn negotiate_accepts_v1() {
        assert_eq!(
            negotiate_protocol_version(1),
            NegotiateResult::Ok { negotiated: 1 }
        );
    }

    #[test]
    fn negotiate_rejects_future() {
        assert_eq!(
            negotiate_protocol_version(9),
            NegotiateResult::Unsupported { client_version: 9 }
        );
        let err = ProtocolError::version_unsupported(9);
        let v = serde_json::to_value(&err).unwrap();
        assert_eq!(v["type"], "error");
        assert_eq!(v["code"], "protocol_version_unsupported");
        assert_eq!(v["clientVersion"], 9);
        assert_eq!(v["minProtocolVersion"], 1);
    }

    #[test]
    fn server_hello_camel_case() {
        let h = ServerHello::new("fixture");
        let v = serde_json::to_value(&h).unwrap();
        assert_eq!(v["type"], "serverHello");
        assert_eq!(v["protocolVersion"], 1);
        assert_eq!(v["minProtocolVersion"], 1);
        assert_eq!(v["maxProtocolVersion"], 1);
    }

    #[test]
    fn client_hello_roundtrip() {
        let raw = json!({
            "type": "clientHello",
            "protocolVersion": 1,
            "clientInstanceId": "phone-1",
            "clientKind": "mobile",
            "futureField": true
        });
        // flatten unknown: we only deserialize known fields
        let hello: ClientHello = serde_json::from_value(raw).unwrap();
        assert_eq!(hello.protocol_version, 1);
        assert_eq!(hello.client_instance_id, "phone-1");
    }

    #[test]
    fn apply_batch_dedup_and_gaps() {
        let events = vec![
            json!({"kind":"text","text":"a","meta":{
                "schemaVersion":1,"eventId":"e1","provider":"claude","threadId":"t",
                "turnId":"u","sequence":1,"ts":1,"durable":true,"origin":"provider"
            }}),
            json!({"kind":"text","text":"a","meta":{
                "schemaVersion":1,"eventId":"e1","provider":"claude","threadId":"t",
                "turnId":"u","sequence":1,"ts":1,"durable":true,"origin":"provider"
            }}),
            json!({"kind":"text","text":"b","meta":{
                "schemaVersion":1,"eventId":"e3","provider":"claude","threadId":"t",
                "turnId":"u","sequence":3,"ts":3,"durable":true,"origin":"provider"
            }}),
        ];
        let r = apply_event_batch(SequenceCursor::default(), &events);
        assert_eq!(r.duplicates, 1);
        assert_eq!(r.gaps, vec![2]);
        assert_eq!(r.cursor.last_sequence, 1);
    }

    #[test]
    fn slice_after_sequence() {
        let events = vec![
            json!({"kind":"text","meta":{"eventId":"a","sequence":1}}),
            json!({"kind":"text","meta":{"eventId":"b","sequence":2}}),
            json!({"kind":"text","meta":{"eventId":"c","sequence":3}}),
        ];
        let sliced = slice_after(&events, 1);
        assert_eq!(sliced.len(), 2);
        assert_eq!(sliced[0]["meta"]["sequence"], 2);
    }

    #[test]
    fn shared_fixture_small_transcript_if_present() {
        // packages/atelier-protocol/fixtures/small-transcript.json (relative to crate)
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/atelier-protocol/fixtures/small-transcript.json"
        );
        let Ok(data) = std::fs::read_to_string(path) else {
            // Fixture not generated yet — skip soft
            eprintln!("skip: small-transcript.json missing at {path}");
            return;
        };
        let v: Value = serde_json::from_str(&data).expect("fixture json");
        let events = v
            .get("events")
            .and_then(|e| e.as_array())
            .expect("events array");
        assert!(!events.is_empty());
        for ev in events {
            if ev.get("meta").is_some() {
                let meta = validate_event_meta(ev).expect("meta valid");
                assert_eq!(meta.schema_version, 1);
                assert!(!meta.event_id.is_empty());
            }
        }
        let r = apply_event_batch(SequenceCursor::default(), events);
        assert_eq!(r.duplicates, 0);
        assert!(r.gaps.is_empty(), "gaps={:?}", r.gaps);
        let last = v["lastSequence"].as_u64().unwrap();
        assert_eq!(r.cursor.last_sequence, last);
    }
}
