//! Masquage des secrets dans une ligne de commande avant qu'elle n'atterrisse
//! dans le journal des tours ou dans un `<fichier>.prov.json`.
//!
//! L'ancienne version découpait la commande sur les espaces et ne masquait que
//! `CLÉ=valeur` à mot-indice, six options et `Bearer`. Passaient en clair :
//! `curl -u user:mdp`, `-H "X-API-Key: …"`, `Authorization: token …`,
//! `mysql -pSECRET`, `export X_PASS=…`, et une tabulation collait deux mots
//! (le secret ET le programme qui suivait étaient alors masqués ensemble).
//!
//! Ici, un petit lexeur façon shell (espaces, tabulations et retours à la
//! ligne séparent ; guillemets simples et doubles ; antislash) produit des
//! mots dont chaque caractère garde sa position dans la commande d'origine.
//! Les règles désignent des plages de caractères à masquer ; on remplace
//! ces plages par `***` dans le texte d'origine, si bien que séparateurs,
//! guillemets et reste de la commande sont conservés tels quels.

/// Un mot de la commande : sa valeur après retrait des guillemets, et pour
/// chaque caractère de cette valeur sa plage d'octets dans la commande.
struct Word {
    chars: Vec<char>,
    raw: Vec<(usize, usize)>,
}

impl Word {
    fn new() -> Self {
        Word { chars: Vec::new(), raw: Vec::new() }
    }
    fn push(&mut self, c: char, start: usize) {
        self.chars.push(c);
        self.raw.push((start, start + c.len_utf8()));
    }
    fn text(&self) -> String {
        self.chars.iter().collect()
    }
}

fn lex(command: &str) -> Vec<Word> {
    let mut words = Vec::new();
    let mut current: Option<Word> = None;
    let mut quote: Option<char> = None;
    let mut it = command.char_indices().peekable();
    while let Some((i, c)) = it.next() {
        if let Some(q) = quote {
            if c == q {
                quote = None;
            } else if q == '"' && c == '\\' {
                match it.peek() {
                    Some(&(j, d)) if matches!(d, '"' | '\\' | '$' | '`') => {
                        it.next();
                        current.get_or_insert_with(Word::new).push(d, j);
                    }
                    _ => current.get_or_insert_with(Word::new).push(c, i),
                }
            } else {
                current.get_or_insert_with(Word::new).push(c, i);
            }
            continue;
        }
        if c.is_whitespace() {
            if let Some(word) = current.take() {
                words.push(word);
            }
        } else if c == '\'' || c == '"' {
            quote = Some(c);
            current.get_or_insert_with(Word::new);
        } else if c == '\\' {
            if let Some((j, d)) = it.next() {
                // `\` + retour à la ligne : continuation, pas un caractère.
                if d != '\n' {
                    current.get_or_insert_with(Word::new).push(d, j);
                }
            }
        } else {
            current.get_or_insert_with(Word::new).push(c, i);
        }
    }
    if let Some(word) = current.take() {
        words.push(word);
    }
    words
}

/// Ce que le mot suivant doit subir, décidé par le mot courant.
#[derive(Clone, Copy, PartialEq)]
enum Next {
    Nothing,
    /// Valeur d'une option secrète (`--password x`, `sshpass -p x`).
    Whole,
    /// `-u user:mdp` : tout ce qui suit le premier `:`.
    AfterColon,
    /// Après `Authorization:` : un schéma (`Bearer`, `token`…) est gardé,
    /// le mot qui suit est masqué.
    SchemeThenWord,
    /// Le premier mot (`Bearer xyz`).
    Word,
}

const SCHEMES: [&str; 6] = ["bearer", "basic", "token", "digest", "negotiate", "apikey"];
const MYSQL_FAMILY: [&str; 10] = [
    "mysql", "mysqldump", "mysqladmin", "mysqlimport", "mysqlshow", "mysqlcheck", "mysqlpump",
    "mariadb", "mariadb-dump", "mariadb-admin",
];

