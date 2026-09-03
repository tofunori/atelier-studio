//! Tool schema for `atelier_sessions`.

use serde_json::{json, Value};

pub const TOOL_NAME: &str = "atelier_sessions";

pub fn tool_definition() -> Value {
    json!({
        "name": TOOL_NAME,
        "description": "Inspect and coordinate Atelier linked-agent sessions. Use action=help for details.",
        "inputSchema": {
            "type": "object",
            "required": ["action"],
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "help",
                        "current",
                        "list",
                        "inspect",
                        "read_context",
                        "wait",
                        "send_message",
                        "report_to_parent"
                    ]
                },
                "targetThreadId": { "type": "string" },
                "requestId": { "type": "string" },
                "afterSequence": { "type": ["integer", "null"] },
                "beforeSequence": { "type": ["integer", "null"] },
                "limit": { "type": "integer" },
                "includeTools": { "type": "boolean" },
                "text": { "type": ["string", "null"] },
                "report": { "type": ["object", "null"] },
                "timeoutMs": { "type": "integer" },
                "traceId": { "type": "string" },
                "hop": { "type": "integer" }
            },
            "additionalProperties": false
        }
    })
}

pub const WIDGET_TOOL_NAME: &str = "atelier_widget";

pub fn widget_tool_definition() -> Value {
    json!({
        "name": WIDGET_TOOL_NAME,
        "description": "Affiche un panneau interactif (curseur, graphique, calculateur) \
    DANS le fil du chat. Si l'utilisateur demande un widget, un panneau ou une visualisation \
    interactive : appelle CET outil — jamais de fichier HTML sur disque, jamais de \
    navigateur. Première utilisation dans cette session : appelle d'abord \
    atelier_widget_guide pour le mode d'emploi complet (formes, thème, mécanique). Passe un FRAGMENT compact (sans <html>/<head>/<body>), autonome : aucun \
    réseau ni bibliothèque, calcul en JS local, données en dur, couleurs via les variables \
    CSS injectées (--fg, --muted, --border, --accent).",
        "inputSchema": {
            "type": "object",
            "required": ["html", "title", "height"],
            "properties": {
                "html": { "type": "string", "description": "Contenu de la page" },
                "title": { "type": "string", "description": "Titre court affiché dans la barre (80 caractères max)" },
                "height": { "type": "integer", "description": "Hauteur du panneau en pixels, de 120 à 900" }
            },
            "additionalProperties": false
        }
    })
}

pub const WIDGET_GUIDE_TOOL_NAME: &str = "atelier_widget_guide";

/// Mode d'emploi copieux, chargé UNIQUEMENT quand l'agent va écrire un widget
/// (patron « read_me » de Claude Desktop) : la description d'atelier_widget
/// reste courte à chaque tour, le guide ne coûte que lors de l'usage réel.
/// Servi localement par le shim — aucun aller-retour vers le pont.
pub fn widget_guide_tool_definition() -> Value {
    json!({
        "name": WIDGET_GUIDE_TOOL_NAME,
        "description": "Mode d'emploi d'atelier_widget : structure du fragment, thème, \
    fonctions du pont, exemple complet à calquer. À appeler une fois avant d'écrire \
    ton premier widget de la session.",
        "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
    })
}

