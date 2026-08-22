//! Port de la chaîne YouTube de `sidecar/knowledge.mjs` (`parseYoutubeUrl`,
//! `vttToPages`, `defaultFetchYoutube`) — dernier recours au CLI Node de la
//! base de connaissances, retiré le 2026-08-22. Aucune API : la transcription
//! vient de `yt-dlp`, spawné comme `pdftotext` l'est pour les PDF.

use crate::search::Page;
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::BTreeMap;
use std::path::Path;
use std::time::Duration;

/// Longueur d'un segment de transcription, en secondes (`YT_BUCKET_SECONDS`).
pub const YT_BUCKET_SECONDS: u64 = 60;

/// Vidéo identifiée : `id` brut et URL canonique (clé d'identité du store).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct YoutubeRef {
    pub id: String,
    pub href: String,
}

static ID_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[\w-]{6,20}$").unwrap());
static CUE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(?:(\d+):)?(\d{1,2}):(\d{2})[.,]\d{3}\s*-->").unwrap());
static TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());
static SKIP_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^(Kind|Language|NOTE|STYLE|Region)\b").unwrap());
static DIGITS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\d+$").unwrap());
static WS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

/// Miroir de `parseYoutubeUrl` : accepte youtu.be, /watch?v=, /shorts/,
/// /live/ et /embed/, sur les hôtes www, m et music.
pub fn parse_youtube_url(origin: &str) -> Result<YoutubeRef, String> {
    let err = || format!("URL YouTube non reconnue: {origin}");
    let url = url::Url::parse(origin.trim()).map_err(|_| err())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(err());
    }
    let host_raw = url.host_str().ok_or_else(err)?.to_lowercase();
    let host = host_raw
        .strip_prefix("www.")
        .or_else(|| host_raw.strip_prefix("m."))
        .or_else(|| host_raw.strip_prefix("music."))
        .unwrap_or(&host_raw);
    let path = url.path().to_string();
    let id = if host == "youtu.be" {
        path.trim_start_matches('/').split('/').next().unwrap_or("").to_string()
    } else if host == "youtube.com" {
        if path == "/watch" {
            url.query_pairs()
                .find(|(k, _)| k == "v")
                .map(|(_, v)| v.into_owned())
                .unwrap_or_default()
        } else {
            let mut parts = path.split('/').skip(1);
            match parts.next() {
                Some("shorts") | Some("live") | Some("embed") => {
                    parts.next().unwrap_or("").to_string()
                }
                _ => String::new(),
            }
        }
    } else {
        String::new()
    };
    if !ID_RE.is_match(&id) {
        return Err(err());
    }
    Ok(YoutubeRef {
        href: format!("https://www.youtube.com/watch?v={id}"),
        id,
    })
}

/// Miroir de `vttToPages` : un segment par tranche de `bucket_seconds`, les
/// lignes répétées des sous-titres automatiques dédoublonnées.
pub fn vtt_to_pages(vtt: &str, bucket_seconds: u64) -> Vec<Page> {
    let bucket_seconds = bucket_seconds.max(1);
    let mut buckets: BTreeMap<u64, String> = BTreeMap::new();
    let mut current_start: Option<u64> = None;
    let mut last_text = String::new();
    for raw_line in vtt.split('\n') {
        let line = raw_line.trim_end_matches('\r').trim();
        if let Some(cue) = CUE_RE.captures(line) {
            let hours: u64 = cue.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
            let minutes: u64 = cue[2].parse().unwrap_or(0);
            let seconds: u64 = cue[3].parse().unwrap_or(0);
            current_start = Some(hours * 3600 + minutes * 60 + seconds);
            continue;
        }
        if line.is_empty() || line == "WEBVTT" || SKIP_RE.is_match(line) || DIGITS_RE.is_match(line) {
            continue;
        }
        let Some(start) = current_start else { continue };
        let stripped = TAG_RE.replace_all(line, "");
        let text = WS_RE.replace_all(stripped.trim(), " ").into_owned();
        if text.is_empty() || text == last_text {
            continue;
        }
        last_text = text.clone();
        let entry = buckets.entry(start / bucket_seconds).or_default();
        if !entry.is_empty() {
            entry.push(' ');
        }
        entry.push_str(&text);
    }
    buckets
        .into_iter()
        .filter(|(_, text)| !text.is_empty())
        .map(|(bucket, text)| Page { page: (bucket + 1) as u32, text })
        .collect()
}

/// Métadonnées + transcription rapportées par `yt-dlp`.
#[derive(Debug, Clone, Default)]
pub struct FetchedVideo {
    pub title: String,
    pub duration: Option<f64>,
    pub channel: Option<String>,
    pub vtt: String,
}

fn run_ytdlp(args: &[&str], timeout: Duration) -> Result<std::process::Output, String> {
    let mut child = std::process::Command::new("yt-dlp")
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("yt-dlp indisponible: {e} (brew install yt-dlp)"))?;
    // `spawnSync` côté Node porte un timeout ; ici on sonde puis on tue.
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            return Err("yt-dlp: délai dépassé".to_string());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    child.wait_with_output().map_err(|e| e.to_string())
}

