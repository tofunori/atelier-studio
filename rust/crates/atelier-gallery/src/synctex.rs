//! Lecture SyncTeX en Rust : remplace le CLI `synctex` (livré avec MacTeX)
//! pour la synchronisation éditeur ↔ PDF de `POST /synctex`.
//!
//! Portage des deux requêtes de `synctex_parser.c` (TeX Live 2023, parser
//! 1.21, celui du CLI 1.5) : même arbre (bornes de hbox, nœuds `x` de tête
//! recalés sur le nœud suivant, 1024 listes « friends »), même recherche
//! avant (ligne → page, x, y) et arrière (page, x, y → ligne), mêmes unités :
//! points PDF, origine en haut à gauche de la page, comme les `x:`/`y:` que
//! le CLI imprime. Seul le PREMIER résultat du CLI est rendu : c'est celui
//! qu'il classe le meilleur.
//!
//! Écarts voulus avec le CLI :
//! - le fichier source demandé est retrouvé par chemin résolu (`./`, `..`,
//!   liens symboliques, noms relatifs au dossier du PDF), puis, pour un
//!   projet déplacé depuis la compilation, par son chemin relatif au dossier
//!   de compilation (voir [`Synctex::tags_for`]) ;
//! - les formulaires pdfTeX (`<`…`>` et références `f`) sont ignorés : le CLI
//!   les remplace par des proxys que ce lecteur ne reconstruit pas, et ni
//!   pdfLaTeX ordinaire ni tectonic n'en écrivent ;
//! - un fichier tronqué rend ce qui a été lu au lieu de rien.

use flate2::read::MultiGzDecoder;
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::SystemTime,
};

/// Nombre de listes « friends » (`scanner->number_of_lists`).
const NUMBER_OF_LISTS: usize = 1024;
/// `INT_MAX` du parseur C : distance « infinie », et borne des entiers lus.
const INT_MAX: i64 = i32::MAX as i64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Sheet,
    Vbox,
    Hbox,
    VoidVbox,
    VoidHbox,
    Kern,
    Glue,
    Rule,
    Math,
    Boundary,
    BoxBdry,
    Ref,
}

impl Kind {
    /// `_synctex_node_is_box`.
    fn is_box(self) -> bool {
        matches!(
            self,
            Kind::Vbox | Kind::Hbox | Kind::VoidVbox | Kind::VoidHbox
        )
    }
}

/// Boîte « visible » d'une hbox (champs `*_V` du C), agrandie par son contenu.
#[derive(Clone, Copy, Debug, Default)]
struct Visible {
    h: i64,
    v: i64,
    width: i64,
    height: i64,
    depth: i64,
}

#[derive(Clone, Debug)]
struct Node {
    kind: Kind,
    tag: i32,
    line: i32,
    column: i32,
    h: i64,
    v: i64,
    width: i64,
    height: i64,
    depth: i64,
    visible: Visible,
    parent: Option<usize>,
    children: Vec<usize>,
    page: i32,
}

#[derive(Clone, Debug)]
struct Input {
    tag: i32,
    name: String,
    /// Plus grande ligne enregistrée pour ce tag (`_synctex_input_register_line`).
    max_line: i32,
}

#[derive(Clone, Debug)]
struct Sheet {
    page: i32,
    node: usize,
    /// Hbox fermées sur cette page, dans l'ordre de fermeture ; le C les
    /// chaîne en tête (`next_hbox`), donc les parcourt à rebours.
    hboxes: Vec<usize>,
}

/// Résultat d'une recherche avant, en points PDF depuis le coin haut-gauche.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ViewHit {
    pub page: i32,
    pub x: f64,
    pub y: f64,
}

/// Résultat d'une recherche arrière : le nom tel qu'écrit dans le fichier.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditHit {
    pub input: String,
    pub line: i32,
}

/// Un fichier SyncTeX analysé, prêt pour les deux requêtes.
#[derive(Debug)]
pub struct Synctex {
    /// Dans l'ordre de déclaration ; le C les chaîne en tête, donc toute
    /// recherche « comme le CLI » les parcourt à rebours.
    inputs: Vec<Input>,
    nodes: Vec<Node>,
    sheets: Vec<Sheet>,
    /// Seaux dans l'ordre d'insertion ; le C insère en tête, donc les parcourt
    /// à rebours.
    friends: Vec<Vec<usize>>,
    unit: f32,
    x_offset: f32,
    y_offset: f32,
    /// Dossier du fichier SyncTeX : base des noms d'entrée relatifs.
    dir: PathBuf,
}

// ---------------------------------------------------------------------------
// Lecture du fichier
// ---------------------------------------------------------------------------

/// `<pdf sans extension>.synctex.gz` ou `.synctex` ; le plus récent si les
/// deux existent (le CLI prendrait `.synctex`, même périmé).
pub fn synctex_path_for(pdf: &Path) -> Option<PathBuf> {
    let gz = pdf.with_extension("synctex.gz");
    let plain = pdf.with_extension("synctex");
    let mtime = |p: &Path| {
        fs::metadata(p)
            .ok()
            .filter(|m| m.is_file())
            .and_then(|m| m.modified().ok())
    };
    match (mtime(&gz), mtime(&plain)) {
        (Some(a), Some(b)) => Some(if b > a { plain } else { gz }),
        (Some(_), None) => Some(gz),
        (None, Some(_)) => Some(plain),
        (None, None) => None,
    }
}

/// Analyse du SyncTeX d'un PDF, mise en cache tant que le fichier ne change
/// pas : la recherche avant suit le curseur, un reparse par requête serait
/// du travail jeté.
pub fn load_for_pdf(pdf: &Path) -> Result<Arc<Synctex>, String> {
    type Entry = (PathBuf, Option<SystemTime>, u64, Arc<Synctex>);
    static CACHE: OnceLock<Mutex<Option<Entry>>> = OnceLock::new();
    let path = synctex_path_for(pdf).ok_or("pas de fichier SyncTeX à côté du PDF")?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let (mtime, len) = (meta.modified().ok(), meta.len());
    let cache = CACHE.get_or_init(Default::default);
    if let Some((p, m, l, parsed)) = cache.lock().unwrap_or_else(|e| e.into_inner()).as_ref()
        && *p == path
        && *m == mtime
        && *l == len
    {
        return Ok(parsed.clone());
    }
    let raw = fs::read(&path).map_err(|e| e.to_string())?;
    let bytes = if raw.starts_with(&[0x1f, 0x8b]) {
        let mut out = Vec::new();
        MultiGzDecoder::new(raw.as_slice())
            .read_to_end(&mut out)
            .map_err(|e| format!("SyncTeX illisible : {e}"))?;
        out
    } else {
        raw
    };
    let dir = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let parsed = Arc::new(Synctex::parse(&bytes, &dir));
    *cache.lock().unwrap_or_else(|e| e.into_inner()) = Some((path, mtime, len, parsed.clone()));
    Ok(parsed)
}

/// Curseur façon `_synctex_decode_int` sur une ligne d'enregistrement.
struct Cursor<'a> {
    s: &'a [u8],
    i: usize,
}

impl<'a> Cursor<'a> {
    fn new(s: &'a [u8]) -> Self {
        Self { s, i: 0 }
    }

    fn peek(&self) -> Option<u8> {
        self.s.get(self.i).copied()
    }

    /// `strtol` en base 10 depuis `at` : blancs, signe, chiffres.
    fn strtol(&self, at: usize) -> Option<(i64, usize)> {
        let mut j = at;
        while self.s.get(j).is_some_and(|c| c.is_ascii_whitespace()) {
            j += 1;
        }
        let negative = match self.s.get(j) {
            Some(b'-') => {
                j += 1;
                true
            }
            Some(b'+') => {
                j += 1;
                false
            }
            _ => false,
        };
        let start = j;
        let mut value: i64 = 0;
        while let Some(c) = self.s.get(j).filter(|c| c.is_ascii_digit()) {
            value = value.saturating_mul(10).saturating_add(i64::from(c - b'0'));
            j += 1;
        }
        // Le C range la valeur dans un `int` : bornée ici à la même plage,
        // un fichier corrompu ne peut pas faire déborder la géométrie en i64.
        let value = if negative { -value } else { value };
        (j > start).then_some((value.clamp(-INT_MAX, INT_MAX), j))
    }

