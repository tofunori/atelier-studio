//! Filet anti-CLI-figé : une échéance d'INACTIVITÉ, pas une durée maximale.
//!
//! Les trois providers ACP/app-server (codex, grok, kimi) posaient un
//! `tokio::time::timeout` sec sur le tour entier. Le commentaire d'origine
//! disait pourtant l'intention exacte — « un tour long reste légitime, seul le
//! CLI FIGÉ est visé » — mais une échéance sèche ne sait pas distinguer les
//! deux : elle tue aussi bien un process mort qu'un agent en plein travail.
//!
//! Vécu le 2026-08-28 : une reconstruction de provenance (fouille des
//! transcripts pour retrouver le script générateur d'une figure) a été coupée
//! à 600 s alors qu'elle venait d'exécuter 39 commandes et lisait son
//! quinzième fichier — le tour PARLAIT en continu. Message affiché : « timeout
//! Codex (600s) », qui laissait croire à une limite de durée voulue.
//!
//! Le compteur d'activité est incrémenté par le handler d'événements du
//! provider ; tant qu'il bouge, l'attente se prolonge. Le tour n'est
//! interrompu que sur un silence complet de `idle`.

use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Granularité du réveil. Assez fin pour que le silence mesuré colle à la
/// fenêtre demandée, assez large pour ne pas réveiller la tâche en boucle sur
/// un tour d'une heure.
const TICK: Duration = Duration::from_secs(5);

/// Compteur d'événements d'un tour : le handler du provider l'incrémente à
/// chaque notification reçue, l'attente le lit pour savoir si le CLI parle.
#[derive(Clone, Default)]
pub struct TurnActivity(Arc<AtomicU64>);

impl TurnActivity {
    pub fn new() -> Self {
        Self(Arc::new(AtomicU64::new(0)))
    }

    /// À appeler pour CHAQUE événement venu du provider (y compris les deltas
    /// de sortie et de raisonnement : un modèle qui réfléchit longuement est
    /// vivant).
    pub fn bump(&self) {
        self.0.fetch_add(1, Ordering::Relaxed);
    }

    fn ticks(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}

/// Attend `fut` tant que le provider donne signe de vie.
///
/// Retourne `Ok(sortie)` dès que le future se résout, `Err(())` après `idle`
/// de silence TOTAL (aucun `bump`). Une `idle` nulle désactive le filet — un
/// tour sans garde-fou vaut mieux qu'un tour tué à zéro seconde.
pub async fn with_idle_timeout<F>(fut: F, idle: Duration, activity: &TurnActivity) -> Result<F::Output, ()>
where
    F: Future,
{
    if idle.is_zero() {
        return Ok(fut.await);
    }
    tokio::pin!(fut);
    let mut silence = Duration::ZERO;
    let mut last = activity.ticks();
    loop {
        let tick = TICK.min(idle - silence.min(idle));
        // `tick` nul (silence == idle) ne doit jamais produire un sleep(0) en
        // boucle : la borne ci-dessous coupe avant d'y arriver.
        let tick = if tick.is_zero() { TICK } else { tick };
        tokio::select! {
            out = &mut fut => return Ok(out),
            _ = tokio::time::sleep(tick) => {
                let now = activity.ticks();
                if now != last {
                    // Le CLI a parlé : le compte à rebours repart de zéro.
                    last = now;
                    silence = Duration::ZERO;
                } else {
                    silence += tick;
                    if silence >= idle {
                        return Err(());
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::oneshot;

    /// Le cas vécu : un tour qui parle sans arrêt pendant plus longtemps que
    /// la fenêtre d'inactivité ne doit JAMAIS être coupé.
    #[tokio::test(start_paused = true)]
    async fn un_tour_bavard_survit_bien_au_dela_de_la_fenetre() {
        let (tx, rx) = oneshot::channel::<u8>();
        let activity = TurnActivity::new();
        let parleur = activity.clone();
        tokio::spawn(async move {
            // 40 « événements » espacés de 3 s = 120 s d'activité continue,
            // très au-delà de la fenêtre de 10 s.
            for _ in 0..40 {
                tokio::time::sleep(Duration::from_secs(3)).await;
                parleur.bump();
            }
            let _ = tx.send(7);
        });
        let out = with_idle_timeout(rx, Duration::from_secs(10), &activity).await;
        assert_eq!(out.expect("pas de coupure").expect("reçu"), 7);
    }

    /// Le cas visé par le filet : le CLI est vivant mais muet.
    #[tokio::test(start_paused = true)]
    async fn un_cli_muet_est_coupe_apres_la_fenetre() {
        let (_tx, rx) = oneshot::channel::<u8>();
        let activity = TurnActivity::new();
        assert!(with_idle_timeout(rx, Duration::from_secs(10), &activity)
            .await
            .is_err());
    }

    /// Un tour qui parle PUIS se tait est coupé — mais seulement après une
    /// fenêtre complète de silence, comptée depuis le dernier signe de vie.
    #[tokio::test(start_paused = true)]
    async fn le_silence_se_compte_depuis_le_dernier_evenement() {
        let (_tx, rx) = oneshot::channel::<u8>();
        let activity = TurnActivity::new();
        let parleur = activity.clone();
        tokio::spawn(async move {
            for _ in 0..4 {
                tokio::time::sleep(Duration::from_secs(6)).await;
                parleur.bump();
            }
        });
        let debut = tokio::time::Instant::now();
        assert!(with_idle_timeout(rx, Duration::from_secs(10), &activity)
            .await
            .is_err());
        // 24 s d'activité, puis 10 s de silence : la coupure ne peut pas
        // tomber avant. Sans le redémarrage du compte, elle serait à 10 s.
        assert!(debut.elapsed() >= Duration::from_secs(30));
    }

    /// Le future qui se résout tout de suite n'attend pas un tick.
    #[tokio::test(start_paused = true)]
    async fn une_fin_immediate_ne_coute_rien() {
        let (tx, rx) = oneshot::channel::<u8>();
        tx.send(3).unwrap();
        let activity = TurnActivity::new();
        assert_eq!(
            with_idle_timeout(rx, Duration::from_secs(600), &activity)
                .await
                .expect("pas de coupure")
                .expect("reçu"),
            3
        );
    }

    /// Fenêtre nulle = filet désactivé, jamais un tour tué instantanément.
    #[tokio::test(start_paused = true)]
    async fn une_fenetre_nulle_desactive_le_filet() {
        let (tx, rx) = oneshot::channel::<u8>();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(120)).await;
            let _ = tx.send(1);
        });
        let activity = TurnActivity::new();
        assert_eq!(
            with_idle_timeout(rx, Duration::ZERO, &activity)
                .await
                .expect("pas de coupure")
                .expect("reçu"),
            1
        );
    }
}
