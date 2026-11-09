//! Outil `highlight_passage` : surligner un passage cité dans un PDF Zotero,
//! dans le store du lecteur d'Atelier (`pdf_annots.json`).
//!
//! La citation est retrouvée par `atelier_pdf::passage` (couche texte du PDF,
//! un rectangle par ligne en fractions de la page).
//!
//! L'écriture passe par le lecteur et l'écrivain communs du store
//! (`atelier_store::pdf_annots`) : même verrou que le serveur galerie
//! (`pdf_annots.lock`), puis remplacement durable du fichier d'un bloc ; la
//! visionneuse ouverte le voit à la date du fichier (`/pdfannot-stamp`).

use crate::library::{self, fold, Config};
use crate::zotero;
use atelier_store::pdf_annots;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

// La recherche du passage dans le PDF est partagée avec l'outil d'annotation
// de l'agent du chat (`atelier_pdf::passage`).
pub use atelier_pdf::passage::{find, norm, page_text, parts, read_pdf, Page, MIN_NEEDLE_CHARS};

pub const MAX_PASSAGES: usize = 20;

/// Les teintes du lecteur (`HL_COLORS` de `pdf_viewer.html`, même ordre).
pub const COLORS: [(&str, &str); 6] = [
    ("jaune", "rgba(255,213,74,.40)"),
    ("vert", "rgba(120,220,140,.40)"),
    ("bleu", "rgba(120,170,255,.40)"),
    ("rose", "rgba(255,140,160,.40)"),
    ("orange", "rgba(255,160,80,.40)"),
    ("violet", "rgba(185,150,255,.40)"),
];

/// Style d'un marquage : `kind` du lecteur (`hl` surligné, `ul` souligné,
/// `st` barré).
pub const STYLES: [(&str, &str); 3] = [("surligner", "hl"), ("souligner", "ul"), ("barrer", "st")];

/// Un PDF Zotero : sa clé, son chemin dans le store (`zotero/<clé>/<fichier>`)
/// et sur disque.
pub struct Target {
    pub article: library::Article,
    pub rel: String,
    pub pdf: PathBuf,
}

/// Retrouve l'article voulu parmi les PDF de Zotero : clé exacte, ou tous
/// les mots de `wanted` dans la clé, la référence, le titre, les auteurs ou
/// l'année.
pub fn resolve(config: &Config, wanted: &str) -> Result<Target, String> {
    let (meta, _) = zotero::read(&config.zotero_dir, &config.cache_dir)
        .map_err(|e| format!("Zotero illisible : {e}"))?;
    let words: Vec<String> = fold(wanted)
        .split_whitespace()
        .map(str::to_string)
        .collect();
    if words.is_empty() {
        return Err(
            "Paramètre `article` requis (clé Zotero, auteur, année ou mots du titre).".into(),
        );
    }
    let mut found: Vec<Target> = meta
        .iter()
        .filter(|(_, m)| !m.file.is_empty())
        .filter_map(|(key, m)| {
            let rel = format!("zotero/{key}/{}", m.file);
            let article = library::article(key, Some(m), Some(&rel));
            let exact = key.eq_ignore_ascii_case(wanted.trim());
            let ident = fold(&format!(
                "{key} {} {} {} {}",
                article.citation, article.title, article.authors, article.year
            ));
            (exact || words.iter().all(|w| ident.contains(w.as_str()))).then(|| Target {
                pdf: config.zotero_dir.join("storage").join(key).join(&m.file),
                rel,
                article,
            })
        })
        .collect();
    if let Some(i) = found
        .iter()
        .position(|t| t.article.key.eq_ignore_ascii_case(wanted.trim()))
    {
        return Ok(found.swap_remove(i));
    }
    found.retain(|t| t.pdf.is_file());
    // « Fire and Ice » : chaque mot se retrouve dans plusieurs articles, mais
    // un seul titre (ou référence) contient l'expression entière.
    if found.len() > 1 {
        let phrase = fold(wanted.trim());
        let whole: Vec<usize> = (0..found.len())
            .filter(|&i| {
                let a = &found[i].article;
                fold(&a.title).contains(&phrase) || fold(&a.citation).contains(&phrase)
            })
            .collect();
        if let [i] = whole[..] {
            return Ok(found.swap_remove(i));
        }
    }
    match found.len() {
        0 => Err(format!("Aucun PDF de Zotero ne correspond à « {wanted} ».")),
        1 => Ok(found.remove(0)),
        n => {
            found.sort_by(|a, b| a.article.citation.cmp(&b.article.citation));
            let list: Vec<String> = found
                .iter()
                .take(8)
                .map(|t| {
                    format!(
                        "- {} [{}] {}",
                        t.article.citation, t.article.key, t.article.title
                    )
                })
                .collect();
            Err(format!(
                "{n} articles correspondent à « {wanted} » ; relancer avec la clé entre crochets :\n{}",
                list.join("\n")
            ))
        }
    }
}

