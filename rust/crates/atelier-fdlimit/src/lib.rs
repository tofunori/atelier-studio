//! Les apps lancées depuis le Finder héritent de la limite launchd GUI
//! (`maxfiles 256` soft) — assez basse pour qu'une rafale de lectures d'un
//! CLI agent produise `EMFILE: too many open files`. Les enfants héritent de
//! la limite du parent, donc chaque binaire qui spawne des CLIs doit la
//! relever AVANT le premier spawn.

/// Plafond demandé pour la soft limit ; borné par la hard limit du processus.
pub const TARGET_NOFILE: u64 = 65_536;

/// Relève la soft limit `RLIMIT_NOFILE` vers `min(TARGET_NOFILE, hard)`.
/// Retourne la soft limit effective après l'appel. Sans effet (mais sans
/// danger) si la limite est déjà au-dessus de la cible ou si l'OS refuse.
#[cfg(unix)]
pub fn raise_nofile_limit() -> u64 {
    unsafe {
        let mut lim = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        if libc::getrlimit(libc::RLIMIT_NOFILE, &mut lim) != 0 {
            return 0;
        }
        let target = TARGET_NOFILE.min(lim.rlim_max as u64);
        if (lim.rlim_cur as u64) < target {
            let wanted = libc::rlimit {
                rlim_cur: target as libc::rlim_t,
                rlim_max: lim.rlim_max,
            };
            let _ = libc::setrlimit(libc::RLIMIT_NOFILE, &wanted);
            let _ = libc::getrlimit(libc::RLIMIT_NOFILE, &mut lim);
        }
        lim.rlim_cur as u64
    }
}

#[cfg(not(unix))]
pub fn raise_nofile_limit() -> u64 {
    0
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn soft_limit_atteint_la_cible_ou_la_hard_limit() {
        let effective = raise_nofile_limit();
        let mut lim = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        unsafe {
            assert_eq!(libc::getrlimit(libc::RLIMIT_NOFILE, &mut lim), 0);
        }
        let expected = TARGET_NOFILE.min(lim.rlim_max as u64);
        assert_eq!(effective, lim.rlim_cur as u64);
        assert!(
            effective >= expected,
            "soft limit {effective} < attendu {expected}"
        );
    }

    #[test]
    fn idempotent() {
        assert_eq!(raise_nofile_limit(), raise_nofile_limit());
    }
}
