//! Recette d'un fichier écrit par une cellule du noyau : la cellule (code,
//! but, auteur), les données qu'elle a lues avec leurs empreintes et l'env
//! avec les versions des paquets chargés. `atelier-runtime` la dépose dans le
//! `.prov.json` du fichier à la place d'une recette de commande shell, qui
//! n'existe pas quand l'agent a calculé dans le noyau.

use crate::journal::{CellJournal, CellRecord};
use crate::packages::EnvSnapshot;
use serde_json::{json, Value};
use std::path::Path;

/// Code gardé dans la recette (le journal garde le reste).
const RECIPE_CODE_MAX: usize = 16 * 1024;

/// Dernière cellule du fil qui a écrit ce fichier.
pub fn writer_of(kernel_dir: &Path, thread_id: &str, file: &Path) -> Option<CellRecord> {
    let journal = CellJournal::new(kernel_dir.join("cells"));
    let mut candidates = vec![file.display().to_string()];
    if let Ok(real) = file.canonicalize() {
        candidates.push(real.display().to_string());
    }
    candidates
        .iter()
        .find_map(|c| journal.writers_of(thread_id, c).pop())
}

fn env_snapshot(kernel_dir: &Path, sha256: Option<&str>) -> Option<EnvSnapshot> {
    let sha = sha256.filter(|s| s.chars().all(|c| c.is_ascii_hexdigit()))?;
    let text = std::fs::read_to_string(kernel_dir.join("envs").join(format!("{sha}.json"))).ok()?;
    serde_json::from_str(&text).ok()
}

/// Champs de recette d'un fichier produit par `cell` : `cell`, `code`,
/// `inputs` et `env`, au format des recettes de commande (`display` rend un
/// chemin lisible relatif au projet).
pub fn cell_recipe(kernel_dir: &Path, cell: &CellRecord, display: impl Fn(&Path) -> String) -> Value {
    let inputs: Vec<Value> = cell
        .prints
        .iter()
        .filter(|p| cell.files_read.contains(&p.path))
        .map(|p| {
            let mut v = json!({"path": display(Path::new(&p.path)), "size": p.size});
            if let Some(sha) = &p.sha256 {
                v["sha256"] = json!(sha);
            }
            v
        })
        .collect();
    let mut env = json!({"python": cell.python_version, "interpreter": cell.python});
    let snapshot = env_snapshot(kernel_dir, cell.env_sha256.as_deref());
    if let Some(snap) = &snapshot {
        env["prefix"] = json!(snap.prefix);
        if Path::new(&snap.prefix).join("conda-meta").is_dir() {
            env["conda"] = json!(cell.env);
        }
        let packages = snap.versions(&cell.imports);
        if !packages.is_empty() {
            env["packages"] = json!(packages);
        }
        env["snapshotSha256"] = json!(snap.sha256);
    }
    json!({
        "cell": {
            "threadId": cell.thread_id,
            "id": cell.id,
            "codeSha256": cell.code_sha256,
            "startedAt": cell.started_at,
            "env": cell.env,
            "purpose": cell.purpose,
            "author": cell.author,
            "fromCell": cell.from_cell,
            "replay": cell.replay,
        },
        "code": crate::journal::clip(&cell.code, RECIPE_CODE_MAX),
        "inputs": inputs,
        "env": env,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prints::FilePrint;

    #[test]
    fn recette_d_une_figure_ecrite_par_une_cellule() {
        let dir = tempfile::tempdir().unwrap();
        let kernel = dir.path().join("kernel");
        let prefix = dir.path().join("env");
        std::fs::create_dir_all(prefix.join("lib/python3.12/site-packages/numpy-2.1.3.dist-info")).unwrap();
        let snap = EnvSnapshot::read("albedo", &prefix, "3.12.13");
        std::fs::create_dir_all(kernel.join("envs")).unwrap();
        std::fs::write(
            kernel.join("envs").join(format!("{}.json", snap.sha256)),
            serde_json::to_vec(&snap).unwrap(),
        )
        .unwrap();
        let fig = dir.path().join("fig.png");
        std::fs::write(&fig, "png").unwrap();
        let cell = CellRecord {
            id: 7,
            thread_id: "t".into(),
            code: "plt.savefig('fig.png')".into(),
            files_read: vec!["/p/panel.csv".into()],
            files_written: vec![fig.display().to_string()],
            prints: vec![FilePrint {
                path: "/p/panel.csv".into(),
                size: 4,
                mtime_ms: 1,
                sha256: Some("abc".into()),
            }],
            imports: vec!["numpy".into()],
            env_sha256: Some(snap.sha256.clone()),
            purpose: Some("Tracer la figure".into()),
            ..Default::default()
        };
        CellJournal::new(kernel.join("cells")).append(&cell).unwrap();
        let found = writer_of(&kernel, "t", &fig).unwrap();
        assert_eq!(found.id, 7);
        let r = cell_recipe(&kernel, &found, |p| p.display().to_string());
        assert_eq!(r["cell"]["id"], 7);
        assert_eq!(r["cell"]["purpose"], "Tracer la figure");
        assert_eq!(r["inputs"][0]["sha256"], "abc");
        assert_eq!(r["env"]["packages"]["numpy"], "2.1.3");
        assert!(writer_of(&kernel, "autre-fil", &fig).is_none());
    }
}
