//! Surlignages et notes posés dans les cellules d'un cahier Jupyter.
//!
//! Ils vivent dans le même store que ceux des éditeurs de code et LaTeX
//! (`<projet>/.fig_thumbs/pdf_annots.json`, sous le verrou partagé de
//! [`atelier_store::pdf_annots`]), sous la clé `nb-comments:<cahier>` : le
//! chemin du cahier relatif au projet, pour survivre à un déplacement du
//! dossier. Le fichier `.ipynb` n'est jamais touché.
//!
//! Une annotation est un objet JSON libre décrit par l'onglet (cellule,
//! partie, décalages, texte, commentaire, couleur) ; le serveur n'exige
//! qu'un `id` texte, qui sert à fusionner les écrivains concurrents.

use atelier_store::pdf_annots;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Dossier du store et clé du cahier dans ce store.
pub fn store_location(project_root: Option<&str>, notebook: &Path) -> (PathBuf, String) {
    let root = project_root
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| Path::new(s).canonicalize().ok())
        .filter(|root| notebook.starts_with(root));
    let (base, rel) = match root {
        Some(root) => {
            let rel = notebook
                .strip_prefix(&root)
                .unwrap_or(notebook)
                .to_path_buf();
            (root, rel)
        }
        // Cahier hors projet : le store suit le cahier.
        None => {
            let base = notebook.parent().map(Path::to_path_buf).unwrap_or_default();
            let name = notebook.file_name().map(PathBuf::from).unwrap_or_default();
            (base, name)
        }
    };
    let rel = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/");
    (base.join(".fig_thumbs"), format!("nb-comments:{rel}"))
}

fn annotation_id(annot: &Value) -> Option<&str> {
    annot
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
}

/// Annotations du cahier (liste vide si aucune).
pub fn load(project_root: Option<&str>, notebook: &Path) -> Result<Value, String> {
    let (dir, rel) = store_location(project_root, notebook);
    if !pdf_annots::store_path(&dir).exists() {
        return Ok(json!([]));
    }
    let store = pdf_annots::read(&dir).map_err(|e| e.to_string())?;
    Ok(store.get(&rel).cloned().unwrap_or_else(|| json!([])))
}

/// Remplace les annotations du cahier par `annots`. `known` = ids que
/// l'onglet avait vus : une annotation du store absente de `known` a été
/// posée ailleurs (autre fenêtre) pendant ce temps, elle est gardée.
pub fn save(
    project_root: Option<&str>,
    notebook: &Path,
    annots: &Value,
    known: Option<&Value>,
) -> Result<Value, String> {
    let list = annots
        .as_array()
        .ok_or_else(|| "annots doit être une liste".to_string())?;
    if list.iter().any(|a| annotation_id(a).is_none()) {
        return Err("chaque annotation doit avoir un id".into());
    }
    let known: Option<HashSet<String>> = match known {
        None | Some(Value::Null) => None,
        Some(Value::Array(ids)) => Some(
            ids.iter()
                .map(|id| {
                    id.as_str()
                        .map(str::to_string)
                        .ok_or("known doit être une liste d'ids")
                })
                .collect::<Result<_, _>>()?,
        ),
        Some(_) => return Err("known doit être une liste d'ids".into()),
    };
    let (dir, rel) = store_location(project_root, notebook);
    pdf_annots::with_store(&dir, |store| {
        let mut next = list.clone();
        if let Some(known) = &known {
            let mine: HashSet<&str> = list.iter().filter_map(annotation_id).collect();
            if let Some(stored) = store.get(&rel).and_then(Value::as_array) {
                next.extend(
                    stored
                        .iter()
                        .filter(|a| {
                            annotation_id(a)
                                .is_some_and(|id| !known.contains(id) && !mine.contains(id))
                        })
                        .cloned(),
                );
            }
        }
        let next = Value::Array(next);
        if next.as_array().is_some_and(Vec::is_empty) {
            let changed = store.remove(&rel).is_some();
            return Ok::<_, pdf_annots_error::Error>((next, changed));
        }
        let changed = store.get(&rel) != Some(&next);
        store.insert(rel.clone(), next.clone());
        Ok((next, changed))
    })
    .map_err(|e| e.0)
}

