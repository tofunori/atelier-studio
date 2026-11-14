//! File d'arrivée d'Atelier (« Atelier partout », lot 1).
//!
//! Trois portes mènent au chat depuis le reste du Mac :
//! - le Service macOS « Envoyer à Atelier » (fichiers, dossiers ou texte
//!   sélectionné dans n'importe quelle app) ;
//! - « Ouvrir avec → Atelier » et le dépôt sur l'icône du Dock ;
//! - un lien `atelier://send?…` (Raccourcis, Raycast, une page web).
//!
//! Ce crate ne touche pas AppKit : il valide et borne ce qui arrive, puis le
//! garde en file jusqu'à ce que l'interface le réclame. La file est la source
//! de vérité ; l'événement émis vers l'interface n'est qu'un signal « viens
//! vider la file », pour qu'un envoi reçu pendant un lancement à froid (avant
//! que React écoute) ne se perde pas.
//!
//! Rien ici n'envoie quoi que ce soit à un agent : l'interface dépose une
//! pilule dans le compositeur, et seul ↵ part.

use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use url::Url;

/// Texte reçu au plus (caractères) : une sélection de page entière tient
/// largement ; au-delà, la pilule l'annonce tronquée.
pub const MAX_TEXT_CHARS: usize = 100_000;
/// Fichiers retenus par envoi : un clic droit sur 300 fichiers ne doit pas
/// remplir le compositeur de 300 pilules.
pub const MAX_PATHS: usize = 50;
/// Envois gardés en file si l'interface ne les réclame pas (app en train de
/// démarrer) ; les plus anciens tombent.
pub const MAX_QUEUE: usize = 32;
/// Titre d'un lien au plus (caractères).
const MAX_TITLE_CHARS: usize = 300;

/// Par où l'envoi est arrivé.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Via {
    /// Service macOS « Envoyer à Atelier ».
    Service,
    /// « Ouvrir avec → Atelier » ou dépôt sur l'icône du Dock.
    Open,
    /// Lien `atelier://send?…`.
    Link,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub is_dir: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Payload {
    /// Fichiers ou dossiers, par leur chemin absolu : l'agent les lit sur
    /// place, rien n'est copié.
    #[serde(rename_all = "camelCase")]
    Files { entries: Vec<Entry>, omitted: usize },
    /// Texte sélectionné ailleurs.
    #[serde(rename_all = "camelCase")]
    Text {
        text: String,
        truncated: bool,
        title: Option<String>,
    },
    /// Adresse web (http ou https seulement).
    #[serde(rename_all = "camelCase")]
    Link { url: String, title: Option<String> },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Arrival {
    pub id: u64,
    pub via: Via,
    /// App d'où vient l'envoi (« Finder », « Safari »…), quand macOS la donne.
    pub source_app: Option<String>,
    #[serde(flatten)]
    pub payload: Payload,
    pub received_at_ms: u64,
}

/// Fichiers ou dossiers existants, absolus, sans doublon, bornés à
/// [`MAX_PATHS`]. `None` si rien n'est utilisable.
pub fn files<I, P>(paths: I) -> Option<Payload>
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    let mut seen = HashSet::new();
    let mut entries = Vec::new();
    let mut omitted = 0;
    for path in paths {
        let path = path.as_ref();
        if !path.is_absolute() {
            continue;
        }
        let Ok(meta) = std::fs::metadata(path) else {
            continue;
        };
        let Some(text) = path.to_str() else { continue };
        if !seen.insert(text.to_string()) {
            continue;
        }
        if entries.len() == MAX_PATHS {
            omitted += 1;
            continue;
        }
        entries.push(Entry {
            path: text.to_string(),
            is_dir: meta.is_dir(),
        });
    }
    (!entries.is_empty()).then_some(Payload::Files { entries, omitted })
}

/// Texte sélectionné : fins de ligne normalisées, blancs de bord retirés,
/// borné à [`MAX_TEXT_CHARS`] sans couper un caractère. `None` si vide.
pub fn text(raw: &str, title: Option<&str>) -> Option<Payload> {
    let normalized = raw.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return None;
    }
    let (text, truncated) = clip(trimmed, MAX_TEXT_CHARS);
    Some(Payload::Text {
        text,
        truncated,
        title: clean_title(title),
    })
}

fn clip(value: &str, max_chars: usize) -> (String, bool) {
    match value.char_indices().nth(max_chars) {
        Some((cut, _)) => (value[..cut].to_string(), true),
        None => (value.to_string(), false),
    }
}

