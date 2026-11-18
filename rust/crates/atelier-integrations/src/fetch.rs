//! Outil externe épinglé, téléchargé une fois dans le dossier d'Atelier
//! (`<app>/tools/<nom>-<version>/<nom>`) : une archive `.tar.gz` officielle,
//! vérifiée par sha256 AVANT extraction, dont on ne garde qu'un exécutable.
//!
//! Le téléchargement s'écrit dans un fichier temporaire puis l'exécutable
//! est renommé à sa place : un téléchargement raté ou coupé ne laisse jamais
//! d'exécutable cassé. Un verrou fs2 sérialise les appels concurrents (même
//! d'autres processus) : le second attend puis trouve l'outil installé.
//!
//! Sert à pixi (env Python d'Atelier, sans Terminal ni curl). tectonic suit
//! la même méthode dans `atelier-gallery/src/tectonic.rs`.

use flate2::read::GzDecoder;
use fs2::FileExt;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::Duration,
};

const TEMP_PREFIX: &str = ".download-";
/// Plafonds : une archive d'outil fait quelques dizaines de Mo.
const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_BINARY_BYTES: u64 = 1024 * 1024 * 1024;

/// Archive à télécharger et son empreinte attendue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Release {
    pub url: String,
    pub sha256: String,
}

/// Cible Rust de cette machine, au sens des noms d'archives (`musl` sous
/// Linux : exécutables statiques, valables sur toute distribution).
pub fn current_target() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("aarch64-apple-darwin"),
        ("macos", "x86_64") => Some("x86_64-apple-darwin"),
        ("linux", "x86_64") => Some("x86_64-unknown-linux-musl"),
        ("linux", "aarch64") => Some("aarch64-unknown-linux-musl"),
        _ => None,
    }
}

/// `<app_dir>/tools/<name>-<version>/<name>`.
pub fn tool_path(app_dir: &Path, name: &str, version: &str) -> PathBuf {
    app_dir
        .join("tools")
        .join(format!("{name}-{version}"))
        .join(name)
}

/// Exécutable présent et exécutable : seul un renommage réussi le crée.
pub fn is_installed(binary: &Path) -> bool {
    let Ok(meta) = fs::metadata(binary) else {
        return false;
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.len() > 0 && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file() && meta.len() > 0
    }
}

/// Installe l'exécutable `name` de `release` à `binary` si besoin, sous
/// verrou exclusif. Bloquant (réseau) : à appeler depuis `spawn_blocking`.
pub fn ensure_at(binary: &Path, name: &str, release: &Release) -> Result<PathBuf, String> {
    if is_installed(binary) {
        return Ok(binary.to_path_buf());
    }
    let dir = binary
        .parent()
        .ok_or_else(|| format!("emplacement de {name} invalide"))?;
    fs::create_dir_all(dir).map_err(|e| format!("création de {} : {e}", dir.display()))?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join(".lock"))
        .map_err(|e| format!("verrou de téléchargement : {e}"))?;
    lock.lock_exclusive()
        .map_err(|e| format!("verrou de téléchargement : {e}"))?;
    let result = if is_installed(binary) {
        Ok(())
    } else {
        remove_stale_temporaries(dir);
        install(binary, name, release)
    };
    let _ = FileExt::unlock(&lock);
    result.map(|()| binary.to_path_buf())
}

