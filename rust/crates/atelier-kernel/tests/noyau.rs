//! Bout en bout avec un vrai Python (sauté s'il n'y en a pas sur la machine).

use atelier_kernel::{KernelError, KernelManager, RunRequest};
use std::path::{Path, PathBuf};
use std::time::Duration;

fn python() -> Option<PathBuf> {
    let out = std::process::Command::new("python3")
        .args(["-c", "import sys; print(sys.executable)"])
        .output()
        .ok()?;
    let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
    p.is_file().then_some(p)
}

fn req<'a>(thread: &'a str, cwd: &'a Path, env: Option<&'a str>, code: &'a str) -> RunRequest<'a> {
    RunRequest {
        thread_id: thread,
        cwd,
        env,
        default_env: None,
        code,
        wait: Duration::from_secs(20),
        turn_id: Some("tour-1"),
        purpose: None,
        author: None,
        from_cell: None,
        resumed_from: None,
    }
}

#[tokio::test]
async fn les_variables_survivent_d_une_cellule_a_l_autre() {
    let Some(py) = python() else {
        eprintln!("pas de python3 : test sauté");
        return;
    };
    let py = py.display().to_string();
    let data = tempfile::tempdir().unwrap();
    let projet = tempfile::tempdir().unwrap();
    let m = KernelManager::new(data.path(), data.path());

    let r = m
        .run(req(
            "fil",
            projet.path(),
            Some(&py),
            "x = 21\nprint('bonjour')\nx * 2",
        ))
        .await
        .unwrap();
    assert!(r.finished);
    assert!(r.note.as_deref().unwrap().starts_with("Noyau démarré"));
    assert_eq!(r.cell["status"], "ok");
    assert_eq!(r.cell["stdout"], "bonjour\n");
    assert_eq!(r.cell["result"], "42");

    // Même noyau : x est encore là, et le fichier écrit est relevé.
    let r = m
        .run(req(
            "fil",
            projet.path(),
            None,
            "open('sortie.csv', 'w').write(str(x))\nimport os\nos.write(1, b'c\\n')",
        ))
        .await
        .unwrap();
    assert_eq!(r.cell["status"], "ok", "{}", r.cell);
    assert!(r.note.is_none());
    let ecrit = r.cell["filesWritten"][0].as_str().unwrap();
    assert!(ecrit.ends_with("sortie.csv"), "{ecrit}");
    assert_eq!(r.cell["cell"], 2);

    let vars = m.variables("fil").await.unwrap();
    let noms: Vec<&str> = vars
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["name"].as_str().unwrap())
        .collect();
    assert!(noms.contains(&"x"), "{noms:?}");
    assert!(
        !noms.contains(&"os"),
        "les modules ne sont pas des variables"
    );

    // Erreur : trace limitée au code de l'agent.
    let r = m.run(req("fil", projet.path(), None, "1/0")).await.unwrap();
    assert_eq!(r.cell["status"], "error");
    assert_eq!(r.cell["error"]["ename"], "ZeroDivisionError");
    let tb = r.cell["error"]["traceback"].as_str().unwrap();
    assert!(tb.contains("<cellule 3>"), "{tb}");
    assert!(!tb.contains("atelier_noyau"), "{tb}");

    // Le journal garde les trois cellules.
    let cells = m.journal().list("fil", 10);
    assert_eq!(cells.len(), 3);
    assert_eq!(cells[1].files_written.len(), 1);
    assert_eq!(cells[0].turn_id.as_deref(), Some("tour-1"));

    m.shutdown_all().await;
}

