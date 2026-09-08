//! One desktop process across every installed copy and worktree. The lock is
//! held before Tauri starts, so a duplicate cannot replace a live chat server.
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;

pub enum Acquisition {
    Owner(InstanceGuard),
    Existing(File),
}

pub struct InstanceGuard(File);

impl Drop for InstanceGuard {
    fn drop(&mut self) {
        unsafe { libc::flock(self.0.as_raw_fd(), libc::LOCK_UN); }
        // Never unlink the file: a waiting process may already have it open.
    }
}

fn acquire(path: &Path) -> std::io::Result<Acquisition> {
    let file = OpenOptions::new().create(true).read(true).write(true)
        .mode(0o600).open(path)?;
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::WouldBlock { return Err(error); }
        return Ok(Acquisition::Existing(file));
    }
    let mut guard = InstanceGuard(file);
    guard.0.set_len(0)?;
    guard.0.seek(SeekFrom::Start(0))?;
    write!(guard.0, "{}", std::process::id())?;
    guard.0.flush()?;
    Ok(Acquisition::Owner(guard))
}

fn retry_owner(mut file: File, mut activate: impl FnMut(i32) -> bool) {
    for _ in 0..40 {
        let mut text = String::new();
        if file.seek(SeekFrom::Start(0)).is_ok() && (&mut file).take(32).read_to_string(&mut text).is_ok() {
            if let Some(pid) = text.trim().parse::<i32>().ok().filter(|pid| *pid > 0) {
                if activate(pid) { return; }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

pub fn enter() -> Result<Option<InstanceGuard>, String> {
    let directory = dirs::home_dir().ok_or("Dossier utilisateur introuvable")?
        .join("Library/Application Support/atelier-studio");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    match acquire(&directory.join("desktop-instance.lock")).map_err(|e| e.to_string())? {
        Acquisition::Owner(guard) => Ok(Some(guard)),
        Acquisition::Existing(file) => {
            // The owner may still be publishing its PID or registering with
            // AppKit. Re-read the same inode instead of trusting a stale PID.
            retry_owner(file, |pid| {
                let Some(app) = objc2_app_kit::NSRunningApplication::runningApplicationWithProcessIdentifier(pid) else { return false };
                if app.bundleIdentifier().is_none_or(|id| id.to_string() != "com.tofunori.atelier") { return false; }
                #[allow(deprecated)]
                app.activateWithOptions(objc2_app_kit::NSApplicationActivationOptions::ActivateIgnoringOtherApps)
            });
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_cannot_acquire_until_owner_exits() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("instance.lock");
        let Acquisition::Owner(owner) = acquire(&path).unwrap() else { panic!("first owner missing") };
        assert!(matches!(acquire(&path).unwrap(), Acquisition::Existing(_)));
        drop(owner);
        assert!(matches!(acquire(&path).unwrap(), Acquisition::Owner(_)));
    }

    #[test]
    fn duplicate_retries_until_owner_publishes_pid() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("instance.lock");
        std::fs::write(&path, b"").unwrap();
        let reader = File::open(&path).unwrap();
        let writer = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(75));
            std::fs::write(path, b"12345").unwrap();
        });
        let mut activated = false;
        retry_owner(reader, |pid| { activated = pid == 12345; activated });
        writer.join().unwrap();
        assert!(activated);
    }

    #[test]
    fn stale_pid_does_not_block_and_file_inode_is_preserved() {
        use std::os::unix::fs::MetadataExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("instance.lock");
        std::fs::write(&path, b"999999").unwrap();
        let inode = std::fs::metadata(&path).unwrap().ino();
        let Acquisition::Owner(owner) = acquire(&path).unwrap() else { panic!("stale pid blocked startup") };
        drop(owner);
        assert_eq!(std::fs::metadata(&path).unwrap().ino(), inode);
    }
}
