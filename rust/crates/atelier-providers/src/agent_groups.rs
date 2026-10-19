//! Groupes de processus des CLI d'agent (claude, codex, opencode, serveurs
//! ACP de grok et kimi).
//!
//! Chaque CLI est spawné avec `process_group(0)` : il survit donc à l'arrêt du
//! serveur de chat, même par `kill -9`. `scripts/relance-app.sh` doit les
//! arrêter, mais SEULEMENT eux : le serveur lance aussi en groupe propre des
//! processus qui doivent survivre à une relance (calculs détachés
//! `atelier-run`, noyaux, jobs `nohup` du terminal). Le serveur publie donc
//! ici la liste exacte des groupes d'agent, que `GET /activity` expose sous
//! `agentGroups`.

use std::collections::BTreeSet;
use std::sync::Mutex;

static GROUPS: Mutex<BTreeSet<u32>> = Mutex::new(BTreeSet::new());

/// Note le groupe d'un CLI d'agent qui vient d'être spawné avec
/// `process_group(0)` (son pgid est son pid).
pub(crate) fn register(pid: Option<u32>) {
    if let Some(pid) = pid.filter(|pid| *pid > 1) {
        if let Ok(mut groups) = GROUPS.lock() {
            groups.insert(pid);
        }
    }
}

/// Groupes d'agent encore vivants, triés. Les groupes disparus sont oubliés
/// au passage, ce qui borne la liste sans toucher aux chemins de sortie de
/// chaque fournisseur.
pub fn current() -> Vec<u32> {
    let Ok(mut groups) = GROUPS.lock() else {
        return Vec::new();
    };
    groups.retain(|pid| group_exists(*pid));
    groups.iter().copied().collect()
}

#[cfg(unix)]
fn group_exists(pgid: u32) -> bool {
    let Ok(pgid) = i32::try_from(pgid) else {
        return false;
    };
    // SAFETY: le signal 0 ne fait que tester l'existence du groupe.
    let rc = unsafe { libc::kill(-pgid, 0) };
    rc == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(not(unix))]
fn group_exists(_pgid: u32) -> bool {
    false
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::process::CommandExt;
    use std::process::Command;

    #[test]
    fn un_groupe_vivant_est_publie_puis_oublie_a_sa_fin() {
        let mut child = Command::new("sleep")
            .arg("30")
            .process_group(0)
            .spawn()
            .expect("sleep");
        let pid = child.id();
        register(Some(pid));
        assert!(current().contains(&pid), "groupe vivant absent");
        child.kill().expect("kill");
        child.wait().expect("wait");
        assert!(!current().contains(&pid), "groupe fini encore publié");
    }

    #[test]
    fn pid_absent_ou_init_ignore() {
        register(None);
        register(Some(1));
        assert!(!current().contains(&1));
    }
}