/// Nom de variable ou d'option qui désigne un secret : `GITHUB_TOKEN`,
/// `--api-key`, `EARTHDATA_PASS`, `MYSQL_PWD`, `CDS_KEY`…
fn sensitive_key(name: &str) -> bool {
    let upper = name
        .trim_start_matches('-')
        .to_ascii_uppercase()
        .replace(['-', '.'], "_");
    const SUBSTRINGS: [&str; 12] = [
        "TOKEN", "SECRET", "PASSWORD", "PASSWD", "PASSPHRASE", "APIKEY", "API_KEY", "ACCESS_KEY",
        "PRIVATE_KEY", "CREDENTIAL", "AUTH_KEY", "COOKIE",
    ];
    if SUBSTRINGS.iter().any(|hint| upper.contains(hint)) {
        return true;
    }
    let segments: Vec<&str> = upper.split('_').filter(|s| !s.is_empty()).collect();
    segments.iter().any(|s| matches!(*s, "PASS" | "AUTH" | "AUTHORIZATION"))
        || (segments.len() > 1 && segments.contains(&"PWD"))
        || (segments.len() > 1 && segments.last() == Some(&"KEY"))
}

/// En-tête HTTP (ou clé de dictionnaire) dont la valeur est un secret.
fn sensitive_header(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "authorization" | "proxy-authorization" | "cookie" | "set-cookie" | "auth"
    ) || [
        "token", "secret", "password", "passwd", "apikey", "api-key", "api_key", "session",
        "credential", "signature", "x-auth",
    ]
    .iter()
    .any(|hint| lower.contains(hint))
        || lower.ends_with("-key")
        || lower.ends_with("_key")
}

fn is_ident(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.')
}

fn is_stop(c: char) -> bool {
    c.is_whitespace() || matches!(c, '"' | '\'' | ',' | ';' | '}' | ')' | ']' | '&' | '>' | '<')
}

/// Nom qui précède la position `end` (exclue), guillemets de clé sautés :
/// `{"Authorization": …` → `Authorization`.
fn name_before(chars: &[char], end: usize) -> String {
    let mut stop = end;
    while stop > 0 && matches!(chars[stop - 1], '"' | '\'') {
        stop -= 1;
    }
    let mut start = stop;
    while start > 0 && is_ident(chars[start - 1]) {
        start -= 1;
    }
    chars[start..stop].iter().collect()
}

/// Fin du mot qui commence à `from` (arrêt aux séparateurs de structure).
fn word_end(chars: &[char], from: usize) -> usize {
    let mut end = from;
    while end < chars.len() && !is_stop(chars[end]) {
        end += 1;
    }
    end
}

fn skip(chars: &[char], mut at: usize, what: impl Fn(char) -> bool) -> usize {
    while at < chars.len() && what(chars[at]) {
        at += 1;
    }
    at
}

/// Plages `user:***@` des URL, et zones d'autorité à ne pas réexaminer.
fn url_credentials(chars: &[char], spans: &mut Vec<(usize, usize)>) -> Vec<(usize, usize)> {
    let mut authorities = Vec::new();
    let mut i = 0;
    while i + 2 < chars.len() {
        if chars[i] == ':' && chars[i + 1] == '/' && chars[i + 2] == '/' {
            let start = i + 3;
            let mut end = start;
            while end < chars.len() && !matches!(chars[end], '/' | '?' | '#') && !is_stop(chars[end]) {
                end += 1;
            }
            authorities.push((i, end));
            if let Some(at) = (start..end).rev().find(|&k| chars[k] == '@') {
                if let Some(colon) = (start..at).find(|&k| chars[k] == ':') {
                    if colon + 1 < at {
                        spans.push((colon + 1, at));
                    }
                }
            }
            i = end;
        } else {
            i += 1;
        }
    }
    authorities
}

