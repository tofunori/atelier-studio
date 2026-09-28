//! Coalesced filesystem notifications. The catalog rebuild scans the root, so
//! only a bounded diagnostic sample of paths must be retained under a storm.
use std::collections::BTreeSet;
use std::time::Duration;
use tokio::time::Instant;

const MAX_PATHS: usize = 512;
const QUIET: Duration = Duration::from_millis(900);
const MAX_WAIT: Duration = Duration::from_secs(3);

#[derive(Default)]
pub(crate) struct DirtyBatch {
    paths: BTreeSet<String>,
    first: Option<Instant>,
    last: Option<Instant>,
    pub error: Option<String>,
}

impl DirtyBatch {
    pub fn rescan(&mut self, now: Instant) {
        self.add(["<rescan>".to_string()], now);
    }
    pub fn add(&mut self, paths: impl IntoIterator<Item = String>, now: Instant) -> bool {
        let mut changed = false;
        for path in paths {
            changed = true;
            if self.paths.len() < MAX_PATHS {
                self.paths.insert(path);
            }
        }
        if changed {
            self.first.get_or_insert(now);
            self.last = Some(now);
        }
        changed
    }
    pub fn deadline(&self) -> Option<Instant> {
        Some((self.last? + QUIET).min(self.first? + MAX_WAIT))
    }
    pub fn sample(&self) -> Vec<String> {
        self.paths.iter().take(50).cloned().collect()
    }
    pub fn take(&mut self) -> Vec<String> {
        let sample = self.sample();
        self.paths.clear();
        self.first = None;
        self.last = None;
        sample
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignored_events_do_not_delay_a_real_edit() {
        let mut batch = DirtyBatch::default();
        let start = Instant::now();
        assert!(batch.add(["paper.tex".into()], start));
        for n in 1..900 {
            assert!(!batch.add([], start + Duration::from_millis(n)));
        }
        assert_eq!(batch.deadline(), Some(start + QUIET));
        assert_eq!(batch.take(), vec!["paper.tex"]);
        assert_eq!(batch.deadline(), None);
    }

    #[test]
    fn continuous_relevant_edits_have_a_fixed_deadline_and_bounded_memory() {
        let mut batch = DirtyBatch::default();
        let start = Instant::now();
        for n in 0..10000 {
            batch.add(
                [format!("figure-{n}.svg")],
                start + Duration::from_millis(n),
            );
        }
        assert_eq!(batch.deadline(), Some(start + MAX_WAIT));
        assert_eq!(batch.paths.len(), MAX_PATHS);
        assert_eq!(batch.sample().len(), 50);
        batch.take();
        batch.add(["next.pdf".into()], start + Duration::from_secs(12));
        assert_eq!(
            batch.deadline(),
            Some(start + Duration::from_secs(12) + QUIET)
        );
    }

    #[test]
    fn notification_overflow_without_paths_still_schedules_a_full_rebuild() {
        let mut batch = DirtyBatch::default();
        let start = Instant::now();
        batch.rescan(start);
        assert_eq!(batch.sample(), vec!["<rescan>"]);
        for n in 1..10 {
            batch.rescan(start + Duration::from_secs(n));
        }
        assert_eq!(batch.deadline(), Some(start + MAX_WAIT));
        assert!(!batch.take().is_empty());
        assert_eq!(batch.deadline(), None);
    }
}