pub fn widget_guide_text() -> Value {
    json!({
        "manuel": include_str!("widget_guide_manuel.md"),
        "regles": [
            "Un widget = un FRAGMENT HTML compact inclus dans le fil du chat. JAMAIS de fichier sur disque, JAMAIS d'ouverture de navigateur, JAMAIS de page complète (<html>/<head>/<body> interdits).",
            "Autonome : aucun fetch/XHR, aucun CDN, aucune bibliothèque, aucune police distante. Tout le calcul en JS local, les données écrites en dur dans le fragment.",
            "Sobre mais VIVANT : ~100-150 lignes. Un panneau, pas une application — mais un panneau qu'on a envie de manipuler.",
            "height obligatoire (120-900 px) : compte ~40 px par rangée de contrôles, ~90-150 px par graphique. Un contenu qui dépasse scrolle DANS le panneau."
        ],
        "theme": [
            "Les couleurs viennent des variables CSS injectées par l'hôte : var(--fg) texte, var(--fg2) secondaire, var(--muted) libellés, var(--border) traits, var(--accent) LA seule couleur d'accent, var(--bg-card) fond de carte.",
            "Donne toujours un repli : var(--accent, #e77f3e). N'invente AUCUNE autre palette. Fond transparent (l'hôte peint derrière).",
            "Tailles de texte : 10-13 px. Chiffres alignés : font-variant-numeric: tabular-nums."
        ],
        "pont": {
            "sendPrompt": "sendPrompt(texte) — propose un message dans le composeur du chat ; l'utilisateur le valide lui-même, rien ne part tout seul. Pour un bouton « explique ce panneau », « refais avec ν=8 ».",
            "saveState": "saveState(objet) — mémorise l'état (≤ 4 Ko JSON) pour qu'il survive au défilement du fil. Appelle-le à chaque changement de contrôle.",
            "onRestore": "window.onRestore = (etat) => {...} — reçoit l'état mémorisé quand le panneau remonte. etat peut être undefined : repars alors des valeurs par défaut."
        },
        "exemple": "<div style=\"display:flex;flex-direction:column;gap:12px;font-size:13px\">\n<div style=\"display:flex;align-items:center;gap:12px\">\n<span style=\"font-size:11px;color:var(--muted,#90969d)\">paramètre k</span>\n<input id=\"k\" type=\"range\" min=\"1\" max=\"10\" value=\"3\" style=\"flex:1;accent-color:var(--accent,#e77f3e)\">\n<b id=\"kv\" style=\"font-variant-numeric:tabular-nums\">3</b>\n</div>\n<div><span style=\"font-size:10px;color:var(--muted,#90969d)\">résultat</span>\n<div id=\"out\" style=\"font-size:15px;font-weight:600;color:var(--accent,#e77f3e)\">—</div></div>\n<svg viewBox=\"0 0 400 80\" style=\"width:100%\"><path id=\"c\" fill=\"none\" stroke=\"var(--accent,#e77f3e)\" stroke-width=\"1.5\"/></svg>\n</div>\n<script>\nvar k=document.getElementById(\"k\");\nfunction f(){var v=+k.value;document.getElementById(\"kv\").textContent=v;\ndocument.getElementById(\"out\").textContent=(v*v)+\" unités\";\nvar d=\"\";for(var i=0;i<=100;i++){var x=i/100*10;d+=(i?\"L\":\"M\")+(i*4)+\" \"+(75-70*(x*x)/100).toFixed(1)+\" \";}\ndocument.getElementById(\"c\").setAttribute(\"d\",d);\nif(window.saveState)saveState({k:v});}\nwindow.onRestore=function(s){if(s&&s.k)k.value=s.k;f();};\nk.addEventListener(\"input\",f);f();\n</script>",
        "creativite": [
            "NE COPIE PAS l'exemple tel quel : c'est un squelette de mécanique, pas un gabarit visuel. Choisis la FORME selon la question — deux widgets d'affilée ne doivent pas se ressembler.",
            "Demande-toi d'abord : qu'est-ce que l'utilisateur doit COMPRENDRE en manipulant ? Puis choisis la forme qui rend cette chose tangible, pas celle que tu sais déjà coder.",
            "Un <canvas> est permis et souvent plus vivant qu'un SVG : simulation animée (requestAnimationFrame), champ de particules, tirages aléatoires qui s'accumulent, carte de chaleur dessinée pixel par pixel.",
            "Anime quand le TEMPS porte du sens (convergence, échantillonnage, trajectoire) : un bouton lancer/pause et une boucle requestAnimationFrame valent mieux qu'une courbe figée. Respecte prefers-reduced-motion.",
            "Varie les contrôles : boutons radio pour comparer des scénarios, cases à cocher pour superposer des couches, un clic direct SUR le graphique (position de la souris = paramètre), un champ nombre, pas seulement des curseurs.",
            "Le manuel contient une section « Interactions avancées » (nombre glissable dans la phrase, trace-ta-prédiction, point glissable sur la courbe, brush de plage, petits multiples, équation colorée) : pioche-y pour élever une forme de base.",
            "Utilise sendPrompt pour prolonger la conversation : un bouton « pourquoi ce creux ? » ou « refais avec mes données » rend le panneau conversationnel."
        ],
        "formes": {
            "comparateur": "2-3 boutons radio (scénarios) qui redessinent la même figure — superpose l'ancien tracé en pointillé var(--muted) pour voir le delta.",
            "simulation": "canvas + boucle requestAnimationFrame : des tirages s'accumulent (histogramme qui se remplit, marche aléatoire, pluie de points sous une densité), boutons lancer/pause/réinitialiser.",
            "exploration_2d": "la souris survole le graphique et une lecture suit (crosshair + valeurs), ou un clic pose un point ; le paramètre EST la position.",
            "avant_apres": "une case à cocher bascule entre deux états de la même figure (avec/sans correction, prior/posterior) — transition opacity 140ms.",
            "table_vivante": "petit tableau dont une colonne se recalcule selon un contrôle ; la ligne max/min se surligne var(--accent) automatiquement.",
            "quiz_estimation": "l'utilisateur devine (curseur) PUIS le vrai résultat se révèle à côté de sa réponse — mémorable pour l'intuition.",
            "multi_panneaux": "2-3 petits panneaux liés au même contrôle (la loi, le poids, la conséquence) — c'est la forme du panneau Claude Desktop classique.",
            "formulaire": "3-5 champs (select, cases, nombre) et UN bouton qui compose une demande claire via sendPrompt — l'utilisateur valide dans le composeur. Pour paramétrer une analyse sans taper.",
            "maquette": "proposition d'interface statique-cliquable dans les jetons du thème — montrer une UI en vrai plutôt qu'en prose ; un seul écran.",
            "art_generatif": "canvas animé sobre (accent + gris), seed affiché + bouton régénérer, pause par défaut si prefers-reduced-motion — pour illustrer bruit, champs, attracteurs."
        },
        "appel": "atelier_widget avec { html: <le fragment>, title: <titre court, 80 car. max>, height: <120-900> }. Ne recopie pas le HTML dans ta réponse ensuite : le panneau est déjà affiché."
    })
}