/// Règles propres au contenu d'un mot : `CLÉ=valeur`, `nom: valeur`, URL.
/// Renvoie ce que le mot suivant doit subir quand la valeur y est reportée
/// (`Authorization:` seul, `… Bearer` en fin de mot).
fn scan_word(chars: &[char], spans: &mut Vec<(usize, usize)>) -> Next {
    let authorities = url_credentials(chars, spans);
    let in_authority = |k: usize| authorities.iter().any(|&(a, b)| k >= a && k < b);
    let mut next = Next::Nothing;

    // Affectation en tête de mot (`X_PASS=…`, `--password=…`) : toute la
    // valeur, quelle qu'elle soit.
    let first_eq = chars.iter().position(|&c| c == '=');
    let mut leading_done = None;
    if let Some(k) = first_eq {
        let name: String = chars[..k].iter().collect();
        if k > 0 && name.trim_start_matches('-').chars().all(is_ident) && sensitive_key(&name) {
            if k + 1 < chars.len() {
                spans.push((k + 1, chars.len()));
            }
            leading_done = Some(k);
        }
    }

    for k in 0..chars.len() {
        match chars[k] {
            // `?api_key=…&` dans une URL, `token=…` au milieu d'un argument.
            '=' if leading_done.is_none() => {
                let name = name_before(chars, k);
                if sensitive_key(&name) {
                    let start = k + 1;
                    let end = word_end(chars, start);
                    if end > start {
                        spans.push((start, end));
                    }
                }
            }
            // `X-API-Key: …`, `Authorization: token …`, `{"password": "…"}`.
            ':' if !in_authority(k) && leading_done.is_none() => {
                let name = name_before(chars, k);
                if name.is_empty() || !(sensitive_header(&name) || sensitive_key(&name)) {
                    continue;
                }
                let mut at = skip(chars, k + 1, |c| c.is_whitespace() || c == '"' || c == '\'');
                if at >= chars.len() {
                    next = Next::SchemeThenWord;
                    continue;
                }
                let scheme_end = word_end(chars, at);
                let scheme: String = chars[at..scheme_end].iter().collect::<String>().to_ascii_lowercase();
                if SCHEMES.contains(&scheme.as_str()) {
                    at = skip(chars, scheme_end, char::is_whitespace);
                    if at >= chars.len() {
                        next = Next::Word;
                        continue;
                    }
                }
                let end = word_end(chars, at);
                if end > at {
                    spans.push((at, end));
                }
            }
            _ => {}
        }
    }
    next
}