/// Ouvre le store sous le verrou du serveur galerie, laisse `op` changer les
/// annotations, et ne réécrit le fichier (d'un bloc, après la sauvegarde du
/// jour) que si `op` dit l'avoir changé. Lecteur, verrou et écrivain sont
/// ceux de tous les écrivains du store (`atelier_store::pdf_annots`) : un store
/// illisible n'est jamais remplacé, ce serait tout perdre.
fn with_store<T>(
    app_dir: &Path,
    op: impl FnOnce(&mut serde_json::Map<String, Value>) -> Result<(T, bool), String>,
) -> Result<T, String> {
    pdf_annots::with_store(app_dir, op)
}

/// Ajoute `new` aux annotations de `rel`, sous le verrou du serveur galerie.
/// Un passage déjà surligné sur la même page n'est pas doublé : son index est
/// renvoyé dans la liste des doublons.
pub fn add_to_store(app_dir: &Path, rel: &str, new: Vec<Value>) -> Result<Vec<usize>, String> {
    with_store(app_dir, |map| {
        let list = map.entry(rel.to_string()).or_insert_with(|| json!([]));
        let Some(list) = list.as_array_mut() else {
            return Err(format!("annotations de {rel} illisibles"));
        };
        // un soulignement du même texte qu'un surlignage n'est pas un doublon
        let key = |a: &Value| {
            (
                a.get("page").and_then(Value::as_u64),
                norm(a.get("text").and_then(Value::as_str).unwrap_or("")),
                a.get("kind")
                    .and_then(Value::as_str)
                    .unwrap_or("hl")
                    .to_string(),
            )
        };
        let mut duplicates = Vec::new();
        for (i, annot) in new.into_iter().enumerate() {
            if list.iter().any(|old| key(old) == key(&annot)) {
                duplicates.push(i);
            } else {
                list.push(annot);
            }
        }
        Ok((duplicates, true))
    })
}

/// Ce que `edit_highlights` fait aux surlignages retrouvés.
pub enum Edit {
    Remove,
    /// `None` = inchangé ; une note vide retire la note.
    Update {
        color: Option<&'static str>,
        memo: Option<String>,
        /// `kind` du lecteur : `hl`, `ul` ou `st`.
        style: Option<&'static str>,
    },
}

/// Un passage surligné par Claude peut couvrir plusieurs pages, donc plusieurs
/// annotations (`{ms}-c{i}p{page}`, `…p{page}-{k}`) : elles partagent tout ce
/// qui précède le dernier `p`.
fn highlight_group(id: &str) -> &str {
    id.rfind('p').map_or(id, |i| &id[..i])
}

fn by_claude(a: &Value) -> bool {
    a.get("by").and_then(Value::as_str) == Some("claude")
}