    /// Entier précédé d'un séparateur `:` ou `,` facultatif.
    fn int(&mut self) -> Option<i64> {
        let at = self.i + usize::from(matches!(self.peek(), Some(b':' | b',')));
        let (value, end) = self.strtol(at)?;
        self.i = end;
        Some(value)
    }

    /// Colonne facultative : seulement si `,` suit (`_synctex_decode_int_opt`).
    fn column(&mut self) -> Option<i64> {
        if self.peek() != Some(b',') {
            return Some(-1);
        }
        let (value, end) = self.strtol(self.i + 1)?;
        self.i = end;
        Some(value)
    }

    /// Coordonnée v : entier, ou `,=` pour « la même que la précédente ».
    fn int_v(&mut self, lastv: &mut i64) -> Option<i64> {
        if let Some(value) = self.int() {
            *lastv = value;
            return Some(value);
        }
        if self.s[self.i..].starts_with(b",=") {
            self.i += 2;
            return Some(*lastv);
        }
        None
    }
}

/// `strtod` au sens large, pour le post-scriptum.
fn strtod_prefix(s: &[u8]) -> Option<(f64, usize)> {
    let text = std::str::from_utf8(s).ok()?;
    let trimmed = text.trim_start();
    let skipped = text.len() - trimmed.len();
    let mut end = 0;
    let bytes = trimmed.as_bytes();
    let mut seen_digit = false;
    let mut seen_dot = false;
    let mut seen_exp = false;
    while end < bytes.len() {
        let c = bytes[end];
        let ok = match c {
            b'0'..=b'9' => {
                seen_digit = true;
                true
            }
            b'+' | b'-' => end == 0 || matches!(bytes[end - 1], b'e' | b'E'),
            b'.' if !seen_dot && !seen_exp => {
                seen_dot = true;
                true
            }
            b'e' | b'E' if seen_digit && !seen_exp => {
                seen_exp = true;
                true
            }
            _ => false,
        };
        if !ok {
            break;
        }
        end += 1;
    }
    // Un exposant incomplet (« 1e ») n'appartient pas au nombre.
    while end > 0 && matches!(bytes[end - 1], b'e' | b'E' | b'+' | b'-') {
        end -= 1;
    }
    let value: f64 = trimmed[..end].parse().ok()?;
    Some((value, skipped + end))
}

/// `_synctex_scan_float_and_dimension` : une longueur TeX convertie en sp.
fn float_and_dimension(s: &[u8]) -> Option<f32> {
    let (value, end) = strtod_prefix(s)?;
    let value = value as f32;
    let unit = &s[end..];
    let scaled = if unit.starts_with(b"in") {
        value * (72.27f32 * 65536.0)
    } else if unit.starts_with(b"cm") {
        value * (72.27f32 * 65536.0 / 2.54f32)
    } else if unit.starts_with(b"mm") {
        value * (72.27f32 * 65536.0 / 25.4f32)
    } else if unit.starts_with(b"pt") {
        value * 65536.0f32
    } else if unit.starts_with(b"bp") {
        value * (72.27f32 / 72.0 * 65536.0f32)
    } else if unit.starts_with(b"pc") {
        (f64::from(value) * (12.0 * 65536.0)) as f32
    } else if unit.starts_with(b"sp") {
        value
    } else if unit.starts_with(b"dd") {
        value * (1238.0f32 / 1157.0 * 65536.0f32)
    } else if unit.starts_with(b"cc") {
        value * (14856.0f32 / 1157.0 * 65536.0)
    } else if unit.starts_with(b"nd") {
        value * (685.0f32 / 642.0 * 65536.0)
    } else if unit.starts_with(b"nc") {
        value * (1370.0f32 / 107.0 * 65536.0)
    } else {
        // Sans unité, le C signale une erreur et ignore la ligne.
        return None;
    };
    Some(scaled)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    Preamble,
    Content,
    Postamble,
    PostScriptum,
}

/// État de `__synctex_parse_sfi` pendant la lecture du contenu.
struct Builder {
    nodes: Vec<Node>,
    friends: Vec<Vec<usize>>,
    inputs: Vec<Input>,
    sheets: Vec<Sheet>,
    sheet: Option<usize>,
    parent: Option<usize>,
    child: Option<usize>,
    /// Pile des `x_handle` : par boîte ouverte, les nœuds `x` de tête dont
    /// la ligne attend le prochain nœud non-`x` (le C : « sometimes, the
    /// first nodes of a box have the wrong line number »).
    pending: Vec<Vec<usize>>,
    last_k: Option<usize>,
    last_g: Option<usize>,
    lastv: i64,
    form_depth: usize,
}

impl Builder {
    fn new() -> Self {
        Self {
            nodes: Vec::new(),
            friends: vec![Vec::new(); NUMBER_OF_LISTS],
            inputs: Vec::new(),
            sheets: Vec::new(),
            sheet: None,
            parent: None,
            child: None,
            pending: vec![Vec::new()],
            last_k: None,
            last_g: None,
            lastv: -1,
            form_depth: 0,
        }
    }

    fn parse_input(&mut self, rest: &[u8]) {
        let mut cursor = Cursor::new(rest);
        let Some(tag) = cursor.int() else {
            return;
        };
        // Un caractère séparateur, puis le nom jusqu'en fin de ligne.
        let start = (cursor.i + 1).min(rest.len());
        let mut name = String::from_utf8_lossy(&rest[start..]).into_owned();
        while name.ends_with(' ') || name.ends_with('\r') {
            name.pop();
        }
        self.inputs.push(Input {
            tag: tag as i32,
            name,
            max_line: 0,
        });
    }

    fn page(&self) -> i32 {
        self.sheet.map_or(-1, |s| self.sheets[s].page)
    }

    fn new_node(&mut self, kind: Kind) -> usize {
        self.nodes.push(Node {
            kind,
            tag: 0,
            line: 0,
            column: 0,
            h: 0,
            v: 0,
            width: 0,
            height: 0,
            depth: 0,
            visible: Visible::default(),
            parent: None,
            children: Vec::new(),
            page: self.page(),
        });
        self.nodes.len() - 1
    }

    /// Décode l'enregistrement selon les champs du modèle de données C.
    fn decode(&mut self, kind: Kind, rest: &[u8]) -> Option<usize> {
        let mut c = Cursor::new(rest);
        let mut n = Node {
            kind,
            tag: 0,
            line: 0,
            column: 0,
            h: 0,
            v: 0,
            width: 0,
            height: 0,
            depth: 0,
            visible: Visible::default(),
            parent: None,
            children: Vec::new(),
            page: self.page(),
        };
        n.tag = c.int()? as i32;
        if kind == Kind::Ref {
            n.h = c.int()?;
            n.v = c.int_v(&mut self.lastv)?;
        } else {
            n.line = c.int()? as i32;
            n.column = c.column()? as i32;
            n.h = c.int()?;
            n.v = c.int_v(&mut self.lastv)?;
            match kind {
                Kind::Vbox | Kind::Hbox | Kind::VoidVbox | Kind::VoidHbox | Kind::Rule => {
                    n.width = c.int()?;
                    n.height = c.int()?;
                    n.depth = c.int()?;
                }
                Kind::Kern => n.width = c.int()?,
                _ => {}
            }
        }
        if kind == Kind::Hbox {
            n.visible = Visible {
                h: n.h,
                v: n.v,
                width: n.width,
                height: n.height,
                depth: n.depth,
            };
        }
        self.nodes.push(n);
        Some(self.nodes.len() - 1)
    }

