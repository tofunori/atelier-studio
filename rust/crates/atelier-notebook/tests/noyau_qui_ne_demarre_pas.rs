//! Un noyau qui meurt au démarrage (module manquant, Python cassé) : l'échec
//! arrive tout de suite, avec ce que le noyau a écrit, sous la cellule lancée,
//! et l'onglet ne reste pas sur « Démarrage… ». Aucun ipykernel requis : le
//! noyau est un `sh` qui écrit une erreur et sort (macOS et Linux).

use atelier_notebook::NotebookManager;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn noyau_mort_au_demarrage_explique_pourquoi() {
    let tmp = tempfile::tempdir().unwrap();
    let kernels = tmp.path().join("jupyter/kernels/casse");
    std::fs::create_dir_all(&kernels).unwrap();
    std::fs::write(
        kernels.join("kernel.json"),
        json!({
            "argv": ["sh", "-c", "echo 'ModuleNotFoundError: No module named ipykernel_launcher' >&2; exit 1", "{connection_file}"],
            "display_name": "Noyau cassé",
            "language": "python"
        })
        .to_string(),
    )
    .unwrap();
    // Seul test de ce binaire : modifier l'environnement ici est sans risque.
    std::env::set_var("JUPYTER_PATH", tmp.path().join("jupyter"));

    let nb = tmp.path().join("casse.ipynb");
    std::fs::write(
        &nb,
        json!({
            "nbformat": 4, "nbformat_minor": 5,
            "metadata": {"kernelspec": {"name": "casse", "display_name": "Noyau cassé", "language": "python"}},
            "cells": [{"id": "c1", "cell_type": "code", "source": "print(1)", "outputs": [], "metadata": {}, "execution_count": null}]
        })
        .to_string(),
    )
    .unwrap();
    let mgr = Arc::new(NotebookManager::new(
        tmp.path().join("rt"),
        tmp.path().join("ak"),
        tmp.path().to_path_buf(),
    ));
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    {
        let sink = Arc::clone(&events);
        mgr.set_listener(Arc::new(move |ev| {
            sink.lock().unwrap().push(serde_json::to_value(&ev).unwrap());
        }));
    }
    let kernel = mgr
        .list_kernels(Some(tmp.path()))
        .into_iter()
        .find(|k| k.display_name == "Noyau cassé")
        .expect("kernelspec de test découvert");

    let started = Instant::now();
    mgr.restart_kernel(&nb, Some(tmp.path()), Some(&kernel.id))
        .await
        .expect_err("le noyau ne peut pas démarrer");
    let err = mgr
        .run_cell(&nb, Some(tmp.path()), "c1", None)
        .await
        .expect_err("la cellule ne peut pas tourner");
    assert!(
        started.elapsed() < Duration::from_secs(10),
        "l'échec doit arriver vite, pas après le délai de 25 s : {:?}",
        started.elapsed()
    );
    assert!(err.contains("n'a pas démarré"), "{err}");
    assert!(err.contains("No module named ipykernel_launcher"), "{err}");

    let events = events.lock().unwrap().clone();
    let last_status = events
        .iter()
        .rev()
        .find(|e| e["event"] == "kernelStatus")
        .expect("état du noyau publié");
    assert_eq!(last_status["status"]["state"], "error", "{last_status}");
    assert!(last_status["status"]["message"]
        .as_str()
        .unwrap_or("")
        .contains("No module named ipykernel_launcher"));
    let cell = events
        .iter()
        .rev()
        .find(|e| e["event"] == "cellUpdated")
        .expect("la cellule reçoit la raison");
    let out = cell["cell"]["outputs"].to_string();
    assert!(out.contains("No module named ipykernel_launcher"), "{out}");
}
