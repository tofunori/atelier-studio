//! Cartes « article » des pièces jointes du chat (2026-11-02).
//!
//! Le message envoyé ne gardait que le nom brut du fichier
//! (`s41561-026-01972-9.pdf`). Pour chaque chemin joint, on renvoie ce qui
//! rend la carte lisible : taille, nombre de pages, et pour un PDF le titre,
//! la revue et l'année. Priorité : notice Zotero (PDF de `storage/`), puis
//! métadonnées du PDF lui-même (XMP, sinon dictionnaire Info).
//!
//! Lecture volontairement légère, sans PDFium : on ne parcourt que le texte
//! brut du fichier et les flux d'objets / de métadonnées (FlateDecode).
//! Rien n'est écrit, rien n'est envoyé ailleurs.

use std::io::Read;
use std::path::Path;

use serde::Serialize;

/// Au-delà, on ne lit pas le PDF (taille seule).
const MAX_PDF_BYTES: u64 = 96 * 1024 * 1024;
/// Plafond de décompression par flux et nombre de flux décompressés.
const MAX_INFLATE: u64 = 8 * 1024 * 1024;
const MAX_STREAMS: usize = 4000;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCard {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pages: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub journal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<String>,
    /// Le chemin n'existe plus (fichier déplacé ou effacé depuis l'envoi).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub missing: bool,
}

/// Notice bibliographique déjà connue (Zotero).
#[derive(Debug, Clone, Default)]
pub struct KnownReference {
    pub title: String,
    pub journal: String,
    pub year: String,
}