/// Restes d'un téléchargement tué en route (le verrou garantit que personne
/// n'écrit ces fichiers en ce moment).
fn remove_stale_temporaries(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().starts_with(TEMP_PREFIX) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Fichier temporaire supprimé à la sortie de portée, sauf s'il a été
/// renommé à sa place définitive.
struct Temporary {
    path: PathBuf,
    keep: bool,
}

impl Temporary {
    fn create(dir: &Path, role: &str) -> Result<(Self, File), String> {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let path = dir.join(format!(
            "{TEMP_PREFIX}{role}-{}-{stamp}",
            std::process::id()
        ));
        let file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .map_err(|e| format!("fichier temporaire : {e}"))?;
        Ok((Self { path, keep: false }, file))
    }
}

impl Drop for Temporary {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn install(binary: &Path, name: &str, release: &Release) -> Result<(), String> {
    let dir = binary
        .parent()
        .ok_or_else(|| format!("emplacement de {name} invalide"))?;
    let (archive, mut archive_file) = Temporary::create(dir, "archive")?;
    let digest = download(&release.url, &mut archive_file)?;
    drop(archive_file);
    if !digest.eq_ignore_ascii_case(release.sha256.trim()) {
        return Err(format!(
            "archive refusée : empreinte sha256 {digest}, attendue {}",
            release.sha256.trim()
        ));
    }
    let (staged, mut staged_file) = Temporary::create(dir, "staged")?;
    extract_binary(&archive.path, name, &mut staged_file)?;
    staged_file.sync_all().map_err(|e| e.to_string())?;
    drop(staged_file);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&staged.path, fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    let mut staged = staged;
    fs::rename(&staged.path, binary).map_err(|e| format!("installation de {name} : {e}"))?;
    staged.keep = true;
    Ok(())
}

/// Télécharge `url` dans `out` ; rend le sha256 hexadécimal du contenu.
fn download(url: &str, out: &mut File) -> Result<String, String> {
    let response = agent_for(url)
        .get(url)
        .call()
        .map_err(|error| match error {
            ureq::Error::Status(code, _) => format!("le serveur a répondu {code}"),
            ureq::Error::Transport(transport) => transport.to_string(),
        })?;
    let mut reader = response.into_reader().take(MAX_ARCHIVE_BYTES + 1);
    let mut hasher = Sha256::new();
    let mut total: u64 = 0;
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("téléchargement interrompu : {e}"))?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > MAX_ARCHIVE_BYTES {
            return Err("archive anormalement grosse, téléchargement abandonné".into());
        }
        hasher.update(&buffer[..read]);
        out.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
    }
    out.sync_all().map_err(|e| e.to_string())?;
    Ok(hex::encode(hasher.finalize()))
}

/// Copie l'entrée `name` (à la racine de l'archive) dans `out` ; rien
/// d'autre n'est écrit sur le disque, donc pas de chemin d'archive à assainir.
fn extract_binary(archive: &Path, name: &str, out: &mut File) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| e.to_string())?;
    let mut tar = tar::Archive::new(GzDecoder::new(file));
    let entries = tar
        .entries()
        .map_err(|e| format!("archive illisible : {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("archive illisible : {e}"))?;
        let is_binary = entry.header().entry_type().is_file()
            && entry.path().is_ok_and(|p| {
                let parts: Vec<_> = p
                    .components()
                    .filter(|c| !matches!(c, Component::CurDir))
                    .collect();
                parts.len() == 1 && parts[0].as_os_str() == name
            });
        if is_binary {
            let copied =
                io::copy(&mut entry.take(MAX_BINARY_BYTES + 1), out).map_err(|e| e.to_string())?;
            if copied == 0 || copied > MAX_BINARY_BYTES {
                return Err(format!("exécutable {name} invalide dans l'archive"));
            }
            return Ok(());
        }
    }
    Err(format!("l'archive ne contient pas d'exécutable {name}"))
}

/// Client HTTP : proxy des variables d'environnement (sauf pour l'hôte
/// local des tests), racines webpki complétées par `SSL_CERT_FILE` quand il
/// est défini (proxy d'entreprise qui re-signe le TLS).
fn agent_for(url: &str) -> ureq::Agent {
    let mut builder = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(60))
        .user_agent(concat!("atelier-studio/", env!("CARGO_PKG_VERSION")));
    if !is_loopback(url) {
        builder = builder.try_proxy_from_env(true);
    }
    if let Some(tls) = tls_with_env_roots() {
        builder = builder.tls_config(tls);
    }
    builder.build()
}

