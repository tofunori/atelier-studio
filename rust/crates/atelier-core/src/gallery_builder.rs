use crate::{ARTIFACT_EXTENSIONS, CoreError, EXCLUDED_DIRECTORIES, atomic_write};
use chrono::{DateTime, Local};
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, UNIX_EPOCH},
};
use walkdir::{DirEntry, WalkDir};

const SELF_NAME: &str = "figures_index.html";
const SCRIPT_EXTS: &[&str] = &["py", "r", "jl", "sh", "rs"];
const CODE_EXTS: &[&str] = &["py", "r", "jl", "sh", "rs", "tex", "md", "csv"];
const ARCHIVE_HINTS: &[&str] = &[
    "_archive",
    "menage_",
    "/tmp/",
    "tmp_dir",
    "/tmp",
    "raqdps_tests",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GalleryRow {
    pub thumb: Option<String>,
    pub code: bool,
    pub name: String,
    pub rel: String,
    pub folder: String,
    pub ext: String,
    pub mtime: u64,
    pub btime: u64,
    pub mdate: String,
    pub bdate: String,
    pub size: u64,
    pub archive: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct GalleryBuildOptions {
    pub root: PathBuf,
    pub template: PathBuf,
    pub title: String,
    pub extensions: Option<BTreeSet<String>>,
    pub show_frames: bool,
    pub no_thumbs: bool,
}

#[derive(Debug, Clone)]
pub struct GalleryBuildResult {
    pub count: usize,
    pub index: PathBuf,
    pub data: PathBuf,
}

fn is_frames_dir(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    matches!(n.as_str(), "frames" | "frame")
        || n.ends_with("_frames")
        || n.ends_with("_frame")
        || n.contains("html_frames")
}

fn include_entry(entry: &DirEntry, root: &Path, show_frames: bool) -> bool {
    if entry.path() == root {
        return true;
    }
    if entry.file_type().is_dir() {
        let name = entry.file_name().to_string_lossy();
        if EXCLUDED_DIRECTORIES
            .iter()
            .any(|excluded| *excluded == name)
        {
            return false;
        }
        if !show_frames && is_frames_dir(&name) {
            return false;
        }
    }
    true
}

fn epoch(meta: &fs::Metadata, created: bool) -> u64 {
    let value = if created {
        meta.created()
    } else {
        meta.modified()
    };
    value
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn local_date(epoch: u64) -> String {
    let time = UNIX_EPOCH + std::time::Duration::from_secs(epoch);
    let date: DateTime<Local> = time.into();
    date.format("%Y-%m-%d %H:%M").to_string()
}

fn normalized_rel(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

pub fn scan(options: &GalleryBuildOptions) -> Result<Vec<GalleryRow>, CoreError> {
    let root = fs::canonicalize(&options.root)?;
    let extensions = options.extensions.clone().unwrap_or_else(|| {
        ARTIFACT_EXTENSIONS
            .iter()
            .map(|ext| (*ext).to_string())
            .collect()
    });
    let mut rows = Vec::new();
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| include_entry(entry, &root, options.show_frames))
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name == SELF_NAME || name.starts_with("~$") {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !extensions.contains(&ext) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let rel = normalized_rel(&root, path);
        let folder = path
            .parent()
            .map(|parent| normalized_rel(&root, parent))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| ".".to_string());
        let mtime = epoch(&metadata, false);
        let created = epoch(&metadata, true);
        let btime = if created == 0 { mtime } else { created };
        let lower = rel.to_ascii_lowercase();
        rows.push(GalleryRow {
            thumb: None,
            code: CODE_EXTS.contains(&ext.as_str()),
            name,
            rel,
            folder,
            ext,
            mtime,
            btime,
            mdate: local_date(mtime),
            bdate: local_date(btime),
            size: metadata.len(),
            archive: ARCHIVE_HINTS.iter().any(|hint| lower.contains(hint)),
            provenance: None,
        });
    }
    if !options.no_thumbs {
        build_thumbnails(&root, &mut rows);
    }
    rows.sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.rel.cmp(&b.rel)));
    Ok(rows)
}

