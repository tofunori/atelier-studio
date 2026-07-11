//! Durable application state — same on-disk formats as the Node sidecar.
//!
//! Paths under `~/Library/Application Support/atelier-studio/` unless overridden.

mod highlights;
mod journal;
mod ledger;
mod settings;
mod threads;

pub use highlights::{Highlight, HighlightStore};
pub use journal::HarnessJournal;
pub use ledger::{append_ledger, get_ledger, slug_for};
pub use settings::{read_settings, write_settings};
pub use threads::{Thread, ThreadStore};

/// Atomic write matching Node `writeFileAtomic` (tmp + rename).
pub fn write_file_atomic(path: &std::path::Path, data: impl AsRef<[u8]>) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = path.with_extension(format!("{pid}.{nanos}.tmp"));
    std::fs::write(&tmp, data.as_ref())?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })?;
    Ok(())
}

pub fn iso_now() -> String {
    // Same style as atelier-runtime / Node Date.toISOString
    let d = std::time::SystemTime::now()
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