    fn attach(&mut self, id: usize) {
        if let Some(parent) = self.parent {
            self.nodes[id].parent = Some(parent);
            self.nodes[parent].children.push(id);
        }
    }

    /// `__synctex_node_make_friend_tlc` : seau fixé par tag + ligne à
    /// l'enregistrement, même si la ligne change ensuite (comme en C).
    fn make_friend(&mut self, id: usize) {
        let i = i64::from(self.nodes[id].tag) + i64::from(self.nodes[id].line);
        if i >= 0 {
            self.friends[(i as usize) % NUMBER_OF_LISTS].push(id);
        }
    }

    /// `_synctex_input_register_line`.
    fn register_line(&mut self, id: usize) {
        let (tag, line) = (self.nodes[id].tag, self.nodes[id].line);
        if let Some(input) = self.inputs.iter_mut().rev().find(|i| i.tag == tag)
            && line > input.max_line
        {
            input.max_line = line;
        }
    }

    fn set_tlc(&mut self, id: usize, model: usize) {
        let (tag, line, column) = {
            let m = &self.nodes[model];
            (m.tag, m.line, m.column)
        };
        let n = &mut self.nodes[id];
        n.tag = tag;
        n.line = line;
        n.column = column;
    }

    /// `_synctex_handle_set_tlc` : les `x` de tête en attente prennent la
    /// ligne du nœud qui les suit, du plus récent au plus ancien.
    fn resolve_pending(&mut self, model: usize) {
        let level = std::mem::take(self.pending.last_mut().expect("niveau racine"));
        for &target in level.iter().rev() {
            self.set_tlc(target, model);
            self.make_friend(target);
        }
    }

    /// `_synctex_handle_make_friend_tlc` à la fermeture d'une boîte : les `x`
    /// restés en attente gardent leur propre ligne.
    fn flush_pending(&mut self) {
        let level = std::mem::take(self.pending.last_mut().expect("niveau racine"));
        for &target in level.iter().rev() {
            self.make_friend(target);
        }
    }

    fn contain_point(&mut self, parent: Option<usize>, h: i64, v: i64) {
        self.contain_box(parent, (h, h), (v, v));
    }

    /// `_synctex_make_hbox_contain_box` : agrandit la boîte visible.
    fn contain_box(
        &mut self,
        parent: Option<usize>,
        (min_h, max_h): (i64, i64),
        (min_v, max_v): (i64, i64),
    ) {
        let Some(parent) = parent.filter(|&p| self.nodes[p].kind == Kind::Hbox) else {
            return;
        };
        let vis = &mut self.nodes[parent].visible;
        let n = vis.width;
        if n < 0 {
            let max = vis.h;
            let min = max + n;
            if min_h < min {
                vis.width = min_h - max;
            } else if max_h > max {
                vis.h = max_h;
                vis.width = min - max_h;
            }
        } else {
            let min = vis.h;
            let max = min + n;
            if min_h < min {
                vis.h = min_h;
                vis.width = max - min_h;
            } else if max_h > max {
                vis.width = max_h - min;
            }
        }
        let n = vis.v;
        let min = n - vis.height;
        let max = n + vis.depth;
        if min_v < min {
            vis.height = n - min_v;
        } else if max_v > max {
            vis.depth = max_v - n;
        }
    }

    /// `_synctex_data_box` (boîte vide) ou `_synctex_data_xob` (crénage).
    fn data_box(&self, id: usize, kern: bool) -> ((i64, i64), (i64, i64)) {
        let n = &self.nodes[id];
        let h = if kern {
            if n.width > 0 {
                (n.h - n.width, n.h)
            } else {
                (n.h, n.h - n.width)
            }
        } else if n.width < 0 {
            (n.h + n.width, n.h)
        } else {
            (n.h, n.h + n.width)
        };
        (h, (n.v - n.height, n.v + n.depth))
    }

    fn visible_box(&self, id: usize) -> ((i64, i64), (i64, i64)) {
        let vis = self.nodes[id].visible;
        let h = if vis.width < 0 {
            (vis.h + vis.width, vis.h)
        } else {
            (vis.h, vis.h + vis.width)
        };
        (h, (vis.v - vis.height, vis.v + vis.depth))
    }

    fn reset_kg(&mut self) {
        self.last_k = None;
        self.last_g = None;
    }

    fn content_line(&mut self, line: &[u8]) {
        let Some(&first) = line.first() else {
            return;
        };
        if self.form_depth > 0 {
            match first {
                b'<' => self.form_depth += 1,
                b'>' => self.form_depth -= 1,
                _ => {}
            }
            return;
        }
        let rest = &line[1..];
        let in_sheet = self.sheet.is_some();
        match first {
            b'<' => {
                self.form_depth = 1;
                self.reset_kg();
            }
            b'{' if !in_sheet => {
                let mut cursor = Cursor::new(rest);
                let Some(page) = cursor.int() else {
                    return;
                };
                self.sheets.push(Sheet {
                    page: page as i32,
                    node: 0,
                    hboxes: Vec::new(),
                });
                self.sheet = Some(self.sheets.len() - 1);
                let node = self.new_node(Kind::Sheet);
                let last = self.sheets.len() - 1;
                self.sheets[last].node = node;
                self.parent = Some(node);
                self.child = None;
                self.reset_kg();
            }
            b'}' if in_sheet => {
                let sheet_node = self.sheets[self.sheet.unwrap_or(0)].node;
                if self.parent == Some(sheet_node) {
                    self.sheet = None;
                    self.parent = None;
                    self.child = None;
                }
                self.reset_kg();
            }
            b'[' if in_sheet => {
                if let Some(id) = self.decode(Kind::Vbox, rest) {
                    self.attach(id);
                    self.pending.push(Vec::new());
                    self.parent = Some(id);
                    self.child = None;
                    self.register_line(id);
                }
                self.reset_kg();
            }
            b']' if in_sheet => {
                if let Some(id) = self.parent.filter(|&p| self.nodes[p].kind == Kind::Vbox) {
                    // Seules les vbox vides sont « friends ».
                    if self.nodes[id].children.is_empty() {
                        self.make_friend(id);
                    }
                    self.child = Some(id);
                    self.parent = self.nodes[id].parent;
                    self.flush_pending();
                    if self.pending.len() > 1 {
                        self.pending.pop();
                    }
                    self.resolve_pending(id);
                }
                self.reset_kg();
            }
            b'(' if in_sheet => {
                if let Some(id) = self.decode(Kind::Hbox, rest) {
                    self.attach(id);
                    self.pending.push(Vec::new());
                    self.parent = Some(id);
                    // Borne d'ouverture : même tag, ligne et position que la boîte.
                    let bdry = self.new_node(Kind::BoxBdry);
                    let (tag, line, column, h, v) = {
                        let n = &self.nodes[id];
                        (n.tag, n.line, n.column, n.h, n.v)
                    };
                    let b = &mut self.nodes[bdry];
                    (b.tag, b.line, b.column, b.h, b.v) = (tag, line, column, h, v);
                    self.attach(bdry);
                    self.make_friend(bdry);
                    self.child = Some(bdry);
                    self.register_line(id);
                }
                self.reset_kg();
            }
            b')' if in_sheet => {
                if let Some(id) = self.parent.filter(|&p| self.nodes[p].kind == Kind::Hbox) {
                    self.close_hbox(id);
                }
                self.reset_kg();
            }
            b'v' | b'h' if in_sheet => {
                let kind = if first == b'v' {
                    Kind::VoidVbox
                } else {
                    Kind::VoidHbox
                };
                if let Some(id) = self.decode(kind, rest) {
                    self.attach(id);
                    self.child = Some(id);
                    self.resolve_pending(id);
                    if kind == Kind::VoidHbox {
                        let (h, v) = self.data_box(id, false);
                        self.contain_box(self.parent, h, v);
                    }
                    self.register_line(id);
                }
                self.reset_kg();
            }
            b'k' if in_sheet => {
                if let Some(id) = self.decode(Kind::Kern, rest) {
                    self.attach(id);
                    self.child = Some(id);
                    self.make_friend(id);
                    self.resolve_pending(id);
                    let (h, v) = self.data_box(id, true);
                    self.contain_box(self.parent, h, v);
                    self.register_line(id);
                    self.last_k = Some(id);
                    self.last_g = None;
                } else {
                    self.reset_kg();
                }
            }
            b'g' if in_sheet => {
                if let Some(id) = self.decode(Kind::Glue, rest) {
                    self.attach(id);
                    self.child = Some(id);
                    self.make_friend(id);
                    self.resolve_pending(id);
                    let (h, v) = (self.nodes[id].h, self.nodes[id].v);
                    self.contain_point(self.parent, h, v);
                    self.register_line(id);
                    if self.last_k.is_some() {
                        self.last_g = Some(id);
                    } else {
                        self.reset_kg();
                    }
                } else {
                    self.reset_kg();
                }
            }
            b'r' | b'$' if in_sheet => {
                let kind = if first == b'r' {
                    Kind::Rule
                } else {
                    Kind::Math
                };
                if let Some(id) = self.decode(kind, rest) {
                    self.attach(id);
                    self.child = Some(id);
                    self.make_friend(id);
                    self.resolve_pending(id);
                    if kind == Kind::Math {
                        let (h, v) = (self.nodes[id].h, self.nodes[id].v);
                        self.contain_point(self.parent, h, v);
                    }
                    self.register_line(id);
                }
                self.reset_kg();
            }
            b'f' if in_sheet => {
                // Référence de formulaire : gardée le temps de la lecture
                // (elle compte comme « dernier enfant »), retirée ensuite.
                if let Some(id) = self.decode(Kind::Ref, rest) {
                    self.nodes[id].column = 0;
                    self.attach(id);
                    self.child = Some(id);
                }
                self.reset_kg();
            }
            b'x' if in_sheet => {
                if let Some(id) = self.decode(Kind::Boundary, rest) {
                    let after_bdry = self
                        .child
                        .is_some_and(|c| self.nodes[c].kind == Kind::BoxBdry);
                    self.attach(id);
                    let level = self.pending.last_mut().expect("niveau racine");
                    if after_bdry || !level.is_empty() {
                        level.push(id);
                    } else {
                        self.make_friend(id);
                    }
                    self.child = Some(id);
                    let (h, v) = (self.nodes[id].h, self.nodes[id].v);
                    self.contain_point(self.parent, h, v);
                    self.register_line(id);
                }
                self.reset_kg();
            }
            _ => self.reset_kg(),
        }
    }

