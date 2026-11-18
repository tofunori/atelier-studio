//! Machine neuve (Ubuntu vierge, Mac sans pixi) : le premier « Tout
//! exécuter » d'un cahier télécharge pixi, crée l'env « atelier » avec
//! ipykernel et numpy, puis tourne sur un vrai ipykernel (ZMQ).
//!
//! Réseau requis : lancé seulement avec `ATELIER_TEST_PIXI_DOWNLOAD=1`, sur
//! une machine sans pixi.

use atelier_notebook::NotebookManager;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn premier_cahier_sur_machine_neuve() {
    if std::env::var("ATELIER_TEST_PIXI_DOWNLOAD").as_deref() != Ok("1") {
        eprintln!("ATELIER_TEST_PIXI_DOWNLOAD absent : test sauté");
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    if atelier_kernel::pixi::find_pixi(tmp.path()).is_some() || std::env::var_os("ATELIER_PIXI").is_some() {
        eprintln!("pixi déjà sur la machine : test sauté");
        return;
    }
    let app = tmp.path().join("atelier-studio");
    let kernels = Arc::new(atelier_kernel::KernelManager::new(&app, tmp.path()));
    kernels.pixi().allow_download();
    let mgr = NotebookManager::new(tmp.path().join("rt"), app.clone(), tmp.path().to_path_buf());
    mgr.set_python_envs(Arc::clone(&kernels));

    let nb = tmp.path().join("premier.ipynb");
    std::fs::write(
        &nb,
        json!({
            "nbformat": 4, "nbformat_minor": 5, "metadata": {},
            "cells": [{"id": "a", "cell_type": "code",
                       "source": "import numpy as np, pandas as pd\nint(np.arange(5).sum()) + len(pd.DataFrame({'x': [1, 2]}))",
                       "outputs": [], "metadata": {}, "execution_count": null}]
        })
        .to_string(),
    )
    .unwrap();
    let snap = tokio::time::timeout(Duration::from_secs(900), mgr.run_all(&nb, Some(tmp.path())))
        .await
        .expect("run_all bloqué")
        .unwrap();
    assert_eq!(snap.status.backend.as_ref().map(|b| format!("{b:?}")), Some("ZmqKernelspec".into()));
    let out = serde_json::to_value(&snap.cells[0].outputs).unwrap();
    assert!(out.to_string().contains("12"), "{out}");
    assert!(app.join(format!("tools/pixi-{}/pixi", atelier_kernel::pixi::PIXI_VERSION)).is_file());
    mgr.shutdown_all().await;
}