pub fn file_card(path: &Path, zotero: impl FnOnce(&Path) -> Option<KnownReference>) -> FileCard {
    let mut card = FileCard { path: path.to_string_lossy().into_owned(), ..FileCard::default() };
    let Ok(meta) = std::fs::metadata(path) else {
        card.missing = true;
        return card;
    };
    if !meta.is_file() {
        return card;
    }
    card.size = Some(meta.len());
    let is_pdf = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"));
    if !is_pdf {
        return card;
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let pdf = if meta.len() <= MAX_PDF_BYTES {
        std::fs::read(path).ok().map(|bytes| pdf_meta(&bytes, stem)).unwrap_or_default()
    } else {
        PdfMeta::default()
    };
    card.pages = pdf.pages;
    let known = zotero(path).filter(|z| !z.title.trim().is_empty() && z.title != "(sans titre)");
    match known {
        Some(z) => {
            card.title = Some(clean_space(&z.title));
            card.journal = non_empty(&z.journal).or(pdf.journal);
            card.year = non_empty(&z.year).or(pdf.year);
        }
        None => {
            card.title = pdf.title;
            card.journal = pdf.journal;
            card.year = pdf.year;
        }
    }
    card
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct PdfMeta {
    pub pages: Option<u32>,
    pub title: Option<String>,
    pub journal: Option<String>,
    pub year: Option<String>,
}

/// Métadonnées d'un PDF en mémoire. `stem` (nom du fichier sans extension)
/// sert à écarter un « titre » qui ne fait que répéter le nom du fichier.
pub fn pdf_meta(bytes: &[u8], stem: &str) -> PdfMeta {
    let mut spaces: Vec<Vec<u8>> = Vec::new();
    for stream in streams(bytes).take(MAX_STREAMS) {
        let dict = &bytes[stream.dict.0..stream.dict.1];
        let wanted = has_name(dict, b"/Type", b"/ObjStm") || has_name(dict, b"/Type", b"/Metadata");
        if !wanted || !contains(dict, b"/FlateDecode") {
            continue;
        }
        if let Some(out) = inflate(&bytes[stream.data.0..stream.data.1]) {
            spaces.push(out);
        }
    }
    let all: Vec<&[u8]> = std::iter::once(bytes).chain(spaces.iter().map(Vec::as_slice)).collect();

    let pages = all.iter().filter_map(|space| page_count(space)).max();
    let xmp = all.iter().find_map(|space| xmp(space)).unwrap_or_default();
    let info = all.iter().find_map(|space| info_dict(space)).unwrap_or_default();

    let title = [xmp.title, info.title]
        .into_iter()
        .flatten()
        .map(|t| clean_space(&t))
        .find(|t| plausible_title(t, stem));
    let journal = xmp
        .journal
        .or(info.journal)
        .map(|j| clean_space(&j))
        .filter(|j| !j.is_empty() && j.chars().count() <= 120);
    PdfMeta { pages, title, journal, year: xmp.year }
}

// ---- flux --------------------------------------------------------------

struct Stream {
    dict: (usize, usize),
    data: (usize, usize),
}

/// Flux du fichier : dictionnaire (depuis l'en-tête `obj`) et données brutes.
fn streams(bytes: &[u8]) -> impl Iterator<Item = Stream> + '_ {
    let mut at = 0;
    std::iter::from_fn(move || loop {
        let rel = find(&bytes[at..], b"stream")?;
        let kw = at + rel;
        at = kw + 6;
        // « endstream » n'ouvre rien.
        if kw >= 3 && &bytes[kw - 3..kw] == b"end" {
            continue;
        }
        let mut start = kw + 6;
        if bytes.get(start) == Some(&b'\r') {
            start += 1;
        }
        if bytes.get(start) != Some(&b'\n') {
            continue;
        }
        start += 1;
        let head_from = kw.saturating_sub(4096);
        let Some(obj) = rfind(&bytes[head_from..kw], b"obj") else { continue };
        let dict = (head_from + obj + 3, kw);
        let declared = length(&bytes[dict.0..dict.1]);
        let end = declared
            .map(|len| start + len)
            .filter(|end| *end <= bytes.len() && find(&bytes[*end..(*end + 32).min(bytes.len())], b"endstream").is_some())
            .or_else(|| find(&bytes[start..], b"endstream").map(|e| start + e))?;
        at = end;
        return Some(Stream { dict, data: (start, end) });
    })
}

fn length(dict: &[u8]) -> Option<usize> {
    let at = find(dict, b"/Length")? + 7;
    let rest = &dict[at..];
    let (n, used) = number(rest)?;
    // « /Length 12 0 R » : référence indirecte, on retombe sur endstream.
    let after = skip_ws(&rest[used..]);
    if let Some((_, used2)) = number(after) {
        if skip_ws(&after[used2..]).first() == Some(&b'R') {
            return None;
        }
    }
    usize::try_from(n).ok()
}

fn inflate(data: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    flate2::read::ZlibDecoder::new(data).take(MAX_INFLATE).read_to_end(&mut out).ok()?;
    (!out.is_empty()).then_some(out)
}

// ---- pages -------------------------------------------------------------

/// Plus grand `/Count` d'un dictionnaire `/Type /Pages` : celui de la racine.
fn page_count(space: &[u8]) -> Option<u32> {
    let mut best: Option<u32> = None;
    let mut at = 0;
    while let Some(rel) = find(&space[at..], b"/Pages") {
        let pos = at + rel;
        at = pos + 6;
        if space.get(pos + 6).is_some_and(|c| c.is_ascii_alphanumeric()) {
            continue;
        }
        let before = trim_ws_end(&space[pos.saturating_sub(16)..pos]);
        if !before.ends_with(b"/Type") {
            continue;
        }
        let Some(dict) = enclosing_dict(space, pos) else { continue };
        let Some(c) = find(dict, b"/Count") else { continue };
        if let Some((n, _)) = number(&dict[c + 6..]) {
            if (1..=100_000).contains(&n) {
                best = Some(best.map_or(n as u32, |b| b.max(n as u32)));
            }
        }
    }
    best
}

// ---- XMP ---------------------------------------------------------------

#[derive(Default)]
struct Found {
    title: Option<String>,
    journal: Option<String>,
    year: Option<String>,
}

fn xmp(space: &[u8]) -> Option<Found> {
    let start = find(space, b"<x:xmpmeta").or_else(|| find(space, b"<rdf:RDF"))?;
    let end = find(&space[start..], b"</x:xmpmeta>")
        .or_else(|| find(&space[start..], b"</rdf:RDF>"))
        .map(|e| start + e)
        .unwrap_or_else(|| (start + 256 * 1024).min(space.len()));
    let text = String::from_utf8_lossy(&space[start..end]);
    let title = element(&text, "dc:title").map(|t| first_li(&t)).map(|t| xml_unescape(&t));
    let journal = element(&text, "prism:publicationName")
        .or_else(|| attribute(&text, "prism:publicationName"))
        .map(|t| xml_unescape(&first_li(&t)));
    let year = ["prism:coverDate", "prism:publicationDate", "prism:coverDisplayDate"]
        .iter()
        .find_map(|name| element(&text, name).or_else(|| attribute(&text, name)))
        .and_then(|d| year_in(&d));
    Some(Found { title, journal, year })
}

fn element(text: &str, name: &str) -> Option<String> {
    let open = format!("<{name}");
    let at = text.find(&open)?;
    let after = &text[at + open.len()..];
    // `<prism:doi>` ne doit pas répondre à `<prism:doiX>`.
    if !after.starts_with(['>', ' ', '\n', '\r', '\t']) {
        return None;
    }
    let gt = after.find('>')?;
    if after[..gt].ends_with('/') {
        return None;
    }
    let body = &after[gt + 1..];
    let close = body.find(&format!("</{name}>"))?;
    Some(body[..close].to_string())
}

fn attribute(text: &str, name: &str) -> Option<String> {
    let key = format!("{name}=");
    let at = text.find(&key)?;
    let rest = &text[at + key.len()..];
    let quote = rest.chars().next().filter(|c| *c == '"' || *c == '\'')?;
    let body = &rest[1..];
    Some(body[..body.find(quote)?].to_string())
}

/// Premier `<rdf:li>` d'un conteneur (Alt/Seq/Bag), sinon le texte nu.
fn first_li(raw: &str) -> String {
    if let Some(at) = raw.find("<rdf:li") {
        let after = &raw[at..];
        if let Some(gt) = after.find('>') {
            let body = &after[gt + 1..];
            if let Some(end) = body.find("</rdf:li>") {
                return body[..end].to_string();
            }
        }
    }
    if raw.contains('<') { String::new() } else { raw.to_string() }
}

fn xml_unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let tail = &rest[amp..];
        let Some(semi) = tail.find(';').filter(|i| *i <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let entity = &tail[1..semi];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            e if e.starts_with("#x") || e.starts_with("#X") => u32::from_str_radix(&e[2..], 16).ok().and_then(char::from_u32),
            e if e.starts_with('#') => e[1..].parse().ok().and_then(char::from_u32),
            _ => None,
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &tail[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

// ---- dictionnaire Info -------------------------------------------------

/// `/Title` d'un dictionnaire Info (il porte aussi /Producer, /Creator ou une
/// date) — jamais celui d'un signet du sommaire. `/Subject` « Revue, doi:… »
/// (Springer Nature, Elsevier) donne la revue.
fn info_dict(space: &[u8]) -> Option<Found> {
    let mut at = 0;
    while let Some(rel) = find(&space[at..], b"/Title") {
        let pos = at + rel;
        at = pos + 6;
        let Some(dict) = enclosing_dict(space, pos) else { continue };
        let is_info = [b"/Producer".as_slice(), b"/Creator", b"/CreationDate", b"/ModDate"]
            .iter()
            .any(|k| contains(dict, k));
        if !is_info {
            continue;
        }
        let title = string_value(dict, b"/Title");
        let journal = string_value(dict, b"/Subject").and_then(|s| journal_from_subject(&s));
        if title.is_some() || journal.is_some() {
            return Some(Found { title, journal, year: None });
        }
    }
    None
}

fn journal_from_subject(subject: &str) -> Option<String> {
    let lower = subject.to_lowercase();
    if !lower.contains("doi") {
        return None;
    }
    let head = subject.split([',', ';']).next()?.trim();
    (!head.is_empty() && !head.to_lowercase().starts_with("doi") && head.chars().any(char::is_alphabetic))
        .then(|| head.to_string())
}

fn string_value(dict: &[u8], key: &[u8]) -> Option<String> {
    let mut at = 0;
    loop {
        let pos = at + find(&dict[at..], key)?;
        at = pos + key.len();
        if dict.get(at).is_some_and(|c| c.is_ascii_alphanumeric()) {
            continue;
        }
        let rest = skip_ws(&dict[at..]);
        return match rest.first() {
            Some(b'(') => Some(decode_text(&literal(&rest[1..]))),
            Some(b'<') if rest.get(1) != Some(&b'<') => Some(decode_text(&hex_string(&rest[1..]))),
            _ => None,
        };
    }
}

fn literal(s: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut depth = 0usize;
    let mut i = 0;
    while i < s.len() {
        let c = s[i];
        match c {
            b'\\' => {
                i += 1;
                let Some(&e) = s.get(i) else { break };
                match e {
                    b'n' => out.push(b'\n'),
                    b'r' => out.push(b'\r'),
                    b't' => out.push(b'\t'),
                    b'b' => out.push(8),
                    b'f' => out.push(12),
                    b'\r' | b'\n' => {
                        if e == b'\r' && s.get(i + 1) == Some(&b'\n') {
                            i += 1;
                        }
                    }
                    b'0'..=b'7' => {
                        let mut v: u32 = 0;
                        let mut n = 0;
                        while n < 3 && i < s.len() && (b'0'..=b'7').contains(&s[i]) {
                            v = v * 8 + u32::from(s[i] - b'0');
                            i += 1;
                            n += 1;
                        }
                        out.push(v as u8);
                        continue;
                    }
                    other => out.push(other),
                }
            }
            b'(' => {
                depth += 1;
                out.push(c);
            }
            b')' => {
                if depth == 0 {
                    break;
                }
                depth -= 1;
                out.push(c);
            }
            _ => out.push(c),
        }
        i += 1;
    }
    out
}

fn hex_string(s: &[u8]) -> Vec<u8> {
    let digits: Vec<u8> = s
        .iter()
        .take_while(|c| **c != b'>')
        .filter_map(|c| (*c as char).to_digit(16).map(|d| d as u8))
        .collect();
    digits.chunks(2).map(|p| (p[0] << 4) | p.get(1).copied().unwrap_or(0)).collect()
}

/// UTF-16BE (BOM FE FF), UTF-8 (BOM EF BB BF), sinon PDFDocEncoding ≈ Latin-1.
fn decode_text(raw: &[u8]) -> String {
    if raw.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = raw[2..].chunks(2).filter(|p| p.len() == 2).map(|p| u16::from_be_bytes([p[0], p[1]])).collect();
        return String::from_utf16_lossy(&units);
    }
    if let Some(rest) = raw.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(rest).into_owned();
    }
    raw.iter().map(|b| *b as char).collect()
}

// ---- titres ------------------------------------------------------------

/// Écarte les « titres » qui n'en sont pas : nom de fichier, gabarit Word,
/// identifiant sans espace, texte trop court.
fn plausible_title(title: &str, stem: &str) -> bool {
    let t = title.trim();
    let lower = t.to_lowercase();
    if t.chars().count() < 8 || t.chars().count() > 400 || !t.contains(' ') {
        return false;
    }
    if !stem.is_empty() && lower == stem.to_lowercase() {
        return false;
    }
    let junk = ["microsoft word", "untitled", "sans titre", "layout 1", "doi:", "powerpoint"];
    if junk.iter().any(|j| lower.starts_with(j) || lower.contains(&format!("{j} - "))) {
        return false;
    }
    let ext = [".pdf", ".doc", ".docx", ".tex", ".dvi", ".indd", ".qxd", ".ps"];
    !ext.iter().any(|e| lower.ends_with(e))
}

fn clean_space(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn non_empty(s: &str) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| t.to_string())
}

