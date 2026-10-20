//! Noyau d'analyse persistant (chantier 5 du plan
//! `rattrapage-claude-science-2026-10-18`).
//!
//! Un processus Python par fil, lancé dans l'env choisi (conda, venv) et
//! gardé en vie entre deux appels de l'agent : les données chargées restent
//! en mémoire, comme dans le noyau de Claude Science. Rust lance et pilote le
//! processus ; le pilote `atelier_noyau.py`, embarqué dans ce crate, n'est
//! que la boucle d'exécution qui tourne dans le Python de l'utilisateur.
//!
//! Chaque cellule est journalisée (code, sorties, erreur, fichiers lus et
//! écrits, env) dans un fichier JSONL par fil : c'est le « journal des
//! cellules » du fil, et la recette des fichiers qu'une cellule écrit.

pub mod envs;
pub mod diff;
pub mod export;
pub mod journal;
mod kernel;
pub mod manager;
pub mod packages;
pub mod prints;
pub mod recipe;
pub mod replay;
pub mod verify;
mod scan;

pub use envs::{discover_envs, resolve_env, PyEnv};
pub use journal::{CellJournal, CellRecord, ChainCheck, Lineage, ReplayMark, VarUse};
pub use kernel::KernelInfo;
pub use manager::{
    panel_view, CellEvent, CellListener, KernelError, KernelManager, KernelStatus, Origin,
    RunOutcome, RunRequest,
};

/// Source du pilote, écrite sur disque au premier lancement.
pub const DRIVER_SOURCE: &str = include_str!("atelier_noyau.py");
