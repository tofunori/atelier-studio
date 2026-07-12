//! Simple sliding-window rate limiter per key (IP or device).

use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct RateLimiter {
    window: Duration,
    max_events: u32,
    hits: HashMap<String, Vec<Instant>>,
}

impl RateLimiter {
    pub fn new(window: Duration, max_events: u32) -> Self {
        Self {
            window,
            max_events,
            hits: HashMap::new(),
        }
    }

    pub fn pairing_default() -> Self {
        // 10 pairing attempts per 5 minutes per IP
        Self::new(Duration::from_secs(300), 10)
    }

    pub fn api_default() -> Self {
        Self::new(Duration::from_secs(60), 120)
    }

    pub fn check(&mut self, key: &str) -> bool {
        let now = Instant::now();
        let entry = self.hits.entry(key.to_string()).or_default();
        entry.retain(|t| now.duration_since(*t) < self.window);
        if entry.len() as u32 >= self.max_events {
            return false;
        }
        entry.push(now);
        true
    }
}