    fn close_hbox(&mut self, id: usize) {
        if let Some(sheet) = self.sheet {
            self.sheets[sheet].hboxes.push(id);
        }
        // La borne d'ouverture prend la ligne du premier vrai enfant.
        let kids = self.nodes[id].children.clone();
        if let (Some(&first), Some(&second)) = (kids.first(), kids.get(1)) {
            self.nodes[first].line = self.nodes[second].line;
        }
        // Borne de fermeture : ligne du dernier enfant (hors références),
        // posée au bord droit de la boîte visible.
        let mut last = self.child.unwrap_or(id);
        if let Some(pos) = kids.iter().position(|&k| k == last) {
            let mut p = pos;
            while self.nodes[kids[p]].kind == Kind::Ref && p > 0 {
                p -= 1;
            }
            last = kids[p];
        }
        let closing = self.new_node(Kind::BoxBdry);
        self.set_tlc(closing, last);
        let vis = self.nodes[id].visible;
        self.nodes[closing].h = vis.h + vis.width;
        self.nodes[closing].v = vis.v;
        self.nodes[closing].parent = Some(id);
        self.nodes[id].children.push(closing);
        if let Some(&first) = kids.first() {
            self.nodes[first].h = vis.h;
            self.nodes[first].v = vis.v;
        }
        // Crénage + ressort finaux : la ligne du nœud qui précède le crénage.
        if let (Some(k), Some(g)) = (self.last_k, self.last_g) {
            let kids = &self.nodes[id].children;
            if let Some(pos) = kids.windows(2).position(|w| w[1] == k) {
                let before = kids[pos];
                self.set_tlc(k, before);
                self.set_tlc(g, before);
            }
        }
        self.child = Some(id);
        self.parent = self.nodes[id].parent;
        self.flush_pending();
        if self.pending.len() > 1 {
            self.pending.pop();
        }
        self.resolve_pending(id);
        let (h, v) = self.visible_box(id);
        self.contain_box(self.parent, h, v);
    }
}

impl Synctex {
    /// Analyse le contenu (décompressé) d'un fichier SyncTeX. `dir` est le
    /// dossier du fichier, base des noms d'entrée relatifs.
    pub fn parse(bytes: &[u8], dir: &Path) -> Self {
        let mut b = Builder::new();
        let mut phase = Phase::Preamble;
        let (mut pre_mag, mut pre_unit, mut pre_x, mut pre_y) = (1000i64, 8192i64, 578i64, 578i64);
        let mut post_mag: Option<f32> = None;
        let (mut post_x, mut post_y): (Option<f32>, Option<f32>) = (None, None);
        for line in bytes.split(|&c| c == b'\n') {
            match phase {
                Phase::Preamble => {
                    let int_after = |prefix: &[u8]| Cursor::new(&line[prefix.len()..]).int();
                    if let Some(rest) = line.strip_prefix(b"Input:") {
                        b.parse_input(rest);
                    } else if line.starts_with(b"Magnification:") {
                        pre_mag = int_after(b"Magnification:").unwrap_or(pre_mag);
                    } else if line.starts_with(b"Unit:") {
                        pre_unit = int_after(b"Unit:").unwrap_or(pre_unit);
                    } else if line.starts_with(b"X Offset:") {
                        pre_x = int_after(b"X Offset:").unwrap_or(pre_x);
                    } else if line.starts_with(b"Y Offset:") {
                        pre_y = int_after(b"Y Offset:").unwrap_or(pre_y);
                    } else if line.starts_with(b"Content:") {
                        phase = Phase::Content;
                    }
                }
                Phase::Content => {
                    if b.sheet.is_none() && b.form_depth == 0 {
                        if let Some(rest) = line.strip_prefix(b"Input:") {
                            b.parse_input(rest);
                            continue;
                        }
                        if line.starts_with(b"Postamble:") {
                            phase = Phase::Postamble;
                            continue;
                        }
                    }
                    b.content_line(line);
                }
                Phase::Postamble => {
                    if line.starts_with(b"Post scriptum:") {
                        phase = Phase::PostScriptum;
                    }
                }
                Phase::PostScriptum => {
                    if let Some(rest) = line.strip_prefix(b"Magnification:") {
                        if let Some((value, _)) = strtod_prefix(rest).filter(|(v, _)| *v > 0.0) {
                            post_mag = Some(value as f32);
                        }
                    } else if let Some(rest) = line.strip_prefix(b"X Offset:") {
                        post_x = float_and_dimension(rest).or(post_x);
                    } else if let Some(rest) = line.strip_prefix(b"Y Offset:") {
                        post_y = float_and_dimension(rest).or(post_y);
                    }
                }
            }
        }
        // Les références de formulaire ne servent qu'à la lecture.
        for i in 0..b.nodes.len() {
            if b.nodes[i].kind != Kind::Ref && !b.nodes[i].children.is_empty() {
                let kids = std::mem::take(&mut b.nodes[i].children);
                let nodes = &b.nodes;
                b.nodes[i].children = kids
                    .into_iter()
                    .filter(|&k| nodes[k].kind != Kind::Ref)
                    .collect();
            }
        }
        // Réglages finaux de `synctex_scanner_parse`, en flottants simples
        // comme le C, pour tomber sur les mêmes arrondis.
        let pre_unit = if pre_unit <= 0 { 8192 } else { pre_unit };
        let pre_mag = if pre_mag <= 0 { 1000 } else { pre_mag };
        let per_bp = pre_unit as f64 / 65781.76;
        let mut unit = match post_mag {
            Some(m) => (f64::from(m) * per_bp) as f32,
            None => per_bp as f32,
        };
        unit = (f64::from(unit) * (pre_mag as f64 / 1000.0)) as f32;
        let (x_offset, y_offset) = match post_x {
            None => (
                (pre_x as f64 * per_bp) as f32,
                (pre_y as f64 * per_bp) as f32,
            ),
            Some(x) => (x / 65781.76f32, post_y.unwrap_or(6.027e23f32) / 65781.76f32),
        };
        Self {
            inputs: b.inputs,
            nodes: b.nodes,
            sheets: b.sheets,
            friends: b.friends,
            unit,
            x_offset,
            y_offset,
            dir: dir.to_path_buf(),
        }
    }

