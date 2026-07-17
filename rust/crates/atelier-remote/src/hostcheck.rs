//! Host / Origin checks for remote gateway.

use crate::error::ApiError;
use axum::http::HeaderMap;

pub fn check_host(headers: &HeaderMap, allowed: &[String]) -> Result<(), ApiError> {
    let host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if host.is_empty() {
        return Err(ApiError::bad_request("bad_host", "Host manquant"));
    }
    // Strip port for comparison flexibility
    let host_lower = host.to_ascii_lowercase();
    if allowed.is_empty() {
        // Default: reject clearly public-looking hosts when list empty? require list.
        return Ok(());
    }
    let ok = allowed.iter().any(|a| {
        let a = a.to_ascii_lowercase();
        a == host_lower || host_lower.starts_with(&format!("{a}:"))
    });
    // Also allow host without port matching allowed with port
    let host_no_port = host_lower.split(':').next().unwrap_or(&host_lower);
    let ok = ok
        || allowed.iter().any(|a| {
            let a = a.to_ascii_lowercase();
            let a0 = a.split(':').next().unwrap_or(&a);
            a0 == host_no_port
        });
    if !ok {
        return Err(ApiError::bad_request("bad_host", "Host non autorisé"));
    }
    Ok(())
}

pub fn check_origin_optional(
    headers: &HeaderMap,
    allowed_hosts: &[String],
) -> Result<(), ApiError> {
    let Some(origin) = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    else {
        return Ok(()); // non-browser clients
    };
    if !origin_allowed(origin, allowed_hosts) {
        return Err(ApiError::bad_request("bad_origin", "Origin non autorisée"));
    }
    Ok(())
}

/// Shared origin predicate for both request validation and the CORS response
/// layer. Keeping one policy prevents a browser preflight from being accepted
/// more broadly than the actual request that follows it.
pub fn origin_allowed(origin: &str, allowed_hosts: &[String]) -> bool {
    if origin == "null" {
        return false;
    }
    let url = origin
        .strip_prefix("https://")
        .or_else(|| origin.strip_prefix("http://"))
        .or_else(|| origin.strip_prefix("tauri://"))
        .unwrap_or(origin);
    let host = url.split('/').next().unwrap_or(url);
    let host_no_port = host.split(':').next().unwrap_or(host);
    let ok = allowed_hosts.iter().any(|a| {
        let a = a.to_ascii_lowercase();
        let a0 = a.split(':').next().unwrap_or(&a);
        a0 == host_no_port.to_ascii_lowercase()
    });
    ok
}

/// True if peer is loopback (for admin routes).
pub fn is_loopback_ip(ip: &str) -> bool {
    matches!(ip, "127.0.0.1" | "::1" | "localhost")
}
