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

// HTTPS proxy peers appear local: never expose administration through this adapter.
async fn deny_admin_on_relay(request: axum::extract::Request, next: axum::middleware::Next) -> axum::response::Response {
    if request.uri().path().starts_with("/remote/admin") {
        return axum::response::IntoResponse::into_response(axum::http::StatusCode::NOT_FOUND);
    }
    next.run(request).await
}

#[tokio::main]
async fn main() {
    atelier_fdlimit::raise_nofile_limit();
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_writer(std::io::stderr)
        .init();

    let config = config_from_env();
    let loopback_hosts = config.allowed_hosts.clone();
    let loopback_mobile = config.mobile_dir.clone();
    let local_socket = config.data_dir.join("pair.sock");
    let log_path = config.data_dir.join("gateway.log");
    let rotation_marker = config.data_dir.join(".sec062_admin_rotated");
    let migration_pending = !rotation_marker.exists();

    match serve(config).await {
        Ok(handle) => {
            // Tailscale Serve dials the local adapter, avoiding a hairpin through its own IP.
            if !handle.addr.ip().is_loopback() {
                let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, handle.port)).await;
                match listener {
                    Ok(listener) => {
                        let mut app = atelier_remote::app_router(handle.state.clone(), loopback_hosts);
                        if let Some(dir) = loopback_mobile {
                            let index = dir.join("index.html");
                            app = app.fallback_service(tower_http::services::ServeDir::new(dir)
                                .fallback(tower_http::services::ServeFile::new(index)));
                        }
                        let app = app.layer(axum::middleware::from_fn(deny_admin_on_relay));
                        tokio::spawn(async move {
                            let _ = axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await;
                        });
                    }
                    Err(error) => eprintln!("adaptateur HTTPS local indisponible: {error}"),
                }
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if local_socket.exists() { let _ = std::fs::remove_file(&local_socket); }
                match tokio::net::UnixListener::bind(&local_socket) {
                    Ok(listener) => {
                        if std::fs::set_permissions(&local_socket, std::fs::Permissions::from_mode(0o600)).is_ok() {
                            let state = handle.state.clone();
                            tokio::spawn(async move {
                                use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
                                while let Ok((stream, _)) = listener.accept().await {
                                    let state = state.clone();
                                    tokio::spawn(async move {
                                        let (read, mut write) = stream.into_split();
                                        let mut line = String::new();
                                        let mut reader = BufReader::new(read);
                                        let read = tokio::time::timeout(std::time::Duration::from_secs(5), reader.read_line(&mut line)).await;
                                        if !matches!(read, Ok(Ok(_))) || line.len() > 512 { return; }
                                        let mut g = state.inner.lock().await;
                                        let result = match line.trim() {
                                            "pair" => g.auth.start_pairing(Some("Atelier iOS".into()))
                                                .map(|p| serde_json::json!({"code":p.code,"expiresAt":p.expires_at})),
                                            "devices" => {
                                                let devices: Vec<_> = g.auth.list_devices().into_iter().map(|d| serde_json::json!({
                                                    "deviceId": d.device_id, "name": d.name, "scopes": d.scopes,
                                                    "createdAt": d.created_at, "lastSeenAt": d.last_seen_at,
                                                    "revoked": d.revoked_at.is_some(), "revokedAt": d.revoked_at
                                                })).collect();
                                                Ok(serde_json::json!({"devices": devices}))
                                            },
                                            command if command.starts_with("revoke ") => g.auth.revoke_device(&command[7..])
                                                .map(|_| serde_json::json!({"ok":true})),
                                            _ => return,
                                        };
                                        let body = match result { Ok(value) => value, Err(_) => serde_json::json!({"error":"Association indisponible"}) };
                                        drop(g);
                                        let _ = write.write_all(body.to_string().as_bytes()).await;
                                    });
                                }
                            });
                        }
                    }
                    Err(error) => eprintln!("canal local d’association indisponible: {error}"),
                }
            }

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

    #[tokio::test]
    async fn https_relay_never_exposes_admin_routes() {
        use tower::ServiceExt;
        let app = axum::Router::new()
            .route("/remote/admin/devices", axum::routing::get(|| async { "secret" }))
            .route("/remote/health", axum::routing::get(|| async { "ok" }))
            .layer(axum::middleware::from_fn(deny_admin_on_relay));
        let denied = app.clone().oneshot(axum::http::Request::builder().uri("/remote/admin/devices")
            .body(axum::body::Body::empty()).unwrap()).await.unwrap();
        assert_eq!(denied.status(), axum::http::StatusCode::NOT_FOUND);
        let health = app.oneshot(axum::http::Request::builder().uri("/remote/health")
            .body(axum::body::Body::empty()).unwrap()).await.unwrap();
        assert_eq!(health.status(), axum::http::StatusCode::OK);
    }

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
