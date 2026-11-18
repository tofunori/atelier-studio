//! Moteur ZMQ contre un VRAI ipykernel (pyzmq/libzmq), pas le pair simulé des
//! tests unitaires : c'est lui qui a montré que `iopub` se refermait après le
//! premier message (aucune sortie) et qu'Interrompre restait bloqué.
//!
//! Lancé seulement si `ATELIER_TEST_IPYKERNEL_PYTHON` désigne un Python qui a
//! `ipykernel` (la CI le crée dans un venv) ; sinon le test se signale et passe.

use atelier_notebook::NotebookManager;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{Duration, Instant};

fn alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn vrai_ipykernel_sorties_interruption_arret() {
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

    let nb = tmp.path().join("essai.ipynb");
    let cell = |id: &str, src: &str| {
        json!({"id": id, "cell_type": "code", "source": src, "outputs": [], "metadata": {}, "execution_count": null})
    };
    std::fs::write(
        &nb,
        json!({
            "nbformat": 4, "nbformat_minor": 5,
            "metadata": {"kernelspec": {"name": "vrai", "display_name": "Vrai ipykernel", "language": "python"}},
            "cells": [
                cell("a", "print('bonjour')\nx = 41"),
                cell("b", "from IPython.display import HTML\nHTML('<table><tr><td>1</td></tr></table>')"),
                cell("c", "x + 1"),
                cell("d", "1/0"),
                cell("e", "print('jamais')"),
                cell("f", "import time\ntime.sleep(30)"),
            ]
        })
        .to_string(),
    )
    .unwrap();

    let mgr = Arc::new(NotebookManager::new(
        tmp.path().join("rt"),
        tmp.path().join("ak"),
        tmp.path().to_path_buf(),
    ));
    let root = tmp.path().to_path_buf();

    // 1. Tout exécuter : vraies sorties, arrêt à la première erreur, rapide.
    let t0 = Instant::now();
    let snap = tokio::time::timeout(Duration::from_secs(60), mgr.run_all(&nb, Some(&root)))
        .await
        .expect("run_all bloqué")
        .unwrap();
    assert!(t0.elapsed() < Duration::from_secs(20), "run_all trop lent : {:?}", t0.elapsed());
    assert_eq!(snap.status.backend.as_ref().map(|b| format!("{b:?}")), Some("ZmqKernelspec".into()));
    let out = |i: usize| serde_json::to_value(&snap.cells[i].outputs).unwrap();
    assert_eq!(out(0)[0]["kind"], "stream");
    assert_eq!(out(0)[0]["text"], "bonjour\n");
    // Noms camelCase attendus par l'onglet (src/lib/notebook.ts).
    assert!(out(1)[0]["textHtml"].as_str().unwrap_or("").contains("<table>"), "{}", out(1));
    assert_eq!(out(2)[0]["textPlain"], "42");
    assert_eq!(out(2)[0]["executionCount"], 3);
    assert_eq!(out(3)[0]["kind"], "error");
    assert_eq!(out(3)[0]["ename"], "ZeroDivisionError");
    assert!(snap.cells[4].execution_count.is_none(), "la cellule après l'erreur ne doit pas tourner");

    // 2. Les sorties sont écrites dans le fichier.
    mgr.save(&nb).await.unwrap();
    let saved: Value = serde_json::from_str(&std::fs::read_to_string(&nb).unwrap()).unwrap();
    assert_eq!(saved["cells"][2]["outputs"][0]["data"]["text/plain"], json!(["42"]));

    // 3. Interrompre une cellule longue répond tout de suite.
    let runner = {
        let mgr = Arc::clone(&mgr);
        let (nb, root) = (nb.clone(), root.clone());
        tokio::spawn(async move { mgr.run_cell(&nb, Some(&root), "f", None).await })
    };
    tokio::time::sleep(Duration::from_millis(1500)).await;
    let t1 = Instant::now();
    tokio::time::timeout(Duration::from_secs(5), mgr.interrupt(&nb))
        .await
        .expect("Interrompre bloqué par l'exécution en cours")
        .unwrap();
    let snap = tokio::time::timeout(Duration::from_secs(10), runner)
        .await
        .expect("la cellule interrompue ne rend pas la main")
        .unwrap()
        .unwrap();
    assert!(t1.elapsed() < Duration::from_secs(10));
    let f = serde_json::to_value(&snap.cells[5].outputs).unwrap();
    assert_eq!(f[0]["ename"], "KeyboardInterrupt", "{f}");

    // 4. Inactivité : le noyau est arrêté et son processus disparaît.
    let pid = snap.status.pid.expect("pid du noyau");
    assert!(alive(pid));
    let stopped = mgr.reap_idle(Duration::ZERO).await;
    assert_eq!(stopped.len(), 1);
    let deadline = Instant::now() + Duration::from_secs(10);
    while alive(pid) && Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(!alive(pid), "le noyau {pid} survit à l'arrêt pour inactivité");

    // 5. Un noyau qui meurt en pleine cellule ne la laisse pas « en cours ».
    std::fs::write(
        &nb,
        json!({
            "nbformat": 4, "nbformat_minor": 5,
            "metadata": {"kernelspec": {"name": "vrai", "display_name": "Vrai ipykernel", "language": "python"}},
            "cells": [cell("z", "import os\nos._exit(1)")]
        })
        .to_string(),
    )
    .unwrap();
    let res = tokio::time::timeout(Duration::from_secs(20), mgr.run_cell(&nb, Some(&root), "z", None))
        .await
        .expect("cellule bloquée après la mort du noyau");
    assert!(res.is_err(), "la mort du noyau doit remonter en erreur");
    mgr.shutdown_all().await;
}
