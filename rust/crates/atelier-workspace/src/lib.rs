//! Workspace ops for the Atelier Rust backend (plan 033 Porte 4).

mod catalog;
mod git;
mod narval;
mod pasted;
mod scan;
mod term;
mod zotero;

pub use catalog::{list_commands, list_file_catalog, list_files, FileCatalog};
pub use git::{
    changed_since, commit, commit_details, commit_file_contents, create_branch, create_branch_at, delete_branch, diff,
    diff_contents, diff_staged, fetch_all, ignore_pattern, log, merge_branch, pull, push, reset_to_commit,
    restore, restore_file_from_commit, revert_commit, revert_file, snapshot, stage_file, stage_files,
    status, switch_branch, undo_last_commit, unstage_file, unstage_files, DiffContents, GitCommitDetails,
    GitCommitFile, GitCommitSummary, GitFile, GitLogPage, GitStatus,
};
pub use narval::{
    inspect_job as narval_inspect_job, list_directory as narval_list_directory,
    read_text as narval_read_text, snapshot as narval_snapshot, status as narval_status,
    NarvalError, NarvalSnapshot, NarvalStatus, RemoteEntry, RemoteTextPreview, SlurmJob,
    SlurmJobDetail,
};
pub use pasted::{clear_pasted, list_pasted, save_image};
pub use scan::{check_frame, scan_local};
pub use term::{TermEvent, TerminalHub};
pub use zotero::{
    available as zotero_available, collections as zotero_collections,
    load_favs as zotero_load_favs, pdf_absolute_path, search as zotero_search,
    toggle_fav as zotero_toggle_fav, ZoteroItem,
};
