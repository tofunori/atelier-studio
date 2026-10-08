//! Codage qualitatif (façon NVivo) depuis Claude : lire le livre de codes,
//! les passages d'un code, créer un code, et PROPOSER des codes pour des
//! passages cités. Le format vit dans `atelier-codebook`, partagé avec le
//! serveur galerie.
//!
//! Ce que Claude code n'est jamais posé d'office : il va dans `suggested` de
//! l'annotation, affiché en pointillé dans Atelier, et l'utilisateur le garde
//! ou le retire. Un passage déjà surligné sur la même page reçoit la
//! proposition ; sinon un passage codé (`kind: "code"`, voile gris) est créé.

use crate::highlight::{find, norm, parts, Page, Request, Target};
use crate::library::{Config, Library};
use atelier_codebook::{self as codebook, Change, Codebook};
use serde_json::{json, Value};

/// Ids des codes voulus, avec leurs sous-codes si `subcodes`.
pub fn resolve_codes(book: &Codebook, wanted: &[String], subcodes: bool) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for w in wanted {
        let code = book.resolve(w)?;
        let ids = if subcodes { book.descendants(&code.id) } else { vec![code.id.clone()] };
        for id in ids {
            if !out.contains(&id) {
                out.push(id);
            }
        }
    }
    Ok(out)
}

/// L'arbre des codes avec, pour chacun (sous-codes compris), le nombre de
/// passages et d'articles, les propositions en attente et le mémo.
pub fn list_codes(lib: &Library) -> String {
    let book = &lib.book;
    if book.codes.is_empty() {
        return "Le livre de codes est vide. L'utilisateur crée ses codes dans Atelier (bouton « Coder » du lecteur PDF, panneau Codes) ; create_code en ajoute un sur sa demande.".into();
    }
    let coded: Vec<_> = lib.annotations.iter().filter(|a| !a.codes.is_empty()).collect();
    let articles: std::collections::BTreeSet<&str> = coded.iter().map(|a| a.article.as_str()).collect();
    let mut out = format!(
        "{} code(s) ; {} passage(s) codé(s) dans {} article(s). Chiffres d'un code = ses sous-codes compris.\n",
        book.codes.len(),
        coded.len(),
        articles.len()
    );
    for (depth, code) in book.ordered() {
        let ids = book.descendants(&code.id);
        let kept: Vec<_> = lib.annotations.iter().filter(|a| a.codes.iter().any(|c| ids.contains(c))).collect();
        let arts: std::collections::BTreeSet<&str> = kept.iter().map(|a| a.article.as_str()).collect();
        let pending = lib
            .annotations
            .iter()
            .filter(|a| a.suggested.iter().any(|c| ids.contains(c)))
            .count();
        let indent = "  ".repeat(depth);
        out.push_str(&format!(
            "\n{indent}- {} : {} passage(s), {} article(s)",
            code.name,
            kept.len(),
            arts.len()
        ));
        if pending > 0 {
            out.push_str(&format!(" ; {pending} proposé(s) par Claude, en attente"));
        }
        if !code.memo.is_empty() {
            out.push_str(&format!("\n{indent}  Mémo : {}", code.memo.replace('\n', " ")));
        }
    }
    out
}

/// Crée un code (sous `parent`, nom ou chemin) ; un code du même nom au même
/// endroit est gardé tel quel.
pub fn create_code(config: &Config, name: &str, parent: &str, memo: &str) -> Result<String, String> {
    codebook::with_locked(&config.app_dir, |_, book| {
        let parent_id = if parent.trim().is_empty() {
            None
        } else {
            Some(book.resolve(parent)?.id.clone())
        };
        let (code, created) = book.create(name, parent_id.as_deref(), memo)?;
        let path = book.path(&code.id);
        let text = if created {
            format!("Code « {path} » créé. Il apparaît dans Atelier en quelques secondes.")
        } else {
            format!("Le code « {path} » existait déjà : rien de créé.")
        };
        Ok((text, false, created))
    })
}

/// Un passage à coder et ses codes (noms ou chemins).
pub struct CodeRequest {
    pub request: Request,
    pub codes: Vec<String>,
}

fn short(quote: &str) -> String {
    let words: Vec<&str> = quote.split_whitespace().collect();
    if words.len() <= 8 {
        words.join(" ")
    } else {
        format!("{} …", words[..8].join(" "))
    }
}

/// Deux textes du même passage : l'un contient l'autre une fois normalisés.
fn same_passage(a: &str, b: &str) -> bool {
    let (a, b) = (norm(a), norm(b));
    a.len() >= 12 && b.len() >= 12 && (a.contains(&b) || b.contains(&a))
}

