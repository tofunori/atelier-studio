//! tectonic épinglé, téléchargé une seule fois au premier « Compiler » quand
//! la machine n'a ni latexmk (MacTeX) ni tectonic : compiler un `.tex` ne
//! demande plus d'installer une distribution TeX.
//!
//! L'archive officielle (`tectonic-<VERSION>-<cible>.tar.gz`, un seul
//! exécutable) est vérifiée par sha256 AVANT extraction, écrite dans un
//! fichier temporaire puis renommée : un téléchargement raté ou interrompu ne
//! laisse jamais d'exécutable cassé à l'emplacement final. Un verrou fs2
//! sérialise les compilations concurrentes (même d'autres serveurs galerie) :
//! la seconde attend puis trouve l'exécutable déjà installé.
//!
//! Variables de test : `ATELIER_TECTONIC_URL` et `ATELIER_TECTONIC_SHA256`
//! remplacent l'archive épinglée (serveur HTTP local, fausse archive).

use atelier_integrations::tectonic::{VERSION, installed_path};
use flate2::read::GzDecoder;
use fs2::FileExt;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

/// Archives épinglées : cible Rust → sha256 de `tectonic-<VERSION>-<cible>.tar.gz`.
const PINNED: &[(&str, &str)] = &[
    (
        "aarch64-apple-darwin",
        "a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667",
    ),
    (
        "x86_64-apple-darwin",
        "7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80",
    ),
    (
        "x86_64-unknown-linux-musl",
        "8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7",
    ),
];

/// Plafonds de taille : l'archive 0.17.0 fait ~12 Mo, l'exécutable ~26 Mo.
const MAX_ARCHIVE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_BINARY_BYTES: u64 = 512 * 1024 * 1024;

/// Préfixe des fichiers temporaires, nettoyés sous verrou s'ils traînent.
const TEMP_PREFIX: &str = ".tectonic-";

/// Archive à télécharger et empreinte attendue.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Release {
    pub url: String,
    pub sha256: String,
}

/// Cible de l'archive pour la machine courante ; `None` : pas d'archive
/// épinglée, la compilation garde `toolchain-missing`.
fn current_target() -> Option<&'static str> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("aarch64-apple-darwin")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some("x86_64-apple-darwin")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        // musl : exécutable statique, valable sur toute distribution x86_64.
        Some("x86_64-unknown-linux-musl")
    } else {
        None
    }
}

fn pinned_release(target: &str) -> Option<Release> {
    let (_, sha256) = PINNED.iter().find(|(t, _)| *t == target)?;
    Some(Release {
        url: format!(
            "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40{VERSION}/tectonic-{VERSION}-{target}.tar.gz"
        ),
        sha256: (*sha256).to_string(),
    })
}

/// Archive épinglée de `target`, éventuellement remplacée par les
/// variables de test lues via `lookup`.
fn release_with(lookup: impl Fn(&str) -> Option<String>, target: Option<&str>) -> Option<Release> {
    let pinned = target.and_then(pinned_release);
    let env = |key: &str| {
        lookup(key)
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    };
    let url = env("ATELIER_TECTONIC_URL").or_else(|| pinned.as_ref().map(|r| r.url.clone()))?;
    let sha256 =
        env("ATELIER_TECTONIC_SHA256").or_else(|| pinned.as_ref().map(|r| r.sha256.clone()))?;
    Some(Release { url, sha256 })
}

/// Dossier de données d'Atelier : `ATELIER_APP_DIR`, sinon
/// `~/Library/Application Support/atelier-studio` (même règle que le store
/// des lectures Zotero et que `atelier-runtime`).
pub fn app_dir() -> Option<PathBuf> {
    std::env::var_os("ATELIER_APP_DIR")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .filter(|home| !home.is_empty())
                .map(|home| PathBuf::from(home).join("Library/Application Support/atelier-studio"))
        })
}

