use super::*;
use std::time::Duration;

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

#[test]
fn dossier_par_defaut_selon_le_systeme() {
    let home = Some(OsString::from("/Users/thierry"));
    assert_eq!(
        log_dir_from(None, home.clone(), None, true),
        Some(PathBuf::from("/Users/thierry/Library/Logs/Atelier"))
    );
    assert_eq!(
        log_dir_from(None, home.clone(), None, false),
        Some(PathBuf::from("/Users/thierry/.local/state/atelier/logs"))
    );
    assert_eq!(
        log_dir_from(None, home.clone(), Some("/etat".into()), false),
        Some(PathBuf::from("/etat/atelier/logs"))
    );
    // XDG relatif ignoré, XDG ignoré sur macOS.
    assert_eq!(
        log_dir_from(None, home.clone(), Some("relatif".into()), false),
        Some(PathBuf::from("/Users/thierry/.local/state/atelier/logs"))
    );
    assert_eq!(
        log_dir_from(None, home.clone(), Some("/etat".into()), true),
        Some(PathBuf::from("/Users/thierry/Library/Logs/Atelier"))
    );
    // La variable explicite gagne ; vide, elle est ignorée.
    assert_eq!(
        log_dir_from(Some("/tmp/j".into()), home.clone(), None, true),
        Some(PathBuf::from("/tmp/j"))
    );
    assert_eq!(
        log_dir_from(Some("".into()), home, None, true),
        Some(PathBuf::from("/Users/thierry/Library/Logs/Atelier"))
    );
    // Sans HOME absolu : aucun dossier plutôt qu'un chemin relatif au cwd.
    assert_eq!(log_dir_from(None, None, None, true), None);
    assert_eq!(log_dir_from(None, Some("".into()), None, true), None);
    assert_eq!(log_dir_from(None, Some("rel".into()), None, false), None);
}

#[test]
fn noms_de_journal_valides() {
    assert!(is_valid_name("studio-server"));
    assert!(is_valid_name("gallery-48123"));
    assert!(is_valid_name("a_b"));
    for bad in ["", "../x", "a/b", ".cache", "é", "a b", &"x".repeat(65)] {
        assert!(!is_valid_name(bad), "{bad:?} devrait être refusé");
    }
}

#[test]
fn chemins_des_fichiers_tournes() {
    assert_eq!(
        rotated_path(Path::new("/l/studio-server.log"), 1),
        PathBuf::from("/l/studio-server.1.log")
    );
    assert_eq!(
        rotated_path(Path::new("/l/gallery-48123.log"), 3),
        PathBuf::from("/l/gallery-48123.3.log")
    );
    assert_eq!(
        rotated_path(Path::new("/l/brut"), 2),
        PathBuf::from("/l/brut.2")
    );
}

#[test]
fn rotation_decale_et_supprime_le_plus_ancien() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("s.log");
    std::fs::write(&base, "courant").unwrap();
    std::fs::write(rotated_path(&base, 1), "un").unwrap();
    // .2 manquant : un trou dans la chaîne n'est pas une erreur.
    std::fs::write(rotated_path(&base, 3), "trois").unwrap();
    rotate(&base, 3).unwrap();
    assert!(!base.exists());
    assert_eq!(read(&rotated_path(&base, 1)), "courant");
    assert_eq!(read(&rotated_path(&base, 2)), "un");
    assert!(
        !rotated_path(&base, 3).exists(),
        "le plus ancien est supprimé"
    );
    assert!(!rotated_path(&base, 4).exists());
    // keep = 0 : le fichier courant est seulement supprimé.
    std::fs::write(&base, "x").unwrap();
    rotate(&base, 0).unwrap();
    assert!(!base.exists());
}

#[test]
fn rotation_seulement_quand_le_fichier_est_plein() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("s.log");
    let rotation = Rotation {
        max_bytes: 10,
        keep: 2,
    };
    assert!(!rotate_if_needed(&base, rotation).unwrap(), "absent : rien");
    std::fs::write(&base, "123456789").unwrap();
    assert!(!rotate_if_needed(&base, rotation).unwrap());
    assert_eq!(read(&base), "123456789");
    std::fs::write(&base, "1234567890").unwrap();
    assert!(rotate_if_needed(&base, rotation).unwrap());
    assert!(!base.exists());
    assert_eq!(read(&rotated_path(&base, 1)), "1234567890");
}

