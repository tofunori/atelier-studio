//! Device scopes — authorization units for the remote gateway.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    #[serde(rename = "chat:read")]
    ChatRead,
    #[serde(rename = "chat:send")]
    ChatSend,
    #[serde(rename = "chat:interact")]
    ChatInteract,
    #[serde(rename = "gallery:read")]
    GalleryRead,
    #[serde(rename = "files:read")]
    FilesRead,
}

impl Scope {
    pub fn as_str(self) -> &'static str {
        match self {
            Scope::ChatRead => "chat:read",
            Scope::ChatSend => "chat:send",
            Scope::ChatInteract => "chat:interact",
            Scope::GalleryRead => "gallery:read",
            Scope::FilesRead => "files:read",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "chat:read" => Some(Scope::ChatRead),
            "chat:send" => Some(Scope::ChatSend),
            "chat:interact" => Some(Scope::ChatInteract),
            "gallery:read" => Some(Scope::GalleryRead),
            "files:read" => Some(Scope::FilesRead),
            _ => None,
        }
    }
}

/// Full MVP grant at pairing.
pub fn all_mvp_scopes() -> BTreeSet<Scope> {
    BTreeSet::from([
        Scope::ChatRead,
        Scope::ChatSend,
        Scope::ChatInteract,
        Scope::GalleryRead,
        Scope::FilesRead,
    ])
}

pub fn scopes_to_strings(scopes: &BTreeSet<Scope>) -> Vec<String> {
    scopes.iter().map(|s| s.as_str().to_string()).collect()
}

pub fn scopes_from_strings(v: &[String]) -> BTreeSet<Scope> {
    v.iter().filter_map(|s| Scope::parse(s)).collect()
}

pub fn has_scope(scopes: &BTreeSet<Scope>, need: Scope) -> bool {
    scopes.contains(&need)
}