/// Masque les secrets visibles dans une commande. La commande reste rejouable
/// à l'œil ; le secret n'atterrit ni dans le journal ni à côté des figures.
/// Voir l'en-tête du module pour les formes couvertes.
pub fn redact_command(command: &str) -> String {
    let words = lex(command);
    let mut raw_spans: Vec<(usize, usize)> = Vec::new();
    let mut next = Next::Nothing;
    let mut mysql = false;
    let mut sshpass = false;

    for word in &words {
        let chars = &word.chars;
        let text = word.text();
        let lower = text.to_ascii_lowercase();
        let mut spans: Vec<(usize, usize)> = Vec::new();
        let pending = std::mem::replace(&mut next, Next::Nothing);
        match pending {
            Next::Whole if !chars.is_empty() => spans.push((0, chars.len())),
            Next::AfterColon => {
                if let Some(colon) = chars.iter().position(|&c| c == ':') {
                    if colon + 1 < chars.len() {
                        spans.push((colon + 1, chars.len()));
                    }
                }
            }
            Next::SchemeThenWord if SCHEMES.contains(&lower.as_str()) => next = Next::Word,
            Next::SchemeThenWord | Next::Word => {
                let end = word_end(chars, 0);
                if end > 0 {
                    spans.push((0, end));
                }
            }
            _ => {}
        }
        if pending == Next::Nothing || pending == Next::AfterColon {
            let program = lower.rsplit('/').next().unwrap_or("");
            if MYSQL_FAMILY.contains(&program) {
                mysql = true;
            } else if program == "sshpass" {
                sshpass = true;
            }
            if lower == "bearer" {
                next = Next::Word;
            } else if matches!(lower.as_str(), "-u" | "--user" | "--proxy-user") {
                next = Next::AfterColon;
            } else if let Some(rest) = ["--user=", "--proxy-user="]
                .iter()
                .find_map(|prefix| lower.strip_prefix(prefix).map(|_| prefix.len()))
            {
                if let Some(colon) = chars[rest..].iter().position(|&c| c == ':') {
                    if rest + colon + 1 < chars.len() {
                        spans.push((rest + colon + 1, chars.len()));
                    }
                }
            } else if lower.starts_with("-u") && !lower.starts_with("--") && chars.len() > 2 && chars.contains(&':') {
                let colon = chars.iter().position(|&c| c == ':').unwrap();
                if colon + 1 < chars.len() {
                    spans.push((colon + 1, chars.len()));
                }
            } else if (mysql || sshpass) && lower.starts_with("-p") && !lower.starts_with("--") && chars.len() > 2 {
                spans.push((2, chars.len()));
            } else if (sshpass && lower == "-p")
                || (lower.starts_with("--")
                    && !lower.contains('=')
                    && !lower[2..].starts_with("no-")
                    && sensitive_key(&lower))
            {
                next = Next::Whole;
            } else {
                let carried = scan_word(chars, &mut spans);
                if carried != Next::Nothing {
                    next = carried;
                }
            }
        }
        for (start, end) in spans {
            if start < end && end <= chars.len() {
                raw_spans.push((word.raw[start].0, word.raw[end - 1].1));
            }
        }
    }

    if raw_spans.is_empty() {
        return command.to_string();
    }
    raw_spans.sort_unstable();
    let mut merged: Vec<(usize, usize)> = Vec::new();
    for (start, end) in raw_spans {
        match merged.last_mut() {
            Some(last) if start <= last.1 => last.1 = last.1.max(end),
            _ => merged.push((start, end)),
        }
    }
    let mut out = String::with_capacity(command.len());
    let mut cursor = 0;
    for (start, end) in merged {
        out.push_str(&command[cursor..start]);
        out.push_str("***");
        cursor = end;
    }
    out.push_str(&command[cursor..]);
    out
}

#[cfg(test)]
mod tests {
    use super::redact_command as r;

    #[test]
    fn formes_historiques_toujours_masquees() {
        assert_eq!(
            r("GITHUB_TOKEN=abc123 curl -H Authorization: Bearer xyz https://u:pw@h/x"),
            "GITHUB_TOKEN=*** curl -H Authorization: Bearer *** https://u:***@h/x"
        );
        assert_eq!(r("tool --password hunter2 run"), "tool --password *** run");
        assert_eq!(r("wget --password=abc --http-password=def u"), "wget --password=*** --http-password=*** u");
        assert_eq!(r("python3 plot.py --region=sask"), "python3 plot.py --region=sask");
    }

    #[test]
    fn curl_utilisateur_et_mot_de_passe() {
        assert_eq!(
            r("curl -u thierry:Glacier2026 https://n5eil01u.ecs.nsidc.org/x"),
            "curl -u thierry:*** https://n5eil01u.ecs.nsidc.org/x"
        );
        assert_eq!(r("curl --user thierry:pw https://h"), "curl --user thierry:*** https://h");
        assert_eq!(r("curl --user=thierry:pw https://h"), "curl --user=thierry:*** https://h");
        assert_eq!(r("curl -uthierry:pw https://h"), "curl -uthierry:*** https://h");
        // `-u` sans `:` (python non tamponné, curl qui demandera) : intact.
        assert_eq!(r("python -u scripts/fig3.py"), "python -u scripts/fig3.py");
        assert_eq!(r("curl -u thierry https://h"), "curl -u thierry https://h");
    }