/// Miroir de `defaultFetchYoutube` : deux passes `yt-dlp` — métadonnées, puis
/// sous-titres VTT (français d'abord, anglais ensuite) dans un dossier
/// temporaire supprimé à la sortie.
pub fn fetch_youtube(url: &str) -> Result<FetchedVideo, String> {
    let meta = run_ytdlp(
        &["--no-download", "--no-playlist", "--print", "%(title)s\n%(duration)s\n%(channel)s", url],
        Duration::from_secs(45),
    )?;
    if !meta.status.success() {
        let stderr = String::from_utf8_lossy(&meta.stderr).trim().to_string();
        return Err(if stderr.is_empty() { "yt-dlp: échec".to_string() } else { stderr });
    }
    let stdout = String::from_utf8_lossy(&meta.stdout).trim().to_string();
    let mut lines = stdout.split('\n');
    let title = lines.next().unwrap_or("").trim().to_string();
    let duration = lines.next().and_then(|d| d.trim().parse::<f64>().ok()).filter(|d| d.is_finite());
    let channel = lines
        .next()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty() && c != "NA");

    let subs_dir = tempdir_for("atelier-kb-yt-")?;
    let result = (|| -> Result<String, String> {
        let out_template = subs_dir.join("sub");
        run_ytdlp(
            &[
                "--skip-download", "--no-playlist", "--write-subs", "--write-auto-subs",
                "--sub-langs", "fr,fr-*,en,en-*", "--sub-format", "vtt",
                "-o", &out_template.to_string_lossy(), url,
            ],
            Duration::from_secs(90),
        )?;
        let mut vtts: Vec<String> = std::fs::read_dir(&subs_dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".vtt"))
            .collect();
        // français d'abord, anglais ensuite, le reste en dernier (rank de Node)
        vtts.sort_by_key(|name| (lang_rank(name), name.clone()));
        let best = vtts
            .first()
            .ok_or("Aucun sous-titre disponible pour cette vidéo (transcript requis)")?;
        std::fs::read_to_string(subs_dir.join(best)).map_err(|e| e.to_string())
    })();
    let _ = std::fs::remove_dir_all(&subs_dir);
    Ok(FetchedVideo { title, duration, channel, vtt: result? })
}

fn lang_rank(name: &str) -> u8 {
    if name.contains(".fr.") || name.contains(".fr-") || name.ends_with(".fr.vtt") {
        0
    } else if name.contains(".en.") || name.contains(".en-") || name.ends_with(".en.vtt") {
        1
    } else {
        2
    }
}

fn tempdir_for(prefix: &str) -> Result<std::path::PathBuf, String> {
    let base = std::env::temp_dir();
    for attempt in 0..64 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .subsec_nanos();
        let candidate = base.join(format!("{prefix}{}{}", std::process::id(), nanos + attempt));
        if !Path::new(&candidate).exists() && std::fs::create_dir_all(&candidate).is_ok() {
            return Ok(candidate);
        }
    }
    Err("dossier temporaire indisponible".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_youtube_url_reconnait_les_cinq_formes() {
        let cases = [
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/live/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
        ];
        for case in cases {
            let parsed = parse_youtube_url(case).unwrap_or_else(|e| panic!("{case} -> {e}"));
            assert_eq!(parsed.id, "dQw4w9WgXcQ", "{case}");
            // href normalisée : la clé d'identité du store ne dépend pas de la forme saisie
            assert_eq!(parsed.href, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "{case}");
        }
    }

    #[test]
    fn parse_youtube_url_rejette_ce_qui_n_est_pas_une_video() {
        assert!(parse_youtube_url("https://example.org/watch?v=dQw4w9WgXcQ").is_err());
        assert!(parse_youtube_url("https://www.youtube.com/watch").is_err());
        assert!(parse_youtube_url("https://www.youtube.com/results?search_query=x").is_err());
        assert!(parse_youtube_url("pas une url").is_err());
        // id trop court : le regex Node exige 6 à 20 caractères de mot
        assert!(parse_youtube_url("https://youtu.be/abc").is_err());
    }

    #[test]
    fn vtt_to_pages_groupe_par_minute_et_dedoublonne() {
        let vtt = "WEBVTT\nKind: captions\nLanguage: fr\n\n\
                   1\n00:00:03.000 --> 00:00:06.000\nle bilan <c>radiatif</c>\n\n\
                   2\n00:00:07.000 --> 00:00:09.000\nle bilan radiatif\n\n\
                   3\n00:00:12.000 --> 00:00:15.000\nde la neige\n\n\
                   4\n01:05.000 --> 01:08.000\nseconde minute\n";
        let pages = vtt_to_pages(vtt, YT_BUCKET_SECONDS);
        assert_eq!(pages.len(), 2, "{pages:?}");
        // page = bucket + 1 ; balises retirées ; ligne répétée ignorée une fois
        assert_eq!(pages[0].page, 1);
        assert_eq!(pages[0].text, "le bilan radiatif de la neige");
        assert_eq!(pages[1].page, 2);
        assert_eq!(pages[1].text, "seconde minute");
    }

    #[test]
    fn vtt_to_pages_ignore_l_entete_et_le_vide() {
        assert!(vtt_to_pages("", YT_BUCKET_SECONDS).is_empty());
        assert!(vtt_to_pages("WEBVTT\nNOTE rien\nSTYLE\nRegion: x\n", YT_BUCKET_SECONDS).is_empty());
        // du texte avant tout timecode n'appartient à aucune page
        assert!(vtt_to_pages("WEBVTT\n\norpheline\n", YT_BUCKET_SECONDS).is_empty());
    }

    #[test]
    fn vtt_to_pages_lit_les_timecodes_avec_et_sans_heures() {
        let pages = vtt_to_pages(
            "WEBVTT\n\n01:00:30.000 --> 01:00:32.000\napres une heure\n",
            YT_BUCKET_SECONDS,
        );
        // 3630 s / 60 = bucket 60 -> page 61
        assert_eq!(pages[0].page, 61, "{pages:?}");
    }
}