#[cfg(unix)]
#[test]
fn journal_cree_en_0600_meme_s_il_existait() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("sous").join("s.log");
    std::fs::create_dir_all(base.parent().unwrap()).unwrap();
    std::fs::write(&base, "ancien\n").unwrap();
    std::fs::set_permissions(&base, std::fs::Permissions::from_mode(0o644)).unwrap();
    let mut file = open_append(&base).unwrap();
    file.write_all(b"nouveau\n").unwrap();
    let mode = std::fs::metadata(&base).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
    assert_eq!(read(&base), "ancien\nnouveau\n", "ajout, jamais écrasement");
}

#[test]
fn le_journal_tourne_et_reste_borne() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("s.log");
    let rotation = Rotation {
        max_bytes: 100,
        keep: 2,
    };
    let log = RotatingLog::open(&base, rotation).unwrap();
    for i in 0..60 {
        log.append(format!("ligne {i:03}\n").as_bytes()).unwrap();
    }
    // 60 lignes de 10 octets : 600 octets écrits, au plus 3 × 100 gardés.
    let sizes: Vec<u64> = [base.clone(), rotated_path(&base, 1), rotated_path(&base, 2)]
        .iter()
        .map(|p| std::fs::metadata(p).unwrap().len())
        .collect();
    assert!(sizes.iter().all(|&s| s <= 100), "tailles {sizes:?}");
    assert!(!rotated_path(&base, 3).exists());
    let courant = read(&base);
    assert!(courant.ends_with("ligne 059\n"), "{courant:?}");
    // Les lignes ne sont jamais coupées par la rotation.
    for file in [base.clone(), rotated_path(&base, 1), rotated_path(&base, 2)] {
        for line in read(&file).lines() {
            assert_eq!(line.len(), 9, "{line:?} dans {}", file.display());
        }
    }
    assert!(read(&rotated_path(&base, 1)).contains("ligne 049"));
}

#[test]
fn un_enregistrement_plus_gros_que_la_borne_est_ecrit_quand_meme() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("s.log");
    let log = RotatingLog::open(
        &base,
        Rotation {
            max_bytes: 4,
            keep: 1,
        },
    )
    .unwrap();
    log.append(b"0123456789").unwrap();
    assert_eq!(read(&base), "0123456789");
    log.append(b"suite").unwrap();
    assert_eq!(read(&base), "suite");
    assert_eq!(read(&rotated_path(&base, 1)), "0123456789");
}

#[test]
fn maintenance_rouvre_un_journal_supprime() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("s.log");
    let log = RotatingLog::open(&base, Rotation::DEFAULT).unwrap();
    log.append(b"avant\n").unwrap();
    assert!(!log.maintain().unwrap(), "rien à faire");
    std::fs::remove_file(&base).unwrap();
    assert!(log.maintain().unwrap(), "fichier supprimé : rouvert");
    log.append(b"apres\n").unwrap();
    assert_eq!(read(&base), "apres\n");
}

#[test]
fn troncature_sur_frontiere_de_caractere() {
    // Le cas de sidecar.rs : 11 999 octets ASCII puis « é » (2 octets) —
    // l'octet 12 000 tombe au milieu du caractère.
    let mut text = "a".repeat(11_999);
    text.push('é');
    text.push_str(" fin");
    let std_panics = std::panic::catch_unwind(|| {
        let mut copy = text.clone();
        copy.truncate(12_000);
    })
    .is_err();
    assert!(std_panics, "String::truncate panique bien hors frontière");
    let mut ours = text.clone();
    truncate_on_char_boundary(&mut ours, 12_000);
    assert_eq!(ours.len(), 11_999);
    let mut euro = "€€".to_string(); // 3 octets chacun
    for max in 0..=6 {
        let mut copy = euro.clone();
        truncate_on_char_boundary(&mut copy, max);
        assert_eq!(copy.len(), (max / 3) * 3, "max {max}");
    }
    truncate_on_char_boundary(&mut euro, 100);
    assert_eq!(euro, "€€");
}

#[test]
fn fin_de_texte_sans_caractere_coupe() {
    let bytes = "aé€x".as_bytes(); // 1 + 2 + 3 + 1 octets
    assert_eq!(tail_utf8(bytes, 100), "aé€x");
    assert_eq!(tail_utf8(bytes, 6), "é€x");
    assert_eq!(
        tail_utf8(bytes, 5),
        "€x",
        "le second octet de « é » est sauté"
    );
    assert_eq!(tail_utf8(bytes, 3), "x", "« € » coupé : sauté");
    assert_eq!(tail_utf8(bytes, 0), "");
    assert!(!tail_utf8(bytes, 5).contains('\u{FFFD}'));
}