/// tectonic d'Atelier, téléchargé au besoin. `Ok(None)` : aucune archive
/// pour cette plateforme. Bloquant (réseau, verrou) : à appeler depuis
/// `spawn_blocking`.
pub fn ensure() -> Result<Option<PathBuf>, String> {
    let Some(release) = release_with(|key| std::env::var(key).ok(), current_target()) else {
        return Ok(None);
    };
    let app_dir = app_dir().ok_or("dossier de l'application introuvable (HOME non défini)")?;
    ensure_at(&installed_path(&app_dir), &release).map(Some)
}

/// Exécutable présent et exécutable : seul un renommage réussi le crée.
fn is_installed(binary: &Path) -> bool {
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

/// Installe `release` à `binary` si besoin, sous verrou exclusif.
pub fn ensure_at(binary: &Path, release: &Release) -> Result<PathBuf, String> {
    if is_installed(binary) {
        return Ok(binary.to_path_buf());
    }
    let dir = binary.parent().ok_or("emplacement de tectonic invalide")?;
    fs::create_dir_all(dir).map_err(|e| format!("création de {} : {e}", dir.display()))?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join(".lock"))
        .map_err(|e| format!("verrou de téléchargement : {e}"))?;
    // Bloque tant qu'une autre compilation télécharge ; à la sortie, elle a
    // soit installé l'exécutable, soit tout nettoyé.
    lock.lock_exclusive()
        .map_err(|e| format!("verrou de téléchargement : {e}"))?;
    let result = if is_installed(binary) {
        Ok(())
    } else {
        remove_stale_temporaries(dir);
        install(binary, release)
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

fn install(binary: &Path, release: &Release) -> Result<(), String> {
    let dir = binary.parent().ok_or("emplacement de tectonic invalide")?;
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
    extract_binary(&archive.path, &mut staged_file)?;
    staged_file.sync_all().map_err(|e| e.to_string())?;
    drop(staged_file);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&staged.path, fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    let mut staged = staged;
    fs::rename(&staged.path, binary).map_err(|e| format!("installation de tectonic : {e}"))?;
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

/// Copie l'entrée `tectonic` de l'archive dans `out` (rien d'autre n'est
/// écrit sur le disque : pas de chemin d'archive à assainir).
fn extract_binary(archive: &Path, out: &mut File) -> Result<(), String> {
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
                    .filter(|c| !matches!(c, std::path::Component::CurDir))
                    .collect();
                parts.len() == 1 && parts[0].as_os_str() == "tectonic"
            });
        if is_binary {
            let copied =
                io::copy(&mut entry.take(MAX_BINARY_BYTES + 1), out).map_err(|e| e.to_string())?;
            if copied == 0 || copied > MAX_BINARY_BYTES {
                return Err("exécutable tectonic invalide dans l'archive".into());
            }
            return Ok(());
        }
    }
    Err("l'archive ne contient pas d'exécutable tectonic".into())
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
    use rustls::pki_types::{CertificateDer, pem::PemObject};
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
    use std::{
        io::{BufRead, BufReader},
        net::TcpListener,
        sync::atomic::{AtomicUsize, Ordering},
    };

    /// Archive comme celles de GitHub : une seule entrée `tectonic`.
    fn fake_archive(script: &[u8]) -> Vec<u8> {
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        {
            let mut builder = tar::Builder::new(&mut gz);
            let mut header = tar::Header::new_gnu();
            header.set_size(script.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, "tectonic", script)
                .unwrap();
            builder.finish().unwrap();
        }
        gz.finish().unwrap()
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        hex::encode(Sha256::digest(bytes))
    }

    /// Serveur HTTP minimal : sert `body` à chaque requête, après `delay`,
    /// et compte les requêtes reçues.
    fn serve(body: Vec<u8>, delay: Duration) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/tectonic.tar.gz", listener.local_addr().unwrap());
        let hits = Arc::new(AtomicUsize::new(0));
        let counter = hits.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                counter.fetch_add(1, Ordering::SeqCst);
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok_and(|n| n > 0) && line != "\r\n" {
                    line.clear();
                }
                std::thread::sleep(delay);
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/gzip\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&body);
            }
        });
        (url, hits)
    }

    fn leftovers(dir: &Path) -> Vec<String> {
        fs::read_dir(dir)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .filter(|n| n.starts_with(TEMP_PREFIX))
                    .collect()
            })
            .unwrap_or_default()
    }

    #[test]
    fn pinned_releases_cover_the_three_targets() {
        let mac = pinned_release("aarch64-apple-darwin").unwrap();
        assert_eq!(
            mac.url,
            "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-aarch64-apple-darwin.tar.gz"
        );
        assert!(pinned_release("x86_64-apple-darwin").is_some());
        assert!(pinned_release("x86_64-unknown-linux-musl").is_some());
        assert!(pinned_release("aarch64-unknown-linux-gnu").is_none());
        // Plateforme sans archive : rien, sauf si les variables de test la fournissent.
        assert!(release_with(|_| None, None).is_none());
        let from_env = release_with(
            |key| match key {
                "ATELIER_TECTONIC_URL" => Some("http://127.0.0.1:9/t.tar.gz".into()),
                "ATELIER_TECTONIC_SHA256" => Some("ab".into()),
                _ => None,
            },
            None,
        )
        .unwrap();
        assert_eq!(from_env.url, "http://127.0.0.1:9/t.tar.gz");
        assert_eq!(from_env.sha256, "ab");
        let pinned = release_with(|_| Some(String::new()), Some("x86_64-apple-darwin")).unwrap();
        assert_eq!(pinned, pinned_release("x86_64-apple-darwin").unwrap());
    }

    #[test]
    fn installed_path_is_versioned_under_tools() {
        let path = installed_path(Path::new("/app"));
        assert_eq!(path, Path::new("/app/tools/tectonic-0.17.0/tectonic"));
    }

    #[test]
    fn loopback_hosts_skip_the_environment_proxy() {
        assert!(is_loopback("http://127.0.0.1:8080/x.tar.gz"));
        assert!(is_loopback("http://localhost/x"));
        assert!(is_loopback("http://[::1]:80/x"));
        assert!(!is_loopback("https://github.com/tectonic-typesetting/x"));
    }

    #[test]
    fn download_installs_an_executable_once() {
        let archive = fake_archive(b"#!/bin/sh\necho fake tectonic\n");
        let (url, hits) = serve(archive.clone(), Duration::ZERO);
        let tmp = tempfile::tempdir().unwrap();
        let binary = installed_path(tmp.path());
        let release = Release {
            url,
            sha256: sha256_hex(&archive),
        };
        assert_eq!(ensure_at(&binary, &release).unwrap(), binary);
        assert_eq!(
            fs::read(&binary).unwrap(),
            b"#!/bin/sh\necho fake tectonic\n"
        );
        assert!(is_installed(&binary));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&binary).unwrap().permissions().mode() & 0o777,
                0o755
            );
            let out = std::process::Command::new(&binary).output().unwrap();
            assert_eq!(String::from_utf8_lossy(&out.stdout), "fake tectonic\n");
        }
        assert!(leftovers(binary.parent().unwrap()).is_empty());
        // Déjà installé : aucun nouveau téléchargement.
        ensure_at(&binary, &release).unwrap();
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_sha_mismatch_leaves_nothing_behind() {
        let archive = fake_archive(b"#!/bin/sh\necho corrupted\n");
        let (url, _) = serve(archive, Duration::ZERO);
        let tmp = tempfile::tempdir().unwrap();
        let binary = installed_path(tmp.path());
        let release = Release {
            url,
            sha256: "0".repeat(64),
        };
        let error = ensure_at(&binary, &release).unwrap_err();
        assert!(error.contains("sha256"), "{error}");
        assert!(!binary.exists());
        assert!(leftovers(binary.parent().unwrap()).is_empty());
    }

    #[test]
    fn an_archive_without_tectonic_is_refused() {
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        {
            let mut builder = tar::Builder::new(&mut gz);
            let mut header = tar::Header::new_gnu();
            header.set_size(3);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(&mut header, "README", &b"hi\n"[..])
                .unwrap();
            builder.finish().unwrap();
        }
        let archive = gz.finish().unwrap();
        let (url, _) = serve(archive.clone(), Duration::ZERO);
        let tmp = tempfile::tempdir().unwrap();
        let binary = installed_path(tmp.path());
        let release = Release {
            url,
            sha256: sha256_hex(&archive),
        };
        assert!(
            ensure_at(&binary, &release)
                .unwrap_err()
                .contains("tectonic")
        );
        assert!(!binary.exists());
        assert!(leftovers(binary.parent().unwrap()).is_empty());
    }

    #[test]
    fn an_unreachable_server_is_an_error_not_a_binary() {
        // Port fermé : connexion refusée.
        let port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let tmp = tempfile::tempdir().unwrap();
        let binary = installed_path(tmp.path());
        let release = Release {
            url: format!("http://127.0.0.1:{port}/tectonic.tar.gz"),
            sha256: "0".repeat(64),
        };
        assert!(ensure_at(&binary, &release).is_err());
        assert!(!binary.exists());
        assert!(leftovers(binary.parent().unwrap()).is_empty());
    }

    #[test]
    fn concurrent_requests_download_once() {
        let archive = fake_archive(b"#!/bin/sh\necho once\n");
        // Réponse lente : la seconde demande arrive pendant le téléchargement.
        let (url, hits) = serve(archive.clone(), Duration::from_millis(300));
        let tmp = tempfile::tempdir().unwrap();
        let binary = installed_path(tmp.path());
        let release = Release {
            url,
            sha256: sha256_hex(&archive),
        };
        let workers: Vec<_> = (0..4)
            .map(|_| {
                let (binary, release) = (binary.clone(), release.clone());
                std::thread::spawn(move || ensure_at(&binary, &release))
            })
            .collect();
        for worker in workers {
            assert_eq!(worker.join().unwrap().unwrap(), binary);
        }
        assert_eq!(hits.load(Ordering::SeqCst), 1);
        assert_eq!(fs::read(&binary).unwrap(), b"#!/bin/sh\necho once\n");
        assert!(leftovers(binary.parent().unwrap()).is_empty());
    }

    #[test]
    fn stale_temporaries_are_cleaned_before_a_new_download() {
        let archive = fake_archive(b"#!/bin/sh\necho ok\n");
        let (url, _) = serve(archive.clone(), Duration::ZERO);
        let tmp = tempfile::tempdir().unwrap();
        let binary = installed_path(tmp.path());
        let dir = binary.parent().unwrap();
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(format!("{TEMP_PREFIX}archive-1-2")), b"partial").unwrap();
        let release = Release {
            url,
            sha256: sha256_hex(&archive),
        };
        ensure_at(&binary, &release).unwrap();
        assert!(leftovers(dir).is_empty());
    }

    /// Téléchargement réel depuis GitHub (réseau requis) :
    /// `cargo test -p atelier-gallery tectonic::tests::real_download -- --ignored`
    /// avec `ATELIER_TECTONIC_REAL_DIR` pointant vers un dossier jetable.
    #[test]
    #[ignore]
    fn real_download() {
        let dir = PathBuf::from(
            std::env::var("ATELIER_TECTONIC_REAL_DIR").expect("ATELIER_TECTONIC_REAL_DIR"),
        );
        let release = pinned_release(current_target().expect("plateforme sans archive")).unwrap();
        let binary = ensure_at(&installed_path(&dir), &release).unwrap();
        let out = std::process::Command::new(&binary)
            .arg("--version")
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&out.stdout).contains(VERSION));
    }
}
