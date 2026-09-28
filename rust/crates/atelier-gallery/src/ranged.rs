//! Servir un fichier avec support HTTP Range (206/416), ETag faible
//! (mtime+taille) et 304 via `If-None-Match`. Utilisé par `serve_video`
//! (main.rs) et par les routes PDF Zotero / base de connaissances
//! (zotero.rs) — factorisation de la logique Range qui vivait auparavant
//! dupliquée/inexistante dans ces deux endroits.

use axum::{
    body::Body,
    http::{HeaderMap, HeaderValue, Method, Request, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::{
    path::Path,
    time::{Duration, UNIX_EPOCH},
};
use tower_http::services::ServeFile;

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

/// ETag faible calculé à partir de mtime (nanosecondes) + taille — bon marché,
/// suffisant pour détecter un fichier changé sans hacher le contenu.
fn weak_etag(mtime_secs: u128, size: u64) -> String {
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
        .as_nanos();
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
/// une requête partielle (lecture progressive bornée) — jamais le fichier entier.
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

    // Preserve the existing single-range contract; ServeFile streams the open
    // file in 64 KiB chunks and stops reading when the client drops the body.
    // A weak ETag cannot satisfy If-Range (strong comparison is required).
    let outcome = if headers.contains_key(header::IF_RANGE) {
        RangeOutcome::Full
    } else {
        headers
            .get(header::RANGE)
            .and_then(|v| v.to_str().ok())
            .map(|v| parse_range(v, size))
            .unwrap_or(RangeOutcome::Full)
    };
    if outcome == RangeOutcome::Unsatisfiable {
        let mut resp = (StatusCode::RANGE_NOT_SATISFIABLE, Body::empty()).into_response();
        resp.headers_mut().insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes */{size}")).expect("numeric range"),
        );
        common_headers(&mut resp, &etag);
        return resp;
    }
    let mut request = Request::builder()
        .method(method.clone())
        .uri("/")
        .body(Body::empty())
        .expect("static file request");
    if let RangeOutcome::Partial(start, end) = outcome {
        request.headers_mut().insert(
            header::RANGE,
            HeaderValue::from_str(&format!("bytes={start}-{end}")).expect("numeric range"),
        );
    }
    let mut response = match ServeFile::new(path)
        .with_buf_chunk_size(64 * 1024)
        .try_call(request)
        .await
    {
        Ok(response) => response.map(Body::new),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "read failed").into_response(),
    };
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(content_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    common_headers(&mut response, &etag);
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn large_bodies_are_streamed_in_bounded_chunks() {
        use axum::body::HttpBody;
        let file = tempfile::NamedTempFile::new().unwrap();
        file.as_file().set_len(16 * 1024 * 1024).unwrap();
        let response = serve_file_ranged(
            file.path(),
            "application/pdf",
            &Method::GET,
            &HeaderMap::new(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "16777216");
        let mut body = response.into_body();
        let frame = std::future::poll_fn(|cx| std::pin::Pin::new(&mut body).poll_frame(cx))
            .await
            .unwrap()
            .unwrap();
        let bytes = frame.into_data().unwrap();
        assert!(!bytes.is_empty());
        assert!(bytes.len() <= 64 * 1024);
        // Dropping the body here never materializes the remaining 16 MiB.
    }

    #[tokio::test]
    async fn range_suffix_head_and_if_range_keep_http_contracts() {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"0123456789abcdefghij").unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(header::RANGE, HeaderValue::from_static("bytes=-4"));
        let response =
            serve_file_ranged(file.path(), "application/pdf", &Method::GET, &headers).await;
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 16-19/20");
        assert_eq!(
            &axum::body::to_bytes(response.into_body(), 100)
                .await
                .unwrap()[..],
            b"ghij"
        );
        let response =
            serve_file_ranged(file.path(), "application/pdf", &Method::HEAD, &headers).await;
        assert!(
            axum::body::to_bytes(response.into_body(), 100)
                .await
                .unwrap()
                .is_empty()
        );
        headers.insert(header::IF_RANGE, HeaderValue::from_static("W/\"old\""));
        assert_eq!(
            serve_file_ranged(file.path(), "application/pdf", &Method::GET, &headers)
                .await
                .status(),
            StatusCode::OK
        );
    }

    #[test]
    fn same_second_same_size_edits_change_the_etag() {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"pdf").unwrap();
        let time = UNIX_EPOCH + Duration::new(1234, 1000);
        file.as_file()
            .set_times(std::fs::FileTimes::new().set_modified(time))
            .unwrap();
        let first = etag_for_metadata(&file.as_file().metadata().unwrap());
        file.as_file()
            .set_times(std::fs::FileTimes::new().set_modified(time + Duration::from_nanos(1000)))
            .unwrap();
        assert_ne!(
            first,
            etag_for_metadata(&file.as_file().metadata().unwrap())
        );
    }

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