fn clean_title(title: Option<&str>) -> Option<String> {
    let title = title?.split_whitespace().collect::<Vec<_>>().join(" ");
    (!title.is_empty()).then(|| clip(&title, MAX_TITLE_CHARS).0)
}

/// Ce que macOS livre par `application:openURLs:` (Ouvrir avec, Dock, liens) :
/// les `file://` deviennent UN envoi de fichiers, chaque `atelier://` valide
/// un envoi à part. Le reste est ignoré.
pub fn from_opened(urls: &[Url]) -> Vec<(Via, Payload)> {
    let mut out = Vec::new();
    let paths: Vec<PathBuf> = urls
        .iter()
        .filter(|url| url.scheme() == "file")
        .filter_map(|url| url.to_file_path().ok())
        .collect();
    if let Some(payload) = files(&paths) {
        out.push((Via::Open, payload));
    }
    out.extend(
        urls.iter()
            .filter_map(link)
            .map(|payload| (Via::Link, payload)),
    );
    out
}

/// `atelier://send?text=…&title=…` ou `atelier://send?url=…&title=…`.
///
/// N'importe quelle page web peut ouvrir un lien `atelier://` : un lien ne
/// transporte donc JAMAIS de chemin local (un paramètre `path` est ignoré),
/// et une adresse n'est retenue qu'en http(s). Pour envoyer un fichier depuis
/// un script, `open -a Atelier <fichier>` passe par « Ouvrir avec ».
pub fn link(url: &Url) -> Option<Payload> {
    if url.scheme() != "atelier" || url.host_str() != Some("send") {
        return None;
    }
    let mut text_param = None;
    let mut url_param = None;
    let mut title_param = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "text" if text_param.is_none() => text_param = Some(value.into_owned()),
            "url" if url_param.is_none() => url_param = Some(value.into_owned()),
            "title" if title_param.is_none() => title_param = Some(value.into_owned()),
            _ => {}
        }
    }
    let title = title_param.as_deref();
    if let Some(raw) = url_param {
        if let Ok(target) = Url::parse(raw.trim()) {
            if matches!(target.scheme(), "http" | "https") && target.host_str().is_some() {
                return Some(Payload::Link {
                    url: target.to_string(),
                    title: clean_title(title),
                });
            }
        }
    }
    text(text_param.as_deref()?, title)
}

/// File d'arrivée : les envois attendent ici que l'interface les vide.
#[derive(Debug, Default)]
pub struct Inbox {
    next_id: u64,
    items: VecDeque<Arrival>,
}

impl Inbox {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(
        &mut self,
        via: Via,
        source_app: Option<String>,
        payload: Payload,
        now_ms: u64,
    ) -> u64 {
        self.next_id += 1;
        let source_app = source_app.and_then(|app| clean_title(Some(&app)));
        self.items.push_back(Arrival {
            id: self.next_id,
            via,
            source_app,
            payload,
            received_at_ms: now_ms,
        });
        while self.items.len() > MAX_QUEUE {
            self.items.pop_front();
        }
        self.next_id
    }

    /// Rend les envois en attente, du plus ancien au plus récent, et vide la file.
    pub fn drain(&mut self) -> Vec<Arrival> {
        self.items.drain(..).collect()
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn files_keeps_existing_absolute_paths_and_flags_folders() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("TP2 Gagnon.docx");
        std::fs::write(&file, b"x").unwrap();
        let sub = dir.path().join("Rendus");
        std::fs::create_dir(&sub).unwrap();
        let payload = files([
            file.clone(),
            sub.clone(),
            file.clone(),
            dir.path().join("absent.pdf"),
            PathBuf::from("relatif.txt"),
        ])
        .unwrap();
        assert_eq!(
            payload,
            Payload::Files {
                entries: vec![
                    Entry {
                        path: file.to_str().unwrap().into(),
                        is_dir: false
                    },
                    Entry {
                        path: sub.to_str().unwrap().into(),
                        is_dir: true
                    },
                ],
                omitted: 0,
            }
        );
    }

