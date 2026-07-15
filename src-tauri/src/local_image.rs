use std::fs;
use std::path::{Path, PathBuf};

const MAX_PREVIEW_BYTES: u64 = 64 * 1024 * 1024;

fn supported_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg"
    )
}

fn valid_image_signature(path: &Path, bytes: &[u8]) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        "svg" => {
            let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]);
            let trimmed = prefix.trim_start_matches('\u{feff}').trim_start();
            trimmed.starts_with("<svg") || (trimmed.starts_with("<?xml") && trimmed.contains("<svg"))
        }
        _ => false,
    }
}

#[tauri::command]
pub fn local_image_read(path: String) -> Result<tauri::ipc::Response, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err("Image preview path must be absolute".into());
    }
    if !supported_extension(&path) {
        return Err("Unsupported image preview format".into());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("Could not inspect image: {error}"))?;
    if !metadata.is_file() {
        return Err("Image preview path is not a file".into());
    }
    if metadata.len() > MAX_PREVIEW_BYTES {
        return Err("Image preview is larger than 64 MiB".into());
    }
    let bytes = fs::read(&path).map_err(|error| format!("Could not read image: {error}"))?;
    if !valid_image_signature(&path, &bytes) {
        return Err("Image preview signature does not match its format".into());
    }
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn validates_supported_signatures() {
        let dir = tempdir().expect("tempdir");
        let png = dir.path().join("figure.png");
        fs::write(&png, b"\x89PNG\r\n\x1a\nbody").expect("png fixture");
        assert!(valid_image_signature(&png, &fs::read(&png).unwrap()));

        let fake = dir.path().join("fake.png");
        fs::write(&fake, b"not an image").expect("fake fixture");
        assert!(!valid_image_signature(&fake, &fs::read(&fake).unwrap()));
    }
}
