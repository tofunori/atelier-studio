//! Graphiques d'Excel intégrés (`c:chart`) : Word les redessine d'après les
//! valeurs gardées en cache dans `word/charts/chartN.xml`. Le moteur les rend
//! en SVG à la taille du cadre (2026-11-13, des TP de conductivité
//! hydraulique où la figure H/Ho en fonction du temps restait un petit cadre
//! vide). Valeurs synthétiques : aucune copie d'étudiant dans le dépôt.

mod common;

use atelier_docx::Docx;
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;

const C: &str = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const A: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/// La fixture, sa figure remplacée par un graphique (`rId5` → `charts/chart1.xml`).
fn with_chart(chart: &str, theme: Option<&str>) -> Docx {
    let src = common::build("christophe");
    let mut zin = zip::ZipArchive::new(Cursor::new(src)).unwrap();
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for i in 0..zin.len() {
        let mut f = zin.by_index(i).unwrap();
        let name = f.name().to_string();
        let mut bytes = Vec::new();
        f.read_to_end(&mut bytes).unwrap();
        let text = || String::from_utf8(bytes.clone()).unwrap();
        let bytes = match name.as_str() {
            "word/media/image1.png" => continue,
            "word/_rels/document.xml.rels" => text()
                .replace(
                    r#"Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png""#,
                    r#"Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml""#,
                )
                .into_bytes(),
            "word/document.xml" => {
                let d = text();
                let start = d.find(r#"<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">"#).unwrap();
                let end = d[start..].find("</a:graphicData>").unwrap() + start + "</a:graphicData>".len();
                let chart = format!(r#"<a:graphicData uri="{C}"><c:chart xmlns:c="{C}" xmlns:r="{R}" r:id="rId5"/></a:graphicData>"#);
                let d = format!("{}{}{}", &d[..start], chart, &d[end..]);
                d.replacen(r#"<wp:extent cx="914400" cy="914400"/>"#, r#"<wp:extent cx="5943600" cy="3291840"/>"#, 1).into_bytes()
            }
            "[Content_Types].xml" => text()
                .replace(
                    "</Types>",
                    r#"<Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>"#,
                )
                .into_bytes(),
            _ => bytes,
        };
        out.start_file(name, SimpleFileOptions::default()).unwrap();
        out.write_all(&bytes).unwrap();
    }
    out.start_file("word/charts/chart1.xml", SimpleFileOptions::default()).unwrap();
    out.write_all(chart.as_bytes()).unwrap();
    if let Some(t) = theme {
        out.start_file("word/theme/theme1.xml", SimpleFileOptions::default()).unwrap();
        out.write_all(t.as_bytes()).unwrap();
    }
    Docx::from_bytes(out.finish().unwrap().into_inner()).unwrap()
}

fn gray(lum_mod: u32, lum_off: u32) -> String {
    format!(r#"<a:solidFill><a:schemeClr val="tx1"><a:lumMod val="{lum_mod}"/><a:lumOff val="{lum_off}"/></a:schemeClr></a:solidFill>"#)
}

fn rich(text: &str, sz: u32, rot: Option<i64>) -> String {
    let rot = rot.map(|r| format!(r#" rot="{r}" vert="horz""#)).unwrap_or_default();
    format!(
        r#"<c:tx><c:rich><a:bodyPr{rot}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="{sz}" b="0">{}</a:defRPr></a:pPr><a:r><a:rPr lang="fr-FR"/><a:t>{text}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/>"#,
        gray(65000, 35000)
    )
}

fn cache(tag: &str, code: Option<&str>, vals: &[Option<f64>]) -> String {
    let mut s = format!("<c:{tag}>");
    if let Some(c) = code {
        s.push_str(&format!("<c:formatCode>{c}</c:formatCode>"));
    }
    s.push_str(&format!(r#"<c:ptCount val="{}"/>"#, vals.len()));
    for (i, v) in vals.iter().enumerate() {
        if let Some(v) = v {
            s.push_str(&format!(r#"<c:pt idx="{i}"><c:v>{v}</c:v></c:pt>"#));
        }
    }
    s.push_str(&format!("</c:{tag}>"));
    s
}

fn axis(id: u32, cross: u32, pos: &str, title: &str, log: bool, lbl: &str) -> String {
    let log = if log { r#"<c:logBase val="10"/>"# } else { "" };
    let rot = if pos == "l" { Some(-5_400_000) } else { None };
    format!(
        r#"<c:valAx><c:axId val="{id}"/><c:scaling>{log}<c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="{pos}"/><c:majorGridlines><c:spPr><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">{}<a:round/></a:ln></c:spPr></c:majorGridlines><c:title>{}</c:title><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="{lbl}"/><c:spPr><a:noFill/><a:ln w="9525">{}</a:ln></c:spPr><c:txPr><a:bodyPr rot="-60000000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900">{}</a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr><c:crossAx val="{cross}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>"#,
        gray(15000, 85000),
        rich(title, 1000, rot),
        gray(25000, 75000),
        gray(65000, 35000)
    )
}

/// Un nuage de points comme celui des TP : points seuls (trait `noFill`),
/// marqueurs ronds, axe des y logarithmique au besoin, titres riches,
/// couleurs du thème retouchées en luminance.
fn scatter(x: &str, y: &[Option<f64>], log: bool, trend: bool, y_lbl: &str) -> String {
    let trend = if trend {
        r#"<c:trendline><c:spPr><a:ln w="19050" cap="rnd"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:prstDash val="sysDot"/></a:ln></c:spPr><c:trendlineType val="linear"/><c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>"#
    } else {
        ""
    };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="{C}" xmlns:a="{A}" xmlns:r="{R}"><c:date1904 val="0"/><c:lang val="fr-FR"/><c:roundedCorners val="0"/><c:chart><c:title>{}</c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:spPr><a:ln w="25400" cap="rnd"><a:noFill/><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:ln w="9525"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></c:spPr></c:marker>{trend}<c:xVal>{x}</c:xVal><c:yVal><c:numRef><c:f>Feuil1!$E$3:$E$9</c:f>{}</c:numRef></c:yVal><c:smooth val="0"/></c:ser><c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls><c:axId val="1"/><c:axId val="2"/></c:scatterChart>{}{}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:ln w="9525">{}</a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr></c:chartSpace>"#,
        rich("Figure H/Ho en fonction du temps", 1400, None),
        cache("numCache", Some("0.000"), y),
        axis(1, 2, "b", "Temps (s)", false, "nextTo"),
        axis(2, 1, "l", "H/Ho", log, y_lbl),
        gray(15000, 85000),
    )
}

fn times() -> Vec<Option<f64>> {
    [120.0, 300.0, 540.0, 900.0, 1380.0, 2280.0, 3480.0].map(Some).to_vec()
}

fn ratios() -> Vec<Option<f64>> {
    // Une descente exponentielle synthétique, avec un trou (idx 3).
    let mut v: Vec<Option<f64>> = times().iter().map(|t| t.map(|t| (-0.0011 * (t - 120.0)).exp())).collect();
    v[3] = None;
    v
}

fn numeric_x() -> String {
    format!("<c:numRef><c:f>Feuil1!$B$3:$B$9</c:f>{}</c:numRef>", cache("numCache", Some("General"), &times()))
}

fn svg(mut d: Docx) -> String {
    let (bytes, mime) = atelier_docx::objects::media(&mut d, "p11", "rId5").unwrap().unwrap();
    assert_eq!(mime, "image/svg+xml");
    let s = String::from_utf8(bytes).unwrap();
    // CHART_DUMP=<dossier> : garde chaque rendu pour le regarder.
    if let Ok(dir) = std::env::var("CHART_DUMP") {
        let name = std::thread::current().name().unwrap_or("rendu").replace("::", "-");
        std::fs::write(format!("{dir}/{name}.svg"), &s).unwrap();
    }
    s
}

/// Centres des marqueurs ronds (x, y), dans l'ordre du dessin.
fn dots(svg: &str) -> Vec<(f64, f64)> {
    svg.split("<circle ")
        .skip(1)
        .map(|c| {
            let get = |k: &str| {
                let s = c.find(&format!("{k}=\"")).unwrap() + k.len() + 2;
                c[s..s + c[s..].find('"').unwrap()].parse::<f64>().unwrap()
            };
            (get("cx"), get("cy"))
        })
        .collect()
}

fn texts(svg: &str) -> Vec<String> {
    svg.split("<text ").skip(1).map(|t| t[t.find('>').unwrap() + 1..t.find("</text>").unwrap()].to_string()).collect()
}

#[test]
fn le_graphique_est_une_figure_du_modele() {
    let mut d = with_chart(&scatter(&numeric_x(), &ratios(), false, false, "nextTo"), None);
    let m = d.model().unwrap();
    let seg = m.paragraphs.iter().flat_map(|p| &p.segments).find(|s| s.media.as_deref() == Some("rId5")).expect("le graphique devient une figure");
    // 5 943 600 × 3 291 840 EMU = 624 × 345,6 px à 96 ppp.
    assert_eq!((seg.width, seg.height), (Some(624), Some(345)));
}

#[test]
fn un_nuage_de_points_se_dessine_avec_ses_valeurs_en_cache() {
    let s = svg(with_chart(&scatter(&numeric_x(), &ratios(), false, false, "nextTo"), None));
    assert!(s.starts_with("<svg"), "{}", &s[..200.min(s.len())]);
    let t = texts(&s);
    for want in ["Figure H/Ho en fonction du temps", "Temps (s)", "H/Ho"] {
        assert!(t.iter().any(|x| x == want), "{want} manque : {t:?}");
    }
    // Six points (le trou de l'indice 3 reste un trou), sans trait entre eux.
    let p = dots(&s);
    assert_eq!(p.len(), 6, "{p:?}");
    assert!(!s.contains(r#"fill="none" stroke-linejoin"#), "points seuls : pas de trait");
    // Le temps croît vers la droite, H/Ho décroît vers le bas.
    assert!(p.windows(2).all(|w| w[1].0 > w[0].0 && w[1].1 > w[0].1), "{p:?}");
    // Marqueurs à la couleur accent1 du thème Office, quadrillage gris clair.
    assert!(s.contains(r##"fill="#4472C4""##));
    assert!(s.contains(r##"stroke="#D9D9D9""##));
    // Graduations à la française, au format des valeurs (« 0.000 », lié à
    // la source comme dans Excel), axe des x « rond » de 0 à 4000.
    assert!(t.iter().any(|x| x == "0,200") && t.iter().any(|x| x == "4000"), "{t:?}");
}

#[test]
fn l_axe_logarithmique_gradue_par_puissances_de_dix() {
    let s = svg(with_chart(&scatter(&numeric_x(), &ratios(), true, false, "nextTo"), None));
    let t = texts(&s);
    assert!(t.iter().any(|x| x == "0,010") && t.iter().any(|x| x == "0,100") && t.iter().any(|x| x == "1,000"), "{t:?}");
    // Sur une échelle log, une décroissance exponentielle est une droite :
    // pentes égales entre points également espacés en temps.
    let p = dots(&s);
    let slope = |a: (f64, f64), b: (f64, f64)| (b.1 - a.1) / (b.0 - a.0);
    let (s1, s2) = (slope(p[0], p[1]), slope(p[3], p[5]));
    assert!((s1 - s2).abs() < 1e-3 * s1.abs().max(1.0), "{s1} ≠ {s2}");
}

#[test]
fn des_abscisses_en_texte_se_tracent_au_rang_du_point_comme_dans_word() {
    // Nombres stockés comme du texte dans Excel : Word trace x = 1, 2, 3…
    let mut strs = String::from(r#"<c:strRef><c:f>Feuil1!$A$3:$A$9</c:f><c:strCache><c:ptCount val="7"/>"#);
    for (i, t) in times().iter().enumerate() {
        strs.push_str(&format!(r#"<c:pt idx="{i}"><c:v>{}</c:v></c:pt>"#, t.unwrap()));
    }
    strs.push_str("</c:strCache></c:strRef>");
    let s = svg(with_chart(&scatter(&strs, &ratios(), false, false, "nextTo"), None));
    let p = dots(&s);
    let gaps: Vec<f64> = p.windows(2).map(|w| w[1].0 - w[0].0).collect();
    // Points 1, 2, 3, 5, 6, 7 : écarts réguliers, double au-dessus du trou.
    assert!((gaps[0] - gaps[1]).abs() < 0.05 && (gaps[2] - 2.0 * gaps[0]).abs() < 0.05, "{gaps:?}");
    let t = texts(&s);
    assert!(t.iter().any(|x| x == "8") && !t.iter().any(|x| x == "3480"), "{t:?}");
}

#[test]
fn la_courbe_de_tendance_suit_les_points_en_pointille() {
    let s = svg(with_chart(&scatter(&numeric_x(), &ratios(), false, true, "nextTo"), None));
    let trend = s.split("<path ").skip(1).find(|p| p.contains("stroke-dasharray")).expect("courbe de tendance pointillée");
    assert!(trend.contains(r##"stroke="#4472C4""##), "{trend}");
}

#[test]
fn les_libelles_bas_restent_sous_la_zone_quand_les_valeurs_sont_negatives() {
    // log10(H/Ho) : valeurs négatives, l'axe des x croise en y = 0 (en haut),
    // ses libellés « bas » (tickLblPos low) restent en bas.
    let logs: Vec<Option<f64>> = ratios().iter().map(|v| v.map(f64::log10)).collect();
    let s = svg(with_chart(&scatter(&numeric_x(), &logs, false, false, "nextTo").replacen(r#"<c:tickLblPos val="nextTo"/>"#, r#"<c:tickLblPos val="low"/>"#, 1), None));
    let y_of = |label: &str| {
        let i = s.find(&format!(">{label}</text>")).unwrap();
        let t = &s[s[..i].rfind("<text ").unwrap()..i];
        let k = t.find(" y=\"").unwrap() + 4;
        t[k..k + t[k..].find('"').unwrap()].parse::<f64>().unwrap()
    };
    let p = dots(&s);
    let lowest = p.iter().map(|q| q.1).fold(f64::MIN, f64::max);
    assert!(y_of("4000") > lowest, "les libellés de x doivent être sous les points");
}

#[test]
fn les_couleurs_viennent_du_theme_du_document() {
    let theme = format!(
        r#"<?xml version="1.0"?><a:theme xmlns:a="{A}" name="T"><a:themeElements><a:clrScheme name="T"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0E2841"/></a:dk2><a:lt2><a:srgbClr val="E8E8E8"/></a:lt2><a:accent1><a:srgbClr val="156082"/></a:accent1><a:accent2><a:srgbClr val="E97132"/></a:accent2><a:accent3><a:srgbClr val="196B24"/></a:accent3><a:accent4><a:srgbClr val="0F9ED5"/></a:accent4><a:accent5><a:srgbClr val="A02B93"/></a:accent5><a:accent6><a:srgbClr val="4EA72E"/></a:accent6><a:hlink><a:srgbClr val="467886"/></a:hlink><a:folHlink><a:srgbClr val="96607D"/></a:folHlink></a:clrScheme><a:fontScheme name="T"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>"#
    );
    let s = svg(with_chart(&scatter(&numeric_x(), &ratios(), false, false, "nextTo"), Some(&theme)));
    assert!(s.contains(r##"fill="#156082""##), "accent1 du thème");
    assert!(s.contains("font-family=\"Aptos, "), "police du thème");
}

#[test]
fn un_graphique_illisible_laisse_un_cadre_qui_le_dit() {
    let s = svg(with_chart(&format!(r#"<?xml version="1.0"?><c:chartSpace xmlns:c="{C}"><c:chart><c:plotArea/></c:chart></c:chartSpace>"#), None));
    assert!(s.contains("Graphique Excel"), "{s}");
}

#[test]
fn le_rendu_suit_la_taille_du_cadre() {
    let mut d = with_chart(&scatter(&numeric_x(), &ratios(), false, false, "nextTo"), None);
    let raw = atelier_docx::objects::media_raw(&mut d, "p11", "rId5").unwrap().unwrap();
    assert_eq!(raw.1, atelier_docx::chart::MIME);
    let (bytes, _) = atelier_docx::objects::render(raw, None, Some((624.0, 345.0)));
    let s = String::from_utf8(bytes).unwrap();
    assert!(s.contains(r#"viewBox="0 0 624.00 345.00""#), "{}", &s[..120]);
}

/// Abscisse et ordonnée d'un `<text>` (x, y, ou le translate d'un texte tourné).
fn text_at(s: &str, label: &str) -> (f64, f64) {
    let i = s.find(&format!(">{label}</text>")).unwrap_or_else(|| panic!("{label} absent"));
    let t = &s[s[..i].rfind("<text ").unwrap()..i];
    if let Some(k) = t.find("translate(") {
        let inner = &t[k + 10..k + 10 + t[k + 10..].find(')').unwrap()];
        let mut it = inner.split(' ').map(|v| v.parse::<f64>().unwrap());
        return (it.next().unwrap(), it.next().unwrap());
    }
    let get = |key: &str| {
        let k = t.find(&format!(" {key}=\"")).unwrap() + key.len() + 3;
        t[k..k + t[k..].find('"').unwrap()].parse::<f64>().unwrap()
    };
    (get("x"), get("y"))
}

/// Haut et bas d'une découpe (`clipPath`).
fn clip(s: &str, id: &str) -> (f64, f64) {
    let i = s.find(&format!(r#"<clipPath id="{id}"><rect "#)).unwrap();
    let r = &s[i..i + s[i..].find("/>").unwrap()];
    let get = |k: &str| {
        let k0 = r.find(&format!(" {k}=\"")).unwrap() + k.len() + 3;
        r[k0..k0 + r[k0..].find('"').unwrap()].parse::<f64>().unwrap()
    };
    (get("y"), get("y") + get("height"))
}

#[test]
fn un_long_titre_passe_a_la_ligne_au_lieu_d_etre_coupe() {
    let long = "Figure 2 : rapport H/Ho en fonction du temps pour l'essai à charge variable du puits P3";
    let s = svg(with_chart(&scatter(&numeric_x(), &ratios(), false, false, "nextTo").replace("Figure H/Ho en fonction du temps", long), None));
    let t = texts(&s);
    assert!(!t.iter().any(|x| x == long), "le titre tient sur plusieurs lignes : {t:?}");
    let lines: Vec<&String> = t.iter().filter(|x| long.contains(x.as_str()) && x.contains(' ')).collect();
    assert!(lines.len() >= 2, "{t:?}");
    assert_eq!(lines.iter().map(|l| l.as_str()).collect::<Vec<_>>().join(" "), long);
    // Les points restent sous le titre.
    let (_, last_line) = text_at(&s, lines.last().unwrap());
    assert!(dots(&s).iter().all(|p| p.1 > last_line), "zone de traçage repoussée sous le titre");
}

#[test]
fn le_titre_d_axe_place_a_la_main_reste_a_sa_place() {
    let layout = r#"<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.25"/><c:y val="0.9"/></c:manualLayout></c:layout>"#;
    let chart = scatter(&numeric_x(), &ratios(), false, false, "nextTo").replacen("Temps (s)</a:t></a:r></a:p></c:rich></c:tx>", &format!("Temps (s)</a:t></a:r></a:p></c:rich></c:tx>{layout}"), 1);
    let s = svg(with_chart(&chart, None));
    let (x, y) = text_at(&s, "Temps (s)");
    // Rendu par défaut 480 × 288 : 0,25 × 480 = 120 (bord gauche du cadre
    // du titre, plus sa marge) ; 0,9 × 288 ≈ 259 (haut du cadre).
    assert!((x - 124.0).abs() < 2.0, "x = {x}");
    assert!(y > 259.0 && y < 276.0, "y = {y}");
}

#[test]
fn les_petites_graduations_s_ajoutent_aux_grandes() {
    let base = scatter(&numeric_x(), &ratios(), false, false, "nextTo").replacen(r#"<c:majorTickMark val="none"/>"#, r#"<c:majorTickMark val="out"/>"#, 1);
    let with_minor = base.replacen(r#"<c:minorTickMark val="none"/>"#, r#"<c:minorTickMark val="cross"/>"#, 1);
    let n = |s: &str| s.matches("<line ").count();
    let (a, b) = (svg(with_chart(&base, None)), svg(with_chart(&with_minor, None)));
    // 0 à 4000 par 500 : 4 petites graduations entre deux grandes.
    assert_eq!(n(&b) - n(&a), 8 * 4, "{} → {}", n(&a), n(&b));
}

#[test]
fn l_axe_qui_croise_en_haut_ne_laisse_pas_de_bande_vide_en_bas() {
    // Valeurs négatives, libellés « à côté de l'axe » : l'axe des x et ses
    // libellés sont en haut ; la zone de traçage descend jusqu'au titre d'axe.
    let logs: Vec<Option<f64>> = ratios().iter().map(|v| v.map(f64::log10)).collect();
    let s = svg(with_chart(&scatter(&numeric_x(), &logs, false, false, "nextTo"), None));
    let (_, plot_bottom) = clip(&s, "pl");
    let (_, title_y) = text_at(&s, "Temps (s)");
    assert!(title_y - plot_bottom < 20.0, "bande vide entre la zone ({plot_bottom}) et le titre d'axe ({title_y})");
    // Libellés des x en haut, près de l'axe y = 0.
    let (_, label_y) = text_at(&s, "4000");
    assert!(label_y < plot_bottom / 2.0, "libellés des x en haut : {label_y}");
}

#[test]
fn les_traits_s_arretent_au_bord_de_la_zone_et_les_points_peuvent_deborder() {
    let s = svg(with_chart(&scatter(&numeric_x(), &ratios(), false, true, "nextTo"), None));
    let attr = |id: &str, k: &str| {
        let i = s.find(&format!(r#"<clipPath id="{id}"><rect "#)).unwrap();
        let r = &s[i..i + s[i..].find("/>").unwrap()];
        let k0 = r.find(&format!(" {k}=\"")).unwrap() + k.len() + 3;
        r[k0..k0 + r[k0..].find('"').unwrap()].parse::<f64>().unwrap()
    };
    let (lx, lw) = (attr("pl", "x"), attr("pl", "width"));
    let (mx, mw) = (attr("pm", "x"), attr("pm", "width"));
    assert!(mx < lx && mw > lw, "les marqueurs ont une marge, pas les traits");
    let trend = s.find("stroke-dasharray").unwrap();
    assert!(s[..trend].rfind(r#"clip-path="url(#pl)""#).is_some(), "la tendance est coupée au bord exact");
}
