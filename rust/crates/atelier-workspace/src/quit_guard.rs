//! Garde de sortie de l'app : documents modifiés non enregistrés.
//!
//! L'état « modifié » vit dans les éditeurs (iframes) ; l'app React en
//! publie le nombre (`set_unsaved_documents`). Fermer la fenêtre principale
//! ou demander la sortie est alors retenu, et l'app demande confirmation
//! (audit du 2026-10-18, problème 1). Logique pure, testable hors Tauri :
//! `src-tauri` n'en fait que le branchement.
//!
//! Issue de secours (relecture du 2026-10-19) : l'app accuse réception de
//! chaque demande retenue (`acknowledge`). Si l'interface ne l'écoute plus
//! (écran de BootBoundary, processus WebKit planté), une demande retenue
//! reste sans accusé ; la suivante, au moins `ACK_TIMEOUT` plus tard, passe.
//! Les brouillons de secours sont déjà sur le serveur.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Délai sans accusé de réception au-delà duquel une nouvelle demande de
/// fermeture ou de sortie n'est plus retenue.
pub const ACK_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy)]
struct Held {
    at: Instant,
    acknowledged: bool,
}

#[derive(Debug, Default)]
pub struct QuitGuard {
    unsaved: AtomicUsize,
    confirmed: AtomicBool,
    held: Mutex<Option<Held>>,
}

impl QuitGuard {
    pub fn new() -> Self {
        Self::default()
    }

    /// Nombre de documents modifiés publié par l'app.
    pub fn set_unsaved(&self, count: usize) {
        self.unsaved.store(count, Ordering::SeqCst);
    }

    pub fn unsaved(&self) -> usize {
        self.unsaved.load(Ordering::SeqCst)
    }

    /// L'utilisateur a confirmé dans l'app : la sortie qui suit passe.
    pub fn confirm(&self) {
        self.confirmed.store(true, Ordering::SeqCst);
    }

    /// Fermeture de la fenêtre principale : à retenir tant que des documents
    /// sont modifiés et que l'utilisateur n'a pas confirmé.
    pub fn should_hold_close(&self) -> bool {
        !self.confirmed.load(Ordering::SeqCst) && self.unsaved() > 0
    }

    /// Sortie demandée. `programmatic` : sortie voulue par l'app elle-même
    /// (`AppHandle::exit`, dont la confirmation) — jamais retenue. Sans
    /// fenêtre principale, personne ne pourrait répondre au dialogue : on
    /// laisse partir (les brouillons de secours sont déjà sur le serveur).
    pub fn should_hold_exit(&self, programmatic: bool, main_window_open: bool) -> bool {
        !programmatic && main_window_open && self.should_hold_close()
    }

    /// L'app a reçu la demande retenue (`atelier-quit-requested`) et affiche
    /// sa confirmation.
    pub fn acknowledge(&self) {
        if let Some(held) = self.held_lock().as_mut() {
            held.acknowledged = true;
        }
    }

    /// Fermeture de la fenêtre principale demandée maintenant : `true` si elle
    /// est retenue (l'app doit alors recevoir `atelier-quit-requested`).
    pub fn hold_close(&self) -> bool {
        self.hold_close_at(Instant::now())
    }

    /// Sortie demandée maintenant (voir `should_hold_exit`).
    pub fn hold_exit(&self, programmatic: bool, main_window_open: bool) -> bool {
        !programmatic && main_window_open && self.hold_close()
    }

    /// `hold_close` à un instant donné (tests).
    pub fn hold_close_at(&self, now: Instant) -> bool {
        if !self.should_hold_close() {
            return false;
        }
        let mut held = self.held_lock();
        match *held {
            // demande précédente jamais accusée : l'interface est sourde
            Some(Held {
                at,
                acknowledged: false,
            }) if now.saturating_duration_since(at) >= ACK_TIMEOUT => {
                // vaut confirmation : l'ExitRequested qui suit la fermeture
                // de la fenêtre ne doit pas retenir à nouveau
                *held = None;
                self.confirmed.store(true, Ordering::SeqCst);
                false
            }
            // toujours en attente d'accusé : retenue, l'horloge ne repart pas
            Some(Held {
                acknowledged: false,
                ..
            }) => true,
            _ => {
                *held = Some(Held {
                    at: now,
                    acknowledged: false,
                });
                true
            }
        }
    }

    fn held_lock(&self) -> std::sync::MutexGuard<'_, Option<Held>> {
        self.held
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_modified_never_holds() {
        let guard = QuitGuard::new();
        assert!(!guard.should_hold_close());
        assert!(!guard.should_hold_exit(false, true));
    }

    #[test]
    fn a_modified_document_holds_close_and_user_exit_until_confirmed() {
        let guard = QuitGuard::new();
        guard.set_unsaved(2);
        assert!(guard.should_hold_close());
        assert!(guard.should_hold_exit(false, true));
        guard.confirm();
        assert!(!guard.should_hold_close());
        assert!(!guard.should_hold_exit(false, true));
    }

    #[test]
    fn saving_everything_releases_the_guard() {
        let guard = QuitGuard::new();
        guard.set_unsaved(1);
        guard.set_unsaved(0);
        assert!(!guard.should_hold_close());
    }

    #[test]
    fn an_unanswered_request_lets_the_next_one_through_after_the_timeout() {
        let guard = QuitGuard::new();
        guard.set_unsaved(1);
        let t0 = Instant::now();
        assert!(guard.hold_close_at(t0), "première demande retenue");
        assert!(
            guard.hold_close_at(t0 + Duration::from_secs(1)),
            "encore dans le délai : retenue, sans relancer l'horloge"
        );
        assert!(
            !guard.hold_close_at(t0 + ACK_TIMEOUT),
            "aucun accusé depuis la première : l'interface est sourde, la sortie passe"
        );
        assert!(
            !guard.hold_exit(false, true),
            "la sortie qui suit la fermeture passe aussi"
        );
    }

    #[test]
    fn an_acknowledged_request_keeps_holding() {
        let guard = QuitGuard::new();
        guard.set_unsaved(1);
        let t0 = Instant::now();
        assert!(guard.hold_close_at(t0));
        guard.acknowledge();
        // l'utilisateur a annulé le dialogue, puis redemande bien plus tard
        let later = t0 + ACK_TIMEOUT * 10;
        assert!(
            guard.hold_close_at(later),
            "l'app répond : toujours retenue"
        );
        guard.acknowledge();
        assert!(guard.hold_close_at(later + ACK_TIMEOUT * 10));
        assert!(
            !guard.hold_close_at(later + ACK_TIMEOUT * 20),
            "le dernier envoi n'a pas d'accusé : il passe à son tour"
        );
    }

    #[test]
    fn hold_exit_follows_the_same_rules() {
        let guard = QuitGuard::new();
        assert!(!guard.hold_exit(false, true), "rien de modifié");
        guard.set_unsaved(1);
        assert!(!guard.hold_exit(true, true));
        assert!(!guard.hold_exit(false, false));
        assert!(guard.hold_exit(false, true));
    }

    #[test]
    fn programmatic_exit_or_no_window_is_never_held() {
        let guard = QuitGuard::new();
        guard.set_unsaved(1);
        assert!(
            !guard.should_hold_exit(true, true),
            "AppHandle::exit après confirmation"
        );
        assert!(
            !guard.should_hold_exit(false, false),
            "fenêtre déjà détruite : aucun dialogue possible"
        );
    }
}
