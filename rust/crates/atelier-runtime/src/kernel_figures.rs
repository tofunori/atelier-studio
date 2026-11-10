//! Figures d'une cellule rendues à l'agent en images.
//!
//! Le pilote du noyau capte en PNG les figures matplotlib restées ouvertes à
//! la fin d'une cellule. La réponse de l'outil `atelier_python` joint les
//! premières en contenu image MCP : l'agent voit ce qu'il a tracé et peut le
//! contrôler, comme dans le noyau de Claude Science.
//!
//! Bornes strictes : peu d'images par cellule, une taille de fichier et un
//! côté maximaux. Rien n'est réduit ici (aucun décodeur d'image dans les
//! dépendances) : une figure hors bornes n'est pas jointe, l'agent reçoit son
//! chemin et la raison.

use atelier_kernel::usage::human_bytes;
use atelier_protocol::agent_mcp_limits as lim;
use base64::Engine;
use serde_json::{json, Value};
use std::path::Path;

/// Images jointes par cellule ; les figures suivantes ne donnent que leur chemin.
pub const ATTACHED_MAX: usize = 3;
/// Taille maximale du fichier PNG d'une figure jointe.
pub const BYTES_MAX: u64 = 1024 * 1024;
/// Plus grand côté d'une figure jointe, en pixels (28 pouces au 144 ppp du
/// pilote).
pub const SIDE_MAX: u32 = 4096;

// Ce que le noyau joint tient dans ce que le pont laisse passer.
const _: () = assert!(ATTACHED_MAX <= lim::BRIDGE_IMAGES_MAX);
const _: () =
    assert!(ATTACHED_MAX * (BYTES_MAX as usize).div_ceil(3) * 4 <= lim::BRIDGE_IMAGES_MAX_BYTES);

const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

/// Ce que la réponse d'une cellule gagne pour ses figures.
#[derive(Debug, Default)]
pub struct Attachments {
    /// Images à joindre, sous la forme attendue par le pont :
    /// `{"mimeType": "image/png", "data": "<base64>"}`.
    pub images: Vec<Value>,
    /// Phrase pour l'agent : quelles figures il voit, lesquelles il ne
    /// reçoit qu'en chemin et pourquoi.
    pub seen: String,
}

/// Largeur et hauteur d'un PNG, lues dans son en-tête (signature puis bloc
/// IHDR). `None` si ce n'en est pas un.
fn png_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[..8] != PNG_SIGNATURE || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let side = |at: usize| u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
    let (width, height) = (side(16), side(20));
    (width > 0 && height > 0).then_some((width, height))
}

/// Lit une figure si elle tient dans les bornes : ses octets et ses
/// dimensions, sinon la raison de ne donner que son chemin.
fn load(dir: &Path, path: &str) -> Result<(Vec<u8>, u32, u32), String> {
    // Seuls les PNG du dossier des figures du fil sont lus : le chemin vient
    // du journal, pas d'une promesse.
    let (Ok(real), Ok(root)) = (std::fs::canonicalize(path), std::fs::canonicalize(dir)) else {
        return Err("fichier absent".into());
    };
    if !real.starts_with(&root) {
        return Err("hors du dossier des figures du fil".into());
    }
    let too_heavy =
        |len: u64| format!("plus de {} : {}", human_bytes(BYTES_MAX), human_bytes(len));
    let len = std::fs::metadata(&real).map_err(|_| "fichier absent".to_string())?.len();
    if len > BYTES_MAX {
        return Err(too_heavy(len));
    }
    let bytes = std::fs::read(&real).map_err(|_| "fichier illisible".to_string())?;
    if bytes.len() as u64 > BYTES_MAX {
        return Err(too_heavy(bytes.len() as u64));
    }
    let (width, height) = png_size(&bytes).ok_or("pas un PNG lisible")?;
    if width.max(height) > SIDE_MAX {
        return Err(format!("plus de {SIDE_MAX} px de côté : {width}×{height} px"));
    }
    Ok((bytes, width, height))
}

