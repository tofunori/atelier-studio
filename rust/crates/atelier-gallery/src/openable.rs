//! Politique d'extensions ouvrables partagée entre `/open-path` (gallery.rs)
//! et le viewer plein écran natif (host.rs) — plan 063, findings SEC-05/06.
//!
//! `/open-path` lançait n'importe quel fichier du projet via `open` sans
//! contrôle de type : un `.command` ou `.app` malveillant déposé dans un
//! dépôt cloné s'exécutait au premier clic. `IMAGE_EXTS` (repris tel quel de
//! l'ancien `NATIVE_FULLSCREEN_EXTS` de host.rs) reste la base des images ;
//! `OPENABLE_EXTS` l'étend aux types légitimes de la galerie scientifique.

/// Images ouvertes par le viewer plein écran natif (host.rs) — inchangé
/// depuis l'ancien `NATIVE_FULLSCREEN_EXTS`.
pub(crate) const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "bmp", "svg",
];

/// Vidéos lues par le lecteur intégré (miroir de `VIDEO_EXTS` de main.rs).
const VIDEO_EXTS: &[&str] = &["mp4", "m4v", "mov", "webm"];

/// Documents et sources de la galerie scientifique ouvrables via `/open-path`.
const DOCUMENT_EXTS: &[&str] = &["pdf", "tex", "md", "py", "r", "ipynb", "csv", "txt", "json"];

/// Bundles/exécutables macOS explicitement refusés par `/open-path`, même si
/// une extension homonyme n'apparaît jamais dans `OPENABLE_EXTS` (l'allowlist
/// suffirait seule ; cette liste sert surtout au message d'erreur et aux
/// tests — ceinture-bretelles documentée par le plan).
pub(crate) const BLOCKED_OPEN_EXTS: &[&str] =
    &["app", "command", "sh", "terminal", "workflow", "webloc"];

/// Types légitimes ouvrables par `/open-path` : images + vidéos + documents.
pub(crate) fn openable_exts() -> impl Iterator<Item = &'static &'static str> {
    IMAGE_EXTS.iter().chain(VIDEO_EXTS).chain(DOCUMENT_EXTS)
}

/// Vrai si l'extension (sans le point, casse quelconque) est ouvrable par
/// `/open-path` : dans l'allowlist ET absente de la liste de blocage.
pub(crate) fn is_openable_ext(ext: &str) -> bool {
    let lower = ext.to_ascii_lowercase();
    !BLOCKED_OPEN_EXTS.contains(&lower.as_str())
        && openable_exts().any(|allowed| *allowed == lower)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_gallery_types() {
        for ext in ["png", "PDF", "Tex", "md", "py", "r", "ipynb", "csv", "txt", "json", "mp4", "svg"] {
            assert!(is_openable_ext(ext), "{ext} devrait être ouvrable");
        }
    }

    #[test]
    fn refuses_bundles_and_executables() {
        for ext in ["app", "command", "sh", "terminal", "workflow", "webloc", "APP", "Command"] {
            assert!(!is_openable_ext(ext), "{ext} ne devrait PAS être ouvrable");
        }
    }

    #[test]
    fn refuses_unknown_extension() {
        assert!(!is_openable_ext("exe"));
        assert!(!is_openable_ext(""));
    }
}
