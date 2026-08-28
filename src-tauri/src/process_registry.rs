//! Registre des serveurs galerie spawnés par CETTE instance de l'app.
//! Ils sont détachés (un par projet visité) : sans ce registre, ils
//! survivent à la fermeture et s'accumulent, chacun avec son watcher FS
//! récursif (audit perf 2026-08-28). Le studio-server (verrou partagé
//! machine) et le gateway iPhone ne sont PAS enregistrés : leur survie
//! est un choix (reconnexion rapide, accès distant).
use std::sync::Mutex;

static CHILDREN: Mutex<Vec<u32>> = Mutex::new(Vec::new());

pub fn register(pid: u32) {
    if pid == 0 {
        return;
    }
    CHILDREN.lock().unwrap().push(pid);
}

pub fn kill_all() {
    for pid in CHILDREN.lock().unwrap().drain(..) {
        // SIGTERM : le serveur ferme proprement (écritures atomiques en cours)
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_ignores_zero_pid() {
        register(0);
        // pas de panique, pas d'ajout observable (kill_all sur un registre
        // vide ne doit rien tenter) — test de fumée uniquement.
        kill_all();
    }
}
