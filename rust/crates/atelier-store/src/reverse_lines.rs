//! Read append-only logs from the end without loading the complete file.
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;

pub struct ReverseLines {
    file: File,
    offset: u64,
    buffer: Vec<u8>,
    reversed_line: Vec<u8>,
    skipping_long_line: bool,
    finished: bool,
}

impl ReverseLines {
    pub fn open(path: impl AsRef<Path>) -> io::Result<Self> {
        let file = File::open(path)?;
        let offset = file.metadata()?.len();
        Ok(Self {
            file,
            offset,
            buffer: Vec::new(),
            reversed_line: Vec::new(),
            skipping_long_line: false,
            finished: false,
        })
    }
}

impl Iterator for ReverseLines {
    type Item = io::Result<String>;
    fn next(&mut self) -> Option<Self::Item> {
        const BLOCK: usize = 16 * 1024;
        const MAX_LINE: usize = 8 * 1024 * 1024;
        loop {
            if self.finished {
                return None;
            }
            // Each block is scanned once; even a very long record is linear.
            let newline = self.buffer.iter().rposition(|byte| *byte == b'\n');
            let start = newline.map_or(0, |position| position + 1);
            if !self.skipping_long_line {
                if self.reversed_line.len() + self.buffer.len() - start > MAX_LINE {
                    self.reversed_line.clear();
                    self.skipping_long_line = true;
                } else {
                    self.reversed_line.extend(self.buffer[start..].iter().rev());
                }
            }
            self.buffer.truncate(newline.unwrap_or(0));
            if newline.is_some() || self.offset == 0 {
                if self.offset == 0 && newline.is_none() {
                    self.finished = true;
                }
                if self.skipping_long_line {
                    self.skipping_long_line = false;
                    continue;
                }
                if self.reversed_line.is_empty() {
                    continue;
                }
                let mut line = std::mem::take(&mut self.reversed_line);
                line.reverse();
                return Some(
                    String::from_utf8(line)
                        .map(|line| line.trim_end_matches('\r').to_owned())
                        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error)),
                );
            }
            let count = (self.offset as usize).min(BLOCK);
            self.offset -= count as u64;
            self.buffer.resize(count, 0);
            if let Err(error) = self
                .file
                .seek(SeekFrom::Start(self.offset))
                .and_then(|_| self.file.read_exact(&mut self.buffer))
            {
                self.finished = true;
                return Some(Err(error));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_utf8_crossing_block_boundaries_and_final_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("log");
        let long = "é".repeat(9000);
        std::fs::write(&path, format!("first\r\n{long}\nlast")).unwrap();
        let lines: Vec<_> = ReverseLines::open(&path)
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(lines, vec!["last".to_owned(), long, "first".to_owned()]);
    }
    #[test]
    fn reads_only_the_tail_and_bounds_pathological_records() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("log");
        std::fs::write(
            &path,
            format!("first\n{}\nlast\n", "a".repeat(9 * 1024 * 1024)),
        )
        .unwrap();
        let mut lines = ReverseLines::open(&path).unwrap();
        assert_eq!(lines.next().unwrap().unwrap(), "last");
        assert!(lines.offset > 8 * 1024 * 1024);
        assert_eq!(lines.next().unwrap().unwrap(), "first");
        assert!(lines.next().is_none());
    }
}
