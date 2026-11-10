//! `atelier-pdf thumb <taille> <dossier> <fichier.pdf>` : vignette de la
//! première page dans `<dossier>/<nom du pdf>.png`, le contrat de
//! `qlmanage -t -s <taille> -o <dossier> <pdf>` qu'elle remplace. Rendue par
//! PDFium dans ce processus sans interface : macOS n'affiche plus d'icône
//! « qlmanage » dans le Dock à chaque vignette (chaque compilation LaTeX en
//! demandait une).

use std::io::Write;
use std::path::{Path, PathBuf};

/// Fichier écrit pour `pdf` dans `dir`, nommé comme par `qlmanage`.
pub fn output_path(dir: &Path, pdf: &Path) -> Option<PathBuf> {
    let name = pdf.file_name()?.to_string_lossy();
    Some(dir.join(format!("{name}.png")))
}

/// PNG RVB 8 bits, sans entrelacement.
pub fn encode_png(width: u32, height: u32, rgb: &[u8]) -> Result<Vec<u8>, String> {
    let row = width as usize * 3;
    if width == 0 || height == 0 || rgb.len() != row * height as usize {
        return Err("image vide ou tronquée".into());
    }
    let mut raw = Vec::with_capacity((row + 1) * height as usize);
    for line in rgb.chunks_exact(row) {
        raw.push(0); // filtre « aucun »
        raw.extend_from_slice(line);
    }
    let mut zlib = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    zlib.write_all(&raw).map_err(|e| e.to_string())?;
    let data = zlib.finish().map_err(|e| e.to_string())?;

    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 2, 0, 0, 0]); // 8 bits, RVB, deflate, filtres de base, pas d'entrelacement
    let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
    for (kind, body) in [(b"IHDR", header.as_slice()), (b"IDAT", data.as_slice()), (b"IEND", &[][..])] {
        png.extend_from_slice(&(body.len() as u32).to_be_bytes());
        let mut crc = crc32fast::Hasher::new();
        crc.update(kind);
        crc.update(body);
        png.extend_from_slice(kind);
        png.extend_from_slice(body);
        png.extend_from_slice(&crc.finalize().to_be_bytes());
    }
    Ok(png)
}

/// PNG compact pour l'aperçu d'une page : niveaux de gris quand la page n'a
/// pas de couleur (le cas d'une page de texte), et filtre choisi ligne par
/// ligne (heuristique de libpng : plus petite somme des écarts). Deux à
/// trois fois plus petit que [`encode_png`].
pub fn encode_png_compact(width: u32, height: u32, rgb: &[u8]) -> Result<Vec<u8>, String> {
    let row = width as usize * 3;
    if width == 0 || height == 0 || rgb.len() != row * height as usize {
        return Err("image vide ou tronquée".into());
    }
    let gray = rgb.chunks_exact(3).all(|p| p[0] == p[1] && p[1] == p[2]);
    let (bpp, pixels): (usize, std::borrow::Cow<[u8]>) = if gray {
        (1, rgb.chunks_exact(3).map(|p| p[0]).collect::<Vec<u8>>().into())
    } else {
        (3, rgb.into())
    };
    let stride = width as usize * bpp;
    let mut raw = Vec::with_capacity((stride + 1) * height as usize);
    let zero = vec![0u8; stride];
    let mut candidate = vec![0u8; stride];
    let mut best = vec![0u8; stride];
    for y in 0..height as usize {
        let line = &pixels[y * stride..(y + 1) * stride];
        let prev = if y == 0 { &zero[..] } else { &pixels[(y - 1) * stride..y * stride] };
        let mut best_kind = 0u8;
        let mut best_cost = u64::MAX;
        for kind in 0u8..5 {
            for x in 0..stride {
                let a = if x >= bpp { line[x - bpp] } else { 0 };
                let b = prev[x];
                let c = if x >= bpp { prev[x - bpp] } else { 0 };
                let predicted = match kind {
                    0 => 0,
                    1 => a,
                    2 => b,
                    3 => ((u16::from(a) + u16::from(b)) / 2) as u8,
                    _ => {
                        let p = i16::from(a) + i16::from(b) - i16::from(c);
                        let (pa, pb, pc) = ((p - i16::from(a)).abs(), (p - i16::from(b)).abs(), (p - i16::from(c)).abs());
                        if pa <= pb && pa <= pc { a } else if pb <= pc { b } else { c }
                    }
                };
                candidate[x] = line[x].wrapping_sub(predicted);
            }
            let cost: u64 = candidate.iter().map(|&v| u64::from((v as i8).unsigned_abs())).sum();
            if cost < best_cost {
                best_cost = cost;
                best_kind = kind;
                best.copy_from_slice(&candidate);
            }
        }
        raw.push(best_kind);
        raw.extend_from_slice(&best);
    }
    let mut zlib = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(7));
    zlib.write_all(&raw).map_err(|e| e.to_string())?;
    let data = zlib.finish().map_err(|e| e.to_string())?;
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, if gray { 0 } else { 2 }, 0, 0, 0]);
    Ok(chunks(&header, &data))
}

