//! Bout en bout avec le vrai pixi (sauté s'il n'est pas sur la machine, comme
//! les tests du noyau sans python3). pixi se cherche comme dans l'app :
//! `ATELIER_PIXI`, le PATH, `~/.pixi/bin`, Homebrew.
//!
//! Ce test télécharge Python et un petit paquet depuis conda-forge (ou les
//! prend dans le cache de pixi) : pixi présent mais machine hors ligne et
//! cache vide, il échoue, et c'est voulu : un manifeste que pixi n'accepte
//! plus doit se voir.

use atelier_kernel::pixi::{find_pixi, package_changes, ChangeKind, ATELIER_ENV, SOURCE_ATELIER};
use atelier_kernel::{KernelManager, RunRequest};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::Duration;

fn req<'a>(cwd: &'a Path, code: &'a str) -> RunRequest<'a> {
    RunRequest {
        thread_id: "fil",
        cwd,
        env: None,
        default_env: None,
        code,
        wait: Duration::from_secs(60),
        turn_id: None,
        purpose: None,
        author: None,
        from_cell: None,
        resumed_from: None,
    }
}

#[tokio::test]
async fn le_vrai_pixi_cree_l_env_atelier_y_lance_une_cellule_et_y_ajoute_un_paquet() {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from).unwrap_or_default();
    let Some(pixi) = find_pixi(&home) else {
        eprintln!("pas de pixi : test sauté");
        return;
    };
    let dir = tempfile::tempdir().unwrap();
    let projet = tempfile::tempdir().unwrap();
    // Comme sur le Mac : un dossier d'app dont le chemin contient un espace.
    let app = dir.path().join("Application Support/atelier-studio");
    std::fs::create_dir_all(&app).unwrap();
    // Dossier personnel vide : aucun env conda à trouver.
    let m = KernelManager::new(&app, dir.path());
    m.pixi().set_binary(Some(pixi));
    let atelier = app.join("python");
    assert!(!atelier.exists(), "rien n'est créé avant le premier usage");

    // Rien demandé : la cellule tourne dans l'env « atelier », créé ici,
    // avec le Python fourni par pixi (pas celui du système).
    let r = m.run(req(projet.path(), "import sys\nsys.prefix")).await.unwrap();
    assert_eq!(r.cell["status"], "ok", "{}", r.cell);
    assert!(r.note.as_deref().unwrap().contains("« atelier »"), "{:?}", r.note);
    let info = m.status("fil").kernel.unwrap();
    assert_eq!((info.env.name.as_str(), info.env.source.as_str()), (ATELIER_ENV, SOURCE_ATELIER));
    assert!(info.python_version.starts_with("3.12."), "{}", info.python_version);
    let prefix = atelier.join(".pixi/envs/default");
    let vu = r.cell["result"].as_str().unwrap().trim_matches('\'').to_string();
    assert_eq!(
        std::fs::canonicalize(&vu).unwrap(),
        std::fs::canonicalize(&prefix).unwrap(),
        "le noyau tourne dans l'env d'Atelier"
    );
    let manifeste = std::fs::read_to_string(atelier.join("pixi.toml")).unwrap();
    assert!(manifeste.contains("conda-forge") && manifeste.contains("python = \"3.12.*\""), "{manifeste}");
    let verrou = |m: &Path| hex::encode(Sha256::digest(std::fs::read(m.join("pixi.lock")).unwrap()));
    let avant = m.journal().get("fil", 1).unwrap();
    let snap = m.env_snapshot(avant.env_sha256.as_deref().unwrap()).unwrap();
    assert_eq!(snap.lock_sha256.as_deref(), Some(verrou(&atelier).as_str()));

    // Ajout d'un paquet pendant que le noyau tourne : importable dans la
    // cellule suivante sans redémarrer, variables gardées.
    m.run(req(projet.path(), "garde = 41")).await.unwrap();
    let env = m.target_env("fil", Some(projet.path()), None, None).unwrap();
    let out = m
        .change_packages("fil", &env, ChangeKind::Add, &["six".into()], false)
        .await
        .unwrap();
    assert_eq!(out["restartNeeded"], false, "{out}");
    let version = out["added"]["six"].as_str().expect("six ajouté").to_string();
    assert_eq!(out["lockSha256"].as_str(), Some(verrou(&atelier).as_str()));
    let r = m.run(req(projet.path(), "import six\n(six.__version__, garde + 1)")).await.unwrap();
    assert_eq!(r.cell["status"], "ok", "{}", r.cell);
    assert!(r.note.is_none(), "même noyau : pas de redémarrage");
    assert_eq!(r.cell["result"], format!("('{version}', 42)"));

    // La cellule d'après porte le nouvel instantané, verrou compris.
    let apres = m.journal().get("fil", 3).unwrap();
    assert_ne!(apres.env_sha256, avant.env_sha256);
    let snap = m.env_snapshot(apres.env_sha256.as_deref().unwrap()).unwrap();
    assert_eq!(snap.lock_sha256.as_deref(), Some(verrou(&atelier).as_str()));
    assert_eq!(snap.packages.get("six"), Some(&version));
    assert!(std::fs::read_to_string(atelier.join("pixi.toml")).unwrap().contains("six = "));
    // L'en-tête écrit par Atelier survit aux modifications de pixi.
    assert!(std::fs::read_to_string(atelier.join("pixi.toml")).unwrap().starts_with("# Environnement Python d'Atelier Studio"));

    // Liste courte : les paquets demandés, le total, le verrou, la taille.
    let liste = m.packages("fil", &env).await.unwrap();
    let noms: Vec<&str> = liste["packages"].as_array().unwrap().iter().map(|p| p["name"].as_str().unwrap()).collect();
    assert_eq!(noms, ["python", "six"], "{liste}");
    assert!(liste["total"].as_u64().unwrap() > 2, "dépendances comprises : {liste}");
    assert_eq!(liste["lock"]["sha256"].as_str(), Some(verrou(&atelier).as_str()));
    assert!(liste["sizeBytes"].as_u64().unwrap() > 10 * 1024 * 1024, "{liste}");
    assert!(liste["pixi"]["version"].as_str().unwrap().starts_with("pixi "), "{liste}");

    // Un paquet qui n'existe pas : l'erreur de pixi remonte, rien ne change.
    let err = m
        .change_packages("fil", &env, ChangeKind::Add, &["paquet-qui-n-existe-pas-xyz".into()], false)
        .await
        .unwrap_err();
    assert!(err.starts_with("kernel_packages_failed"), "{err}");
    assert_eq!(apres.env_sha256, m.status("fil").env_sha256, "l'env n'a pas bougé");

    // Retrait, puis noyau neuf : le paquet n'est plus là.
    let out = m
        .change_packages("fil", &env, ChangeKind::Remove, &["six".into()], false)
        .await
        .unwrap();
    assert_eq!(out["removed"]["six"].as_str(), Some(version.as_str()), "{out}");
    m.restart("fil", projet.path(), None, None, true).await.unwrap();
    let r = m
        .run(req(projet.path(), "import importlib.util\nimportlib.util.find_spec('six') is None"))
        .await
        .unwrap();
    assert_eq!(r.cell["result"], "True", "{}", r.cell);

    // La trace du fil garde les trois changements, échec compris.
    let trace = package_changes(m.kernel_dir(), "fil");
    let actions: Vec<(&str, bool)> = trace.iter().map(|c| (c.action.as_str(), c.error.is_some())).collect();
    assert_eq!(actions, [("add", false), ("add", true), ("remove", false)]);
    assert_ne!(trace[0].lock_before, trace[0].lock_after);
    assert_eq!(trace[1].lock_before, trace[1].lock_after, "un échec ne touche pas au verrou");
    m.shutdown_all().await;
}
