//! Mémoire résidente et temps processeur d'un noyau, lus dans le système
//! sans lancer de processus : `/proc` sous Linux, `proc_pidinfo` sous macOS.
//!
//! Le noyau est chef de son groupe de processus (`process_group(0)` au
//! lancement) : ses sous-processus (multiprocessing, joblib, sous-commandes)
//! restent dans ce groupe et sont comptés avec lui.

/// Relevé d'un noyau et des processus de son groupe.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Usage {
    /// Mémoire résidente, en octets.
    pub rss_bytes: u64,
    /// Temps processeur cumulé (utilisateur et système), en millisecondes.
    pub cpu_ms: u64,
    /// Processus comptés : le noyau et ceux de son groupe.
    pub processes: u32,
}

/// Relevé du processus `pid` et de son groupe. `None` si le processus
/// n'existe plus, ou sur un système où rien n'est lu.
pub fn read(pid: u32) -> Option<Usage> {
    if pid == 0 {
        return None;
    }
    sys::read(pid)
}

/// Mémoire physique de la machine, en octets.
pub fn machine_memory_bytes() -> Option<u64> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        // SAFETY: sysconf ne lit que des constantes du système.
        let (pages, page) = unsafe {
            (
                libc::sysconf(libc::_SC_PHYS_PAGES),
                libc::sysconf(libc::_SC_PAGESIZE),
            )
        };
        if pages > 0 && page > 0 {
            return Some(pages as u64 * page as u64);
        }
    }
    None
}

/// Taille lisible, en unités binaires et à la française : « 412 Mo »,
/// « 1,5 Mo », « 16 Go ». Une décimale sous 10 unités.
pub fn human_bytes(bytes: u64) -> String {
    const KO: f64 = 1024.0;
    let scaled = |value: f64, unit: &str| {
        let text = if value < 10.0 {
            format!("{value:.1}")
        } else {
            format!("{value:.0}")
        };
        format!("{} {unit}", text.trim_end_matches(".0").replace('.', ","))
    };
    let b = bytes as f64;
    if b < KO {
        format!("{bytes} o")
    } else if b < KO * KO {
        scaled(b / KO, "Ko")
    } else if b < KO * KO * KO {
        scaled(b / (KO * KO), "Mo")
    } else {
        scaled(b / (KO * KO * KO), "Go")
    }
}

#[cfg(target_os = "linux")]
mod sys {
    use super::Usage;

    /// Champs utiles de `/proc/<pid>/stat`.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub(super) struct Stat {
        pub pgrp: i64,
        /// Temps du processus, plus celui de ses enfants déjà terminés et
        /// attendus : la somme sur le groupe ne recule pas quand un
        /// sous-processus se termine.
        pub cpu_ticks: u64,
        pub rss_pages: u64,
    }

    pub(super) fn parse_stat(text: &str) -> Option<Stat> {
        // Le nom du programme, entre parenthèses, peut contenir des espaces
        // et des parenthèses : les champs se comptent après la dernière.
        let rest = &text[text.rfind(')')? + 1..];
        let fields: Vec<&str> = rest.split_whitespace().collect();
        // `rest` commence au champ 3 (état) de proc(5) : champ n → indice n - 3.
        let number = |field: usize| -> Option<u64> {
            let v = fields.get(field - 3)?.parse::<i64>().ok()?;
            Some(v.max(0) as u64)
        };
        Some(Stat {
            pgrp: fields.get(5 - 3)?.parse().ok()?,
            cpu_ticks: number(14)? + number(15)? + number(16)? + number(17)?,
            rss_pages: number(24)?,
        })
    }

    fn stat_of(pid: u32) -> Option<Stat> {
        parse_stat(&std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?)
    }

    pub(super) fn read(pid: u32) -> Option<Usage> {
        // SAFETY: sysconf ne lit que des constantes du système.
        let (ticks, page) = unsafe {
            (
                libc::sysconf(libc::_SC_CLK_TCK),
                libc::sysconf(libc::_SC_PAGESIZE),
            )
        };
        if ticks <= 0 || page <= 0 {
            return None;
        }
        let leader = stat_of(pid)?;
        let (mut cpu_ticks, mut rss_pages, mut processes) = (leader.cpu_ticks, leader.rss_pages, 1);
        // Les autres processus du groupe dont `pid` est le chef.
        for entry in std::fs::read_dir("/proc").into_iter().flatten().flatten() {
            let other = entry
                .file_name()
                .to_str()
                .and_then(|name| name.parse::<u32>().ok());
            let Some(other) = other.filter(|o| *o != pid) else {
                continue;
            };
            if let Some(stat) = stat_of(other).filter(|s| s.pgrp == i64::from(pid)) {
                cpu_ticks += stat.cpu_ticks;
                rss_pages += stat.rss_pages;
                processes += 1;
            }
        }
        Some(Usage {
            rss_bytes: rss_pages * page as u64,
            cpu_ms: cpu_ticks * 1000 / ticks as u64,
            processes,
        })
    }
}