fn command_success_with_timeout(command: &mut Command, timeout: Duration) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Put thumbnail helpers in their own process group so a timed-out
        // QuickLook/sips subprocess cannot survive its parent.
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    let Ok(mut child) = command.spawn() else {
        return false;
    };
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => break,
        }
    }
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = child.kill();
    let _ = child.wait();
    false
}

fn image_thumb_key(path: &Path, mtime: u64) -> String {
    let mut hash = Md5::new();
    hash.update(format!("{}:{mtime}:480", path.to_string_lossy()));
    hex::encode(hash.finalize())
}

fn safe_cache_dir(root: &Path) -> Option<PathBuf> {
    let root = fs::canonicalize(root).ok()?;
    let cache = root.join(".fig_thumbs");
    if cache.exists() {
        let metadata = fs::symlink_metadata(&cache).ok()?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return None;
        }
    } else {
        fs::create_dir(&cache).ok()?;
    }
    let canonical = fs::canonicalize(&cache).ok()?;
    canonical.starts_with(&root).then_some(canonical)
}

fn regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
}

fn temporary_output(suffix: &str) -> Option<(PathBuf, PathBuf)> {
    let nonce = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_nanos();
    let directory = env::temp_dir().join(format!("atelier-thumb-{}-{nonce}", std::process::id()));
    fs::create_dir(&directory).ok()?;
    let output = directory.join(format!("output.{suffix}"));
    Some((directory, output))
}

