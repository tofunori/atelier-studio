//! Solidité du moteur contre un VRAI ipykernel : `input()`, noyau qui meurt
//! tout seul, flux de sorties regroupés pour l'écran.
//!
//! Lancé seulement si `ATELIER_TEST_IPYKERNEL_PYTHON` désigne un Python qui a
//! `ipykernel` (la CI le crée dans un venv) ; sinon le test se signale et passe.

use atelier_notebook::NotebookManager;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

fn notebook(dir: &Path, cells: &[(&str, &str)]) -> PathBuf {
    let nb = dir.join("solidite.ipynb");
    let cells: Vec<Value> = cells
        .iter()
        .map(|(id, src)| {
            json!({"id": id, "cell_type": "code", "source": src, "outputs": [], "metadata": {}, "execution_count": null})
        })
        .collect();
    std::fs::write(
        &nb,
        json!({
            "nbformat": 4, "nbformat_minor": 5,
            "metadata": {"kernelspec": {"name": "vrai", "display_name": "Vrai ipykernel", "language": "python"}},
            "cells": cells
        })
        .to_string(),
    )
    .unwrap();
    nb
}

async fn wait_for(
    events: &Arc<Mutex<Vec<Value>>>,
    what: &str,
    pred: impl Fn(&Value) -> bool,
) -> Value {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if let Some(found) = events.lock().unwrap().iter().find(|e| pred(e)).cloned() {
            return found;
        }
        assert!(Instant::now() < deadline, "attendu en vain : {what}");
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn vrai_ipykernel_input_mort_et_flux() {
    let Ok(python) = std::env::var("ATELIER_TEST_IPYKERNEL_PYTHON") else {
        eprintln!("ATELIER_TEST_IPYKERNEL_PYTHON absent : test ipykernel réel sauté");
        return;
    };
    let tmp = tempfile::tempdir().unwrap();
    let kernels = tmp.path().join("jupyter/kernels/vrai");
    std::fs::create_dir_all(&kernels).unwrap();
    std::fs::write(
        kernels.join("kernel.json"),
        json!({
            "argv": [python, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
            "display_name": "Vrai ipykernel",
            "language": "python"
        })
        .to_string(),
    )
    .unwrap();
    // Seul test de ce binaire : modifier l'environnement ici est sans risque.
    std::env::set_var("JUPYTER_PATH", tmp.path().join("jupyter"));

    let nb = notebook(
        tmp.path(),
        &[
            ("ask", "nom = input('Votre nom ? ')\nprint('bonjour', nom)"),
            ("flood", "for i in range(3000):\n    print(i, flush=True)"),
            ("die", "import os\nos._exit(3)"),
        ],
    );
    let mgr = Arc::new(NotebookManager::new(
        tmp.path().join("rt"),
        tmp.path().join("ak"),
        tmp.path().to_path_buf(),
    ));
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    {
        let sink = Arc::clone(&events);
        mgr.set_listener(Arc::new(move |ev| {
            sink.lock()
                .unwrap()
                .push(serde_json::to_value(&ev).unwrap());
        }));
    }
    let root = tmp.path().to_path_buf();

    // 1. input() : la demande arrive à l'onglet, la réponse débloque la cellule.
    let runner = {
        let (mgr, nb, root) = (Arc::clone(&mgr), nb.clone(), root.clone());
        tokio::spawn(async move { mgr.run_cell(&nb, Some(&root), "ask", None).await })
    };
    let asked = wait_for(&events, "inputRequested", |e| {
        e["event"] == "inputRequested"
    })
    .await;
    assert_eq!(asked["cellId"], "ask");
    assert_eq!(asked["prompt"], "Votre nom ? ");
    assert_eq!(asked["password"], false);
    let snap = mgr.get_or_open(&nb).await.unwrap().snapshot().await;
    assert_eq!(
        snap.pending_input.as_ref().map(|p| p.cell_id.as_str()),
        Some("ask")
    );
    mgr.send_input(&nb, "Ada").await.unwrap();
    let snap = tokio::time::timeout(Duration::from_secs(20), runner)
        .await
        .expect("la cellule reste bloquée après la réponse")
        .unwrap()
        .unwrap();
    let out = serde_json::to_value(&snap.cells[0].outputs).unwrap();
    let text: String = out
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|o| o["text"].as_str())
        .collect();
    assert!(text.contains("bonjour Ada"), "{out}");
    assert!(snap.pending_input.is_none());
    assert!(events
        .lock()
        .unwrap()
        .iter()
        .any(|e| e["event"] == "inputCleared"));

    // 2. 3 000 `print` : sortie complète, mais l'écran reçoit des paquets
    //    regroupés, pas 3 000 cellules entières.
    let before = events.lock().unwrap().len();
    let snap = mgr.run_cell(&nb, Some(&root), "flood", None).await.unwrap();
    let flood = serde_json::to_value(&snap.cells[1].outputs).unwrap();
    assert!(
        flood[0]["text"].as_str().unwrap().ends_with("2999\n"),
        "{}",
        &flood[0]["text"].to_string()[..80]
    );
    tokio::time::sleep(Duration::from_millis(300)).await;
    let pushes = events.lock().unwrap()[before..]
        .iter()
        .filter(|e| e["event"] == "cellUpdated" && e["cell"]["id"] == "flood")
        .count();
    assert!(pushes < 300, "{pushes} envois à l'écran pour 3 000 lignes");

    // 3. Le noyau meurt tout seul : la cellule rend la main, la veille le
    //    voit et l'état passe à « dead » avec son code de sortie.
    let pid = snap.status.pid.expect("pid");
    let res = tokio::time::timeout(
        Duration::from_secs(20),
        mgr.run_cell(&nb, Some(&root), "die", None),
    )
    .await
    .expect("cellule bloquée après la mort du noyau");
    assert!(res.is_err());
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        mgr.tick().await;
        let snap = mgr.get_or_open(&nb).await.unwrap().snapshot().await;
        if snap.status.state == "dead" {
            assert_eq!(snap.status.exit_code, Some(3));
            assert!(snap.status.pid.is_none());
            break;
        }
        assert!(
            Instant::now() < deadline,
            "mort du noyau {pid} jamais signalée : {:?}",
            snap.status
        );
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    assert!(events
        .lock()
        .unwrap()
        .iter()
        .any(|e| e["event"] == "kernelStatus"
            && e["status"]["state"] == "dead"
            && e["status"]["exitCode"] == 3));

    // 4. Exécuter de nouveau relance un noyau neuf et efface l'état « dead ».
    let snap = mgr
        .run_cell(&nb, Some(&root), "ask", Some("print('de retour')".into()))
        .await
        .unwrap();
    assert_eq!(snap.status.state, "idle");
    assert!(snap.status.exit_code.is_none());
    mgr.shutdown_all().await;
}
