//! Workspace ops for the Atelier Rust backend (plan 033 Porte 4).

mod catalog;
mod git;
mod narval;
mod pasted;
mod scan;
mod term;
mod zotero;

pub use catalog::{list_commands, list_files};
pub use git::{
    changed_since, commit, diff, diff_contents, diff_staged, ignore_pattern, pull, push, restore,
    revert_file, snapshot, stage_file, stage_files, status, unstage_file, unstage_files,
    DiffContents, GitFile, GitStatus,
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