fn build_thumbnails(root: &Path, rows: &mut [GalleryRow]) {
    let Some(thumbs) = safe_cache_dir(root) else {
        return;
    };
    let mut live = BTreeSet::new();
    for row in rows.iter_mut() {
        let source = root.join(&row.rel);
        if matches!(row.ext.as_str(), "pdf" | "mp4" | "m4v" | "mov" | "webm") {
            let key = stable_thumb_key(&row.rel, row.mtime);
            live.insert(key.clone());
            let target = thumbs.join(format!("{key}.png"));
            let failed = thumbs.join(format!("{key}.fail"));
            if !regular_file(&target)
                && !regular_file(&failed)
                && let Some((temporary, _)) = temporary_output("png")
            {
                let ok = command_success_with_timeout(
                    Command::new("qlmanage")
                        .args(["-t", "-s", "480", "-o"])
                        .arg(&temporary)
                        .arg(&source)
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null()),
                    Duration::from_secs(15),
                );
                let produced = temporary.join(format!("{}.png", row.name));
                if ok && produced.is_file() {
                    let _ = fs::rename(produced, &target);
                } else {
                    let marker = temporary.join("failed");
                    if fs::write(&marker, []).is_ok() {
                        let _ = fs::rename(marker, &failed);
                    }
                }
                let _ = fs::remove_dir_all(temporary);
            }
            if regular_file(&target) {
                row.thumb = Some(format!(".fig_thumbs/{key}.png"));
            }
        } else if matches!(row.ext.as_str(), "png" | "jpg" | "jpeg") {
            let canonical = fs::canonicalize(&source).unwrap_or(source.clone());
            let key = image_thumb_key(&canonical, row.mtime);
            let target = thumbs.join(format!("imgthumb_{key}.png"));
            if !regular_file(&target)
                && let Some((temporary, output)) = temporary_output("png")
            {
                let ok = command_success_with_timeout(
                    Command::new("sips")
                        .args(["-Z", "480", "-s", "format", "png"])
                        .arg(&source)
                        .arg("--out")
                        .arg(&output)
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null()),
                    Duration::from_secs(20),
                );
                if ok && regular_file(&output) {
                    let _ = fs::rename(&output, &target);
                }
                let _ = fs::remove_dir_all(temporary);
            }
        }
    }
    if let Ok(entries) = fs::read_dir(&thumbs) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let key = name
                .strip_suffix(".png")
                .or_else(|| name.strip_suffix(".fail"));
            if regular_file(&entry.path())
                && key.is_some_and(|key| {
                    key.len() == 32
                        && key.chars().all(|c| c.is_ascii_hexdigit())
                        && !live.contains(key)
                })
            {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

fn git_commit(root: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["-C", root.to_str()?, "rev-parse", "--short", "HEAD"])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn enrich_provenance(rows: &mut [GalleryRow], root: &Path) {
    let manifest: Map<String, Value> = fs::read(root.join(".atelier-provenance.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|raw| raw.get("artifacts").cloned().or(Some(raw)))
        .and_then(|raw| raw.as_object().cloned())
        .unwrap_or_default();
    let mut scripts = BTreeMap::<String, Vec<String>>::new();
    for row in rows
        .iter()
        .filter(|row| SCRIPT_EXTS.contains(&row.ext.as_str()))
    {
        let stem = Path::new(&row.rel)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        scripts.entry(stem).or_default().push(row.rel.clone());
    }
    let commit = git_commit(root);
    for row in rows {
        let mut provenance = manifest.get(&row.rel).and_then(Value::as_object).cloned();
        if let Some(map) = provenance.as_mut() {
            let valid = map
                .get("command")
                .and_then(Value::as_array)
                .is_some_and(|args| {
                    !args.is_empty()
                        && args.len() <= 32
                        && args.iter().all(|arg| {
                            arg.as_str()
                                .is_some_and(|text| !text.is_empty() && text.len() <= 2000)
                        })
                });
            if map.contains_key("command") && !valid {
                map.remove("command");
            }
            map.insert("confidence".into(), json!("declared"));
        } else if !SCRIPT_EXTS.contains(&row.ext.as_str()) {
            let stem = Path::new(&row.rel)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if let Some(candidates) = scripts.get(stem).filter(|items| items.len() == 1) {
                provenance = Some(Map::from_iter([
                    ("generator".into(), json!(candidates[0])),
                    ("confidence".into(), json!("same-stem")),
                ]));
            }
        }
        if let Some(mut map) = provenance {
            if let Some(commit) = commit.as_ref() {
                map.entry("gitCommit").or_insert_with(|| json!(commit));
            }
            row.provenance = Some(Value::Object(map));
        }
    }
}

fn favorites(root: &Path) -> Vec<String> {
    let Some(home) = env::var_os("HOME") else {
        return Vec::new();
    };
    let directory = PathBuf::from(home).join(".cmux-favorites");
    let mut result = BTreeSet::new();
    if let Ok(entries) = fs::read_dir(directory) {
        for entry in entries.flatten() {
            if let Ok(target) = fs::canonicalize(entry.path())
                && target.starts_with(root)
            {
                result.insert(normalized_rel(root, &target));
            }
        }
    }
    result.into_iter().collect()
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn js_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "")
        .replace("</", "<\\/")
}

pub fn build(options: &GalleryBuildOptions) -> Result<GalleryBuildResult, CoreError> {
    let root = fs::canonicalize(&options.root)?;
    let mut rows = scan(options)?;
    enrich_provenance(&mut rows, &root);
    let folders: Vec<String> = rows
        .iter()
        .map(|row| row.folder.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let favs = favorites(&root);
    let now = Local::now();
    let generated = now.format("%Y-%m-%d %H:%M").to_string();
    let version = now.timestamp().to_string();
    let wordmark = html_escape(if options.title.is_empty() {
        "Atelier"
    } else {
        &options.title
    });
    let project = html_escape(
        root.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("project"),
    );
    let template = fs::read_to_string(&options.template)?;
    let json_rows = serde_json::to_string(&rows)?.replace("</", "<\\/");
    let json_folders = serde_json::to_string(&folders)?.replace("</", "<\\/");
    let json_favs = serde_json::to_string(&favs)?.replace("</", "<\\/");
    let html = template
        .replace("__TITLE__", &format!("{wordmark} · {project}"))
        .replace("__WORDMARK__", &wordmark)
        .replace("__PROJECT__", &project)
        .replace("__COUNT__", &rows.len().to_string())
        .replace("__GEN__", &generated)
        .replace("__VER__", &version)
        .replace("__DATA__", &json_rows)
        .replace("__FOLDERS__", &json_folders)
        .replace("__FAVS__", &json_favs)
        .replace("__ROOT__", &js_escape(&root.to_string_lossy()));
    if html.matches("</script>").count() != template.matches("</script>").count() {
        return Err(CoreError::Io(std::io::Error::other(
            "generated script boundary mismatch",
        )));
    }
    let index = root.join(SELF_NAME);
    atomic_write(&index, html.as_bytes())?;
    let payload = json!({
        "files": rows, "folders": folders, "favs": favs,
        "root": root, "title": format!("{wordmark} · {project}"),
        "wordmark": wordmark, "project": project, "count": rows.len(),
        "countLabel": rows.len().to_string(), "gen": generated, "ver": version,
    });
    let data = root.join("figures_data.json");
    let mut encoded = serde_json::to_vec(&payload)?;
    encoded.push(b'\n');
    atomic_write(&data, &encoded)?;
    Ok(GalleryBuildResult {
        count: rows.len(),
        index,
        data,
    })
}

pub fn parse_extensions(value: Option<&str>) -> Option<BTreeSet<String>> {
    value
        .map(|raw| {
            raw.split(|c: char| c == ',' || c.is_whitespace())
                .filter(|item| !item.is_empty())
                .map(|item| item.trim_start_matches('.').to_ascii_lowercase())
                .collect()
        })
        .filter(|set: &BTreeSet<String>| !set.is_empty())
}

pub fn stable_thumb_key(rel: &str, mtime: u64) -> String {
    let mut hash = Md5::new();
    hash.update(format!("{rel}:{mtime}"));
    hex::encode(hash.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> PathBuf {
        let root = env::temp_dir().join(format!(
            "atelier-rust-builder-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn native_builder_scans_and_escapes_project_data() {
        let root = fixture();
        fs::write(root.join("plot.png"), b"png").unwrap();
        fs::write(root.join("plot.py"), b"print('ok')").unwrap();
        fs::write(root.join("main.rs"), b"fn main() {}").unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules/ignored.png"), b"ignored").unwrap();
        let template = root.join("template.shell");
        fs::write(
            &template,
            "<script>const rows=__DATA__;const root='__ROOT__'</script>__COUNT__",
        )
        .unwrap();
        let result = build(&GalleryBuildOptions {
            root: root.clone(),
            template,
            title: "Atelier".into(),
            extensions: None,
            show_frames: false,
            no_thumbs: true,
        })
        .unwrap();
        assert_eq!(result.count, 3);
        let payload: Value = serde_json::from_slice(&fs::read(&result.data).unwrap()).unwrap();
        let files = payload["files"].as_array().unwrap();
        assert!(files.iter().any(|row| row["rel"] == "plot.png"));
        let rust = files.iter().find(|row| row["rel"] == "main.rs").unwrap();
        assert_eq!(rust["code"], true);
        assert!(!files.iter().any(|row| row["rel"] == "ignored.png"));
        let png = files.iter().find(|row| row["rel"] == "plot.png").unwrap();
        assert_eq!(png["provenance"]["generator"], "plot.py");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn declared_commands_are_argv_only() {
        let root = fixture();
        fs::write(root.join("figure.svg"), b"<svg/>").unwrap();
        fs::write(
            root.join(".atelier-provenance.json"),
            r#"{"figure.svg":{"command":"rm -rf /","generator":"safe.py"}}"#,
        )
        .unwrap();
        let mut rows = vec![GalleryRow {
            thumb: None,
            code: false,
            name: "figure.svg".into(),
            rel: "figure.svg".into(),
            folder: ".".into(),
            ext: "svg".into(),
            mtime: 0,
            btime: 0,
            mdate: String::new(),
            bdate: String::new(),
            size: 0,
            archive: false,
            provenance: None,
        }];
        enrich_provenance(&mut rows, &root);
        assert!(
            rows[0]
                .provenance
                .as_ref()
                .unwrap()
                .get("command")
                .is_none()
        );
        let _ = fs::remove_dir_all(root);
    }
}
