//! Sonde manuelle : `cargo run -p atelier-workspace --example compute_probe -- mac nas`
use atelier_workspace::{compute_snapshot, ComputeConfig, ComputeHost, SystemExec};
fn main() {
    let hosts: Vec<ComputeHost> = std::env::args().skip(1).filter_map(|a| ComputeHost::parse(&a)).collect();
    let hosts = if hosts.is_empty() { ComputeHost::ALL.to_vec() } else { hosts };
    let cfg = ComputeConfig::default();
    let t = std::time::Instant::now();
    let snap = compute_snapshot(&cfg, &hosts, 7, &SystemExec);
    eprintln!("{} runs, {} erreurs, {:?}", snap.runs.len(), snap.errors.len(), t.elapsed());
    println!("{}", serde_json::to_string_pretty(&snap).unwrap());
}
