//! Safe storage for attachments created by the assistant-ui composer.
//!
//! The WebView sends the bytes as a base64 string (or a data URL).  The
//! command never accepts a directory from the client: every attachment is
//! written below the application's private `attachments` directory with a
//! sanitized basename and an atomically-created unique filename.

use base64::Engine as _;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

/// Keep IPC and on-disk writes bounded.  This matches the attachment-sized
/// payloads accepted elsewhere in Atelier while leaving room for PDFs and
/// screenshots without allowing an accidental multi-gigabyte allocation.
pub const MAX_CHAT_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;

static NEXT_ATTACHMENT_NONCE: AtomicU64 = AtomicU64::new(0);

fn sanitize_filename(input: &str) -> String {
    // Treat both separators as path separators even when the command is run
    // on macOS.  A client can therefore never smuggle a parent directory in
    // through a Windows-style name.
    let component = input.rsplit(['/', '\\']).next().unwrap_or(input);
    let cleaned: String = component
        .chars()
        .filter(|character| !character.is_control() && !matches!(character, '/' | '\\' | ':'))
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    let bounded: String = trimmed.chars().take(96).collect();
    if bounded.is_empty() || bounded == "." || bounded == ".." {
        "attachment".to_owned()
    } else {
        bounded
    }
}

fn unique_filename(name: &str, timestamp_ms: u128, nonce: u64) -> String {
    let safe = sanitize_filename(name);
    let path = Path::new(&safe);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    format!("{stem}-{timestamp_ms}-{nonce}{extension}")
}

fn decode_payload(payload: &str) -> Result<Vec<u8>, String> {
    let payload = payload.trim();
    let encoded = if let Some(data_url) = payload.strip_prefix("data:") {
        let (header, body) = data_url
            .split_once(',')
            .ok_or_else(|| "attachment data URL is missing its payload".to_owned())?;
        if !header
            .split(';')
            .any(|part| part.eq_ignore_ascii_case("base64"))
        {
            return Err("attachment data URL must use base64".to_owned());
        }
        body
    } else {
        payload
    };

    // Reject obviously oversized input before base64 allocates its output.
    let estimated_size = encoded.len().saturating_mul(3) / 4;
    if estimated_size > MAX_CHAT_ATTACHMENT_BYTES + 2 {
        return Err(format!(
            "attachment exceeds the {} MiB limit",
            MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)
        ));
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| format!("invalid attachment base64: {error}"))?;
    if bytes.len() > MAX_CHAT_ATTACHMENT_BYTES {
        return Err(format!(
            "attachment exceeds the {} MiB limit",
            MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)
        ));
    }
    Ok(bytes)
}

/// Write bytes below `app_data_dir/attachments` without replacing an
/// existing file.  This pure helper is kept separate from the Tauri command
/// so its path and overwrite guarantees can be tested without launching the
/// desktop application.
pub(crate) fn save_chat_attachment_bytes(
    app_data_dir: &Path,
    name: &str,
    bytes: &[u8],
) -> Result<PathBuf, String> {
    if bytes.len() > MAX_CHAT_ATTACHMENT_BYTES {
        return Err(format!(
            "attachment exceeds the {} MiB limit",
            MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)
        ));
    }

    let directory = app_data_dir.join("attachments");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create attachment directory: {error}"))?;

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    // `create_new` is the important part of the no-overwrite guarantee.  The
    // nonce also keeps concurrent WebView calls distinct when they share a
    // millisecond timestamp.
    for _ in 0..32 {
        let nonce = NEXT_ATTACHMENT_NONCE.fetch_add(1, Ordering::Relaxed);
        let candidate = directory.join(unique_filename(name, timestamp_ms, nonce));
        let mut file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("could not create attachment file: {error}")),
        };

        let write_result = file.write_all(bytes).and_then(|_| file.sync_all());
        if let Err(error) = write_result {
            let _ = fs::remove_file(&candidate);
            return Err(format!("could not write attachment file: {error}"));
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Err(error) = fs::set_permissions(&candidate, fs::Permissions::from_mode(0o600)) {
                let _ = fs::remove_file(&candidate);
                return Err(format!("could not protect attachment file: {error}"));
            }
        }

        return Ok(candidate);
    }

    Err("could not allocate a unique attachment filename".to_owned())
}

/// Persist one browser attachment and return its private absolute path.
/// `base64` may be a raw standard base64 payload or a `data:*;base64,...`
/// URL.  The MIME header is intentionally not decoded here; PDFs and other
/// binary formats remain opaque bytes for the model/runtime layer.
#[tauri::command]
pub fn save_chat_attachment(
    app: AppHandle,
    name: String,
    base64: String,
) -> Result<String, String> {
    let bytes = decode_payload(&base64)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("could not resolve app data directory: {error}"))?;
    let path = save_chat_attachment_bytes(&app_data_dir, &name, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn strips_path_components_and_control_characters() {
        let root = tempdir().unwrap();
        let attachment_dir = root.path().join("attachments");
        let path =
            save_chat_attachment_bytes(root.path(), "../../private\\notes\n.pdf", b"pdf").unwrap();
        assert_eq!(path.parent(), Some(attachment_dir.as_path()));
        assert_eq!(fs::read(&path).unwrap(), b"pdf");
        assert!(!path.to_string_lossy().contains("private/"));
        assert!(path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .ends_with(".pdf"));
    }

    #[test]
    fn uses_distinct_files_without_overwriting() {
        let root = tempdir().unwrap();
        let first = save_chat_attachment_bytes(root.path(), "report.txt", b"one").unwrap();
        let second = save_chat_attachment_bytes(root.path(), "report.txt", b"two").unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(first).unwrap(), b"one");
        assert_eq!(fs::read(second).unwrap(), b"two");
    }

    #[test]
    fn decodes_raw_and_data_url_payloads() {
        assert_eq!(decode_payload("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(
            decode_payload("data:application/pdf;base64,aGVsbG8=").unwrap(),
            b"hello"
        );
        assert!(decode_payload("data:application/pdf,hello").is_err());
    }

    #[test]
    fn rejects_oversized_bytes_before_writing() {
        let root = tempdir().unwrap();
        let bytes = vec![0_u8; MAX_CHAT_ATTACHMENT_BYTES + 1];
        let error = save_chat_attachment_bytes(root.path(), "large.bin", &bytes).unwrap_err();
        assert!(error.contains("limit"));
        assert!(!root.path().join("attachments").exists());
    }
}