#[tokio::test]
async fn une_longue_cellule_rend_la_main_puis_s_interrompt() {
    let Some(py) = python() else {
        return;
    };
    let py = py.display().to_string();
    let data = tempfile::tempdir().unwrap();
    let projet = tempfile::tempdir().unwrap();
    let m = KernelManager::new(data.path(), data.path());
    let mut r = req(
        "fil",
        projet.path(),
        Some(&py),
        "import time\nprint('debut')\ntime.sleep(60)",
    );
    r.wait = Duration::from_millis(800);
    let out = m.run(r).await.unwrap();
    assert!(!out.finished);
    assert_eq!(out.cell["status"], "running");

    let busy = m
        .run(req("fil", projet.path(), None, "1"))
        .await
        .unwrap_err();
    assert_eq!(busy, KernelError::Busy(1));
    assert_eq!(m.status("fil").busy_cell, Some(1));

    assert_eq!(m.interrupt("fil").await.unwrap(), Some(1));
    let fin = m.wait("fil", 1, Duration::from_secs(10)).await.unwrap();
    assert_eq!(
        fin.cell["error"]["ename"], "KeyboardInterrupt",
        "{}",
        fin.cell
    );

    // Le noyau survit à l'interruption.
    let r = m
        .run(req("fil", projet.path(), None, "2 + 2"))
        .await
        .unwrap();
    assert_eq!(r.cell["result"], "4");
    m.shutdown_all().await;
}

#[tokio::test]
async fn un_noyau_mort_est_relance_et_le_dit() {
    let Some(py) = python() else {
        return;
    };
    let py = py.display().to_string();
    let data = tempfile::tempdir().unwrap();
    let projet = tempfile::tempdir().unwrap();
    let m = KernelManager::new(data.path(), data.path());
    m.run(req("fil", projet.path(), Some(&py), "a = 1"))
        .await
        .unwrap();
    let r = m
        .run(req("fil", projet.path(), None, "import os\nos._exit(3)"))
        .await
        .unwrap();
    assert_eq!(r.cell["error"]["ename"], "NoyauArrete", "{}", r.cell);
    let r = m
        .run(req("fil", projet.path(), Some(&py), "'a' in globals()"))
        .await
        .unwrap();
    assert!(r
        .note
        .as_deref()
        .unwrap()
        .contains("variables sont perdues"));
    assert_eq!(r.cell["result"], "False");
    assert_eq!(
        r.cell["cell"], 3,
        "la numérotation continue après une relance"
    );
    m.shutdown_all().await;
}

#[tokio::test]
async fn l_inactivite_arrete_le_noyau_mais_pas_un_calcul_en_cours() {
    let Some(py) = python() else {
        return;
    };
    let py = py.display().to_string();
    let data = tempfile::tempdir().unwrap();
    let projet = tempfile::tempdir().unwrap();
    let m = KernelManager::new(data.path(), data.path());
    m.run(req("calme", projet.path(), Some(&py), "1"))
        .await
        .unwrap();
    let mut long = req(
        "occupe",
        projet.path(),
        Some(&py),
        "import time; time.sleep(30)",
    );
    long.wait = Duration::from_millis(300);
    m.run(long).await.unwrap();
    let arretes = m.reap_idle(Duration::ZERO).await;
    assert_eq!(arretes, vec!["calme".to_string()]);
    assert!(m.status("occupe").running);
    m.shutdown_all().await;
}