    #[test]
    fn en_tetes_http_secrets() {
        assert_eq!(
            r(r#"curl -H "X-API-Key: abc123secret" https://api.example.org"#),
            r#"curl -H "X-API-Key: ***" https://api.example.org"#
        );
        assert_eq!(
            r("curl -H 'Authorization: token ghp_abcdef123' https://api.github.com/user"),
            "curl -H 'Authorization: token ***' https://api.github.com/user"
        );
        assert_eq!(
            r(r#"curl --header="Authorization: Bearer eyJhbGc.x.y" u"#),
            r#"curl --header="Authorization: Bearer ***" u"#
        );
        assert_eq!(
            r("curl -H Authorization: token ghp_abc u"),
            "curl -H Authorization: token *** u"
        );
        // Un en-tête ordinaire reste lisible.
        assert_eq!(
            r(r#"curl -H "Content-Type: application/json" -H "Accept: */*" u"#),
            r#"curl -H "Content-Type: application/json" -H "Accept: */*" u"#
        );
    }

    #[test]
    fn mysql_mot_de_passe_colle() {
        assert_eq!(r("mysql -u root -pS3cret glaciers"), "mysql -u root -p*** glaciers");
        assert_eq!(r("/usr/bin/mysqldump -pS3cret db > d.sql"), "/usr/bin/mysqldump -p*** db > d.sql");
        assert_eq!(r("sshpass -p S3cret ssh narval"), "sshpass -p *** ssh narval");
        // Hors de la famille mysql, `-p` garde son sens (mkdir -p, ssh -p 22).
        assert_eq!(r("mkdir -p out && ssh -p 2222 h"), "mkdir -p out && ssh -p 2222 h");
    }

    #[test]
    fn export_et_variables_d_environnement() {
        assert_eq!(
            r("export EARTHDATA_PASS=xyz && python dl.py"),
            "export EARTHDATA_PASS=*** && python dl.py"
        );
        assert_eq!(r(r#"export X_PASS="a b c""#), r#"export X_PASS="***""#);
        assert_eq!(r("MYSQL_PWD=abc mysql db"), "MYSQL_PWD=*** mysql db");
        assert_eq!(r("CDSAPI_KEY=1:abc python era5.py"), "CDSAPI_KEY=*** python era5.py");
        assert_eq!(r("cd /tmp && PWD=/x ls"), "cd /tmp && PWD=/x ls");
    }

    #[test]
    fn tabulations_et_retours_a_la_ligne_preserves() {
        assert_eq!(r("PASSWORD=abc\tpython plot.py"), "PASSWORD=***\tpython plot.py");
        assert_eq!(
            r("export HF_TOKEN=abc\npython train.py\t--epochs 3"),
            "export HF_TOKEN=***\npython train.py\t--epochs 3"
        );
    }

    #[test]
    fn secrets_dans_une_url_ou_un_script() {
        assert_eq!(
            r(r#"wget "https://h/x?api_key=abc&format=nc" -O x.nc"#),
            r#"wget "https://h/x?api_key=***&format=nc" -O x.nc"#
        );
        assert_eq!(
            r(r#"python -c 'requests.get(u, headers={"Authorization": "Bearer tok123"})'"#),
            r#"python -c 'requests.get(u, headers={"Authorization": "Bearer ***"})'"#
        );
        assert_eq!(
            r("git clone https://thierry:ghp_x@github.com/t/these.git"),
            "git clone https://thierry:***@github.com/t/these.git"
        );
    }

    #[test]
    fn commande_sans_secret_rendue_a_l_identique() {
        for command in [
            "python3 scripts/make_fig3.py --dpi 300",
            "cat <<'EOF' > a.py\nprint('x: y')\nEOF",
            "ls -la\t'mon dossier'",
            "echo \"a\\\"b\"",
        ] {
            assert_eq!(r(command), command);
        }
    }
}