    fn input_with_tag(&self, tag: i32) -> Option<&Input> {
        self.inputs.iter().rev().find(|i| i.tag == tag)
    }

    /// Coordonnée horizontale visible (`synctex_node_visible_h`).
    fn visible_h(&self, id: usize) -> f32 {
        let n = &self.nodes[id];
        let d = match n.kind {
            Kind::Kern if n.width > 0 => n.h - n.width,
            Kind::Rule if n.width <= 0 => n.h - n.width,
            _ => n.h,
        };
        d as f32 * self.unit + self.x_offset
    }

    fn visible_v(&self, id: usize) -> f32 {
        self.nodes[id].v as f32 * self.unit + self.y_offset
    }

    // -----------------------------------------------------------------------
    // Correspondance du fichier source
    // -----------------------------------------------------------------------

    fn resolve_name(&self, name: &str) -> PathBuf {
        let path = Path::new(name);
        normalize(&if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.dir.join(path)
        })
    }

    /// Tags des entrées qui désignent `tex`, dans l'ordre où le CLI les
    /// essaierait. Trois étages, le premier qui trouve gagne :
    /// 1. même fichier une fois les chemins résolus (`./`, `..`, liens
    ///    symboliques ; noms relatifs rapportés au dossier du SyncTeX) ;
    /// 2. même chemin à la casse près (volumes macOS insensibles à la casse) ;
    /// 3. projet déplacé depuis la compilation : le chemin relatif au dossier
    ///    de compilation (ce qui suit `/./` chez pdfTeX et tectonic) termine
    ///    le chemin demandé ; le plus long gagne, une égalité entre fichiers
    ///    différents ne donne rien plutôt qu'un mauvais fichier.
    pub fn tags_for(&self, tex: &Path) -> Vec<i32> {
        let want_lexical = normalize(tex);
        let want = fs::canonicalize(&want_lexical).unwrap_or_else(|_| want_lexical.clone());
        let Some(want_name) = want.file_name().map(|n| n.to_string_lossy().to_lowercase()) else {
            return Vec::new();
        };
        // Candidats : même nom de fichier, à la casse près (aucun accès disque).
        let candidates: Vec<(&Input, PathBuf)> = self
            .inputs
            .iter()
            .rev()
            .filter(|i| !i.name.is_empty())
            .map(|i| (i, self.resolve_name(&i.name)))
            .filter(|(_, p)| {
                p.file_name()
                    .is_some_and(|n| n.to_string_lossy().to_lowercase() == want_name)
            })
            .collect();
        let resolved: Vec<PathBuf> = candidates
            .iter()
            .map(|(_, p)| fs::canonicalize(p).unwrap_or_else(|_| p.clone()))
            .collect();
        let exact: Vec<i32> = candidates
            .iter()
            .zip(&resolved)
            .filter(|(_, p)| **p == want || **p == want_lexical)
            .map(|((i, _), _)| i.tag)
            .collect();
        if !exact.is_empty() {
            return exact;
        }
        let lower = |p: &Path| p.to_string_lossy().to_lowercase();
        let (want_lower, lexical_lower) = (lower(&want), lower(&want_lexical));
        let folded: Vec<i32> = candidates
            .iter()
            .zip(&resolved)
            .filter(|(_, p)| lower(p) == want_lower || lower(p) == lexical_lower)
            .map(|((i, _), _)| i.tag)
            .collect();
        if !folded.is_empty() {
            return folded;
        }
        let want_parts: Vec<String> = components(&want_lexical);
        let mut best: Vec<(usize, Vec<String>, i32)> = Vec::new();
        for (input, _) in &candidates {
            let Some(rel) = self.relative_part(&input.name) else {
                continue;
            };
            if rel.is_empty()
                || rel.len() > want_parts.len()
                || want_parts[want_parts.len() - rel.len()..] != rel[..]
            {
                continue;
            }
            best.push((rel.len(), rel, input.tag));
        }
        let Some(longest) = best.iter().map(|(n, _, _)| *n).max() else {
            return Vec::new();
        };
        best.retain(|(n, _, _)| *n == longest);
        if best.iter().any(|(_, rel, _)| *rel != best[0].1) {
            return Vec::new();
        }
        best.into_iter().map(|(_, _, tag)| tag).collect()
    }

    /// Chemin d'une entrée relatif au dossier de compilation, en composants.
    fn relative_part(&self, name: &str) -> Option<Vec<String>> {
        if let Some(pos) = name.find("/./") {
            return Some(components(Path::new(&name[pos + 3..])));
        }
        let path = Path::new(name);
        if path.is_relative() {
            return Some(components(path));
        }
        normalize(path)
            .strip_prefix(normalize(&self.dir))
            .ok()
            .map(components)
    }

    // -----------------------------------------------------------------------
    // Recherche avant : source → PDF
    // -----------------------------------------------------------------------

    /// Ligne (1-based) de `tex` → page et point, comme `synctex view` ; la
    /// colonne est ignorée, comme dans le parser 1.21.
    pub fn view(&self, tex: &Path, line: i32, _column: i32) -> Option<ViewHit> {
        self.tags_for(tex).into_iter().find_map(|tag| {
            let node = self.display_query(tag, line)?;
            Some(ViewHit {
                page: self.nodes[node].page,
                x: f64::from(self.visible_h(node)),
                y: f64::from(self.visible_v(node)),
            })
        })
    }

    /// `synctex_iterator_new_display` réduit à son premier résultat.
    fn display_query(&self, tag: i32, line: i32) -> Option<usize> {
        let max_line = self.input_with_tag(tag)?.max_line;
        let mut line = line.min(max_line);
        let mut offset: i32 = 1;
        let step = |offset: i32| {
            if offset < 0 {
                -(offset - 1)
            } else {
                -(offset + 1)
            }
        };
        for _ in 0..100 {
            // Comme en C : au-delà de la dernière ligne connue, la
            // recherche s'arrête de bouger.
            if line > max_line {
                continue;
            }
            let index = i64::from(tag) + i64::from(line);
            if index >= 0 {
                let bucket = &self.friends[(index as usize) % NUMBER_OF_LISTS];
                let roots = self
                    .display_candidates(bucket, tag, line, true)
                    .or_else(|| self.display_candidates(bucket, tag, line, false));
                if let Some(roots) = roots {
                    // Indice de page 0 (le CLI sans `page_hint`) : la plus
                    // petite page gagne.
                    let chain = roots
                        .iter()
                        .min_by_key(|chain| self.nodes[chain[0]].page.abs())?;
                    return Some(self.vertically_sorted_head(chain, tag, line));
                }
            }
            line += offset;
            offset = step(offset);
            if line <= 0 {
                line += offset;
                offset = step(offset);
            }
        }
        None
    }

    /// `_synctex_display_query_v2` : chaînes de résultats par page, dans
    /// l'ordre exact où le C les construit.
    fn display_candidates(
        &self,
        bucket: &[usize],
        tag: i32,
        line: i32,
        exclude_box: bool,
    ) -> Option<Vec<Vec<usize>>> {
        let mut matches = bucket.iter().rev().copied().filter(|&id| {
            let n = &self.nodes[id];
            !(exclude_box && n.kind.is_box()) && n.tag == tag && n.line == line
        });
        let first = matches.next()?;
        let page = self.nodes[first].page;
        let mut chain = vec![first];
        let mut roots = loop {
            let Some(id) = matches.next() else {
                return Some(vec![chain]);
            };
            if self.nodes[id].page == page {
                chain.insert(0, id);
            } else {
                break vec![chain, vec![id]];
            }
        };
        for id in matches {
            let page = self.nodes[id].page;
            if let Some(root) = roots.iter_mut().find(|r| self.nodes[r[0]].page == page) {
                root.insert(1, id);
            } else {
                roots.insert(0, vec![id]);
            }
        }
        Some(roots)
    }

    /// Tête de `_synctex_vertically_sorted_v2` : le premier nœud dont le
    /// parent compte le plus d'enfants de même tag et ligne. Le poids d'une
    /// hbox parente n'est compté qu'une fois ; une vbox n'a pas de champ
    /// poids en C, elle est donc recomptée pour chaque nœud.
    fn vertically_sorted_head(&self, chain: &[usize], tag: i32, line: i32) -> usize {
        let mut counted: HashMap<usize, usize> = HashMap::new();
        let mut best = (chain[0], 0usize);
        for &id in chain {
            let Some(parent) = self.nodes[id].parent else {
                continue;
            };
            let is_hbox = self.nodes[parent].kind == Kind::Hbox;
            if is_hbox && counted.contains_key(&parent) {
                continue;
            }
            let weight = self.nodes[parent]
                .children
                .iter()
                .filter(|&&c| self.nodes[c].tag == tag && self.nodes[c].line == line)
                .count();
            if is_hbox {
                counted.insert(parent, weight);
            }
            if weight > best.1 {
                best = (id, weight);
            }
        }
        best.0
    }

    // -----------------------------------------------------------------------
    // Recherche arrière : PDF → source
    // -----------------------------------------------------------------------

    /// Clic (page 1-based, points PDF depuis le haut-gauche) → entrée et
    /// ligne, comme `synctex edit`.
    pub fn edit(&self, page: i32, x: f64, y: f64) -> Option<EditHit> {
        let node = self.edit_query(page, x, y)?;
        let n = &self.nodes[node];
        let input = self.input_with_tag(n.tag)?;
        Some(EditHit {
            input: input.name.clone(),
            line: n.line,
        })
    }

    /// `synctex_iterator_new_edit` réduit à son premier résultat.
    fn edit_query(&self, page: i32, x: f64, y: f64) -> Option<usize> {
        if self.unit <= 0.0 {
            return None;
        }
        let sheet = self
            .sheets
            .iter()
            .find(|s| s.page == page)
            .or_else(|| (page == 0).then(|| self.sheets.first()).flatten())?;
        let hit = Point {
            h: (((x as f32) - self.x_offset) / self.unit) as i64,
            v: (((y as f32) - self.y_offset) / self.unit) as i64,
        };
        let hboxes: Vec<usize> = sheet.hboxes.iter().rev().copied().collect();
        let (node, nds) = if let Some(pos) = hboxes.iter().position(|&h| self.point_in_box(hit, h))
        {
            // Boîtes qui se chevauchent : la plus petite qui contient le clic.
            let mut node = hboxes[pos];
            for &next in &hboxes[pos + 1..] {
                if self.point_in_box(hit, next) {
                    node = self.smallest_container(next, node);
                }
            }
            let node = self.deepest_container_v2(hit, node).unwrap_or(node);
            (node, self.closest_children_in_box(hit, node))
        } else {
            let node = *self.nodes[sheet.node].children.first()?;
            let l = self.closest_deep_child(hit, node);
            (node, Lr { l, r: Nd::NONE })
        };
        let (l, r) = (nds.l, nds.r);
        match (l.node, r.node) {
            (Some(ln), Some(rn)) => {
                let (a, b) = (&self.nodes[ln], &self.nodes[rn]);
                if (a.tag, a.line, a.column) != (b.tag, b.line, b.column) {
                    // Deux résultats : le premier a la plus petite ligne,
                    // à ligne égale le plus proche.
                    if b.line < a.line || (b.line == a.line && l.distance > r.distance) {
                        return Some(rn);
                    }
                    return Some(ln);
                }
                Some(if l.distance > r.distance { rn } else { ln })
            }
            (None, Some(rn)) => Some(rn),
            (Some(ln), None) => Some(ln),
            (None, None) => Some(node),
        }
    }

    fn parent_height(&self, id: usize) -> i64 {
        self.nodes[id].parent.map_or(0, |p| self.nodes[p].height)
    }

    fn parent_depth(&self, id: usize) -> i64 {
        self.nodes[id].parent.map_or(0, |p| self.nodes[p].depth)
    }

    /// `_synctex_point_h_ordered_distance_v2` : positif si le nœud est à
    /// droite du clic, négatif à gauche, 0 dedans.
    fn h_ordered_distance(&self, hit: Point, id: usize) -> i64 {
        let n = &self.nodes[id];
        let span = |min: i64, width: i64| {
            let max = min + width.abs();
            if hit.h < min {
                min - hit.h
            } else if hit.h > max {
                max - hit.h
            } else {
                0
            }
        };
        match n.kind {
            Kind::Vbox | Kind::VoidVbox | Kind::VoidHbox => span(n.h, n.width),
            Kind::Hbox => span(n.visible.h, n.visible.width),
            Kind::Kern => {
                // Position enregistrée APRÈS le déplacement.
                let (min, max) = if n.width < 0 {
                    (n.h, n.h - n.width)
                } else {
                    (n.h - n.width, n.h)
                };
                let med = (min + max) / 2;
                if hit.h < min {
                    min - hit.h + 1
                } else if hit.h > max {
                    max - hit.h - 1
                } else if hit.h > med {
                    max - hit.h + 1
                } else {
                    min - hit.h - 1
                }
            }
            Kind::Rule | Kind::Glue | Kind::Math | Kind::Boundary | Kind::BoxBdry => n.h - hit.h,
            Kind::Sheet | Kind::Ref => INT_MAX,
        }
    }

    /// `_synctex_point_v_ordered_distance_v2`.
    fn v_ordered_distance(&self, hit: Point, id: usize) -> i64 {
        let n = &self.nodes[id];
        let (min, max) = match n.kind {
            Kind::Vbox | Kind::VoidVbox | Kind::VoidHbox => {
                (n.v - n.height.abs(), n.v + n.depth.abs())
            }
            Kind::Hbox => (
                n.visible.v - n.visible.height.abs(),
                n.visible.v + n.visible.depth.abs(),
            ),
            Kind::Rule | Kind::Kern | Kind::Glue | Kind::Math => (
                n.v - self.parent_height(id).abs(),
                n.v + self.parent_depth(id).abs(),
            ),
            _ => return INT_MAX,
        };
        if hit.v < min {
            min - hit.v
        } else if hit.v > max {
            max - hit.v
        } else {
            0
        }
    }

    fn point_in_box(&self, hit: Point, id: usize) -> bool {
        self.h_ordered_distance(hit, id) == 0 && self.v_ordered_distance(hit, id) == 0
    }

    /// `_synctex_smallest_container_v2` entre deux hbox.
    fn smallest_container(&self, node: usize, other: usize) -> usize {
        let (a, b) = (&self.nodes[node], &self.nodes[other]);
        let size = |n: &Node| {
            let height = n.visible.depth.abs() + n.visible.height.abs();
            (n.visible.width.abs(), height)
        };
        let ((wa, ha), (wb, hb)) = (size(a), size(b));
        let (area, other_area) = (ha as i128 * wa as i128, hb as i128 * wb as i128);
        if area != other_area {
            return if area < other_area { node } else { other };
        }
        if a.width.abs() != b.width.abs() {
            return if a.width.abs() > b.width.abs() {
                node
            } else {
                other
            };
        }
        if ha > hb { other } else { node }
    }

    /// `_synctex_point_node_distance_v2`.
    fn point_node_distance(&self, hit: Point, id: usize) -> i64 {
        let n = &self.nodes[id];
        let rect = |min_h: i64, max_h: i64, min_v: i64, max_v: i64| {
            distance_to_box(hit, min_h, max_h, min_v, max_v)
        };
        match n.kind {
            Kind::Vbox => rect(
                n.h,
                n.h + n.width.abs(),
                n.v - n.height.abs(),
                n.v + n.depth.abs(),
            ),
            Kind::Hbox => {
                let vis = n.visible;
                rect(
                    vis.h,
                    vis.h + vis.width.abs(),
                    vis.v - vis.height.abs(),
                    vis.v + vis.depth.abs(),
                )
            }
            Kind::VoidVbox | Kind::VoidHbox => {
                let (min_v, max_v) = (n.v - n.height.abs(), n.v + n.depth.abs());
                let left = rect(n.h, n.h, min_v, max_v);
                let right_h = n.h + n.width.abs();
                left.min(rect(right_h, right_h, min_v, max_v))
            }
            Kind::Kern => {
                let min_v = n.v - self.parent_height(id).abs();
                let d = rect(n.h, n.h, min_v, n.v);
                let other = n.h - n.width;
                d.min(rect(other, other, min_v, n.v))
            }
            Kind::Glue | Kind::Math | Kind::Boundary | Kind::BoxBdry => {
                rect(n.h, n.h, n.v - self.parent_height(id).abs(), n.v)
            }
            Kind::Rule | Kind::Sheet | Kind::Ref => INT_MAX,
        }
    }

    /// `_synctex_eq_deepest_container_v2`.
    fn deepest_container_v2(&self, hit: Point, id: usize) -> Option<usize> {
        let children = &self.nodes[id].children;
        if children.is_empty() {
            return None;
        }
        for &child in children {
            if self.point_in_box(hit, child)
                && let Some(deep) = self.deepest_container_v2(hit, child)
            {
                return Some(deep);
            }
        }
        if self.nodes[id].kind == Kind::Vbox {
            let mut best = Nd::NONE;
            for &child in children {
                if !self.nodes[child].children.is_empty() {
                    let d = self.point_node_distance(hit, child);
                    if d <= best.distance {
                        best = Nd {
                            node: Some(child),
                            distance: d,
                        };
                    }
                }
            }
            if best.node.is_some() {
                return best.node;
            }
        }
        self.point_in_box(hit, id).then_some(id)
    }

    /// `_synctex_eq_deepest_container_v3`.
    fn deepest_container_v3(&self, hit: Point, id: usize) -> Nd {
        let children = &self.nodes[id].children;
        if children.is_empty() {
            return Nd::NONE;
        }
        for &child in children {
            let deep = self.deepest_container_v3(hit, child);
            if deep.node.is_some() {
                return deep;
            }
        }
        if self.nodes[id].kind == Kind::Vbox {
            let mut best = Nd::NONE;
            for &child in children {
                if !self.nodes[child].children.is_empty() {
                    let d = self.point_node_distance(hit, child);
                    if d < best.distance {
                        best = Nd {
                            node: Some(child),
                            distance: d,
                        };
                    }
                }
            }
            if best.node.is_some() {
                return best;
            }
        }
        if self.point_in_box(hit, id) {
            return Nd {
                node: Some(id),
                distance: 0,
            };
        }
        Nd::NONE
    }

    /// `__synctex_closest_deep_child_v2`.
    fn closest_deep_child(&self, hit: Point, id: usize) -> Nd {
        let mut best = Nd::NONE;
        for &child in &self.nodes[id].children {
            let nd = if self.nodes[child].kind.is_box() {
                self.closest_deep_child(hit, child)
            } else {
                Nd {
                    node: Some(child),
                    distance: self.point_node_distance(hit, child),
                }
            };
            let not_kern = nd.node.map(|n| self.nodes[n].kind) != Some(Kind::Kern);
            if nd.distance < best.distance || (nd.distance == best.distance && not_kern) {
                best = nd;
            }
        }
        best
    }

    /// `_synctex_eq_get_closest_children_in_box_v2`. La variante vbox du C
    /// part d'un nœud nul et ne rend jamais rien : reproduit tel quel, la
    /// requête retombe alors sur la boîte elle-même.
    fn closest_children_in_box(&self, hit: Point, id: usize) -> Lr {
        if self.nodes[id].kind == Kind::Hbox {
            self.closest_children_in_hbox(hit, id)
        } else {
            Lr {
                l: Nd::NONE,
                r: Nd::NONE,
            }
        }
    }

    /// `__synctex_eq_get_closest_children_in_hbox_v2`.
    fn closest_children_in_hbox(&self, hit: Point, id: usize) -> Lr {
        let mut nds = Lr {
            l: Nd::NONE,
            r: Nd::NONE,
        };
        let prefer = |current: &Nd, candidate: usize| {
            current.node.is_some_and(|c| {
                let (a, b) = (&self.nodes[c], &self.nodes[candidate]);
                a.tag == b.tag && (a.line > b.line || (a.line == b.line && a.column > b.column))
            })
        };
        for &child in &self.nodes[id].children {
            let distance = self.h_ordered_distance(hit, child);
            if distance > 0 {
                if nds.r.distance > distance
                    || (nds.r.distance == distance && prefer(&nds.r, child))
                {
                    nds.r = Nd {
                        node: Some(child),
                        distance,
                    };
                }
            } else if distance == 0 {
                if !self.nodes[child].children.is_empty() {
                    return self.closest_children_in_box(hit, child);
                }
                nds.l = Nd {
                    node: Some(child),
                    distance,
                };
            } else {
                let distance = -distance;
                if nds.l.distance > distance
                    || (nds.l.distance == distance && prefer(&nds.l, child))
                {
                    nds.l = Nd {
                        node: Some(child),
                        distance,
                    };
                }
            }
        }
        for side in [&mut nds.l, &mut nds.r] {
            if let Some(node) = side.node {
                let deep = self.deepest_container_v3(hit, node);
                if deep.node.is_some() {
                    *side = deep;
                }
                if let Some(closest) = side.node.and_then(|n| self.closest_deep_child(hit, n).node)
                {
                    side.node = Some(closest);
                }
            }
        }
        nds
    }
}