/// Prépare les figures d'une cellule pour l'agent : les `ATTACHED_MAX`
/// premières qui tiennent dans les bornes sont jointes en image, les autres
/// restent des chemins. `dir` est le dossier des figures du fil, `figures`
/// les chemins notés au journal. `None` si la cellule n'a pas de figure.
pub fn attach(dir: &Path, figures: &[String]) -> Option<Attachments> {
    if figures.is_empty() {
        return None;
    }
    let mut out = Attachments::default();
    let (mut attached, mut path_only) = (Vec::new(), Vec::new());
    for (index, path) in figures.iter().enumerate() {
        let number = index + 1;
        if out.images.len() >= ATTACHED_MAX {
            // Tout le reste d'un coup : « figures 4 à 6 ».
            let rest = if number == figures.len() {
                format!("figure {number}")
            } else {
                format!("figures {number} à {}", figures.len())
            };
            path_only.push(format!("{rest} (au-delà de {ATTACHED_MAX} images par cellule)"));
            break;
        }
        match load(dir, path) {
            Ok((bytes, width, height)) => {
                out.images.push(json!({
                    "mimeType": "image/png",
                    "data": base64::engine::general_purpose::STANDARD.encode(bytes),
                }));
                attached.push(format!("figure {number} ({width}×{height} px)"));
            }
            Err(why) => path_only.push(format!("figure {number} ({why})")),
        }
    }
    let mut seen = if attached.is_empty() {
        "Aucune image jointe à ce résultat.".to_string()
    } else {
        format!(
            "Images jointes à ce résultat, dans l'ordre : {}.",
            attached.join(", ")
        )
    };
    if !path_only.is_empty() {
        seen.push_str(&format!(
            " Chemin seul, sans image : {}. Pour voir une de ces figures, lis son fichier PNG.",
            path_only.join(", ")
        ));
    }
    if !attached.is_empty() {
        seen.push_str(" Regarde chaque image avant de la décrire ou de la montrer (axes, unités, légende, panneaux vides, textes qui se chevauchent) ; corrige le code et relance si quelque chose cloche.");
    }
    out.seen = seen;
    Some(out)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// En-tête d'un PNG de `width`×`height`, complété à `len` octets : assez
    /// pour les bornes, qui ne décodent pas l'image.
    pub(crate) fn png(width: u32, height: u32, len: usize) -> Vec<u8> {
        let mut bytes = PNG_SIGNATURE.to_vec();
        bytes.extend(13u32.to_be_bytes());
        bytes.extend(b"IHDR");
        bytes.extend(width.to_be_bytes());
        bytes.extend(height.to_be_bytes());
        bytes.extend([8, 2, 0, 0, 0]);
        bytes.resize(bytes.len().max(len), 0);
        bytes
    }

    fn write(dir: &Path, name: &str, bytes: &[u8]) -> String {
        let path = dir.join(name);
        std::fs::write(&path, bytes).unwrap();
        path.display().to_string()
    }

    #[test]
    fn l_en_tete_png_donne_les_dimensions() {
        assert_eq!(png_size(&png(921, 691, 64)), Some((921, 691)));
        assert_eq!(png_size(b"png 2"), None);
        assert_eq!(png_size(&png(0, 10, 64)), None);
        let mut jpeg = png(10, 10, 64);
        jpeg[..4].copy_from_slice(&[0xff, 0xd8, 0xff, 0xe0]);
        assert_eq!(png_size(&jpeg), None);
    }

    #[test]
    fn une_cellule_sans_figure_ne_joint_rien() {
        let dir = tempfile::tempdir().unwrap();
        assert!(attach(dir.path(), &[]).is_none());
    }

    #[test]
    fn les_trois_premieres_figures_sont_jointes_les_autres_en_chemin() {
        let dir = tempfile::tempdir().unwrap();
        let figures: Vec<String> = (1..=5)
            .map(|n| write(dir.path(), &format!("cellule-7-{n}.png"), &png(900 + n, 600, 200)))
            .collect();
        let found = attach(dir.path(), &figures).unwrap();
        assert_eq!(found.images.len(), ATTACHED_MAX);
        for (n, image) in found.images.iter().enumerate() {
            assert_eq!(image["mimeType"], "image/png");
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(image["data"].as_str().unwrap())
                .unwrap();
            assert_eq!(bytes, png(901 + n as u32, 600, 200), "dans l'ordre des figures");
        }
        assert!(
            found.seen.starts_with("Images jointes à ce résultat, dans l'ordre : figure 1 (901×600 px), figure 2 (902×600 px), figure 3 (903×600 px). Chemin seul, sans image : figures 4 à 5 (au-delà de 3 images par cellule)."),
            "{}",
            found.seen
        );
        assert!(found.seen.contains("Regarde chaque image"), "{}", found.seen);
    }

    #[test]
    fn une_figure_hors_bornes_reste_un_chemin_et_la_reponse_dit_pourquoi() {
        let dir = tempfile::tempdir().unwrap();
        let ailleurs = tempfile::tempdir().unwrap();
        let figures = vec![
            write(dir.path(), "lourde.png", &png(800, 600, BYTES_MAX as usize * 3 / 2)),
            write(dir.path(), "immense.png", &png(SIDE_MAX + 1, 600, 200)),
            write(dir.path(), "faux.png", b"png 2"),
            dir.path().join("absente.png").display().to_string(),
            write(ailleurs.path(), "secret.png", &png(10, 10, 200)),
            write(dir.path(), "bonne.png", &png(640, 480, BYTES_MAX as usize)),
        ];
        let found = attach(dir.path(), &figures).unwrap();
        // Une figure écartée ne prend pas la place d'une suivante.
        assert_eq!(found.images.len(), 1);
        for attendu in [
            "Images jointes à ce résultat, dans l'ordre : figure 6 (640×480 px).",
            "figure 1 (plus de 1 Mo : 1,5 Mo)",
            "figure 2 (plus de 4096 px de côté : 4097×600 px)",
            "figure 3 (pas un PNG lisible)",
            "figure 4 (fichier absent)",
            "figure 5 (hors du dossier des figures du fil)",
            "lis son fichier PNG",
        ] {
            assert!(found.seen.contains(attendu), "« {attendu} » manque : {}", found.seen);
        }

        // La borne de taille est stricte : un octet de trop suffit.
        let juste = write(dir.path(), "juste.png", &png(800, 600, BYTES_MAX as usize + 1));
        assert!(load(dir.path(), &juste).is_err());
        assert!(load(dir.path(), &figures[5]).is_ok());

        // Rien de joignable : la réponse le dit et ne demande pas de regarder.
        let found = attach(dir.path(), &figures[..3]).unwrap();
        assert!(found.images.is_empty());
        assert!(found.seen.starts_with("Aucune image jointe à ce résultat."), "{}", found.seen);
        assert!(!found.seen.contains("Regarde chaque image"), "{}", found.seen);
    }

    #[test]
    fn le_plus_gros_lot_tient_dans_la_borne_du_pont() {
        let dir = tempfile::tempdir().unwrap();
        let figures: Vec<String> = (0..ATTACHED_MAX)
            .map(|n| write(dir.path(), &format!("{n}.png"), &png(800, 600, BYTES_MAX as usize)))
            .collect();
        let found = attach(dir.path(), &figures).unwrap();
        let total: usize = found
            .images
            .iter()
            .map(|i| i["data"].as_str().unwrap().len())
            .sum();
        assert_eq!(found.images.len(), ATTACHED_MAX);
        assert!(total <= lim::BRIDGE_IMAGES_MAX_BYTES, "{total}");
    }
}
