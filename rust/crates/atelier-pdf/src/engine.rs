//! PDFium → caractères positionnés, en points, origine en haut à gauche de
//! la page telle qu'elle s'affiche (boîte de rognage, rotation appliquée) :
//! le repère de pdf.js dans le lecteur et celui de `pdftotext -cropbox`.

use pdfium_render::prelude::*;
use std::path::{Path, PathBuf};

/// Un caractère visible (les blancs ne servent qu'à couper les mots).
#[derive(Debug, Clone)]
pub struct Glyph {
    pub c: char,
    /// [x0, y0, x1, y1], y vers le bas. Cadre « large » de PDFium : hauteur
    /// tirée de l'ascendante et de la descendante de la police, comme les
    /// cadres de mots de poppler.
    pub bbox: [f32; 4],
    /// Ligne de base (y vers le bas).
    pub base: f32,
    pub size: f32,
    /// Indice dans [`Doc::fonts`].
    pub font: usize,
    /// Un blanc (espace ou fin de ligne, écrit par le PDF ou ajouté par
    /// PDFium) le précède.
    pub space_before: bool,
}

#[derive(Debug, Clone, Default)]
pub struct PageGlyphs {
    pub width: f32,
    pub height: f32,
    pub glyphs: Vec<Glyph>,
    /// Images bitmap posées sur la page, [x0, y0, x1, y1].
    pub images: Vec<[f32; 4]>,
}

#[derive(Debug, Default)]
pub struct Doc {
    pub pages: Vec<PageGlyphs>,
    /// Nom de base des polices (préfixe de sous-ensemble compris).
    pub fonts: Vec<String>,
}

/// Où chercher `libpdfium`, dans l'ordre : variable `ATELIER_PDFIUM_LIB`
/// (fichier ou dossier), à côté de l'exécutable (le .app l'y pose), dans
/// `../lib` et `../Frameworks`, dans `rust/vendor/pdfium/lib` du dépôt
/// (développement, `scripts/fetch-pdfium.sh`), puis dans Atelier installé.
pub fn library_candidates() -> Vec<PathBuf> {
    let name = Pdfium::pdfium_platform_library_name();
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut out: Vec<PathBuf> = Vec::new();
    if let Some(value) = std::env::var_os("ATELIER_PDFIUM_LIB").filter(|v| !v.is_empty()) {
        let path = PathBuf::from(value);
        if path.is_dir() {
            dirs.push(path);
        } else {
            out.push(path);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let exe = exe.canonicalize().unwrap_or(exe);
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
            dirs.push(dir.join("../lib"));
            dirs.push(dir.join("../Frameworks"));
            // exécutable de test cargo : target/<profil>/deps/
            if let Some(parent) = dir.parent() {
                dirs.push(parent.to_path_buf());
            }
        }
    }
    dirs.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../vendor/pdfium/lib"));
    for app in crate::tool::installed_app_dirs() {
        dirs.push(app);
    }
    out.extend(dirs.into_iter().map(|d| d.join(&name)));
    out
}

fn bind() -> Result<Pdfium, String> {
    let mut tried = Vec::new();
    for candidate in library_candidates() {
        if !candidate.is_file() {
            continue;
        }
        match Pdfium::bind_to_library(&candidate) {
            Ok(bindings) => return Ok(Pdfium::new(bindings)),
            Err(error) => tried.push(format!("{} ({error})", candidate.display())),
        }
    }
    match Pdfium::bind_to_system_library() {
        Ok(bindings) => Ok(Pdfium::new(bindings)),
        Err(_) if tried.is_empty() => Err(
            "PDFium introuvable : la bibliothèque libpdfium manque à côté d'atelier-pdf (réinstaller Atelier, ou scripts/fetch-pdfium.sh en développement)".into(),
        ),
        Err(_) => Err(format!("PDFium illisible : {}", tried.join(" ; "))),
    }
}

