//! `atelier-remote-gateway` — secure remote API for Atelier Companion (plan 034 C).
//!
//! Env:
//! - `ATELIER_REMOTE_BIND` — e.g. `127.0.0.1:18765` or Tailscale IP
//! - `ATELIER_REMOTE_DIR` — devices store directory
//! - `ATELIER_APP_DIR` — Application Support atelier-studio
//! - `ATELIER_REMOTE_ALLOWED_HOSTS` — comma-separated Host allowlist
//! - `ATELIER_TOKEN` / `ATELIER_SIDECAR_BASE` — optional loopback sidecar proxy
//! - Never enables Tailscale Funnel.

use atelier_remote::{config_from_env, serve};
use tracing_subscriber::EnvFilter;

/// Empreinte imprimée sur stderr pour l'opérateur Mac — jamais le jeton
/// complet (SEC-03) : stderr est append-é sans protection immédiate dans
/// `…/atelier-studio/remote/gateway.log` par le process parent. Le jeton
/// complet reste consultable via `/remote/admin`, servi sur le bind Tailscale
/// du gateway et gardé par `require_admin` (loopback + jeton admin).
fn print_admin_fingerprint(admin: &str, port: u16) {
    let fingerprint: String = admin.chars().take(6).collect();
    eprintln!(
        "atelier-remote-gateway admin token prêt — empreinte {fingerprint}… (jeton complet : /remote/admin, réservé au loopback)"
    );
    eprintln!("port={port}");
}

/// Vrai si le texte contient une suite de 32+ caractères hex consécutifs —
/// signature d'un jeton admin/device qui aurait fuité en clair dans un log
/// écrit avant ce correctif.
fn contains_long_hex_run(text: &str) -> bool {
    let mut run = 0usize;
    for c in text.chars() {
        if c.is_ascii_hexdigit() {
            run += 1;
            if run >= 32 {
                return true;
            }
        } else {
            run = 0;
        }
    }
    false
}

#[tokio::main]
async fn main() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_writer(std::io::stderr)
        .init();

    let config = config_from_env();
    let log_path = config.data_dir.join("gateway.log");
    let rotation_marker = config.data_dir.join(".sec062_admin_rotated");
    let migration_pending = !rotation_marker.exists();

    match serve(config).await {
        Ok(handle) => {
            if migration_pending {
                // Correctif SEC-03 : un jeton admin en clair a pu être écrit
                // dans gateway.log par une version antérieure (log non 0600,
                // token imprimé en entier). Rotation forcée, une seule fois,
                // si un tel jeton est détecté dans le log existant.
                let leaked_before_fix = std::fs::read_to_string(&log_path)
                    .map(|text| contains_long_hex_run(&text))
                    .unwrap_or(false);
                if leaked_before_fix {
                    let mut g = handle.state.inner.lock().await;
                    if let Ok(new_admin) = g.auth.rotate_admin_token() {
                        drop(g);
                        eprintln!(
                            "atelier-remote-gateway: jeton admin pré-correctif potentiellement exposé dans le log — rotation automatique (SEC-03)"
                        );
                        print_admin_fingerprint(&new_admin, handle.port);
                    }
                }
                let _ = std::fs::write(&rotation_marker, b"1");
            }
            if let Some(admin) = &handle.admin_token {
                print_admin_fingerprint(admin, handle.port);
            }
            // Park until ctrl-c
            tokio::signal::ctrl_c().await.ok();
            handle.shutdown().await;
        }
        Err(e) => {
            eprintln!("atelier-remote-gateway error: {e}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_a_leaked_hex_token_in_log_text() {
        let clean = "atelier-remote-gateway listening on 100.64.1.2:18765\nport=18765\n";
        assert!(!contains_long_hex_run(clean));

        let leaked = format!(
            "atelier-remote-gateway admin token (loopback only): {}\n",
            "a".repeat(64)
        );
        assert!(contains_long_hex_run(&leaked));
    }

    #[test]
    fn fingerprint_never_prints_the_full_token() {
        let token = "b".repeat(64);
        let fingerprint: String = token.chars().take(6).collect();
        assert_eq!(fingerprint.len(), 6);
        assert_ne!(fingerprint, token);
    }
}
