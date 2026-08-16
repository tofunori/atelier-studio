//! `add --kind web` (fetch réel) — miroir de `defaultFetchPage`/`htmlToText`
//! (`sidecar/knowledge.mjs`). Appel réseau réel via `reqwest::blocking`
//! (déjà utilisé par `article_meta::crossref_meta`), aucun mock : fixture de
//! parité groupe d (`gallery/server/tests/kb_parity/fixtures/d-network.json`),
//! best-effort — sautée par le harnais si le réseau est indisponible.

use once_cell::sync::Lazy;
use regex::{Captures, Regex};
use std::time::Duration;

const FETCH_TIMEOUT_SECS: u64 = 20;
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

/// Télécharge une page http(s) — miroir de `defaultFetchPage`. Retourne
/// `(body, contentType)`. Erreurs réseau formulées pour matcher
/// `NETWORK_ERROR_PATTERN` du harnais de parité (mot « réseau »).
pub fn fetch_page(url: &str) -> Result<(String, String), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Téléchargement réseau échoué : {url} ({e})"))?;
    let resp = client
        .get(url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "text/html,application/xhtml+xml,text/plain,*/*")
        .header("Accept-Language", "fr-CA,fr;q=0.9,en;q=0.8")
        .send()
        .map_err(|e| format!("Téléchargement réseau échoué : {url} ({e})"))?;
    let status = resp.status();
    if !status.is_success() {
        let code = status.as_u16();
        // sites anti-robot (éditeurs, paywalls) : le texte affiché reste
        // capturable par la webview — guider vers ce chemin.
        let guidance = if [403u16, 401, 406, 429, 451, 503].contains(&code) {
            " — ce site bloque le téléchargement direct : ouvre la page dans le browser intégré et utilise son bouton livre (capture du texte affiché)"
        } else {
            ""
        };
        return Err(format!("Téléchargement échoué (HTTP {code}) : {url}{guidance}"));
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if content_type.to_lowercase().contains("application/pdf") {
        return Err("URL de PDF : télécharger le fichier puis l'épingler avec --kind pdf".to_string());
    }
    let body = resp.text().map_err(|e| format!("Téléchargement réseau échoué : {url} ({e})"))?;
    Ok((body, content_type))
}

// --- décodage d'entités HTML — miroir de `decodeEntities` (knowledge.mjs) --

fn named_entity(name: &str) -> Option<&'static str> {
    Some(match name {
        "mdash" => "\u{2014}",
        "ndash" => "\u{2013}",
        "hellip" => "\u{2026}",
        "rsquo" => "\u{2019}",
        "lsquo" => "\u{2018}",
        "rdquo" => "\u{201d}",
        "ldquo" => "\u{201c}",
        "laquo" => "\u{00ab}",
        "raquo" => "\u{00bb}",
        "deg" => "\u{00b0}",
        "times" => "\u{00d7}",
        "middot" => "\u{00b7}",
        "bull" => "\u{2022}",
        "copy" => "\u{00a9}",
        "eacute" => "\u{00e9}",
        "egrave" => "\u{00e8}",
        "ecirc" => "\u{00ea}",
        "euml" => "\u{00eb}",
        "agrave" => "\u{00e0}",
        "acirc" => "\u{00e2}",
        "ccedil" => "\u{00e7}",
        "ugrave" => "\u{00f9}",
        "ucirc" => "\u{00fb}",
        "uuml" => "\u{00fc}",
        "ocirc" => "\u{00f4}",
        "ouml" => "\u{00f6}",
        "icirc" => "\u{00ee}",
        "iuml" => "\u{00ef}",
        _ => return None,
    })
}

fn decode_entities(value: &str) -> String {
    static NBSP: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)&nbsp;").unwrap());
    static LT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)&lt;").unwrap());
    static GT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)&gt;").unwrap());
    static QUOT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)&quot;").unwrap());
    static APOS: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)&#39;|&apos;").unwrap());
    static HEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)&#x([0-9a-f]+);").unwrap());
    static DEC: Lazy<Regex> = Lazy::new(|| Regex::new(r"&#(\d+);").unwrap());
    static NAMED: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)&([a-z]+);").unwrap());
    static AMP: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)&amp;").unwrap());

    let mut out = NBSP.replace_all(value, " ").into_owned();
    out = LT.replace_all(&out, "<").into_owned();
    out = GT.replace_all(&out, ">").into_owned();
    out = QUOT.replace_all(&out, "\"").into_owned();
    out = APOS.replace_all(&out, "'").into_owned();
    out = HEX
        .replace_all(&out, |caps: &Captures| {
            u32::from_str_radix(&caps[1], 16)
                .ok()
                .and_then(char::from_u32)
                .map(|c| c.to_string())
                .unwrap_or_else(|| " ".to_string())
        })
        .into_owned();
    out = DEC
        .replace_all(&out, |caps: &Captures| {
            caps[1]
                .parse::<u32>()
                .ok()
                .and_then(char::from_u32)
                .map(|c| c.to_string())
                .unwrap_or_else(|| " ".to_string())
        })
        .into_owned();
    out = NAMED
        .replace_all(&out, |caps: &Captures| named_entity(&caps[1].to_lowercase()).map(str::to_string).unwrap_or_else(|| caps[0].to_string()))
        .into_owned();
    out = AMP.replace_all(&out, "&").into_owned();
    out
}