fn chunks(header: &[u8], data: &[u8]) -> Vec<u8> {
    let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
    for (kind, body) in [(b"IHDR", header), (b"IDAT", data), (b"IEND", &[][..])] {
        png.extend_from_slice(&(body.len() as u32).to_be_bytes());
        let mut crc = crc32fast::Hasher::new();
        crc.update(kind);
        crc.update(body);
        png.extend_from_slice(kind);
        png.extend_from_slice(body);
        png.extend_from_slice(&crc.finalize().to_be_bytes());
    }
    png
}

/// Rend la vignette et l'écrit à côté (fichier temporaire puis renommage :
/// l'appelant ne voit jamais de PNG à moitié écrit).
pub fn write(pdf: &Path, dir: &Path, size: u16) -> Result<PathBuf, String> {
    let target = output_path(dir, pdf).ok_or("nom de PDF invalide")?;
    let (width, height, rgb) = crate::engine::render_first_page(pdf, size)?;
    let png = encode_png(width, height, &rgb)?;
    let partial = target.with_extension("png.part");
    std::fs::write(&partial, png).map_err(|e| format!("{} : {e}", partial.display()))?;
    std::fs::rename(&partial, &target).map_err(|e| format!("{} : {e}", target.display()))?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_is_well_formed() {
        let png = encode_png(2, 1, &[255, 0, 0, 0, 0, 255]).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        assert_eq!(&png[12..16], b"IHDR");
        assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 2);
        assert_eq!(u32::from_be_bytes(png[20..24].try_into().unwrap()), 1);
        assert_eq!(&png[png.len() - 8..png.len() - 4], b"IEND");
        // CRC de IHDR : type + corps
        let mut crc = crc32fast::Hasher::new();
        crc.update(&png[12..29]);
        assert_eq!(crc.finalize().to_be_bytes(), png[29..33]);
    }

    #[test]
    fn compact_png_is_gray_when_the_page_has_no_colour() {
        let gray = encode_png_compact(3, 2, &[9, 9, 9, 200, 200, 200, 0, 0, 0, 9, 9, 9, 1, 1, 1, 255, 255, 255]).unwrap();
        assert_eq!(&gray[..8], b"\x89PNG\r\n\x1a\n");
        assert_eq!(gray[25], 0, "type de couleur : gris");
        let colour = encode_png_compact(1, 1, &[255, 0, 0]).unwrap();
        assert_eq!(colour[25], 2, "type de couleur : RVB");
        assert!(encode_png_compact(2, 2, &[0; 6]).is_err());
    }

    #[test]
    fn truncated_pixels_are_refused() {
        assert!(encode_png(2, 2, &[0; 6]).is_err());
        assert!(encode_png(0, 1, &[]).is_err());
    }

    #[test]
    fn output_is_named_like_qlmanage() {
        assert_eq!(
            output_path(Path::new("/tmp/x"), Path::new("/a/main.pdf")).unwrap(),
            Path::new("/tmp/x/main.pdf.png")
        );
    }
}