#[tokio::test]
async fn les_figures_restees_ouvertes_sont_captees_hors_des_fichiers_ecrits() {
    let Some(py) = python() else {
        eprintln!("pas de python3 : test sauté");
        return;
    };
    let py = py.display().to_string();
    let data = tempfile::tempdir().unwrap();
    let projet = tempfile::tempdir().unwrap();
    let m = KernelManager::new(data.path(), data.path());
    // Faux pyplot (matplotlib n'est pas requis pour tester le pilote) : deux
    // figures ouvertes, que le pilote doit enregistrer puis fermer.
    let code = r#"
import sys, types
plt = types.ModuleType("matplotlib.pyplot")
ouvertes = [1, 2]
class Fig:
    def __init__(self, n): self.n = n
    def savefig(self, chemin, **kw): open(chemin, "w").write("png %d" % self.n)
plt.get_fignums = lambda: list(ouvertes)
plt.figure = lambda n: Fig(n)
plt.close = lambda quoi: ouvertes.clear()
sys.modules["matplotlib.pyplot"] = plt
"#;
    let r = m
        .run(req("fil", projet.path(), Some(&py), code))
        .await
        .unwrap();
    assert_eq!(r.cell["status"], "ok", "{}", r.cell);
    let figures: Vec<String> = serde_json::from_value(r.cell["figures"].clone()).unwrap();
    assert_eq!(figures.len(), 2, "{}", r.cell);
    let dossier = m.figures_dir("fil");
    assert!(figures[0].starts_with(&dossier.display().to_string()));
    assert_eq!(std::fs::read_to_string(&figures[1]).unwrap(), "png 2");
    assert!(r.cell.get("filesWritten").is_none(), "les PNG ne sont pas des écritures de la cellule");

    // Fermées : la cellule suivante n'en recapte aucune.
    let r = m.run(req("fil", projet.path(), None, "1")).await.unwrap();
    assert!(r.cell.get("figures").is_none(), "{}", r.cell);

    // Une figure copiée dans le projet rejoint les écritures de sa cellule.
    let copie = projet.path().join("figure.png").display().to_string();
    assert!(m.journal().add_written("fil", 1, &copie).unwrap());
    let cellules = m.journal().list("fil", 10);
    assert_eq!(cellules.len(), 2, "la cellule réécrite remplace l'ancienne");
    assert_eq!(cellules[0].files_written, vec![copie.clone()]);
    assert_eq!(m.journal().writers_of("fil", &copie)[0].id, 1);
    m.shutdown_all().await;
}

#[tokio::test]
async fn lignee_des_variables_et_empreintes_des_donnees() {
    let Some(py) = python() else {
        return;
    };
    let py = py.display().to_string();
    let data = tempfile::tempdir().unwrap();
    // Hors de /tmp, que le pilote ignore comme dossier temporaire.
    let projet = tempfile::tempdir_in(env!("CARGO_TARGET_TMPDIR")).unwrap();
    let panel = projet.path().join("panel.csv");
    std::fs::write(&panel, "a\n1\n2\n").unwrap();
    // Assez ancien pour ne pas passer pour une écriture de la cellule.
    let avant = std::time::SystemTime::now() - Duration::from_secs(3600);
    std::fs::File::options().write(true).open(&panel).unwrap().set_modified(avant).unwrap();
    let m = KernelManager::new(data.path(), data.path());
    let mut r = req("fil", projet.path(), Some(&py), "lignes = open('panel.csv').read().split()\nn = len(lignes)");
    r.purpose = Some("Charger le panel");
    m.run(r).await.unwrap();
    m.run(req("fil", projet.path(), None, "lignes.append('3')\ntotal = n + 1"))
        .await
        .unwrap();
    let cells = m.journal().list("fil", 10);
    assert_eq!(cells[0].purpose.as_deref(), Some("Charger le panel"));
    let lin = cells[0].lineage.as_ref().unwrap();
    assert_eq!(lin.created, vec!["lignes", "n"]);
    let lin = cells[1].lineage.as_ref().unwrap();
    assert_eq!(lin.created, vec!["total"]);
    assert_eq!(lin.modified, vec!["lignes"]);
    let uses: Vec<(String, Option<u64>)> = lin.uses.iter().map(|u| (u.name.clone(), u.cell)).collect();
    assert_eq!(uses, vec![("lignes".into(), Some(1)), ("n".into(), Some(1))]);
    assert_eq!(cells[0].session, cells[1].session);

    // Empreinte du fichier lu, puis « Données modifiées depuis ».
    let print = &cells[0].prints[0];
    assert!(print.path.ends_with("panel.csv") && print.sha256.is_some(), "{print:?}");
    assert!(m.panel_cells("fil", 10)[0].get("stale").is_none());
    std::fs::write(projet.path().join("panel.csv"), "a\n1\n2\n9\n").unwrap();
    assert_eq!(m.panel_cells("fil", 10)[0]["stale"][0]["state"], "modified");

    // Les variables portent leur origine.
    let vars = m.variables("fil").await.unwrap();
    let lignes = vars.as_array().unwrap().iter().find(|v| v["name"] == "lignes").unwrap();
    assert_eq!(lignes["origin"]["created"], 1);
    assert_eq!(lignes["origin"]["modified"], 2);
    assert_eq!(m.journal().verify_chain("fil").broken_at, None);
    m.shutdown_all().await;
}

