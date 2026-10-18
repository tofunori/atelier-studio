//! Durable application state — same on-disk formats as the Node sidecar.
//!
//! Paths under `~/Library/Application Support/atelier-studio/` unless overridden.

mod agent_mailbox;
mod automations;
pub mod context_projection;
pub mod durable;
mod highlights;
mod journal;
mod ledger;
mod memories;
pub mod pdf_annots;
mod receipts;
mod reviews;
mod reverse_lines;
mod settings;
mod threads;

pub use agent_mailbox::{AgentMailboxStore, MailboxMessage};
pub use automations::{Automation, AutomationRun, AutomationStore};
pub use context_projection::{build_child_envelope, project_events};
pub use highlights::{Highlight, HighlightStore};
pub use journal::{HarnessJournal, JournalError};
pub use ledger::{append_ledger, get_all_ledgers, get_ledger, project_id, slug_for};
pub use memories::{
    fold as fold_memory_text, ImportReport, ImportedMemory, Memory, MemoryOrigin, MemoryQuery,
    MemoryStore, MEMORY_TEXT_MAX,
};
pub use receipts::{request_fingerprint, CommandReceipt, CommandReceiptStore, ReceiptError, ReceiptReservation};
pub use reviews::{
    canonical_sha256, dedup_key, evidence_sha256, hash_config, hash_input, new_review_id, now_iso,
    RequiredCheck, ReviewCheck, ReviewConfig, ReviewErrorInfo, ReviewEvidence, ReviewInput,
    ReviewPolicy, ReviewRecord, ReviewReservation, ReviewStore, ReviewStoreError,
    REVIEW_PROTOCOL_VERSION, REVIEW_SCHEMA_VERSION,
};
pub use reverse_lines::ReverseLines;
pub use settings::{load_settings, read_settings, write_settings};
pub use threads::{AgentLink, Thread, ThreadStore};

/// Atomic write (tmp + rename) with a stable-storage boundary: the temporary
/// file is fsynced before the rename and the directory after it
/// (`durable::write_durable`). A crash right after the call can no longer
/// leave an empty or torn preferences, highlights or memories file.
pub fn write_file_atomic(path: &std::path::Path, data: impl AsRef<[u8]>) -> std::io::Result<()> {
    durable::write_durable(path, data.as_ref())
}

/// Same as [`write_file_atomic`]; kept for the receipts and journal callers
/// that asked for durability explicitly before every atomic write had it.
pub fn write_file_atomic_durable(
    path: &std::path::Path,
    data: impl AsRef<[u8]>,
) -> std::io::Result<()> {
    durable::write_durable(path, data.as_ref())
}

pub fn iso_now() -> String {
    iso_at(std::time::SystemTime::now())
}

pub fn iso_at(now: std::time::SystemTime) -> String {
    // Same style as atelier-runtime / Node Date.toISOString
    let d = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs() as i64;
    let millis = d.subsec_millis();
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let tod = secs.rem_euclid(86_400) as u32;
    let h = tod / 3600;
    let mi = (tod % 3600) / 60;
    let s = tod % 60;
    format!("{y:04}-{m:02}-{day:02}T{h:02}:{mi:02}:{s:02}.{millis:03}Z")
}
