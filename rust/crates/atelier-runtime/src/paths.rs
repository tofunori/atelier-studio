//! Application Support paths for the Atelier Studio backend.

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub app_dir: PathBuf,
    pub pid_file: PathBuf,
    pub lock_file: PathBuf,
    pub ui_file: PathBuf,
}

impl AppPaths {
    /// Production paths under `~/Library/Application Support/atelier-studio`.
    pub fn default_mac() -> Self {
        let home = dirs_home();
        let app_dir = home.join("Library/Application Support/atelier-studio");
        Self::from_app_dir(app_dir)
    }

    pub fn from_app_dir(app_dir: PathBuf) -> Self {
        Self {
            pid_file: app_dir.join("sidecar.pid"),
            lock_file: app_dir.join("sidecar.lock"),
            ui_file: app_dir.join("ui.json"),
            app_dir,
        }
    }
}

fn dirs_home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_app_dir_joins() {
        let p = AppPaths::from_app_dir(PathBuf::from("/tmp/atelier-test"));
        assert_eq!(p.pid_file, PathBuf::from("/tmp/atelier-test/sidecar.pid"));
        assert_eq!(p.lock_file, PathBuf::from("/tmp/atelier-test/sidecar.lock"));
        assert_eq!(p.ui_file, PathBuf::from("/tmp/atelier-test/ui.json"));
    }
}