/// Modifie ou supprime des surlignages POSÉS PAR CLAUDE (`by: "claude"`) :
/// ceux que l'utilisateur a faits lui-même ne sont jamais touchés. `requests` les
/// désigne par leur texte (et leur page) ; `all` les prend tous dans l'article.
pub fn edit_highlights(
    config: &Config,
    target: &Target,
    requests: &[Request],
    all: bool,
    edit: &Edit,
) -> Result<String, String> {
    let rel = target.rel.clone();
    let report = with_store(&config.app_dir, |map| {
        let Some(list) = map.get_mut(&rel).and_then(Value::as_array_mut) else {
            return Ok((
                vec!["- aucun surlignage dans cet article.".to_string()],
                false,
            ));
        };
        // groupes de Claude, dans l'ordre du store : (clé, pages, texte normalisé)
        let mut groups: Vec<(String, Vec<u64>, String)> = Vec::new();
        for a in list.iter().filter(|a| by_claude(a)) {
            let Some(id) = a.get("id").and_then(Value::as_str) else {
                continue;
            };
            let key = highlight_group(id).to_string();
            let page = a.get("page").and_then(Value::as_u64).unwrap_or(0);
            let text = norm(a.get("text").and_then(Value::as_str).unwrap_or(""));
            match groups.iter_mut().find(|g| g.0 == key) {
                Some(g) => {
                    g.1.push(page);
                    g.2.push_str(&text);
                }
                None => groups.push((key, vec![page], text)),
            }
        }
        let mut chosen: Vec<String> = Vec::new();
        let mut report = Vec::new();
        let verb = match edit {
            Edit::Remove => "supprimé",
            Edit::Update { .. } => "modifié",
        };
        let pages_of = |g: &(String, Vec<u64>, String)| {
            let mut pages = g.1.clone();
            pages.sort_unstable();
            pages.dedup();
            pages
                .iter()
                .map(u64::to_string)
                .collect::<Vec<_>>()
                .join("-")
        };
        if all {
            for g in &groups {
                chosen.push(g.0.clone());
            }
            report.push(format!(
                "- {} surlignage(s) de Claude {verb}(s).",
                groups.len()
            ));
        }
        for req in requests {
            let label = short(&req.quote);
            let needle = norm(&req.quote);
            if needle.chars().count() < MIN_NEEDLE_CHARS {
                report.push(format!(
                    "- « {label} » : citation trop courte pour désigner un surlignage."
                ));
                continue;
            }
            let matches = |text: &str, pages: &[u64]| {
                !text.is_empty()
                    && (text.contains(&needle) || needle.contains(text))
                    && req.page.is_none_or(|p| pages.contains(&(p as u64)))
            };
            let hits: Vec<&(String, Vec<u64>, String)> =
                groups.iter().filter(|g| matches(&g.2, &g.1)).collect();
            if hits.is_empty() {
                let theirs = list.iter().any(|a| {
                    !by_claude(a)
                        && matches(
                            &norm(a.get("text").and_then(Value::as_str).unwrap_or("")),
                            &[a.get("page").and_then(Value::as_u64).unwrap_or(0)],
                        )
                });
                report.push(if theirs {
                    format!(
                        "- « {label} » : c'est un surlignage de l'utilisateur, Claude n'y touche pas."
                    )
                } else {
                    format!("- « {label} » : aucun surlignage de Claude ne correspond.")
                });
                continue;
            }
            let pages: Vec<String> = hits.iter().map(|g| pages_of(g)).collect();
            report.push(format!("- « {label} » : {verb} p. {}", pages.join(", p. ")));
            for g in hits {
                if !chosen.contains(&g.0) {
                    chosen.push(g.0.clone());
                }
            }
        }
        if chosen.is_empty() {
            return Ok((report, false));
        }
        let in_chosen = |a: &Value| {
            by_claude(a)
                && a.get("id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| chosen.iter().any(|k| k == highlight_group(id)))
        };
        match edit {
            Edit::Remove => list.retain(|a| !in_chosen(a)),
            Edit::Update { color, memo, style } => {
                let mut first_seen: Vec<String> = Vec::new();
                for a in list.iter_mut().filter(|a| in_chosen(a)) {
                    let key = highlight_group(a["id"].as_str().unwrap_or("")).to_string();
                    let first = !first_seen.contains(&key);
                    if first {
                        first_seen.push(key);
                    }
                    let Some(obj) = a.as_object_mut() else {
                        continue;
                    };
                    if let Some(color) = color {
                        obj.insert("color".into(), json!(color));
                    }
                    if let Some(style) = style {
                        obj.insert("kind".into(), json!(style));
                    }
                    if let Some(memo) = memo {
                        // la note vit sur la première annotation du passage
                        if first && is_real_memo(memo) {
                            obj.insert("memo".into(), json!(memo.trim()));
                        } else {
                            obj.remove("memo");
                        }
                    }
                }
            }
        }
        Ok((report, true))
    })?;
    Ok(format!(
        "{} [{}] :\n{}\nVisible dans le lecteur d'Atelier en quelques secondes si l'article y est ouvert.",
        target.article.citation,
        target.article.key,
        report.join("\n")
    ))
}

pub struct Request {
    pub quote: String,
    pub page: Option<u32>,
    pub memo: String,
    /// Couleur propre à ce passage (`None` = celle de l'appel).
    pub color: Option<&'static str>,
    /// Style propre à ce passage, `hl`, `ul` ou `st` (`None` = celui de l'appel).
    pub style: Option<&'static str>,
}

/// Surligne chaque passage de `requests` dans `target` ; renvoie le compte
/// rendu pour Claude.
pub fn highlight(
    config: &Config,
    target: &Target,
    pages: &[Page],
    requests: &[Request],
    color: &str,
    style: &str,
) -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut report = Vec::new();
    let mut new = Vec::new();
    // index dans `new` → passage demandé
    let mut origin = Vec::new();
    for (i, req) in requests.iter().enumerate() {
        let label = short(&req.quote);
        let found = match find(pages, &req.quote, req.page) {
            Ok(found) => found,
            Err(e) => {
                report.push(format!("- « {label} » : {e}."));
                continue;
            }
        };
        let parts = parts(pages, &found);
        let where_ = parts
            .iter()
            .map(|p| p.page.to_string())
            .collect::<Vec<_>>()
            .join("-");
        let kind = req.style.unwrap_or(style);
        let done = match kind {
            "ul" => "souligné",
            "st" => "barré",
            _ => "surligné",
        };
        let mut line = format!("- « {label} » : {done} p. {where_}");
        if !found.exact {
            line.push_str(" (début et fin retrouvés, milieu différent de la citation : vérifier)");
        }
        if found.occurrences > 1 {
            line.push_str(&format!(
                " ({} occurrences, {} ; préciser `page` pour une autre)",
                found.occurrences,
                if req.page.is_some() {
                    "la plus proche de la page donnée"
                } else {
                    "la première"
                }
            ));
        }
        report.push(line);
        for (k, part) in parts.into_iter().enumerate() {
            let mut annot = json!({
                "id": format!("{stamp}-c{i}p{}{}", part.page, if k > 0 { format!("-{k}") } else { String::new() }),
                "page": part.page,
                "rects": part.rects,
                "text": part.text,
                "kind": kind,
                "color": req.color.unwrap_or(color),
                "note": "",
                "by": "claude",
            });
            // la note va sur la première page du passage seulement ; « Claude »
            // n'en est pas une (l'origine est dans `by`)
            if k == 0 && is_real_memo(&req.memo) {
                annot["memo"] = json!(req.memo.trim());
            }
            new.push(annot);
            origin.push(report.len() - 1);
        }
    }
    if !new.is_empty() {
        let duplicates = add_to_store(&config.app_dir, &target.rel, new)?;
        let mut already: Vec<usize> = duplicates.iter().map(|&d| origin[d]).collect();
        already.dedup();
        for r in already {
            report[r].push_str(" — déjà surligné, rien d'ajouté");
        }
    }
    Ok(format!(
        "{} [{}] :\n{}\nVisible dans le lecteur d'Atelier en quelques secondes si l'article y est ouvert, sinon à sa prochaine ouverture.",
        target.article.citation,
        target.article.key,
        report.join("\n")
    ))
}