/// Traduit un `tools/call` en couple (action, arguments) pour le pont.
/// `atelier_sessions` porte son action dans ses arguments ; `atelier_widget`
/// est un outil plat dont l'action est fixe.
pub fn bridge_call_for(tool_name: &str, args: &Value) -> Option<(String, Value)> {
    match tool_name {
        WIDGET_TOOL_NAME => Some(("show_widget".to_string(), args.clone())),
        TOOL_NAME => {
            let action = args
                .get("action")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())?;
            Some((action.to_string(), args.clone()))
        }
        _ => None,
    }
}

pub fn help_text() -> Value {
    json!({
        "tool": TOOL_NAME,
        "actions": {
            "help": "This document",
            "current": "Caller identity, parent, children, limits",
            "list": "Directly related threads",
            "inspect": "Metadata + small recent projection (targetThreadId)",
            "read_context": "Paginated projection (targetThreadId, afterSequence/beforeSequence, limit)",
            "wait": "Wait for status/sequence change (timeoutMs max 60000)",
            "send_message": "Queue semantic message (targetThreadId, text, requestId required)",
            "report_to_parent": "Queue structured report to parent (requestId, report/text)"
        },
        "auth": "Caller is authenticated by process capability — never pass callerThreadId as authority",
        "scope": "Direct parent/children only, same project"
    })
}

#[cfg(test)]
mod contrat_typographique_du_manuel {
    const MANUEL: &str = include_str!("widget_guide_manuel.md");

    /// Le manuel est le seul endroit où la typographie des widgets se décide :
    /// l'agent écrit ce qu'il y lit. Il doit donc tenir l'échelle de l'app
    /// (10/11/12/13/15), sinon chaque panneau détonne — relevé le 2026-09-03,
    /// des tuiles en 17 px enseignées par l'exemple.
    #[test]
    fn le_manuel_ne_prescrit_que_les_tailles_du_systeme() {
        let permises = ["10", "11", "12", "13", "15"];
        let mut hors_echelle = Vec::new();
        for (i, ligne) in MANUEL.lines().enumerate() {
            for tag in ["font-size:", "font-size=\""] {
                let mut reste = ligne;
                while let Some(pos) = reste.find(tag) {
                    reste = &reste[pos + tag.len()..];
                    let valeur: String =
                        reste.chars().take_while(|c| c.is_ascii_digit()).collect();
                    if !valeur.is_empty() && !permises.contains(&valeur.as_str()) {
                        hors_echelle.push(format!("ligne {} : {valeur} px", i + 1));
                    }
                }
            }
        }
        assert!(
            hors_echelle.is_empty(),
            "le manuel enseigne des tailles hors échelle : {hors_echelle:?}"
        );
    }