#[derive(Clone, Copy, Debug)]
struct Point {
    h: i64,
    v: i64,
}

/// `synctex_nd_s` : un nœud et sa distance au clic.
#[derive(Clone, Copy, Debug)]
struct Nd {
    node: Option<usize>,
    distance: i64,
}

impl Nd {
    const NONE: Nd = Nd {
        node: None,
        distance: INT_MAX,
    };
}

struct Lr {
    l: Nd,
    r: Nd,
}

/// `_synctex_distance_to_box_v2` : distance L1 aux bords, 0 dedans.
fn distance_to_box(hit: Point, min_h: i64, max_h: i64, min_v: i64, max_v: i64) -> i64 {
    if hit.v < min_v {
        if hit.h < min_h {
            min_v - hit.v + min_h - hit.h
        } else if hit.h <= max_h {
            min_v - hit.v
        } else {
            min_v - hit.v + hit.h - max_h
        }
    } else if hit.v <= max_v {
        if hit.h < min_h {
            min_h - hit.h
        } else if hit.h <= max_h {
            0
        } else {
            hit.h - max_h
        }
    } else if hit.h < min_h {
        hit.v - max_v + min_h - hit.h
    } else if hit.h <= max_h {
        hit.v - max_v
    } else {
        hit.v - max_v + hit.h - max_h
    }
}