/// Miroir de `htmlToText` — extraction de titre + texte, regex maison (pas
/// de parseur DOM), à l'identique du CLI Node.
pub fn html_to_text(html: &str) -> (String, String) {
    static TITLE_CAPTURE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<title[^>]*>([\s\S]*?)</title>").unwrap());
    static COMMENT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<!--[\s\S]*?-->").unwrap());
    static SCRIPT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<script\b[\s\S]*?</script>").unwrap());
    static STYLE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<style\b[\s\S]*?</style>").unwrap());
    static NOSCRIPT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<noscript\b[\s\S]*?</noscript>").unwrap());
    static SVG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<svg\b[\s\S]*?</svg>").unwrap());
    static HEAD_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<head\b[\s\S]*?</head>").unwrap());
    static TITLE_BLOCK_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<title\b[\s\S]*?</title>").unwrap());
    static BR_HR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<(?:br|hr)\b[^>]*/?>").unwrap());
    static BLOCK_CLOSE_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)</(?:p|div|li|h[1-6]|tr|section|article|blockquote|pre|ul|ol|table)>").unwrap());
    static TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());
    static SPACE_TAB_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[ \t]+").unwrap());
    static NL_SPACE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r" ?\n ?").unwrap());
    static MULTI_NL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\n{3,}").unwrap());
    static WS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

    let title_raw = TITLE_CAPTURE_RE.captures(html).and_then(|c| c.get(1)).map(|m| m.as_str()).unwrap_or("");
    let title_decoded = decode_entities(title_raw);
    let title = WS_RE.replace_all(&title_decoded, " ").trim().to_string();

    let mut body = html.to_string();
    body = COMMENT_RE.replace_all(&body, " ").into_owned();
    body = SCRIPT_RE.replace_all(&body, " ").into_owned();
    body = STYLE_RE.replace_all(&body, " ").into_owned();
    body = NOSCRIPT_RE.replace_all(&body, " ").into_owned();
    body = SVG_RE.replace_all(&body, " ").into_owned();
    body = HEAD_RE.replace_all(&body, " ").into_owned();
    body = TITLE_BLOCK_RE.replace_all(&body, " ").into_owned();
    body = BR_HR_RE.replace_all(&body, "\n").into_owned();
    body = BLOCK_CLOSE_RE.replace_all(&body, "\n").into_owned();
    body = TAG_RE.replace_all(&body, " ").into_owned();

    let decoded_body = decode_entities(&body);
    let mut text = SPACE_TAB_RE.replace_all(&decoded_body, " ").into_owned();
    text = NL_SPACE_RE.replace_all(&text, "\n").into_owned();
    text = MULTI_NL_RE.replace_all(&text, "\n\n").into_owned();
    let text = text.trim().to_string();

    (title, text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_to_text_extrait_titre_et_texte() {
        let html = "<html><head><title>Un &eacute;t\u{e9}</title></head><body><h1>Titre</h1><p>Un paragraphe.</p><script>evil()</script></body></html>";
        let (title, text) = html_to_text(html);
        assert_eq!(title, "Un \u{e9}t\u{e9}");
        assert!(text.contains("Titre"));
        assert!(text.contains("Un paragraphe."));
        assert!(!text.contains("evil()"));
    }

    #[test]
    fn decode_entities_gere_amp_en_dernier() {
        assert_eq!(decode_entities("Tom &amp; Jerry"), "Tom & Jerry");
        assert_eq!(decode_entities("&lt;div&gt;"), "<div>");
        assert_eq!(decode_entities("&#233;"), "\u{e9}");
        assert_eq!(decode_entities("&#x2014;"), "\u{2014}");
    }
}