fn is_loopback(url: &str) -> bool {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);
    let host = if let Some(v6) = host.strip_prefix('[') {
        v6.split(']').next().unwrap_or("")
    } else {
        host.split(':').next().unwrap_or("")
    };
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback())
}

fn tls_with_env_roots() -> Option<Arc<rustls::ClientConfig>> {
    use rustls::pki_types::{pem::PemObject, CertificateDer};
    let path = std::env::var_os("SSL_CERT_FILE").filter(|p| !p.is_empty())?;
    let extra: Vec<CertificateDer<'static>> = CertificateDer::pem_file_iter(&path)
        .ok()?
        .flatten()
        .collect();
    if extra.is_empty() {
        return None;
    }
    let mut roots = rustls::RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    roots.add_parsable_certificates(extra);
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .ok()?
    .with_root_certificates(roots)
    .with_no_client_auth();
    Some(Arc::new(config))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;

    fn fake_archive(name: &str, script: &[u8]) -> Vec<u8> {
        let mut tar = tar::Builder::new(Vec::new());
        let mut header = tar::Header::new_gnu();
        header.set_size(script.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        tar.append_data(&mut header, name, script).unwrap();
        let raw = tar.into_inner().unwrap();
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        gz.write_all(&raw).unwrap();
        gz.finish().unwrap()
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        hex::encode(Sha256::digest(bytes))
    }

    /// Serveur HTTP local qui sert `body` à chaque requête.
    fn serve(body: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/outil.tar.gz", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok_and(|n| n > 2) {
                    line.clear();
                }
                let mut stream = stream;
                let _ = write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(&body);
            }
        });
        url
    }

    #[test]
    fn current_target_covers_mac_and_linux() {
        if cfg!(any(target_os = "macos", target_os = "linux"))
            && matches!(std::env::consts::ARCH, "x86_64" | "aarch64")
        {
            assert!(current_target().is_some());
        }
    }

    #[test]
    fn tool_path_is_versioned_under_tools() {
        assert_eq!(
            tool_path(Path::new("/app"), "pixi", "0.84.2"),
            PathBuf::from("/app/tools/pixi-0.84.2/pixi")
        );
    }

    #[test]
    fn download_installs_an_executable_once() {
        let dir = tempfile::tempdir().unwrap();
        let archive = fake_archive("pixi", b"#!/bin/sh\necho ok\n");
        let release = Release {
            url: serve(archive.clone()),
            sha256: sha256_hex(&archive),
        };
        let binary = tool_path(dir.path(), "pixi", "1.0");
        assert_eq!(ensure_at(&binary, "pixi", &release).unwrap(), binary);
        assert!(is_installed(&binary));
        assert_eq!(fs::read(&binary).unwrap(), b"#!/bin/sh\necho ok\n");
        // Deuxième appel : rien à télécharger (l'URL ne sert plus).
        let gone = Release {
            url: "http://127.0.0.1:9/absent".into(),
            sha256: "00".into(),
        };
        assert_eq!(ensure_at(&binary, "pixi", &gone).unwrap(), binary);
    }

    #[test]
    fn a_sha_mismatch_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let archive = fake_archive("pixi", b"x");
        let release = Release {
            url: serve(archive),
            sha256: "0".repeat(64),
        };
        let binary = tool_path(dir.path(), "pixi", "1.0");
        let error = ensure_at(&binary, "pixi", &release).unwrap_err();
        assert!(error.contains("empreinte"), "{error}");
        assert!(!binary.exists());
        let left: Vec<_> = fs::read_dir(binary.parent().unwrap())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n != ".lock")
            .collect();
        assert!(left.is_empty(), "{left:?}");
    }

    #[test]
    fn an_archive_without_the_binary_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let archive = fake_archive("autre", b"x");
        let release = Release {
            url: serve(archive.clone()),
            sha256: sha256_hex(&archive),
        };
        let binary = tool_path(dir.path(), "pixi", "1.0");
        let error = ensure_at(&binary, "pixi", &release).unwrap_err();
        assert!(error.contains("ne contient pas"), "{error}");
        assert!(!binary.exists());
    }
}
