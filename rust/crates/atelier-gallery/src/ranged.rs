//! Servir un fichier avec support HTTP Range (206/416), ETag faible
//! (mtime+taille) et 304 via `If-None-Match`. Utilisé par `serve_video`
//! (main.rs) et par les routes PDF Zotero / base de connaissances
//! (zotero.rs) — factorisation de la logique Range qui vivait auparavant
//! dupliquée/inexistante dans ces deux endroits.

use axum::{
    body::Body,
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::{
    path::Path,
    time::{Duration, UNIX_EPOCH},
};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

/// Résultat de l'analyse de l'en-tête `Range`.
#[derive(Debug, PartialEq, Eq)]
enum RangeOutcome {
    /// Pas de `Range`, ou en-tête malformé/non supporté (multi-plages) :
    /// on ignore et sert le fichier complet.
    Full,
    /// Plage satisfiable, bornes inclusives déjà clampées à `[0, size-1]`.
    Partial(u64, u64),
    /// Plage hors bornes : 416.
    Unsatisfiable,
}

/// Parse `bytes=start-end` / `bytes=start-` / `bytes=-suffix`. Toute syntaxe
/// non reconnue (préfixe absent, plages multiples séparées par des virgules,
/// nombres invalides) retombe sur `Full` plutôt que de faire échouer la
/// requête — un client qui envoie un `Range` qu'on ne comprend pas doit
/// quand même obtenir une réponse 200 utilisable.
fn parse_range(header_val: &str, size: u64) -> RangeOutcome {
    let Some(spec) = header_val.strip_prefix("bytes=") else {
        return RangeOutcome::Full;
    };
    // Plages multiples ("bytes=0-1,2-3") : non supporté, on ignore.
    if spec.contains(',') {
        return RangeOutcome::Full;
    }
    let Some((s, e)) = spec.split_once('-') else {
        return RangeOutcome::Full;
    };
    if s.is_empty() {
        // Suffixe : les `suffix` derniers octets.
        let Ok(suffix) = e.parse::<u64>() else {
            return RangeOutcome::Full;
        };
        if suffix == 0 || size == 0 {
            return RangeOutcome::Unsatisfiable;
        }
        let start = size.saturating_sub(suffix);
        return RangeOutcome::Partial(start, size - 1);
    }
    let Ok(start) = s.parse::<u64>() else {
        return RangeOutcome::Full;
    };
    let end = if e.is_empty() {
        size.saturating_sub(1)
    } else {
        match e.parse::<u64>() {
            Ok(v) => v,
            Err(_) => return RangeOutcome::Full,
        }
    };
    if size == 0 || start >= size || start > end {
        return RangeOutcome::Unsatisfiable;
    }
    RangeOutcome::Partial(start, end.min(size.saturating_sub(1)))
}

/// ETag faible calculé à partir de mtime (secondes) + taille — bon marché,
/// suffisant pour détecter un fichier changé sans hacher le contenu.
fn weak_etag(mtime_secs: u64, size: u64) -> String {
    format!("W/\"{mtime_secs}-{size}\"")
}

/// `If-None-Match` peut contenir `*` ou une liste d'ETags séparés par des
/// virgules ; on compare la chaîne telle quelle (nos ETags sont faibles,
/// donc l'égalité textuelle est la sémantique correcte ici).
fn if_none_match_matches(header_val: &str, etag: &str) -> bool {
    let trimmed = header_val.trim();
    if trimmed == "*" {
        return true;
    }
    header_val.split(',').any(|part| part.trim() == etag)
}

/// ETag faible d'un fichier déjà stat'é — exposé pour le handler générique
/// (`static_asset` dans main.rs), qui gère lui-même son propre 304 pour les
/// fichiers non-HTML sans passer par `serve_file_ranged` (il a déjà les
/// octets en main après injection éventuelle pour le HTML).
pub(crate) fn etag_for_metadata(metadata: &std::fs::Metadata) -> String {
    let size = metadata.len();
    let mtime_secs = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .unwrap_or(Duration::ZERO)
        .as_secs();
    weak_etag(mtime_secs, size)
}

/// `true` si `headers` porte un `If-None-Match` satisfait par `etag`.
pub(crate) fn matches_if_none_match(headers: &HeaderMap, etag: &str) -> bool {
    headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| if_none_match_matches(v, etag))
}

fn common_headers(resp: &mut Response, etag: &str) {
    let headers = resp.headers_mut();
    headers.insert(
        header::ETAG,
        HeaderValue::from_str(etag).unwrap_or_else(|_| HeaderValue::from_static("W/\"0-0\"")),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-cache"),
    );
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
}

