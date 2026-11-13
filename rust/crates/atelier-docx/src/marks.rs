//! Retouches de l'agent signées au nom de l'utilisateur.
//!
//! Dans le .docx, les suivis que l'agent propose portent le nom de
//! l'utilisateur (Thierry, 2026-11-13 : « Oui », les retouches de Claude
//! sont signées Thierry) : Christophe ne voit qu'un auteur. Atelier, lui,
//! se souvient de ceux qui viennent de l'agent pour les montrer comme
//! « proposés par Claude » : leur signature (nom et heure) vit dans le dossier
//! temporaire, sous un nom tiré du chemin du document comme les brouillons
//! (rien ne s'ajoute à côté du fichier de l'utilisateur).

use crate::model::DocModel;
use crate::{Result, Signature};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Une retouche de l'agent : le nom et l'heure inscrits dans ses suivis.
/// On les reconnaît par cette signature et non par leur numéro, que Word
/// renumérote à chaque enregistrement (il garde `w:author` et `w:date`).
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Stamp {
    /// Agent qui a proposé (« Claude », « Codex »…).
    pub agent: String,
    /// Nom inscrit dans le .docx (l'utilisateur).
    pub author: String,
    pub date: String,
}

fn store_for(doc: &Path) -> Result<PathBuf> {
    let canon = doc.canonicalize()?;
    let name = format!("atelier-docx-{}.agent.json", hex::encode(&Sha256::digest(canon.to_string_lossy().as_bytes())[..8]));
    Ok(std::env::temp_dir().join(name))
}

fn read(store: &Path) -> Vec<Stamp> {
    std::fs::read(store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn owner<'a>(stamps: &'a [Stamp], author: &str, date: &str) -> Option<&'a Stamp> {
    stamps.iter().find(|s| s.author == author && s.date == date)
}

/// Numéro de suivi → agent qui l'a proposé, pour les suivis encore présents.
pub fn list(doc: &Path, model: &DocModel) -> Result<BTreeMap<u32, String>> {
    let stamps = read(&store_for(doc)?);
    Ok(model.changes.iter().filter_map(|c| owner(&stamps, &c.author, &c.date).map(|s| (c.id, s.agent.clone()))).collect())
}

/// Commentaire (ou réponse) → agent qui l'a écrit, pour ceux encore présents.
/// Seuls ceux-là, l'agent peut les corriger ou les retirer.
pub fn comments(doc: &Path, model: &DocModel) -> Result<BTreeMap<u32, String>> {
    let stamps = read(&store_for(doc)?);
    Ok(model.comments.iter().filter_map(|c| owner(&stamps, &c.author, &c.date).map(|s| (c.id, s.agent.clone()))).collect())
}

/// Une signature est-elle encore portée par un suivi ou un commentaire ?
fn alive(after: &DocModel, author: &str, date: &str) -> bool {
    after.changes.iter().any(|c| c.author == author && c.date == date) || after.comments.iter().any(|c| c.author == author && c.date == date)
}

/// Note la retouche que l'agent vient de poser sous `sig`, si elle a laissé
/// des suivis ou des commentaires ; oublie celles dont plus rien ne reste
/// (suivis acceptés ou refusés, commentaires supprimés). Rend les numéros
/// des suivis de cette retouche.
pub fn record(doc: &Path, after: &DocModel, sig: &Signature, agent: &str) -> Result<Vec<u32>> {
    let store = store_for(doc)?;
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let mut stamps = read(&store);
    let stamp = Stamp { agent: agent.trim().to_string(), author: sig.author.clone(), date: sig.date.clone() };
    let mine: Vec<u32> = after.changes.iter().filter(|c| c.author == stamp.author && c.date == stamp.date).map(|c| c.id).collect();
    if alive(after, &stamp.author, &stamp.date) && !stamps.contains(&stamp) {
        stamps.push(stamp);
    }
    stamps.retain(|s| alive(after, &s.author, &s.date));
    if stamps.is_empty() {
        match std::fs::remove_file(&store) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
    } else {
        let bytes = serde_json::to_vec(&stamps).map_err(|e| crate::DocxError(format!("retouches de l'agent : {e}")))?;
        crate::write_atomic(&store, &bytes)?;
    }
    Ok(mine)
}

/// Éléments de suivi qui portent un auteur (`w:author`).
const TRACKED: &[&str] = &[
    "ins", "del", "moveFrom", "moveTo", "moveFromRangeStart", "moveToRangeStart", "rPrChange", "pPrChange", "sectPrChange",
    "tblPrChange", "tblGridChange", "trPrChange", "tcPrChange", "numberingChange", "cellIns", "cellDel", "cellMerge",
];