/// Normalisation lexicale : retire `.`, résout `..`, sans accès disque.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn components(path: &Path) -> Vec<String> {
    normalize(path)
        .components()
        .filter_map(|c| match c {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `tests/fixtures/synctex` : deux fichiers sources (`\input`), le même
    /// document compilé par pdfLaTeX et par tectonic, et les réponses du CLI.
    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/synctex")
    }

    fn fixture(engine: &str) -> Synctex {
        let dir = fixture_root().join(engine);
        let raw = fs::read(dir.join("main.synctex.gz")).unwrap();
        let mut bytes = Vec::new();
        MultiGzDecoder::new(raw.as_slice())
            .read_to_end(&mut bytes)
            .unwrap();
        Synctex::parse(&bytes, &dir)
    }

    /// Rejoue les réponses enregistrées du CLI ; le projet a « bougé » depuis
    /// la compilation (`/compil/<moteur>/`), comme un dossier déplacé ou
    /// synchronisé sur une autre machine.
    fn assert_matches_cli(engine: &str) {
        let synctex = fixture(engine);
        let root = fixture_root();
        let answers = fs::read_to_string(root.join(engine).join("cli_answers.tsv")).unwrap();
        let (mut views, mut edits) = (0, 0);
        for line in answers
            .lines()
            .filter(|l| !l.starts_with('#') && !l.is_empty())
        {
            let f: Vec<&str> = line.split('\t').collect();
            match f[0] {
                "view" => {
                    views += 1;
                    let hit = synctex.view(&root.join(f[1]), f[2].parse().unwrap(), 1);
                    if f[3] == "-" {
                        assert_eq!(hit, None, "{line}");
                        continue;
                    }
                    let hit = hit.unwrap_or_else(|| panic!("aucune réponse : {line}"));
                    let (x, y): (f64, f64) = (f[4].parse().unwrap(), f[5].parse().unwrap());
                    assert_eq!(hit.page, f[3].parse::<i32>().unwrap(), "{line}");
                    assert!(
                        (hit.x - x).abs() < 0.01 && (hit.y - y).abs() < 0.01,
                        "{line} → {hit:?}"
                    );
                }
                "edit" => {
                    edits += 1;
                    let (page, x, y) = (
                        f[1].parse().unwrap(),
                        f[2].parse().unwrap(),
                        f[3].parse().unwrap(),
                    );
                    let hit = synctex.edit(page, x, y);
                    if f[4] == "-" {
                        assert_eq!(hit, None, "{line}");
                        continue;
                    }
                    let hit = hit.unwrap_or_else(|| panic!("aucune réponse : {line}"));
                    assert_eq!(
                        (hit.line, hit.input.as_str()),
                        (f[4].parse().unwrap(), f[5]),
                        "{line}"
                    );
                }
                other => panic!("ligne inconnue : {other}"),
            }
        }
        assert!(views > 100 && edits > 1000, "{views} view, {edits} edit");
    }

    #[test]
    fn matches_the_cli_on_pdflatex_output() {
        assert_matches_cli("pdflatex");
    }

    #[test]
    fn matches_the_cli_on_tectonic_output() {
        assert_matches_cli("tectonic");
    }

    #[test]
    fn preamble_units_and_inputs() {
        let synctex = fixture("pdflatex");
        assert_eq!(synctex.sheets.len(), 3);
        assert!((synctex.unit - 1.0 / 65781.76).abs() < 1e-9);
        assert_eq!((synctex.x_offset, synctex.y_offset), (0.0, 0.0));
        // main.aux apparaît deux fois, comme dans le fichier.
        assert_eq!(
            synctex
                .inputs
                .iter()
                .filter(|i| i.name.ends_with("main.aux"))
                .count(),
            2
        );
        // tectonic écrit des entrées sans nom : jamais candidates.
        let tectonic = fixture("tectonic");
        assert!(tectonic.inputs.iter().any(|i| i.name.is_empty()));
        assert_eq!(tectonic.tags_for(Path::new("")), Vec::<i32>::new());
    }

    #[test]
    fn source_names_as_written_resolved_or_moved_agree() {
        let synctex = fixture("pdflatex");
        let moved = fixture_root().join("chapitres/methode.tex");
        let expected = synctex.view(&moved, 7, 1).unwrap();
        for name in [
            "/compil/pdflatex/./chapitres/methode.tex",
            "/compil/pdflatex/chapitres/methode.tex",
            "/compil/pdflatex/chapitres/../chapitres/./methode.tex",
        ] {
            assert_eq!(
                synctex.view(Path::new(name), 7, 1),
                Some(expected),
                "{name}"
            );
        }
        // Le fichier principal et le sous-fichier ne se confondent pas.
        assert_ne!(
            synctex.tags_for(&fixture_root().join("main.tex")),
            synctex.tags_for(&moved)
        );
        // Nom inconnu : pas de réponse plutôt qu'un mauvais fichier.
        assert_eq!(synctex.view(Path::new("/ailleurs/annexe.tex"), 3, 1), None);
        assert_eq!(
            synctex.view(&fixture_root().join("autre/methode.tex"), 3, 1),
            None
        );
    }

    /// Deux entrées de même nom dans des dossiers différents.
    const TWO_HOMONYMS: &str = "SyncTeX Version:1
Input:1:/compil/./a/x.tex
Input:2:/compil/./b/x.tex
Output:pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
!120
{1
[1,1:0,0:6553600,52428800,0
(1,3:655360,1310720:3276800,655360,131072
$1,3:655360,1310720
)
(2,5:655360,2621440:3276800,655360,131072
$2,5:655360,2621440
)
]
}1
Postamble:
Count:6
!30
Post scriptum:
";

    #[test]
    fn homonyms_in_moved_projects_need_their_folder() {
        let synctex = Synctex::parse(TWO_HOMONYMS.as_bytes(), Path::new("/compil"));
        assert_eq!(synctex.tags_for(Path::new("/compil/a/x.tex")), vec![1]);
        assert_eq!(
            synctex.tags_for(Path::new("/ailleurs/projet/b/x.tex")),
            vec![2]
        );
        // Seul le nom concorde : ambigu, donc rien.
        assert_eq!(
            synctex.tags_for(Path::new("/ailleurs/x.tex")),
            Vec::<i32>::new()
        );
        let a = synctex.view(Path::new("/ailleurs/a/x.tex"), 3, 1).unwrap();
        assert_eq!(a.page, 1);
        assert!((a.x - 10.0 * 65536.0 / 65781.76).abs() < 1e-3, "{a:?}");
        assert!((a.y - 20.0 * 65536.0 / 65781.76).abs() < 1e-3, "{a:?}");
        let b = synctex.edit(1, a.x, 40.0 * 65536.0 / 65781.76).unwrap();
        assert_eq!((b.input.as_str(), b.line), ("/compil/./b/x.tex", 5));
        assert_eq!(synctex.edit(2, 10.0, 10.0), None);
    }

    #[test]
    fn load_reads_plain_and_gzipped_files_and_follows_changes() {
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("these.pdf");
        assert!(load_for_pdf(&pdf).is_err());
        fs::write(dir.path().join("these.synctex"), TWO_HOMONYMS).unwrap();
        let plain = load_for_pdf(&pdf).unwrap();
        assert_eq!(plain.tags_for(Path::new("/compil/b/x.tex")), vec![2]);
        // Recompilation : le fichier change, le cache aussi.
        fs::remove_file(dir.path().join("these.synctex")).unwrap();
        fs::copy(
            fixture_root().join("tectonic/main.synctex.gz"),
            dir.path().join("these.synctex.gz"),
        )
        .unwrap();
        let gz = load_for_pdf(&pdf).unwrap();
        assert_eq!(gz.sheets.len(), 3);
        assert!(Arc::ptr_eq(&gz, &load_for_pdf(&pdf).unwrap()));
    }
}