mod pdf_annots_error {
    use atelier_store::durable::StoreError;
    pub struct Error(pub String);
    impl From<StoreError> for Error {
        fn from(e: StoreError) -> Self {
            Self(e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notebook(dir: &Path, rel: &str) -> PathBuf {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "{}").unwrap();
        path.canonicalize().unwrap()
    }

    #[test]
    fn la_cle_suit_le_chemin_relatif_au_projet() {
        let dir = tempfile::tempdir().unwrap();
        let nb = notebook(dir.path(), "analyses/albedo.ipynb");
        let root = dir.path().to_str().unwrap();
        let (store, rel) = store_location(Some(root), &nb);
        assert_eq!(
            store,
            dir.path().canonicalize().unwrap().join(".fig_thumbs")
        );
        assert_eq!(rel, "nb-comments:analyses/albedo.ipynb");
        // Sans projet, le store suit le cahier.
        let (store, rel) = store_location(None, &nb);
        assert_eq!(store, nb.parent().unwrap().join(".fig_thumbs"));
        assert_eq!(rel, "nb-comments:albedo.ipynb");
    }

    #[test]
    fn enregistre_relit_et_garde_les_autres_cles() {
        let dir = tempfile::tempdir().unwrap();
        let nb = notebook(dir.path(), "cahier.ipynb");
        let root = dir.path().to_str();
        // Un surlignage d'un fichier Python dans le même store reste intact.
        let fig = dir.path().canonicalize().unwrap().join(".fig_thumbs");
        std::fs::create_dir_all(&fig).unwrap();
        std::fs::write(
            fig.join("pdf_annots.json"),
            r#"{"tex-comments:a.py":[{"id":"py1"}]}"#,
        )
        .unwrap();
        assert_eq!(load(root, &nb).unwrap(), json!([]));
        let one = json!([{"id":"a","cellId":"c1","part":"code","from":0,"to":5,"text":"print","kind":"hl","color":"amber"}]);
        save(root, &nb, &one, Some(&json!([]))).unwrap();
        assert_eq!(load(root, &nb).unwrap(), one);
        let raw: Value =
            serde_json::from_slice(&std::fs::read(fig.join("pdf_annots.json")).unwrap()).unwrap();
        assert_eq!(raw["tex-comments:a.py"], json!([{"id":"py1"}]));
        // Tout supprimer retire la clé.
        save(root, &nb, &json!([]), Some(&json!(["a"]))).unwrap();
        assert_eq!(load(root, &nb).unwrap(), json!([]));
        let raw: Value =
            serde_json::from_slice(&std::fs::read(fig.join("pdf_annots.json")).unwrap()).unwrap();
        assert!(raw.get("nb-comments:cahier.ipynb").is_none());
    }

    #[test]
    fn une_note_posee_ailleurs_survit_a_l_enregistrement() {
        let dir = tempfile::tempdir().unwrap();
        let nb = notebook(dir.path(), "cahier.ipynb");
        let root = dir.path().to_str();
        save(root, &nb, &json!([{"id":"a"}, {"id":"b"}]), None).unwrap();
        // L'onglet a vu a et b ; une autre fenêtre ajoute c.
        save(
            root,
            &nb,
            &json!([{"id":"a"}, {"id":"b"}, {"id":"c"}]),
            None,
        )
        .unwrap();
        // L'onglet supprime b : c, qu'il n'a jamais vue, reste.
        let saved = save(root, &nb, &json!([{"id":"a"}]), Some(&json!(["a", "b"]))).unwrap();
        assert_eq!(saved, json!([{"id":"a"}, {"id":"c"}]));
        assert_eq!(load(root, &nb).unwrap(), saved);
    }

    #[test]
    fn refuse_une_annotation_sans_id() {
        let dir = tempfile::tempdir().unwrap();
        let nb = notebook(dir.path(), "cahier.ipynb");
        assert!(save(dir.path().to_str(), &nb, &json!([{"text":"x"}]), None).is_err());
        assert!(save(dir.path().to_str(), &nb, &json!({}), None).is_err());
    }
}