/// Reprend sous le nom `to` les suivis et les commentaires qu'un agent
/// avait signés de son nom (fichiers retouchés avant la signature au nom de
/// l'utilisateur) : Word n'affiche plus que `to`. Les signatures rendues
/// (suivis seulement) permettent à Atelier de les montrer encore « proposés
/// par Claude ». Rend les signatures à noter avec [`remember`].
pub fn adopt(docx: &mut crate::Docx, to: &str) -> Result<Vec<Stamp>> {
    let to = to.trim();
    if to.is_empty() || is_agent(to) {
        return crate::err("nom de l'utilisateur manquant");
    }
    let mut stamps: Vec<Stamp> = Vec::new();
    for part in docx.story_parts() {
        let Some(src) = docx.part(&part)? else { continue };
        let doc = crate::xml::parse(&src)?;
        let mut edits = Vec::new();
        for n in doc.descendants().filter(|n| n.is_element() && n.tag_name().namespace() == Some(crate::xml::W) && TRACKED.contains(&n.tag_name().name())) {
            let Some(a) = n.attributes().find(|a| a.namespace() == Some(crate::xml::W) && a.name() == "author") else { continue };
            if !is_agent(a.value()) {
                continue;
            }
            let stamp = Stamp { agent: canonical(a.value()), author: to.to_string(), date: crate::xml::w_attr(n, "date").unwrap_or("").to_string() };
            if !stamps.contains(&stamp) {
                stamps.push(stamp);
            }
            edits.push((a.range_value(), crate::xml::escape_attr(to)));
        }
        drop(doc);
        if !edits.is_empty() {
            let out = crate::xml::splice(&src, edits)?;
            docx.set_part(&part, out);
        }
    }
    adopt_comments(docx, to)?;
    Ok(stamps)
}

/// Commentaires et réponses signés par un agent : auteur et initiales de
/// `to` (Thierry, 2026-11-13 : « je veux que ça soit mon nom »). Rend leur
/// nombre.
pub fn adopt_comments(docx: &mut crate::Docx, to: &str) -> Result<usize> {
    let to = to.trim();
    if to.is_empty() || is_agent(to) {
        return crate::err("nom de l'utilisateur manquant");
    }
    let Some(src) = docx.part(crate::COMMENTS)? else { return Ok(0) };
    let doc = crate::xml::parse(&src)?;
    let initials = crate::xml::escape_attr(&crate::initials(to));
    let mut edits = Vec::new();
    let mut count = 0;
    for n in doc.descendants().filter(|n| n.is_element() && n.tag_name().namespace() == Some(crate::xml::W) && n.tag_name().name() == "comment") {
        let attr = |name: &str| n.attributes().find(|a| a.namespace() == Some(crate::xml::W) && a.name() == name);
        let Some(a) = attr("author").filter(|a| is_agent(a.value())) else { continue };
        edits.push((a.range_value(), crate::xml::escape_attr(to)));
        if let Some(i) = attr("initials") {
            edits.push((i.range_value(), initials.clone()));
        }
        count += 1;
    }
    drop(doc);
    if count == 0 {
        return Ok(0);
    }
    docx.set_part(crate::COMMENTS, crate::xml::splice(&src, edits)?);
    // Liste des personnes de Word 2013+ : l'agent y cède sa place si `to`
    // n'y figure pas encore (Word veut une entrée par auteur de commentaire).
    if let Some(people) = docx.part("word/people.xml")? {
        let doc = crate::xml::parse(&people)?;
        let w15 = "http://schemas.microsoft.com/office/word/2012/wordml";
        let persons: Vec<_> = doc.descendants().filter(|n| n.tag_name().name() == "person").collect();
        let agent = persons.iter().find(|p| p.attribute((w15, "author")).is_some_and(is_agent));
        if let Some(agent) = agent.filter(|_| !persons.iter().any(|p| p.attribute((w15, "author")) == Some(to))) {
            let mut edits = Vec::new();
            for n in agent.descendants() {
                for a in n.attributes().filter(|a| a.namespace() == Some(w15) && (a.name() == "author" || a.name() == "userId")) {
                    edits.push((a.range_value(), crate::xml::escape_attr(to)));
                }
                if let Some(a) = n.attributes().find(|a| a.namespace() == Some(w15) && a.name() == "providerId") {
                    edits.push((a.range_value(), "None".to_string()));
                }
            }
            drop(doc);
            docx.set_part("word/people.xml", crate::xml::splice(&people, edits)?);
        }
    }
    Ok(count)
}

/// Bilan d'une [`repair`].
#[derive(Debug, Default)]
pub struct Repair {
    /// Signatures des suivis repris au nom de l'utilisateur (pour [`remember`]).
    pub stamps: Vec<Stamp>,
    /// Fils rouverts.
    pub reopened: usize,
    /// Commentaires qui ont reçu leur brouillon comme réponse.
    pub replied: Vec<u32>,
}