#[cfg(target_os = "macos")]
mod sys {
    use super::Usage;
    use std::mem::{size_of, MaybeUninit};
    use std::sync::OnceLock;

    /// Processus du groupe au plus : au-delà, les derniers ne sont pas comptés.
    const GROUP_MAX: usize = 512;

    fn task_info(pid: libc::pid_t) -> Option<libc::proc_taskinfo> {
        let mut info = MaybeUninit::<libc::proc_taskinfo>::zeroed();
        let size = size_of::<libc::proc_taskinfo>() as libc::c_int;
        // SAFETY: le tampon a exactement la taille annoncée ; le noyau le
        // remplit en entier ou rend une autre taille, et rien n'est lu alors.
        let written = unsafe {
            libc::proc_pidinfo(
                pid,
                libc::PROC_PIDTASKINFO,
                0,
                info.as_mut_ptr().cast(),
                size,
            )
        };
        // SAFETY: `written == size` : la structure est remplie.
        (written == size).then(|| unsafe { info.assume_init() })
    }

    /// Processus du groupe `pgrp`. Vide si l'appel échoue : seul le noyau
    /// est alors compté.
    fn group_pids(pgrp: libc::pid_t) -> Vec<libc::pid_t> {
        let mut pids: Vec<libc::pid_t> = vec![0; GROUP_MAX];
        let bytes = (pids.len() * size_of::<libc::pid_t>()) as libc::c_int;
        // SAFETY: le tampon fait `bytes` octets.
        let n = unsafe { libc::proc_listpgrppids(pgrp, pids.as_mut_ptr().cast(), bytes) };
        if n <= 0 {
            return Vec::new();
        }
        // Le tampon part de zéro : seules les cases remplies comptent, que
        // l'appel rende un nombre de processus ou d'octets.
        pids.truncate((n as usize).min(GROUP_MAX));
        pids.retain(|p| *p > 0);
        pids
    }

    /// Les temps de `proc_taskinfo` sont en unités de l'horloge Mach, pas en
    /// nanosecondes (rapport 125/3 sur Apple Silicon, 1/1 sur Intel).
    #[allow(deprecated)] // libc renvoie au crate mach2, absent des dépendances.
    fn mach_to_ns() -> (u64, u64) {
        static BASE: OnceLock<(u64, u64)> = OnceLock::new();
        *BASE.get_or_init(|| {
            let mut info = libc::mach_timebase_info { numer: 0, denom: 0 };
            // SAFETY: l'appel remplit la structure passée.
            let status = unsafe { libc::mach_timebase_info(&mut info) };
            if status == 0 && info.denom > 0 {
                (u64::from(info.numer), u64::from(info.denom))
            } else {
                (1, 1)
            }
        })
    }