/// Sert `path` avec Content-Type `content_type`, en honorant `Range`,
/// `If-None-Match` et `HEAD`. Ne lit du disque que la fenêtre demandée pour
/// une requête partielle (seek + read_exact) — jamais le fichier entier.
pub(crate) async fn serve_file_ranged(
    path: &Path,
    content_type: &str,
    method: &Method,
    headers: &HeaderMap,
) -> Response {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(m) => m,
        Err(_) => return (StatusCode::NOT_FOUND, "not found").into_response(),
    };
    if !metadata.is_file() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    let size = metadata.len();
    let etag = etag_for_metadata(&metadata);

    if matches_if_none_match(headers, &etag) {
        let mut resp = (StatusCode::NOT_MODIFIED, Body::empty()).into_response();
        common_headers(&mut resp, &etag);
        return resp;
    }

    let outcome = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|v| parse_range(v, size))
        .unwrap_or(RangeOutcome::Full);

    match outcome {
        RangeOutcome::Unsatisfiable => {
            let mut resp = (StatusCode::RANGE_NOT_SATISFIABLE, Body::empty()).into_response();
            resp.headers_mut().insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes */{size}"))
                    .unwrap_or_else(|_| HeaderValue::from_static("bytes */0")),
            );
            common_headers(&mut resp, &etag);
            resp
        }
        RangeOutcome::Full => build_full(path, content_type, method, size, &etag).await,
        RangeOutcome::Partial(start, end) => {
            build_partial(path, content_type, method, start, end, size, &etag).await
        }
    }
}

async fn build_full(
    path: &Path,
    content_type: &str,
    method: &Method,
    size: u64,
    etag: &str,
) -> Response {
    let body = if *method == Method::HEAD {
        Vec::new()
    } else {
        match tokio::fs::read(path).await {
            Ok(b) => b,
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "read failed").into_response(),
        }
    };
    let content_length = size;
    let mut resp = build_response(StatusCode::OK, content_type, content_length, body);
    common_headers(&mut resp, etag);
    resp
}

async fn build_partial(
    path: &Path,
    content_type: &str,
    method: &Method,
    start: u64,
    end: u64,
    size: u64,
    etag: &str,
) -> Response {
    let length = end - start + 1;
    let mut file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "read failed").into_response(),
    };
    if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "seek failed").into_response();
    }
    let body = if *method == Method::HEAD {
        Vec::new()
    } else {
        let mut buf = vec![0u8; length as usize];
        if file.read_exact(&mut buf).await.is_err() {
            return (StatusCode::INTERNAL_SERVER_ERROR, "read failed").into_response();
        }
        buf
    };
    let mut resp = build_response(StatusCode::PARTIAL_CONTENT, content_type, length, body);
    resp.headers_mut().insert(
        header::CONTENT_RANGE,
        HeaderValue::from_str(&format!("bytes {start}-{end}/{size}"))
            .unwrap_or_else(|_| HeaderValue::from_static("bytes */0")),
    );
    common_headers(&mut resp, etag);
    resp
}

fn build_response(
    status: StatusCode,
    content_type: &str,
    content_length: u64,
    body: Vec<u8>,
) -> Response {
    Response::builder()
        .status(status)
        .header(
            header::CONTENT_TYPE,
            HeaderValue::from_str(content_type)
                .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
        )
        .header(header::CONTENT_LENGTH, content_length)
        .body(Body::from(body))
        .unwrap_or_else(|_| (StatusCode::INTERNAL_SERVER_ERROR, "response").into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_normal_start_end() {
        assert_eq!(parse_range("bytes=0-9", 100), RangeOutcome::Partial(0, 9));
        assert_eq!(
            parse_range("bytes=10-19", 100),
            RangeOutcome::Partial(10, 19)
        );
    }

    #[test]
    fn range_open_ended() {
        assert_eq!(parse_range("bytes=50-", 100), RangeOutcome::Partial(50, 99));
    }

    #[test]
    fn range_suffix() {
        assert_eq!(parse_range("bytes=-10", 100), RangeOutcome::Partial(90, 99));
        // Suffixe plus grand que le fichier : tout le fichier.
        assert_eq!(
            parse_range("bytes=-1000", 100),
            RangeOutcome::Partial(0, 99)
        );
    }

    #[test]
    fn range_out_of_bounds_is_unsatisfiable() {
        assert_eq!(
            parse_range("bytes=200-300", 100),
            RangeOutcome::Unsatisfiable
        );
        assert_eq!(parse_range("bytes=100-", 100), RangeOutcome::Unsatisfiable);
        assert_eq!(parse_range("bytes=-0", 100), RangeOutcome::Unsatisfiable);
        assert_eq!(parse_range("bytes=0-9", 0), RangeOutcome::Unsatisfiable);
    }

    #[test]
    fn range_end_before_start_is_unsatisfiable() {
        assert_eq!(parse_range("bytes=50-10", 100), RangeOutcome::Unsatisfiable);
    }

    #[test]
    fn range_end_clamped_to_file_size() {
        assert_eq!(
            parse_range("bytes=0-99999", 100),
            RangeOutcome::Partial(0, 99)
        );
    }

    #[test]
    fn range_malformed_is_ignored() {
        assert_eq!(parse_range("garbage", 100), RangeOutcome::Full);
        assert_eq!(parse_range("bytes=abc-def", 100), RangeOutcome::Full);
        assert_eq!(parse_range("bytes=0-1,2-3", 100), RangeOutcome::Full);
        assert_eq!(parse_range("bytes=", 100), RangeOutcome::Full);
    }

    #[test]
    fn etag_matching() {
        let etag = weak_etag(1234, 5678);
        assert_eq!(etag, "W/\"1234-5678\"");
        assert!(if_none_match_matches(&etag, &etag));
        assert!(if_none_match_matches("*", &etag));
        assert!(if_none_match_matches("W/\"1-2\", W/\"1234-5678\"", &etag));
        assert!(!if_none_match_matches("W/\"1-2\"", &etag));
    }
}