/// Passage du repère de la page (points PDF, y vers le haut, origine de la
/// MediaBox) au repère affiché.
#[derive(Clone, Copy)]
struct View {
    left: f32,
    bottom: f32,
    right: f32,
    top: f32,
    rotation: u16,
}

impl View {
    fn point(&self, x: f32, y: f32) -> (f32, f32) {
        match self.rotation {
            90 => (y - self.bottom, x - self.left),
            180 => (self.right - x, y - self.bottom),
            270 => (self.top - y, self.right - x),
            _ => (x - self.left, self.top - y),
        }
    }

    fn rect(&self, r: &PdfRect) -> [f32; 4] {
        let (ax, ay) = self.point(r.left().value, r.top().value);
        let (bx, by) = self.point(r.right().value, r.bottom().value);
        [ax.min(bx), ay.min(by), ax.max(bx), ay.max(by)]
    }
}

fn is_blank(c: char) -> bool {
    c.is_whitespace() || c == '\u{0}' || c == '\u{feff}'
}

/// Caractère affichable : PDFium rend les césures de fin de ligne en U+0002 ;
/// les autres caractères de contrôle ne portent rien.
fn printable(c: char) -> Option<char> {
    match c {
        '\u{2}' => Some('-'),
        c if c.is_control() => None,
        c => Some(c),
    }
}

pub fn read(path: &Path) -> Result<Doc, String> {
    let pdfium = bind()?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|e| match e {
            PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError) => {
                "PDF protégé par mot de passe".to_string()
            }
            e => format!("PDF illisible : {e}"),
        })?;
    let mut doc = Doc::default();
    let mut font_ids: std::collections::HashMap<String, usize> = Default::default();
    for page in document.pages().iter() {
        let crop = page
            .boundaries()
            .crop()
            .or_else(|_| page.boundaries().media())
            .map(|b| b.bounds)
            .unwrap_or_else(|_| page.page_size());
        let rotation = match page.rotation() {
            Ok(PdfPageRenderRotation::Degrees90) => 90,
            Ok(PdfPageRenderRotation::Degrees180) => 180,
            Ok(PdfPageRenderRotation::Degrees270) => 270,
            _ => 0,
        };
        let view = View {
            left: crop.left().value,
            bottom: crop.bottom().value,
            right: crop.right().value,
            top: crop.top().value,
            rotation,
        };
        let mut out = PageGlyphs {
            width: page.width().value,
            height: page.height().value,
            ..Default::default()
        };
        if let Ok(text) = page.text() {
            let mut pending_space = false;
            for ch in text.chars().iter() {
                let Some(raw) = ch.unicode_char() else {
                    continue;
                };
                if is_blank(raw) {
                    pending_space = true;
                    continue;
                }
                let Some(c) = printable(raw) else {
                    continue;
                };
                let Ok(bounds) = ch.loose_bounds() else {
                    continue;
                };
                let bbox = view.rect(&bounds);
                if !(bbox[2] > bbox[0] || bbox[3] > bbox[1]) {
                    continue;
                }
                let base = ch
                    .origin()
                    .map(|(x, y)| view.point(x.value, y.value).1)
                    .unwrap_or(bbox[3]);
                let name = ch.font_name();
                let next = font_ids.len();
                let font = *font_ids.entry(name.clone()).or_insert_with(|| {
                    doc.fonts.push(name);
                    next
                });
                out.glyphs.push(Glyph {
                    c,
                    bbox,
                    base,
                    size: ch.scaled_font_size().value.abs(),
                    font,
                    space_before: std::mem::take(&mut pending_space),
                });
            }
        }
        for object in page.objects().iter() {
            if object.object_type() == PdfPageObjectType::Image {
                if let Ok(bounds) = object.bounds() {
                    out.images.push(view.rect(&bounds.to_rect()));
                }
            }
        }
        doc.pages.push(out);
    }
    Ok(doc)
}