/// Propose des codes pour chaque passage cité. Rien n'est écrit pour un
/// passage introuvable ; un code inconnu arrête tout avant d'écrire.
pub fn code_passages(config: &Config, target: &Target, pages: &[Page], requests: &[CodeRequest]) -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // Retrouver les passages d'abord : la lecture du PDF se fait hors verrou.
    let mut located = Vec::new();
    let mut report: Vec<String> = Vec::new();
    for (i, req) in requests.iter().enumerate() {
        let label = short(&req.request.quote);
        match find(pages, &req.request.quote, req.request.page) {
            Ok(found) => {
                let mut line = format!("- « {label} »");
                if !found.exact {
                    line.push_str(" (début et fin retrouvés, milieu différent : vérifier)");
                }
                report.push(line);
                located.push((i, report.len() - 1, parts(pages, &found)));
            }
            Err(e) => report.push(format!("- « {label} » : {e}, rien de proposé.")),
        }
    }
    let rel = target.rel.clone();
    codebook::with_locked(&config.app_dir, |store, book| {
        let mut wanted: Vec<Vec<String>> = Vec::new();
        for req in requests {
            if req.codes.is_empty() {
                return Err(format!("Aucun code donné pour « {} ».", short(&req.request.quote)));
            }
            wanted.push(resolve_codes(book, &req.codes, false).map_err(|e| {
                format!("{e} Codes existants : {}.", existing(book))
            })?);
        }
        let list = store.entry(rel.clone()).or_insert_with(|| json!([]));
        let Some(list) = list.as_array_mut() else {
            return Err(format!("annotations de {rel} illisibles"));
        };
        let mut changed = false;
        for (i, line, page_parts) in &located {
            let ids = &wanted[*i];
            let names: Vec<String> = ids.iter().map(|id| format!("« {} »", book.path(id))).collect();
            let mut on_existing = 0;
            let mut created = 0;
            let mut already = true;
            for (k, part) in page_parts.iter().enumerate() {
                let existing_at = list.iter().position(|a| {
                    a.get("page").and_then(Value::as_u64) == Some(part.page as u64)
                        && same_passage(a.get("text").and_then(Value::as_str).unwrap_or(""), &part.text)
                });
                match existing_at {
                    Some(at) => {
                        let fresh: Vec<String> = ids
                            .iter()
                            .filter(|id| !codebook::ids(&list[at], codebook::CODES).contains(id))
                            .cloned()
                            .collect();
                        if !fresh.is_empty() {
                            already = false;
                        }
                        if codebook::apply(&mut list[at], &Change { suggest: fresh, ..Default::default() }) {
                            changed = true;
                        }
                        on_existing += 1;
                    }
                    None => {
                        list.push(json!({
                            "id": format!("{stamp}-k{i}p{}{}", part.page, if k > 0 { format!("-{k}") } else { String::new() }),
                            "page": part.page,
                            "rects": part.rects,
                            "text": part.text,
                            "kind": "code",
                            "note": "",
                            "by": "claude",
                            "suggested": ids,
                        }));
                        changed = true;
                        already = false;
                        created += 1;
                    }
                }
            }
            let pages_label = page_parts.iter().map(|p| p.page.to_string()).collect::<Vec<_>>().join("-");
            let what = if already {
                "déjà codé ainsi, rien d'ajouté".to_string()
            } else if created == 0 {
                format!("proposé {} sur un passage déjà annoté", names.join(", "))
            } else if on_existing == 0 {
                format!("proposé {} (nouveau passage codé)", names.join(", "))
            } else {
                format!("proposé {}", names.join(", "))
            };
            report[*line].push_str(&format!(" p. {pages_label} : {what}."));
        }
        Ok((report.join("\n"), changed, false))
    })
    .map(|lines| {
        format!(
            "{} [{}] :\n{}\nCes codes sont des PROPOSITIONS : l'utilisateur les voit en pointillé dans Atelier et les garde ou les retire.",
            target.article.citation, target.article.key, lines
        )
    })
}

fn existing(book: &Codebook) -> String {
    let names: Vec<String> = book.ordered().iter().take(40).map(|(_, c)| format!("« {} »", book.path(&c.id))).collect();
    if names.is_empty() {
        "aucun (livre de codes vide)".into()
    } else {
        names.join(", ")
    }
}

/// Noms lisibles des codes d'une annotation, pour les sorties des outils.
pub fn code_line(book: &Codebook, codes: &[String], suggested: &[String]) -> String {
    let name = |id: &String| book.get(id).map(|_| book.path(id));
    let kept: Vec<String> = codes.iter().filter_map(name).collect();
    let pending: Vec<String> = suggested.iter().filter_map(name).collect();
    let mut parts = Vec::new();
    if !kept.is_empty() {
        parts.push(format!("Codes : {}", kept.join(" ; ")));
    }
    if !pending.is_empty() {
        parts.push(format!("Proposés par Claude (en attente) : {}", pending.join(" ; ")));
    }
    parts.join(". ")
}

/// Chemin et mémo du code demandé (nom ou chemin, sans accents ni casse).
pub fn code_title(book: &Codebook, wanted: &str) -> Result<(String, String), String> {
    let code = book.resolve(wanted)?;
    Ok((book.path(&code.id), code.memo.clone()))
}