#[test]
fn sortie_depuis_l_ouverture() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("s.log");
    std::fs::write(&base, "session précédente\n").unwrap();
    let mut log = ChildLog::open_at(&base, Rotation::DEFAULT).unwrap();
    log.mark("tauri-app lance le serveur");
    assert_eq!(log.output_since_open(1_000), "");
    let mut file = open_append(&base).unwrap();
    file.write_all("erreur de démarrage é\n".as_bytes())
        .unwrap();
    assert_eq!(log.output_since_open(1_000), "erreur de démarrage é");
    // Borné : seulement la fin, marquée « … », jamais un caractère coupé.
    let borne = log.output_since_open(5);
    assert_eq!(borne, "… e é");
    let tout = read(&base);
    assert!(tout.starts_with("session précédente\n"));
    assert!(tout.contains("==== tauri-app lance le serveur ===="));
}

#[test]
fn sortie_apres_rotation_relit_le_fichier_courant() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("s.log");
    std::fs::write(&base, "x".repeat(50)).unwrap();
    let log = ChildLog::open_at(&base, Rotation::DEFAULT).unwrap();
    rotate(&base, 1).unwrap();
    std::fs::write(&base, "neuf\n").unwrap();
    assert_eq!(log.output_since_open(100), "neuf");
}

#[test]
fn horodatage_utc() {
    let at = |secs| UNIX_EPOCH + Duration::from_secs(secs);
    assert_eq!(utc_timestamp(at(0)), "1970-01-01T00:00:00Z");
    assert_eq!(utc_timestamp(at(951_782_400)), "2000-02-29T00:00:00Z");
    assert_eq!(utc_timestamp(at(1_709_164_800)), "2024-02-29T00:00:00Z");
    assert_eq!(utc_timestamp(at(1_792_363_689)), "2026-10-18T22:48:09Z");
    assert_eq!(utc_timestamp(at(4_102_444_799)), "2099-12-31T23:59:59Z");
}

#[test]
fn format_de_la_panique() {
    let text = format_panic(&PanicRecord {
        at: UNIX_EPOCH + Duration::from_secs(1_792_363_689),
        program: "atelier-studio-server".into(),
        pid: 42,
        thread: "tokio-runtime-worker".into(),
        location: Some("src/x.rs:1:2".into()),
        message: "index hors bornes".into(),
        backtrace: "   0: main\n".into(),
    });
    assert!(text.starts_with(
        "2026-10-18T22:48:09Z ==== PANIQUE dans atelier-studio-server (pid 42, fil « tokio-runtime-worker ») ====\n"
    ));
    assert!(text.contains("lieu : src/x.rs:1:2\n"));
    assert!(text.contains("message : index hors bornes\n"));
    assert!(text.contains("pile :\n   0: main\n==== fin de la panique ====\n"));
    let payload: Box<dyn std::any::Any + Send> = Box::new(String::from("possédé"));
    assert_eq!(panic_message(payload.as_ref()), "possédé");
    let payload: Box<dyn std::any::Any + Send> = Box::new("statique");
    assert_eq!(panic_message(payload.as_ref()), "statique");
    let payload: Box<dyn std::any::Any + Send> = Box::new(7_u8);
    assert_eq!(panic_message(payload.as_ref()), "(message non textuel)");
}

#[test]
fn ecrivain_pour_tracing_ne_echoue_jamais() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("s.log");
    let log = ServerLog::open(&base, Rotation::DEFAULT).unwrap();
    let make = log.make_writer();
    let mut writer = make();
    writer.write_all(b"premier\n").unwrap();
    writer.flush().unwrap();
    std::fs::remove_dir_all(dir.path()).unwrap();
    // Dossier supprimé : l'écriture est perdue mais ne remonte aucune erreur.
    let mut writer = make();
    assert_eq!(writer.write(b"perdu\n").unwrap(), 6);
}

// --- Comportements de processus : chaque cas tourne dans un processus
// enfant (ce binaire de test relancé sur un seul test), parce qu'il change
// les descripteurs 1 et 2 ou le panic hook, qui sont globaux.

