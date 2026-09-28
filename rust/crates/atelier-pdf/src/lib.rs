//! Lecture de PDF sans poppler.
//!
//! Deux moitiés :
//! - [`tool`] : ce que les autres crates appellent. Elles lancent l'outil
//!   `atelier-pdf` (processus séparé : un PDF qui fait planter ou boucler le
//!   moteur ne tue pas le serveur, et l'échéance reste un simple `kill`), avec
//!   un repli sur `pdftotext`/`pdftohtml` quand l'outil manque.
//! - le moteur ([`engine`], [`layout`], [`emit`]) : PDFium (le moteur PDF de
//!   Chromium, licence BSD/Apache) lit les caractères et leurs cadres ; on les
//!   regroupe en mots, lignes, blocs et flux, puis on écrit exactement les
//!   formats de poppler que les analyseurs d'Atelier lisent déjà
//!   (`pdftotext`, `pdftotext -bbox-layout`, `pdftohtml -xml`).

pub mod emit;
pub mod engine;
pub mod layout;
pub mod tool;