fn year_in(s: &str) -> Option<String> {
    let chars: Vec<char> = s.chars().collect();
    chars
        .windows(4)
        .find(|w| w.iter().all(char::is_ascii_digit) && matches!(w[0], '1' | '2'))
        .map(|w| w.iter().collect())
}

// ---- octets ------------------------------------------------------------

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    hay.windows(needle.len()).position(|w| w == needle)
}

fn rfind(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    hay.windows(needle.len()).rposition(|w| w == needle)
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    find(hay, needle).is_some()
}

/// `/Type /ObjStm` (avec ou sans espace).
fn has_name(dict: &[u8], key: &[u8], value: &[u8]) -> bool {
    let mut at = 0;
    while let Some(rel) = find(&dict[at..], key) {
        let pos = at + rel + key.len();
        at = pos;
        let rest = skip_ws(&dict[pos..]);
        if rest.starts_with(value) && !rest.get(value.len()).is_some_and(|c| c.is_ascii_alphanumeric()) {
            return true;
        }
    }
    false
}

fn skip_ws(s: &[u8]) -> &[u8] {
    let n = s.iter().take_while(|c| c.is_ascii_whitespace() || **c == 0).count();
    &s[n..]
}

fn trim_ws_end(s: &[u8]) -> &[u8] {
    let n = s.iter().rev().take_while(|c| c.is_ascii_whitespace()).count();
    &s[..s.len() - n]
}

