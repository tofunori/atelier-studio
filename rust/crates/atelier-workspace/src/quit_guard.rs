//! Garde de sortie de l'app : documents modifiés non enregistrés.
//!
//! L'état « modifié » vit dans les éditeurs (iframes) ; l'app React en
//! publie le nombre (`set_unsaved_documents`). Fermer la fenêtre principale
//! ou demander la sortie est alors retenu, et l'app demande confirmation
//! (audit du 2026-10-18, problème 1). Logique pure, testable hors Tauri :
//! `src-tauri` n'en fait que le branchement.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

#[derive(Debug, Default)]
pub struct QuitGuard {
    unsaved: AtomicUsize,
    confirmed: AtomicBool,
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