#[tokio::test]
async fn rejouer_a_neuf_compare_et_reconstruit_l_etat() {
    let Some(py) = python() else {
        return;
    };
    let py = py.display().to_string();
    let data = tempfile::tempdir().unwrap();
    let projet = tempfile::tempdir_in(env!("CARGO_TARGET_TMPDIR")).unwrap();
    let m = KernelManager::new(data.path(), data.path());
    m.run(req("fil", projet.path(), Some(&py), "x = 20\nprint(x + 1)"))
        .await
        .unwrap();
    m.run(req("fil", projet.path(), None, "open('sortie.txt', 'w').write(str(x))\nx * 2"))
        .await
        .unwrap();
    m.run(req("fil", projet.path(), None, "import random\nprint(random.random())"))
        .await
        .unwrap();
    m.run(req("fil", projet.path(), None, "1/0")).await.unwrap();
    // L'utilisateur a retouché le fichier produit : le rejeu ne doit pas
    // l'écraser.
    std::fs::write(projet.path().join("sortie.txt"), "retouche").unwrap();
    m.shutdown("fil").await;

    let summary = m.replay("fil", projet.path(), |_, _, _| {}).await.unwrap();
    assert_eq!(summary.total, 4);
    assert_eq!(summary.differs, 1, "le tirage aléatoire diffère : {summary:?}");
    assert_eq!(summary.skipped, 1, "la cellule en erreur n'est pas rejouée");
    assert_eq!(summary.same + summary.files, 2, "{summary:?}");
    assert!(summary.adopted, "aucun noyau ne tournait : le rejeu le remplace");
    assert_eq!(std::fs::read_to_string(projet.path().join("sortie.txt")).unwrap(), "retouche");

    let cells = m.journal().list("fil", 10);
    assert_eq!(cells.len(), 4, "les marques remplacent les cellules, sans doublon");
    assert_eq!(cells[0].replay.as_ref().unwrap().status, "same");
    assert_eq!(cells[2].replay.as_ref().unwrap().status, "differs");
    assert_eq!(cells[3].replay.as_ref().unwrap().status, "skipped");

    // L'état est revenu : x existe dans le noyau adopté.
    let r = m.run(req("fil", projet.path(), None, "x")).await.unwrap();
    assert_eq!(r.cell["result"], "20");
    assert!(r.note.is_none(), "pas de redémarrage : le noyau rejoué sert");

    // Cellule relancée à la main d'après la 2.
    let mut user = req("fil", projet.path(), None, "x * 3");
    user.author = Some("user");
    user.from_cell = Some(2);
    m.run(user).await.unwrap();
    let last = m.journal().list("fil", 1).pop().unwrap();
    assert_eq!(last.author.as_deref(), Some("user"));
    let panel = m.panel_cells("fil", 1);
    assert_eq!(panel[0]["fromDiff"]["added"][0], "x * 3");

    let py_export = m.export("fil", "Essai", false).unwrap();
    assert!(py_export.contains("# %% [6]"), "{py_export}");
    assert!(py_export.contains("(modifiée à la main d'après [2])"), "{py_export}");
    m.shutdown_all().await;
}