const CHILD_ENV: &str = "ATELIER_LOGS_TEST_CHILD";

#[cfg(unix)]
fn run_child(test: &str, dir: &Path) -> std::process::Output {
    Command::new(std::env::current_exe().unwrap())
        .args(["--exact", test, "--nocapture", "--test-threads=1"])
        .env(CHILD_ENV, dir)
        .env_remove(LOG_FILE_ENV)
        .output()
        .unwrap()
}

#[cfg(unix)]
fn child_dir() -> Option<PathBuf> {
    std::env::var_os(CHILD_ENV).map(PathBuf::from)
}

#[cfg(unix)]
#[test]
fn enfant_panique() {
    let Some(dir) = child_dir() else { return };
    let log = ServerLog::open(dir.join("p.log"), Rotation::DEFAULT).unwrap();
    log.adopt_stderr().unwrap();
    log.install_panic_hook("serveur-de-test");
    std::thread::Builder::new()
        .name("fil-qui-panique".into())
        .spawn(|| panic!("boum accentué é"))
        .unwrap()
        .join()
        .ok();
}

#[cfg(unix)]
#[test]
fn le_panic_hook_ecrit_lieu_message_et_pile_dans_le_journal() {
    if child_dir().is_some() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let out = run_child("tests::enfant_panique", dir.path());
    assert!(out.status.success(), "{out:?}");
    let text = read(&dir.path().join("p.log"));
    assert!(
        text.contains("==== PANIQUE dans serveur-de-test (pid "),
        "{text}"
    );
    assert!(text.contains("fil « fil-qui-panique »"), "{text}");
    assert!(text.contains("message : boum accentué é"), "{text}");
    assert!(text.contains("lieu : "), "{text}");
    assert!(text.contains("src/tests.rs:"), "{text}");
    assert!(text.contains("pile :"), "{text}");
    // stderr adopté : le hook par défaut n'écrit pas une deuxième copie.
    assert_eq!(text.matches("boum accentué é").count(), 1, "{text}");
}

#[cfg(unix)]
#[test]
fn enfant_adopte_stderr_et_stdout() {
    let Some(dir) = child_dir() else { return };
    let base = dir.join("s.log");
    let log = ServerLog::open(
        &base,
        Rotation {
            max_bytes: 64,
            keep: 2,
        },
    )
    .unwrap();
    log.adopt_stderr().unwrap();
    eprintln!("eprintln avant rotation é");
    log.adopt_stdout().unwrap();
    println!("println après la ligne de démarrage");
    // Remplit le fichier par fd 2 seulement (comme le relais du stderr de
    // codex), puis la maintenance fait tourner et fd 2 suit.
    eprintln!("{}", "x".repeat(80));
    assert!(log.rotating().maintain().unwrap());
    eprintln!("eprintln après rotation");
    println!("println après rotation");
    let mut child = Command::new("sh")
        .args(["-c", "echo enfant herite de stderr >&2"])
        .spawn()
        .unwrap();
    child.wait().unwrap();
}

#[cfg(unix)]
#[test]
fn stderr_et_stdout_adoptes_suivent_la_rotation() {
    if child_dir().is_some() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let out = run_child("tests::enfant_adopte_stderr_et_stdout", dir.path());
    assert!(out.status.success(), "{out:?}");
    let base = dir.path().join("s.log");
    let ancien = read(&rotated_path(&base, 1));
    let courant = read(&base);
    assert!(ancien.contains("eprintln avant rotation é"), "{ancien}");
    assert!(
        ancien.contains("println après la ligne de démarrage"),
        "{ancien}"
    );
    assert!(ancien.contains(&"x".repeat(80)), "{ancien}");
    assert!(courant.contains("eprintln après rotation"), "{courant}");
    assert!(courant.contains("println après rotation"), "{courant}");
    assert!(courant.contains("enfant herite de stderr"), "{courant}");
}

