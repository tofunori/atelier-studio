//! Workspace ops for the Atelier Rust backend (plan 033 Porte 4).

mod catalog;
mod claude_science;
pub use claude_science::{
    claude_science_data_dir, find_claude_science_db, import_claude_science,
    read_claude_science_specialists, ClaudeScienceImport, ClaudeScienceSpecialist,
};
mod claude_science_memories;
pub use claude_science_memories::{
    claude_science_memory_overview, claude_science_memory_projects, import_claude_science_memories,
    read_claude_science_memories, ClaudeScienceMemory, ClaudeScienceMemoryOverview,
    ClaudeScienceMemoryProject,
};
mod compute;
mod mcp_du_mac;
pub use mcp_du_mac::{
    cle_mcp, definition_codex, mcp_du_mac, noms_mcp_codex, serveurs_mcp_claude, McpDuMac, ServeurMcp,
};
mod git;
mod generated_images;
pub use generated_images::save_generated_image;
mod narval;
mod pasted;
mod scan;
mod term;
mod zotero;

pub use catalog::{list_commands, list_file_catalog, list_files, FileCatalog};
pub use compute::{
    forget_run as compute_forget_run, read_log as compute_read_log,
    snapshot as compute_snapshot, ComputeConfig, Exec, ExecError as ComputeExecError,
    ForgetOutcome as ComputeForgetOutcome, Output as ComputeOutput,
    Host as ComputeHost, HostError as ComputeHostError, LogChunk as ComputeLogChunk,
    Run as ComputeRun, RunState as ComputeRunState, Snapshot as ComputeSnapshot, SystemExec,
};
/// Calculs lancés par l'agent : fiches d'hôte et soumission (chantier 4).
pub use compute::{hosts as compute_hosts, submit as compute_submit};
pub use git::{
    changed_since, changed_since_stats, changed_since_stats_and_tree, commit, commit_details, commit_summary, commit_file_contents, create_branch, create_branch_at, delete_branch, diff,
    diff_contents, diff_staged, fetch_all, ignore_pattern, log, merge_branch, pull, push, reset_to_commit,
    restore, restore_file_from_commit, revert_commit, revert_conflicts, revert_file, set_aside_before_rewind, snapshot, stage_file, stage_files,
    status, switch_branch, undo_last_commit, unstage_file, unstage_files, ChangedStat, DiffContents, GitCommitDetails,
    GitCommitFile, GitCommitSummary, GitFile, GitLogPage, GitStatus,
};
pub use narval::{
    inspect_job as narval_inspect_job, list_directory as narval_list_directory,
    read_text as narval_read_text, run_files as narval_run_files,
    snapshot as narval_snapshot, status as narval_status, NarvalError, NarvalRunFiles,
    NarvalProfile, NarvalSnapshot, NarvalStatus, RemoteEntry, RemoteTextPreview, RunFileEntry, RunFileRoot,
    SlurmJob, SlurmJobDetail,
};
pub use pasted::{clear_pasted, list_pasted, save_image};
pub use scan::{check_frame, scan_local};
pub use term::{TermEvent, TerminalHub};
pub use zotero::{
    add_pdfs as zotero_add_pdfs, available as zotero_available, collections as zotero_collections,
    load_favs as zotero_load_favs, pdf_absolute_path, search as zotero_search,
    toggle_fav as zotero_toggle_fav, zotero_dir, ZoteroAddResult, ZoteroItem,
};