    pub(super) fn read(pid: u32) -> Option<Usage> {
        let leader = pid as libc::pid_t;
        let info = task_info(leader)?;
        let mut rss_bytes = info.pti_resident_size;
        let mut mach = u128::from(info.pti_total_user) + u128::from(info.pti_total_system);
        let mut processes = 1;
        for other in group_pids(leader).into_iter().filter(|p| *p != leader) {
            if let Some(info) = task_info(other) {
                rss_bytes += info.pti_resident_size;
                mach += u128::from(info.pti_total_user) + u128::from(info.pti_total_system);
                processes += 1;
            }
        }
        let (numer, denom) = mach_to_ns();
        let ns = mach * u128::from(numer) / u128::from(denom);
        Some(Usage {
            rss_bytes,
            cpu_ms: (ns / 1_000_000) as u64,
            processes,
        })
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
mod sys {
    use super::Usage;

    pub(super) fn read(_pid: u32) -> Option<Usage> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_tailles_se_lisent_a_la_francaise() {
        assert_eq!(human_bytes(512), "512 o");
        assert_eq!(human_bytes(300 * 1024), "300 Ko");
        assert_eq!(human_bytes(1024 * 1024), "1 Mo");
        assert_eq!(human_bytes(1536 * 1024), "1,5 Mo");
        assert_eq!(human_bytes(412 * 1024 * 1024), "412 Mo");
        assert_eq!(human_bytes(1932735283), "1,8 Go");
        assert_eq!(human_bytes(16 * 1024 * 1024 * 1024), "16 Go");
    }

    #[test]
    fn un_pid_nul_ou_mort_ne_rend_rien() {
        assert_eq!(read(0), None);
        // Au-delà du plus grand pid possible (2^22 sous Linux, 99999 sous macOS).
        assert_eq!(read(u32::MAX / 2), None);
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn la_machine_annonce_sa_memoire() {
        assert!(machine_memory_bytes().unwrap() > 64 * 1024 * 1024);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn stat_se_lit_meme_avec_un_nom_a_parentheses() {
        // Champs 3 à 24 : état, ppid, pgrp, …, utime 14, stime 15, cutime 16,
        // cstime 17, …, rss 24.
        let line = "4242 (py (v3) x) S 1 4242 4242 0 -1 4194560 100 0 0 0 250 50 30 20 20 0 4 0 12345 1000000 2048 18446744073709551615";
        let stat = sys::parse_stat(line).unwrap();
        assert_eq!(stat.pgrp, 4242);
        assert_eq!(stat.cpu_ticks, 250 + 50 + 30 + 20);
        assert_eq!(stat.rss_pages, 2048);
        assert_eq!(sys::parse_stat("4242 (tronqué) S 1 4242"), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn le_processus_courant_a_de_la_memoire_et_du_temps_processeur() {
        // De quoi faire avancer le compteur d'au moins un tic d'horloge.
        let start = std::time::Instant::now();
        let mut x = 0u64;
        while start.elapsed() < std::time::Duration::from_millis(60) {
            x = std::hint::black_box(x.wrapping_mul(31).wrapping_add(7));
        }
        let usage = read(std::process::id()).unwrap();
        assert!(usage.rss_bytes > 1024 * 1024, "{usage:?}");
        assert!(usage.cpu_ms > 0, "{usage:?}");
        assert!(usage.processes >= 1);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn les_sous_processus_du_groupe_sont_comptes() {
        use std::os::unix::process::CommandExt;
        // Un chef de groupe et deux enfants, comme un noyau et ses ouvriers.
        let mut chef = std::process::Command::new("sh")
            .args(["-c", "sleep 30 & sleep 30 & wait"])
            .process_group(0)
            .spawn()
            .unwrap();
        let pid = chef.id();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        let mut usage = read(pid).unwrap();
        while usage.processes < 3 && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(20));
            usage = read(pid).unwrap();
        }
        let seul = sys::parse_stat(&std::fs::read_to_string(format!("/proc/{pid}/stat")).unwrap())
            .unwrap();
        // SAFETY: killpg sur le groupe de notre propre enfant.
        unsafe {
            libc::killpg(pid as libc::pid_t, libc::SIGKILL);
        }
        let _ = chef.wait();
        assert_eq!(usage.processes, 3, "{usage:?}");
        // SAFETY: sysconf ne lit qu'une constante du système.
        let page = unsafe { libc::sysconf(libc::_SC_PAGESIZE) } as u64;
        assert!(
            usage.rss_bytes > seul.rss_pages * page,
            "la mémoire des enfants s'ajoute : {usage:?}"
        );
    }
}