#[cfg(unix)]
#[test]
fn l_enfant_ecrit_dans_le_fichier_apres_la_fin_du_parent() {
    // Le cas lock-reuse : le parent qui a lancé le serveur n'existe plus.
    // Avec un pipe, l'écriture suivante recevait EPIPE ; avec le fichier,
    // elle arrive sur disque.
    let dir = tempfile::tempdir().unwrap();
    let mut log = ChildLog::open_at(dir.path().join("s.log"), Rotation::DEFAULT).unwrap();
    log.mark("lancement");
    let path = log.path().to_path_buf();
    let start = std::fs::metadata(&path).unwrap().len();
    let mut cmd = Command::new("sh");
    cmd.args([
        "-c",
        "printf '%s\\n' \"$ATELIER_LOG_FILE\"; sleep 0.3; echo écrit après le parent >&2",
    ])
    .stdout(Stdio::piped());
    assert!(log.attach(&mut cmd));
    let child = cmd.spawn().unwrap();
    // Le parent lâche tous ses descripteurs du journal avant que l'enfant
    // n'écrive : personne ne « lit » plus rien, comme après un ⌘Q.
    drop(cmd);
    drop(log);
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        path.display().to_string(),
        "le chemin du journal est transmis à l'enfant"
    );
    assert_eq!(read_since(&path, start, 1_000), "écrit après le parent");
}

#[cfg(unix)]
#[test]
fn stdout_aussi_branche_sur_le_journal() {
    let dir = tempfile::tempdir().unwrap();
    let log = ChildLog::open_at(dir.path().join("g.log"), Rotation::DEFAULT).unwrap();
    let mut cmd = Command::new("sh");
    cmd.args(["-c", "echo sortie; echo erreur >&2"]);
    assert!(log.attach(&mut cmd));
    assert!(log.attach_stdout(&mut cmd));
    assert!(cmd.status().unwrap().success());
    let text = log.output_since_open(1_000);
    assert!(text.contains("sortie") && text.contains("erreur"), "{text}");
}

#[test]
fn nom_invalide_refuse_a_l_ouverture() {
    let error = ChildLog::open("../evasion").err().unwrap();
    assert_eq!(error.kind(), io::ErrorKind::NotFound);
}

#[cfg(unix)]
#[test]
fn enfant_from_env() {
    let Some(dir) = child_dir() else { return };
    let log = ServerLog::from_env();
    println!("adopte={}", log.is_some());
    eprintln!("stderr de l'enfant é");
    let _ = dir;
}

#[cfg(unix)]
fn run_from_env_child(dir: &Path, log_path: &Path, stderr: Stdio) -> std::process::Output {
    Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "tests::enfant_from_env",
            "--nocapture",
            "--test-threads=1",
        ])
        .env(CHILD_ENV, dir)
        .env(LOG_FILE_ENV, log_path)
        .stdout(Stdio::piped())
        .stderr(stderr)
        .output()
        .unwrap()
}

#[cfg(unix)]
#[test]
fn variable_heritee_sans_le_fichier_en_stderr_est_ignoree() {
    // Un CLI d'agent hérite d'ATELIER_LOG_FILE du serveur de chat et lance
    // un serveur galerie de test dont le stderr est un pipe : celui-ci ne
    // doit rien écrire dans le journal du serveur de chat.
    if child_dir().is_some() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("studio-server.log");
    std::fs::write(&path, "journal d'un autre processus\n").unwrap();
    let out = run_from_env_child(dir.path(), &path, Stdio::piped());
    assert!(out.status.success(), "{out:?}");
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("adopte=false"), "{stdout}");
    assert!(
        String::from_utf8_lossy(&out.stderr).contains("stderr de l'enfant é"),
        "{out:?}"
    );
    assert_eq!(read(&path), "journal d'un autre processus\n");
}

#[cfg(unix)]
#[test]
fn variable_et_fichier_en_stderr_adoptent_le_journal() {
    if child_dir().is_some() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let mut log =
        ChildLog::open_at(dir.path().join("studio-server.log"), Rotation::DEFAULT).unwrap();
    log.mark("lancement");
    let path = log.path().to_path_buf();
    let stderr = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap();
    let out = run_from_env_child(dir.path(), &path, Stdio::from(stderr));
    assert!(out.status.success(), "{out:?}");
    assert!(
        String::from_utf8_lossy(&out.stdout).contains("adopte=true"),
        "{out:?}"
    );
    assert!(log
        .output_since_open(10_000)
        .contains("stderr de l'enfant é"));
}

#[cfg(unix)]
#[test]
fn stderr_is_compare_l_inode() {
    let dir = tempfile::tempdir().unwrap();
    assert!(!stderr_is(&dir.path().join("absent.log")));
    std::fs::write(dir.path().join("autre.log"), "").unwrap();
    assert!(!stderr_is(&dir.path().join("autre.log")));
}