    /// Le panneau est FLUIDE : un `viewBox` fixe étiré par `width:100%`
    /// multiplie toute la figure, texte compris (grille de 400 dans un
    /// panneau de 740 → ×1,85). Les squelettes doivent mesurer, comme le
    /// canvas le fait déjà.
    #[test]
    fn aucun_squelette_netire_un_viewbox_fixe() {
        let coupables: Vec<&str> = MANUEL
            .lines()
            .filter(|l| l.contains("viewBox=\"0 0 ") && l.contains("width:100%"))
            .collect();
        assert!(
            coupables.is_empty(),
            "viewBox fixe étiré à 100 % — la figure entière arrive agrandie : {coupables:?}"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn widget_tool_declares_its_three_required_fields() {
        let def = widget_tool_definition();
        assert_eq!(def["name"], WIDGET_TOOL_NAME);
        let required = def["inputSchema"]["required"].as_array().unwrap();
        assert_eq!(required.len(), 3);
        for field in ["html", "title", "height"] {
            assert!(
                required.iter().any(|v| v == field),
                "champ requis manquant : {field}"
            );
        }
        assert_eq!(def["inputSchema"]["additionalProperties"], json!(false));
    }

    #[test]
    fn widget_tool_announces_the_three_bridge_functions() {
        // Sans ça, aucun LLM ne devine leur existence : tout le §G (le widget
        // propose un message) et tout le gel d'état du §E reposent sur des
        // fonctions que l'agent doit appeler dans SON html. Depuis le guide
        // (patron read_me de Desktop), c'est LUI qui les porte — la
        // description courte se contente d'y renvoyer.
        let guide = serde_json::to_string(&widget_guide_text()).unwrap();
        for f in ["sendPrompt(", "saveState(", "window.onRestore"] {
            assert!(guide.contains(f), "le guide n'annonce pas {f}");
        }
        let def = widget_tool_definition();
        let description = def["description"].as_str().unwrap();
        assert!(
            description.contains(WIDGET_GUIDE_TOOL_NAME),
            "la description doit renvoyer au guide"
        );
        // et elle reste courte : elle repart au modèle à chaque tour
        assert!(
            description.len() < 900,
            "description trop longue ({} octets) — elle est envoyée à chaque tour",
            description.len()
        );
    }

    #[test]
    fn widget_call_routes_to_show_widget_verbatim() {
        let args = json!({"html": "<p>x</p>", "title": "t", "height": 200});
        let (action, forwarded) = bridge_call_for(WIDGET_TOOL_NAME, &args).unwrap();
        assert_eq!(action, "show_widget");
        assert_eq!(forwarded, args, "les arguments passent tels quels au pont");
    }

    #[test]
    fn sessions_call_still_routes_by_its_action_field() {
        let args = json!({"action": "current"});
        let (action, _) = bridge_call_for(TOOL_NAME, &args).unwrap();
        assert_eq!(action, "current");
    }

    #[test]
    fn guide_is_served_locally_and_carries_the_antipatterns() {
        // Le guide ne passe JAMAIS par le pont : bridge_call_for l'ignore,
        // c'est server.rs qui le sert directement (comme le help de sessions).
        assert!(bridge_call_for(WIDGET_GUIDE_TOOL_NAME, &json!({})).is_none());
        let guide = serde_json::to_string(&widget_guide_text()).unwrap();
        // les interdictions qui ont fait échouer le premier test réel (GLM
        // écrivait dans /tmp puis lançait open) doivent être nommées
        for interdit in ["JAMAIS de fichier", "navigateur", "page complète", "CDN"] {
            assert!(guide.contains(interdit), "le guide n'interdit pas : {interdit}");
        }
        // l'exemple à calquer est un fragment, pas une page
        let exemple = widget_guide_text()["exemple"].as_str().unwrap().to_string();
        assert!(!exemple.contains("<html"), "l'exemple ne doit pas être une page");
        assert!(exemple.contains("saveState") && exemple.contains("onRestore"));
        assert!(exemple.contains("var(--accent"));
        // et le guide impose la variété : sans ça un petit modèle clone
        // l'exemple unique et tous les widgets se ressemblent (vu avec GLM)
        let creativite = serde_json::to_string(&widget_guide_text()["creativite"]).unwrap();
        assert!(creativite.contains("NE COPIE PAS"));
        let formes = widget_guide_text();
        let formes = formes["formes"].as_object().unwrap();
        assert!(formes.len() >= 5, "il faut une vraie bibliothèque de formes");
        // le manuel complet (patron read_me de Desktop) : copieux et structuré
        let manuel = widget_guide_text()["manuel"].as_str().unwrap().to_string();
        assert!(manuel.len() > 8_000, "le manuel doit être copieux ({} o)", manuel.len());
        for section in ["Budgets de complexité", "Lisibilité des graphiques",
                        "Accessibilité", "Anti-patterns", "Checklist",
                        "requestAnimationFrame", "tabular-nums", "var(--u-ok"] {
            assert!(manuel.contains(section), "manuel sans : {section}");
        }
    }

    #[test]
    fn tools_list_serves_three_tools() {
        let defs = [
            tool_definition(),
            widget_tool_definition(),
            widget_guide_tool_definition(),
        ];
        let names: Vec<String> = defs
            .iter()
            .map(|d| d["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(names, [TOOL_NAME, WIDGET_TOOL_NAME, WIDGET_GUIDE_TOOL_NAME]);
    }

    #[test]
    fn unknown_tool_routes_nowhere() {
        assert!(bridge_call_for("rm_rf", &json!({})).is_none());
    }

    #[test]
    fn sessions_call_with_empty_action_routes_nowhere() {
        assert!(bridge_call_for(TOOL_NAME, &json!({"action": ""})).is_none());
    }

    #[test]
    fn sessions_call_with_missing_action_routes_nowhere() {
        assert!(bridge_call_for(TOOL_NAME, &json!({})).is_none());
    }
}