fn number(s: &[u8]) -> Option<(i64, usize)> {
    let lead = s.len() - skip_ws(s).len();
    let digits = s[lead..].iter().take_while(|c| c.is_ascii_digit()).count();
    if digits == 0 || digits > 12 {
        return None;
    }
    let n = std::str::from_utf8(&s[lead..lead + digits]).ok()?.parse().ok()?;
    Some((n, lead + digits))
}

/// Le dictionnaire `<< … >>` qui contient `pos` (imbrication comprise).
fn enclosing_dict(space: &[u8], pos: usize) -> Option<&[u8]> {
    let lo = pos.saturating_sub(16 * 1024);
    let mut depth = 0i32;
    let mut i = pos;
    let mut start = None;
    while i > lo + 1 {
        i -= 1;
        if space[i - 1] == b'>' && space[i] == b'>' {
            depth += 1;
            i -= 1;
        } else if space[i - 1] == b'<' && space[i] == b'<' {
            if depth == 0 {
                start = Some(i - 1);
                break;
            }
            depth -= 1;
            i -= 1;
        }
    }
    let start = start?;
    let hi = (pos + 16 * 1024).min(space.len());
    let mut depth = 0i32;
    let mut j = pos;
    while j + 1 < hi {
        if space[j] == b'<' && space[j + 1] == b'<' {
            depth += 1;
            j += 2;
            continue;
        }
        if space[j] == b'>' && space[j + 1] == b'>' {
            if depth == 0 {
                return Some(&space[start..j + 2]);
            }
            depth -= 1;
            j += 2;
            continue;
        }
        j += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn deflate(data: &[u8]) -> Vec<u8> {
        let mut e = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        e.write_all(data).unwrap();
        e.finish().unwrap()
    }

    const XMP: &str = r#"<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Wildfire smoke darkens glacier ice &amp; snow</rdf:li></rdf:Alt></dc:title>
<prism:publicationName>Nature Geoscience</prism:publicationName>
<prism:coverDate>2026-03-04</prism:coverDate>
</rdf:Description></rdf:RDF></x:xmpmeta>"#;

    #[test]
    fn plain_pdf_reads_pages_and_info_title() {
        let pdf = b"%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n\
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >> endobj\n\
6 0 obj << /Title (Bare-ice albedo decline \\(Arctic\\) amplifies loss) /Producer (TeX) >> endobj\n\
7 0 obj << /Title (Introduction) /Parent 8 0 R /Dest [3 0 R /Fit] >> endobj\n";
        let meta = pdf_meta(pdf, "paper");
        assert_eq!(meta.pages, Some(3));
        assert_eq!(meta.title.as_deref(), Some("Bare-ice albedo decline (Arctic) amplifies loss"));
        assert_eq!(meta.journal, None);
    }

    #[test]
    fn xmp_wins_and_gives_journal_and_year() {
        let pdf = format!(
            "%PDF-1.6\n3 0 obj << /Type /Metadata /Subtype /XML /Length {} >>\nstream\n{}\nendstream endobj\n\
9 0 obj << /Title (s41561-026-01972-9) /Producer (x) /Subject (Nature Geoscience, doi:10.1038/s41561-026-01972-9) >> endobj\n",
            XMP.len() + 1,
            XMP
        );
        let meta = pdf_meta(pdf.as_bytes(), "s41561-026-01972-9");
        assert_eq!(meta.title.as_deref(), Some("Wildfire smoke darkens glacier ice & snow"));
        assert_eq!(meta.journal.as_deref(), Some("Nature Geoscience"));
        assert_eq!(meta.year.as_deref(), Some("2026"));
    }

    #[test]
    fn compressed_object_streams_and_metadata_are_read() {
        let objs = b"<< /Type /Pages /Kids [4 0 R] /Count 14 >> << /Title <FEFF0041006C006200650064006F00200061006E0064002000690063006500> /CreationDate (D:2026) /Subject (Remote Sensing of Environment, 285 (2023) 113402. doi:10.1016/j.rse) >>";
        let packed = deflate(objs);
        let xmp = deflate(b"<x:xmpmeta><rdf:RDF/></x:xmpmeta>");
        let mut pdf = b"%PDF-1.7\n".to_vec();
        pdf.extend_from_slice(format!("5 0 obj << /Type /ObjStm /N 2 /First 8 /Filter /FlateDecode /Length {} >>\nstream\n", packed.len()).as_bytes());
        pdf.extend_from_slice(&packed);
        pdf.extend_from_slice(b"\nendstream\nendobj\n");
        pdf.extend_from_slice(b"6 0 obj << /Type /Metadata /Filter /FlateDecode /Length 9 0 R >>\nstream\n");
        pdf.extend_from_slice(&xmp);
        pdf.extend_from_slice(b"\nendstream\nendobj\n");
        let meta = pdf_meta(&pdf, "x");
        assert_eq!(meta.pages, Some(14));
        assert_eq!(meta.title.as_deref(), Some("Albedo and ice"));
        assert_eq!(meta.journal.as_deref(), Some("Remote Sensing of Environment"));
    }

    #[test]
    fn junk_titles_are_rejected() {
        assert!(!plausible_title("Microsoft Word - draft_v3.docx", "draft"));
        assert!(!plausible_title("s41561-026-01972-9", "s41561-026-01972-9"));
        assert!(!plausible_title("paper final.pdf", "paper"));
        assert!(!plausible_title("Untitled", "x"));
        assert!(plausible_title("Glacier albedo feedbacks in the Andes", "x"));
    }

    #[test]
    fn file_card_prefers_zotero_and_reports_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.pdf");
        std::fs::write(&path, b"%PDF-1.4\n<< /Type /Pages /Count 2 >>").unwrap();
        let card = file_card(&path, |_| {
            Some(KnownReference { title: "  Zotero   title here ".into(), journal: "J. Glaciol.".into(), year: "2024".into() })
        });
        assert_eq!(card.size, Some(36));
        assert_eq!(card.pages, Some(2));
        assert_eq!(card.title.as_deref(), Some("Zotero title here"));
        assert_eq!(card.journal.as_deref(), Some("J. Glaciol."));
        assert_eq!(card.year.as_deref(), Some("2024"));

        let csv = dir.path().join("data.csv");
        std::fs::write(&csv, b"a,b\n").unwrap();
        let card = file_card(&csv, |_| panic!("pas de Zotero pour un CSV"));
        assert_eq!((card.size, card.pages, card.title.clone()), (Some(4), None, None));

        let gone = file_card(&dir.path().join("gone.pdf"), |_| None);
        assert!(gone.missing);
        assert_eq!(serde_json::to_value(&gone).unwrap()["missing"], true);
    }
}
