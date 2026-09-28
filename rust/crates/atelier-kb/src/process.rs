//! Bounded process collection: deadlines cover the child, descendants and pipes.
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

#[derive(Default)]
pub(crate) struct Run {
    pub status: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub timed_out: bool,
    pub error: Option<String>,
}

enum Pipe {
    Data(bool, Vec<u8>),
    Closed,
    InputDone,
    Error(String),
}

pub(crate) fn run(
    bin: &str,
    args: &[&str],
    input: Option<&str>,
    timeout: Duration,
    mut on_chunk: impl FnMut(&[u8]),
) -> Run {
    const MAX_OUTPUT: usize = 32 * 1024 * 1024;
    let mut command = Command::new(bin);
    command
        .args(args)
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return Run {
                error: Some(error.to_string()),
                ..Run::default()
            }
        }
    };
    let (tx, rx) = mpsc::sync_channel(8);
    fn drain(mut pipe: impl Read + Send + 'static, stdout: bool, tx: mpsc::SyncSender<Pipe>) {
        std::thread::spawn(move || {
            let mut buffer = [0; 16 * 1024];
            loop {
                match pipe.read(&mut buffer) {
                    Ok(0) => {
                        let _ = tx.send(Pipe::Closed);
                        break;
                    }
                    Ok(n) => {
                        if tx.send(Pipe::Data(stdout, buffer[..n].to_vec())).is_err() {
                            break;
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(error) => {
                        let _ = tx.send(Pipe::Error(error.to_string()));
                        break;
                    }
                }
            }
        });
    }
    drain(child.stdout.take().unwrap(), true, tx.clone());
    drain(child.stderr.take().unwrap(), false, tx.clone());
    let stdin = child.stdin.take();
    let input = input.map(str::to_owned);
    std::thread::spawn(move || {
        if let (Some(mut pipe), Some(input)) = (stdin, input) {
            // Broken pipe is expected when a command rejects input early.
            let _ = pipe.write_all(input.as_bytes());
        }
        let _ = tx.send(Pipe::InputDone);
    });
    let deadline = Instant::now() + timeout;
    let mut result = Run::default();
    let mut closed = 0;
    let mut input_done = false;
    let mut exited = false;
    loop {
        if !exited {
            match child.try_wait() {
                Ok(Some(status)) => {
                    exited = true;
                    result.status = status.code();
                }
                Ok(None) => {}
                Err(error) => {
                    result.error = Some(error.to_string());
                    break;
                }
            }
        }
        if exited && closed == 2 && input_done {
            return result;
        }
        if Instant::now() >= deadline {
            result.timed_out = true;
            break;
        }
        match rx.recv_timeout(
            deadline
                .saturating_duration_since(Instant::now())
                .min(Duration::from_millis(10)),
        ) {
            Ok(Pipe::Data(stdout, bytes)) => {
                let output = if stdout {
                    &mut result.stdout
                } else {
                    &mut result.stderr
                };
                if output.len() + bytes.len() > MAX_OUTPUT {
                    result.error = Some("sortie du processus trop volumineuse (32 Mio)".into());
                    break;
                }
                if stdout {
                    on_chunk(&bytes);
                }
                output.extend_from_slice(&bytes);
            }
            Ok(Pipe::Closed) => closed += 1,
            Ok(Pipe::InputDone) => input_done = true,
            Ok(Pipe::Error(error)) => {
                result.error = Some(error);
                break;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) if exited => return result,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                std::thread::sleep(Duration::from_millis(1))
            }
        }
    }
    // Never join pipe readers: an escaped descendant must not defeat the deadline.
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = child.kill();
    let _ = child.wait();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deadline_covers_descendant_held_pipes_and_closed_pipes() {
        for command in ["sleep 5 & exit 0", "exec 1>&- 2>&-; sleep 5"] {
            let start = Instant::now();
            let result = run(
                "sh",
                &["-c", command],
                None,
                Duration::from_millis(60),
                |_| {},
            );
            assert!(result.timed_out, "{command}");
            assert!(start.elapsed() < Duration::from_secs(1));
        }
    }
    #[test]
    fn drains_large_input_and_both_outputs() {
        let input = "é".repeat(100_000);
        let result = run(
            "sh",
            &["-c", "cat; printf error >&2"],
            Some(&input),
            Duration::from_secs(2),
            |_| {},
        );
        assert_eq!(result.status, Some(0));
        assert_eq!(result.stdout, input.as_bytes());
        assert_eq!(result.stderr, b"error");
    }
}