/// Remet d'aplomb un .docx retouché avant la signature au nom de
/// l'utilisateur : suivis de l'agent repris sous `name` ([`adopt`]) ;
/// brouillons de réponse (`drafts`) envoyés comme réponses de `name` ; avec
/// `reopen`, fils rouverts là où `name` a répondu (Word replie les fils
/// résolus et leurs réponses). Les brouillons envoyés restent à effacer.
pub fn repair(docx: &mut crate::Docx, name: &str, drafts: &crate::drafts::Drafts, reopen: bool) -> Result<Repair> {
    let stamps = adopt(docx, name)?;
    let sig = Signature::now(name);
    let mut parents = Vec::new();
    let mut replied = Vec::new();
    for (id, draft) in drafts {
        let text = draft.text.trim();
        if text.is_empty() {
            continue;
        }
        crate::comments::reply(docx, *id, text, &sig)?;
        replied.push(*id);
        parents.push(*id);
    }
    let m = docx.model()?;
    if reopen {
        parents.extend(m.comments.iter().filter(|c| c.author == name).filter_map(|c| c.parent));
    }
    parents.sort_unstable();
    parents.dedup();
    let mut reopened = 0;
    for id in parents {
        if m.comments.iter().any(|c| c.id == id && c.done) {
            crate::comments::resolve(docx, id, false)?;
            reopened += 1;
        }
    }
    Ok(Repair { stamps, reopened, replied })
}

/// « claude » → « Claude » : le nom d'agent tel que le panneau l'affiche.
fn canonical(name: &str) -> String {
    let n = name.trim();
    let mut c = n.chars();
    c.next().map(|f| f.to_uppercase().chain(c).collect()).unwrap_or_default()
}

/// Ajoute des signatures à celles du document (sans doublon).
pub fn remember(doc: &Path, add: &[Stamp]) -> Result<()> {
    if add.is_empty() {
        return Ok(());
    }
    let store = store_for(doc)?;
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let mut stamps = read(&store);
    for s in add {
        if !stamps.contains(s) {
            stamps.push(s.clone());
        }
    }
    let bytes = serde_json::to_vec(&stamps).map_err(|e| crate::DocxError(format!("retouches de l'agent : {e}")))?;
    crate::write_atomic(&store, &bytes)
}

/// Nom de l'utilisateur sous lequel l'agent signe dans ce document : celui
/// choisi dans le panneau (`.fig_thumbs/docx_prefs.json` du projet ou d'un
/// dossier parent du document), sinon le nom que Word a déjà inscrit dans le
/// document et qui ressemble à celui du Mac, sinon celui du Mac.
pub fn signer(doc: &Path, project_root: &Path, model: &DocModel) -> String {
    let mut dirs: Vec<&Path> = doc.ancestors().skip(1).take_while(|d| d.starts_with(project_root)).collect();
    if !dirs.contains(&project_root) {
        dirs.push(project_root);
    }
    for d in dirs {
        let prefs = d.join(".fig_thumbs").join("docx_prefs.json");
        let stored: Option<serde_json::Value> = std::fs::read(&prefs).ok().and_then(|b| serde_json::from_slice(&b).ok());
        if let Some(a) = stored.as_ref().and_then(|v| v.get("author")).and_then(|a| a.as_str()).map(str::trim).filter(|a| !a.is_empty()) {
            return a.to_string();
        }
    }
    let sys = system_user_name();
    let first = sys.split_whitespace().next().unwrap_or("").to_lowercase();
    model
        .authors
        .iter()
        .find(|a| !is_agent(&a.name) && !first.is_empty() && a.name.to_lowercase().starts_with(&first))
        .map(|a| a.name.clone())
        .unwrap_or(sys)
}

/// Nom d'un agent (même liste que le panneau).
pub fn is_agent(name: &str) -> bool {
    let n = name.trim().to_lowercase();
    ["claude", "codex", "kimi", "grok", "opencode", "agent"].iter().any(|a| n == *a || n.strip_prefix(a).is_some_and(|r| r.starts_with(|c: char| !c.is_alphanumeric())))
}

/// Nom complet de l'utilisateur du Mac (celui que Word propose par défaut).
pub fn system_user_name() -> String {
    let full = std::process::Command::new("id")
        .arg("-F")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());
    full.or_else(|| std::env::var("USER").ok()).unwrap_or_else(|| "Moi".into())
}

#[cfg(test)]
mod tests {
    use super::is_agent;

    #[test]
    fn un_agent_se_reconnait_a_son_nom_seulement() {
        for a in ["Claude", "codex", "Claude (Opus)", "Agent"] {
            assert!(is_agent(a), "{a}");
        }
        for h in ["Thierry", "Christophe Kinnard", "Claudette", "Agentine"] {
            assert!(!is_agent(h), "{h}");
        }
    }
}