fn is_real_memo(memo: &str) -> bool {
    let memo = fold(memo.trim());
    !memo.is_empty() && memo != "claude"
}

fn short(quote: &str) -> String {
    let words: Vec<&str> = quote.split_whitespace().collect();
    if words.len() <= 8 {
        words.join(" ")
    } else {
        format!("{} …", words[..8].join(" "))
    }
}

pub fn color_value(name: &str) -> Result<&'static str, String> {
    let name = fold(name.trim());
    if name.is_empty() {
        return Ok(COLORS[0].1);
    }
    COLORS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, v)| *v)
        .ok_or_else(|| {
            format!("couleur inconnue « {name} » : jaune, vert, bleu, rose, orange ou violet")
        })
}

/// « surligner » / « souligner » / « barrer » (ou leurs noms, ou `hl` / `ul`
/// / `st`) → `kind`.
pub fn style_value(name: &str) -> Result<&'static str, String> {
    let name = fold(name.trim());
    match name.as_str() {
        "" | "surligner" | "surlignage" | "surligne" | "hl" => Ok(STYLES[0].1),
        "souligner" | "soulignement" | "souligne" | "ul" => Ok(STYLES[1].1),
        "barrer" | "barre" | "rayer" | "raye" | "st" => Ok(STYLES[2].1),
        _ => Err(format!(
            "style inconnu « {name} » : surligner, souligner ou barrer"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_store_gets_new_highlights_once_and_keeps_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        let rel = "zotero/ABCD1234/paper.pdf";
        std::fs::write(
            dir.path().join("pdf_annots.json"),
            json!({"other.pdf": [{"id": "x"}], rel: [{"id": "a", "page": 1, "text": "Old"}]})
                .to_string(),
        )
        .unwrap();
        let hl = |id: &str| json!({"id": id, "page": 2, "text": "Black carbon", "kind": "hl"});
        assert!(add_to_store(dir.path(), rel, vec![hl("b")])
            .unwrap()
            .is_empty());
        assert_eq!(
            add_to_store(dir.path(), rel, vec![hl("c")]).unwrap(),
            vec![0]
        );
        let store: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("pdf_annots.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(store["other.pdf"][0]["id"], "x");
        let ids: Vec<&str> = store[rel]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["a", "b"]);
    }

    #[test]
    fn an_unreadable_store_is_never_overwritten() {
        for (case, raw) in atelier_store::durable::UNREADABLE_SAMPLES {
            let dir = tempfile::tempdir().unwrap();
            std::fs::write(dir.path().join("pdf_annots.json"), raw).unwrap();
            let error = add_to_store(dir.path(), "zotero/ABCD1234/p.pdf", vec![json!({})]).unwrap_err();
            assert!(error.contains("illisible"), "{case}: {error}");
            assert_eq!(
                std::fs::read_to_string(dir.path().join("pdf_annots.json")).unwrap(),
                raw,
                "{case}"
            );
            let copies: Vec<String> = std::fs::read_dir(dir.path())
                .unwrap()
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| n.starts_with("pdf_annots.json.corrupt-"))
                .collect();
            assert_eq!(copies.len(), 1, "{case}");
            assert_eq!(std::fs::read_to_string(dir.path().join(&copies[0])).unwrap(), raw, "{case}");
        }
    }

    #[test]
    fn claude_is_not_a_note() {
        assert!(!is_real_memo(" Claude "));
        assert!(!is_real_memo(""));
        assert!(is_real_memo(
            "pour la discussion : limite de la quantification"
        ));
    }
}
