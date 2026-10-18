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
