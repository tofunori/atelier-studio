//! Local server scan + iframe check (Node index.mjs).

use serde::Serialize;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const SCAN_PORTS: &[u16] = &[
    3000, 3001, 4173, 4321, 5173, 5174, 8000, 8080, 8081, 8484, 8501, 8765, 8787, 8888, 9091,
];

#[derive(Debug, Clone, Serialize)]
pub struct LocalServer {
    pub port: u16,
    pub title: Option<String>,
}

fn tcp_alive(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let Ok(sock) = addr.parse() else {
        return false;
    };
    TcpStream::connect_timeout(&sock, Duration::from_millis(250)).is_ok()
}

fn html_title(port: u16) -> Option<String> {
    let mut stream =
        TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().ok()?, Duration::from_millis(600))
            .ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
    let req = format!("GET / HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).ok()?;
    let mut buf = Vec::new();
    let _ = stream.read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf);
    let body = text.split("\r\n\r\n").nth(1).unwrap_or(&text);
    let body = &body[..body.len().min(4000)];
    extract_title(body)
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let after = &html[start..];
    let gt = after.find('>')?;
    let rest = &after[gt + 1..];
    let end = rest.to_lowercase().find("</title>")?;
    Some(rest[..end].trim().to_string())
}

pub fn scan_local() -> Vec<LocalServer> {
    SCAN_PORTS
        .iter()
        .filter(|&&p| tcp_alive(p))
        .map(|&port| LocalServer {
            port,
            title: html_title(port),
        })
        .collect()
}

/// Returns `blocked` (true if XFO/CSP prevent framing).
pub fn check_frame(url: &str) -> bool {
    let url = url.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return false;
    }
    let without_scheme = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or(url);
    let (hostport, path) = match without_scheme.find('/') {
        Some(i) => (&without_scheme[..i], &without_scheme[i..]),
        None => (without_scheme, "/"),
    };
    let (host, port) = if let Some((h, p)) = hostport.rsplit_once(':') {
        (h, p.parse().unwrap_or(80))
    } else {
        let default = if url.starts_with("https://") { 443 } else { 80 };
        (hostport, default)
    };
    // Only probe loopback / local for safety in Studio.
    if host != "127.0.0.1" && host != "localhost" && host != "[::1]" {
        return false;
    }
    let mut stream = match TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(3000),
    ) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(3000)));
    let req = format!("GET {path} HTTP/1.0\r\nHost: {host}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = Vec::new();
    let _ = stream.read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf);
    let head = text.split("\r\n\r\n").next().unwrap_or("").to_lowercase();
    let xfo = head
        .lines()
        .find(|l| l.starts_with("x-frame-options:"))
        .unwrap_or("");
    let csp = head
        .lines()
        .find(|l| l.starts_with("content-security-policy:"))
        .unwrap_or("");
    xfo.contains("deny")
        || xfo.contains("sameorigin")
        || (csp.contains("frame-ancestors") && !csp.contains("frame-ancestors *"))
}