    #[test]
    fn files_caps_the_count_and_reports_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        let paths: Vec<PathBuf> = (0..MAX_PATHS + 3)
            .map(|i| {
                let p = dir.path().join(format!("f{i}.txt"));
                std::fs::write(&p, b"x").unwrap();
                p
            })
            .collect();
        let Payload::Files { entries, omitted } = files(&paths).unwrap() else {
            panic!()
        };
        assert_eq!(entries.len(), MAX_PATHS);
        assert_eq!(omitted, 3);
    }

    #[test]
    fn files_none_when_nothing_usable() {
        assert_eq!(files(["/nexiste/pas", "relatif"]), None);
    }

    #[test]
    fn text_trims_normalizes_and_rejects_empty() {
        assert_eq!(
            text("  ligne 1\r\nligne 2\r ", Some("  Une   page ")),
            Some(Payload::Text {
                text: "ligne 1\nligne 2".into(),
                truncated: false,
                title: Some("Une page".into())
            })
        );
        assert_eq!(text(" \n\t ", None), None);
    }

    #[test]
    fn text_is_clipped_on_a_char_boundary() {
        let long = "é".repeat(MAX_TEXT_CHARS + 10);
        let Some(Payload::Text {
            text, truncated, ..
        }) = text(&long, None)
        else {
            panic!()
        };
        assert!(truncated);
        assert_eq!(text.chars().count(), MAX_TEXT_CHARS);
    }

    #[test]
    fn opened_file_urls_become_one_files_arrival() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a b.pdf");
        let b = dir.path().join("c.tex");
        std::fs::write(&a, b"x").unwrap();
        std::fs::write(&b, b"x").unwrap();
        let urls = [
            Url::from_file_path(&a).unwrap(),
            Url::from_file_path(&b).unwrap(),
            u("https://exemple.org"),
        ];
        let out = from_opened(&urls);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].0, Via::Open);
        let Payload::Files { entries, .. } = &out[0].1 else {
            panic!()
        };
        assert_eq!(entries[0].path, a.to_str().unwrap());
    }

    #[test]
    fn link_carries_text_or_web_url_never_a_path() {
        assert_eq!(
            link(&u("atelier://send?text=Bonjour%20%C3%A0%20toi&title=Note")),
            Some(Payload::Text {
                text: "Bonjour à toi".into(),
                truncated: false,
                title: Some("Note".into())
            })
        );
        assert_eq!(
            link(&u(
                "atelier://send?url=https%3A%2F%2Ftc.copernicus.org%2Farticles%2F19&title=TC"
            )),
            Some(Payload::Link {
                url: "https://tc.copernicus.org/articles/19".into(),
                title: Some("TC".into())
            })
        );
        // un chemin local n'est jamais accepté par un lien
        assert_eq!(
            link(&u("atelier://send?path=%2FUsers%2Fx%2F.ssh%2Fid_rsa")),
            None
        );
        // file:, javascript: : refusés, retombe sur le texte s'il y en a
        assert_eq!(
            link(&u("atelier://send?url=file%3A%2F%2F%2Fetc%2Fpasswd")),
            None
        );
        assert_eq!(
            link(&u("atelier://send?url=javascript%3Aalert(1)&text=ok")),
            Some(Payload::Text {
                text: "ok".into(),
                truncated: false,
                title: None
            })
        );
        // autre hôte ou autre schéma : rien
        assert_eq!(link(&u("atelier://run?text=x")), None);
        assert_eq!(link(&u("https://send?text=x")), None);
    }

    #[test]
    fn opened_keeps_links_apart_from_files() {
        let out = from_opened(&[
            u("atelier://send?text=a"),
            u("atelier://send?text=b"),
            u("atelier://send"),
        ]);
        assert_eq!(out.len(), 2);
        assert!(out.iter().all(|(via, _)| *via == Via::Link));
    }

    #[test]
    fn inbox_drains_in_order_and_caps_its_length() {
        let mut inbox = Inbox::new();
        for i in 0..MAX_QUEUE + 2 {
            inbox.push(
                Via::Service,
                Some("Finder".into()),
                text(&format!("t{i}"), None).unwrap(),
                i as u64,
            );
        }
        assert_eq!(inbox.len(), MAX_QUEUE);
        let drained = inbox.drain();
        assert!(inbox.is_empty());
        assert_eq!(drained.first().unwrap().id, 3);
        assert_eq!(drained.last().unwrap().id, (MAX_QUEUE + 2) as u64);
    }

    #[test]
    fn arrival_serializes_for_the_interface() {
        let mut inbox = Inbox::new();
        inbox.push(
            Via::Service,
            Some("  Finder ".into()),
            Payload::Files {
                entries: vec![Entry {
                    path: "/a/b.pdf".into(),
                    is_dir: false,
                }],
                omitted: 0,
            },
            42,
        );
        let value = serde_json::to_value(&inbox.drain()[0]).unwrap();
        assert_eq!(
            value,
            json!({
                "id": 1, "via": "service", "sourceApp": "Finder", "receivedAtMs": 42,
                "kind": "files", "entries": [{ "path": "/a/b.pdf", "isDir": false }], "omitted": 0
            })
        );
    }
}
