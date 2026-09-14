//! Provider trait — common lifecycle, not capability normalization.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub type InteractionFuture = Pin<Box<dyn Future<Output = Option<Value>> + Send>>;
pub type InteractionFn = Arc<dyn Fn(String, Value) -> InteractionFuture + Send + Sync>;
pub type SessionBindingFuture = Pin<Box<dyn Future<Output = Result<(), String>> + Send>>;
/// A provider calls this after opening/resuming its native thread and awaits
/// the durable Atelier binding before it is allowed to start native work.
pub type SessionBindingFn = Arc<dyn Fn(String) -> SessionBindingFuture + Send + Sync>;

#[derive(Debug, Clone)]
pub struct ProviderCaps {
    pub resume: bool,
    pub steering: bool,
    pub queue: bool,
    pub goals: bool,
    pub tools: bool,
}

#[derive(Clone)]
pub struct SendRequest {
    pub thread_id: String,
    pub turn_id: String,
    pub prompt: String,
    /// Provider-native structured inputs (images, skills, mentions).
    pub inputs: Option<Vec<Value>>,
    pub project_root: String,
    /// Additional writable roots for Codex workspace-write. Empty explicitly clears previous roots.
    pub additional_directories: Vec<String>,
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    /// Codex "Fast" service tier. `true` maps to `service_tier = "priority"`
    /// in the thread config; `false` forces nothing and keeps Codex defaults.
    /// Orthogonal to `model` and `effort` — it never changes either.
    pub fast_mode: bool,
    pub permission_mode: Option<String>,
    /// Ce tour ouvre une branche : reprendre la session source SANS l'écraser.
    /// Claude Code exprime ça par `--fork-session` au moment de la reprise —
    /// il n'a pas d'appel de fork hors tour, contrairement à Grok.
    pub fork_pending: bool,
    pub mode: SendMode,
    /// Called with each provider-native event (undecorated kind payload).
    pub on_event: Arc<dyn Fn(Value) + Send + Sync>,
    /// Durable native-session acknowledgement. Providers without an early
    /// session-open phase keep the compatibility default `None`.
    pub on_session_opened: Option<SessionBindingFn>,
    /// Provider server request → interaction utilisateur. `None` signifie
    /// refus sûr ou absence d'interface interactive.
    pub on_interaction: Option<InteractionFn>,
    /// Cancel probe — return true to stop generation.
    pub is_cancelled: Arc<dyn Fn() -> bool + Send + Sync>,
    /// Scoped Atelier Sessions MCP launch (plan 057). Built only by the runtime.
    pub atelier_mcp: Option<AtelierMcpLaunch>,
    /// Consigne du fil : instruction de ton/forme choisie par l'utilisateur,
    /// RÉÉMISE À CHAQUE TOUR. Aucun CLI ne la retient d'un tour à l'autre.
    /// Texte brut, sans balise — chaque adaptateur choisit son enveloppe.
    /// `None` = aucune consigne active sur ce fil.
    pub consigne: Option<String>,
}

/// MCP subprocess config for a single thread (plan 057).
#[derive(Debug, Clone)]
pub struct AtelierMcpLaunch {
    pub command: std::path::PathBuf,
    pub server_name: String,
    pub env: std::collections::HashMap<String, String>,
    /// Fil LIÉ (parent ou enfants). Seul ce cas justifie d'isoler la session
    /// MCP du CLI ; un fil ordinaire doit continuer de charger la config MCP
    /// personnelle de l'utilisateur.
    pub linked: bool,
}

/// ACP représente les variables d'environnement d'un serveur MCP comme une
/// liste de paires `{name, value}` (et non comme l'objet accepté par Claude).
/// Centraliser ce wire évite que les adaptateurs Kimi/Grok/OpenCode divergent.
pub(crate) fn atelier_mcp_servers(launch: Option<&AtelierMcpLaunch>) -> Value {
    let Some(launch) = launch else {
        return json!([]);
    };
    let mut env = launch
        .env
        .iter()
        .map(|(name, value)| json!({"name": name, "value": value}))
        .collect::<Vec<_>>();
    env.sort_by(|left, right| left["name"].as_str().cmp(&right["name"].as_str()));
    json!([{
        "name": launch.server_name,
        "command": launch.command,
        "args": [],
        "env": env,
    }])
}

/// Empreinte des serveurs MCP déclarés à une session ACP.
///
/// Les voies rapides d'opencode/kimi/grok sautaient `session/load|resume` tant
/// que `req.atelier_mcp` était `None`. Depuis que le serveur atelier part sur
/// tout fil compatible (2026-08-28), cette condition n'est plus jamais vraie
/// et la voie rapide est morte. Ce qui compte réellement n'est pas l'ABSENCE
/// de serveur mais le fait que la déclaration soit INCHANGÉE depuis
/// l'ouverture de la session : c'est ce que cette empreinte permet de tester.
pub(crate) fn atelier_mcp_fingerprint(servers: &Value) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    servers.to_string().hash(&mut hasher);
    hasher.finish()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendMode {
    Normal,
    Steer,
}

#[derive(Debug, Clone)]
pub struct SendResult {
    pub session_id: Option<String>,
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitMessageDetails {
    pub title: String,
    pub description: String,
}

/// Paramètres explicites de l'assistance de réécriture des consignes.
///
/// Les champs du formulaire restent des données de l'utilisateur. Ils ne
/// servent plus à smuggler le mode demandé dans `description`, ce qui
/// permet au provider d'appliquer une politique système adaptée à chaque
/// action (et de réserver la sortie « questions » au premier appel).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RewriteOptions {
    /// `correct`, `clarify`, `shorten`, `structure`, `questions` ou `custom`.
    pub mode: Option<String>,
    /// Langue de l'interface pour les questions générées. Les transformations
    /// d'un texte existant conservent, elles, la langue de ce texte.
    #[serde(default)]
    pub language: Option<String>,
    /// Texte libre de l'action `custom`.
    #[serde(default)]
    pub custom: Option<String>,
    /// Questions retournées par l'appel `questions` précédent.
    #[serde(default)]
    pub questions: Option<String>,
    /// Réponses de l'utilisateur aux questions précédentes.
    #[serde(default)]
    pub answers: Option<String>,
}

/// Prompts de l'assistance « Reformuler » de l'éditeur de consignes.
/// N'emporte que les trois champs du formulaire — jamais le fil, les
/// fichiers du projet ou CLAUDE.md. Vit ici (pas dans `codex.rs`) : c'est le
/// module partagé des deux adaptateurs qui l'implémentent (codex, claude) —
/// l'un ne doit pas dépendre de l'autre pour un simple gabarit de texte.
/// Le texte produit est identique pour les deux ; seule l'enveloppe d'appel
/// diverge (codex concatène système + utilisateur, claude a un vrai
/// `--system-prompt`).
pub fn prompts_reformulation(nom: &str, description: &str, texte: &str) -> (String, String) {
    prompts_reformulation_with_options(nom, description, texte, None)
}

/// Variante de [`prompts_reformulation`] qui applique l'action choisie par
/// l'éditeur. Le système reste la source de vérité pour le format de sortie;
/// les champs de la consigne et les réponses sont seulement injectés dans le
/// message utilisateur, entre libellés stables.
pub fn prompts_reformulation_with_options(
    nom: &str,
    description: &str,
    texte: &str,
    options: Option<&RewriteOptions>,
) -> (String, String) {
    // Keep the old public helper byte-for-byte compatible for callers that do
    // not send an action. New UI calls always include `mode`, and therefore
    // use the explicit policy branches below.
    if options.is_none() {
        let vide = texte.trim().is_empty();
        let verbe = if vide {
            "Rédige une consigne à partir du nom et de la description fournis."
        } else {
            "Reformule la consigne fournie : resserre-la, mets-la à l'impératif, coupe le flou."
        };
        let systeme = format!(
            "Tu écris des consignes destinées à un assistant de programmation. {verbe} \
             Écris à l'impératif, en français, une instruction par ligne, cinq lignes au maximum. \
             Ne commente pas, ne justifie pas : renvoie uniquement le texte de la consigne."
        );
        return prompt_with_system(&systeme, nom, description, texte, None, None, None);
    }

    let mode = options
        .and_then(|value| value.mode.as_deref())
        .unwrap_or("");
    let questions = options
        .and_then(|value| value.questions.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let answers = options
        .and_then(|value| value.answers.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let language = options
        .and_then(|value| value.language.as_deref())
        .unwrap_or("fr");
    let is_english = language.eq_ignore_ascii_case("en");
    let custom = (mode == "custom")
        .then(|| {
            options
                .and_then(|value| value.custom.as_deref())
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .flatten();
    let output_language = if is_english { "English" } else { "français" };

    let systeme = match mode {
        "correct" => "Corrige uniquement l'orthographe, la grammaire et la ponctuation. Conserve la langue, les mots, le sens, le niveau de détail et toutes les exigences de la consigne.",
        "clarify" => "Clarifie la consigne et rends ses exigences précises et vérifiables. Conserve la langue et l'intention; supprime les ambiguïtés sans ajouter d'exigence nouvelle.",
        "shorten" => "Raccourcis la consigne en supprimant les répétitions et les mots inutiles. Conserve la langue, toutes les exigences et le sens.",
        "structure" => "Structure la consigne en étapes ou en règles ordonnées et cohérentes. Conserve la langue, toutes les exigences et le sens.",
        "custom" => "Applique l'ajustement personnalisé demandé dans le message utilisateur. Respecte le sens et toutes les exigences de la consigne.",
        "questions" if answers.is_none() => {
            return prompt_with_system(
                if is_english {
                "You help clarify instructions for an assistant. Ask at most five short, concrete questions that resolve useful ambiguities. Number the questions. Return only the questions, without commentary or an instruction draft."
                } else {
                    "Tu aides à préciser une consigne destinée à un assistant. Pose au maximum cinq questions courtes et concrètes pour lever les ambiguïtés utiles. Numérote les questions. Renvoie uniquement les questions, sans commentaire ni proposition de consigne."
                },
                nom,
                description,
                texte,
                custom,
                questions,
                answers,
            );
        }
        "questions" => if is_english {
            "Draft final instructions using only requirements explicitly provided in the current instruction, its description and the user answers. Questions are prompts for clarification, not requirements: leave unanswered points unspecified. Never invent numerical thresholds, technical criteria, automatic actions or approval requirements. Do not mention the conversation or the questions. Preserve the language of the current instruction."
        } else {
            "Rédige une consigne finale avec uniquement les exigences explicitement fournies dans la consigne actuelle, sa description et les réponses de l'utilisateur. Les questions ne sont pas des exigences : laisse les points sans réponse non spécifiés. N'invente jamais de seuil numérique, de critère technique, d'action automatique ou d'obligation de validation. Ne mentionne pas la conversation ni les questions. Conserve la langue de la consigne actuelle."
        },
        _ if texte.trim().is_empty() => "Rédige une consigne à partir du nom et de la description fournis.",
        _ => "Reformule la consigne fournie : resserre-la, mets-la à l'impératif, coupe le flou.",
    };

    let systeme = format!(
        "Tu écris une consigne destinée à un assistant logiciel. {systeme} \
         Retourne uniquement la consigne transformée, sans commentaire ni justification. \
         Conserve la langue de la consigne actuelle; si elle est vide, écris en {output_language}."
    );
    prompt_with_system(
        &systeme,
        nom,
        description,
        texte,
        custom,
        questions,
        answers,
    )
}

fn prompt_with_system(
    systeme: &str,
    nom: &str,
    description: &str,
    texte: &str,
    custom: Option<&str>,
    questions: Option<&str>,
    answers: Option<&str>,
) -> (String, String) {
    let mut utilisateur =
        format!("Nom : {nom}\nDescription : {description}\nConsigne actuelle :\n{texte}");
    if let Some(custom) = custom {
        utilisateur.push_str(&format!("\nAjustement personnalisé demandé :\n{custom}"));
    }
    if let Some(questions) = questions {
        utilisateur.push_str(&format!("\nQuestions posées :\n{questions}"));
    }
    if let Some(answers) = answers {
        utilisateur.push_str(&format!("\nRéponses de l'utilisateur :\n{answers}"));
    }
    (systeme.to_string(), utilisateur)
}

#[async_trait]
pub trait Provider: Send + Sync {
    /// Thread-level native events, independent of any active send future.
    fn set_native_event_sink(&self, _sink: Arc<dyn Fn(String, Value) + Send + Sync>) {}
    fn id(&self) -> &str;
    fn label(&self) -> &str;
    fn caps(&self) -> ProviderCaps;
    fn models(&self) -> Vec<String>;
    fn default_model(&self) -> String;
    fn efforts(&self) -> Vec<String>;

    async fn send(&self, req: SendRequest) -> SendResult;

    /// Optional lightweight semantic title generation for a new conversation.
    /// Providers that do not expose a cheap title path keep the UI fallback.
    async fn title_conversation(&self, _first_message: &str) -> Option<String> {
        None
    }

    /// Optional commit title and description generation from an already-scoped diff.
    async fn commit_message(
        &self,
        _diff: &str,
        _project_root: &str,
    ) -> Result<Option<CommitMessageDetails>, String> {
        Ok(None)
    }

    /// Reformule une consigne de l'éditeur. `model` vient du réglage
    /// `consignesAssist` : l'utilisateur choisit ce qui réécrit ses textes.
    /// Défaut `None` = ce CLI n'a pas de tour un-coup exploitable ; l'UI
    /// n'offre pas ce provider plutôt que d'éteindre un bouton sans raison.
    async fn reformuler_consigne(
        &self,
        _nom: &str,
        _description: &str,
        _texte: &str,
        _model: &str,
        _project_root: &str,
    ) -> Option<String> {
        None
    }

    /// Variante avec action explicite. Les providers historiques peuvent
    /// conserver leur chemin précédent; le défaut appelle donc la méthode
    /// sans options. Codex et Claude redéfinissent ce hook pour appliquer les
    /// politiques système de chaque mode.
    async fn reformuler_consigne_with_options(
        &self,
        nom: &str,
        description: &str,
        texte: &str,
        model: &str,
        project_root: &str,
        _options: Option<&RewriteOptions>,
    ) -> Option<String> {
        self.reformuler_consigne(nom, description, texte, model, project_root)
            .await
    }

    /// Optional native steer (Codex). Default: not supported.
    async fn steer(&self, _req: SendRequest) -> bool {
        false
    }

    async fn interrupt(&self, _thread_id: &str) -> bool {
        true
    }

    /// Libère tout runtime persistant attaché à un thread. Le routeur appelle
    /// ce hook avant suppression ou changement de projet ; les providers
    /// one-shot n'ont rien à faire.
    async fn stop_session(&self, _thread_id: &str) {}

    async fn native_command(&self, name: &str, _params: Value) -> Result<Value, String> {
        Err(format!(
            "commande native non supportée par {}: {name}",
            self.id()
        ))
    }

    /// Listing natif des sessions du provider (`{id, title, mtime, projectRoot}`).
    /// `None` = pas de listing natif — le routeur garde son comportement
    /// historique (plan 046 étape 8).
    async fn list_sessions(&self, _project_root: &str) -> Option<Vec<Value>> {
        None
    }

    /// Sonde Setup SANS quota (plan 046 étape 10) :
    /// `{state, version, binPath, models, loginCommand?, shadowed?, error?}` —
    /// `state` ∈ not_installed / version_unsupported / login_needed /
    /// model_config_needed / ready / protocol_error. `None` = pas de sonde
    /// dédiée (comportement historique : présent ⇒ ready).
    async fn setup_probe(&self) -> Option<Value> {
        None
    }

    /// Catalogue dynamique pour providerStatus :
    /// `{models: [...], defaultModel, modelReasoning: {...}}`.
    /// `None` = catalogue statique du registre (comportement historique).
    async fn dynamic_models(&self) -> Option<Value> {
        None
    }

    /// Historique natif d'une session (import/reprise), events Atelier
    /// `user/thinking/text/tool_update`. `None` = pas de source native.
    async fn native_history(&self, _session_id: &str, _project_root: &str) -> Option<Vec<Value>> {
        None
    }

    /// Annule les tours à partir du prompt `prompt_index` DANS la session du
    /// CLI. Sans ça, Atelier tronque son journal mais l'agent garde tout en
    /// mémoire : il continue de répondre en fonction de ce qu'on croyait
    /// avoir effacé. `Err` = non supporté, l'appelant n'en fait pas un échec.
    async fn rewind(&self, _thread_id: &str, _prompt_index: usize) -> Result<Value, String> {
        Err("rewind non supporté par ce provider".into())
    }

    /// Rewind a persisted session, including after the app has restarted.
    async fn rewind_session(
        &self,
        thread_id: &str,
        _session_id: Option<&str>,
        prompt_index: usize,
        _native_turn_id: Option<&str>,
    ) -> Result<Value, String> {
        self.rewind(thread_id, prompt_index).await
    }

    /// Duplique la session du CLI jusqu'au prompt `prompt_index` et retourne
    /// l'identifiant de la copie. La branche garde alors l'historique réel
    /// (outils, plan) au lieu d'un texte reconstruit. `Err` = non supporté.
    async fn fork_session(
        &self,
        _thread_id: &str,
        _source_session: &str,
        _cwd: &str,
        _prompt_index: Option<usize>,
    ) -> Result<String, String> {
        Err("fork natif non supporté par ce provider".into())
    }

    /// Commandes que le CLI expose lui-même (`available_commands_update`) :
    /// `[{name, description}]`. Elles n'existent nulle part sur le disque, un
    /// scan de `skills/` ou `commands/` ne peut donc pas les découvrir.
    fn native_commands(&self) -> Vec<Value> {
        Vec::new()
    }

    /// Isolated structured review (plan 080 A2). Distinct from native `review`.
    fn structured_review(&self) -> bool {
        false
    }

    async fn review(&self, _req: ReviewRequest) -> Result<ReviewResponse, ReviewError> {
        Err(ReviewError::Unsupported)
    }
}

#[derive(Debug, Clone)]
pub struct ReviewRequest {
    pub model: String,
    pub effort: String,
    pub dossier: String,
}

#[derive(Debug, Clone)]
pub struct ReviewResponse {
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewError {
    Unsupported,
    Timeout,
    Provider(String),
}

impl std::fmt::Display for ReviewError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => write!(f, "REVIEW_UNSUPPORTED"),
            Self::Timeout => write!(f, "REVIEW_TIMEOUT"),
            Self::Provider(message) => write!(f, "{message}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::PathBuf;

    struct CapsOnly;

    #[async_trait]
    impl Provider for CapsOnly {
        fn id(&self) -> &str {
            "caps-only"
        }
        fn label(&self) -> &str {
            "Caps"
        }
        fn caps(&self) -> ProviderCaps {
            ProviderCaps {
                resume: false,
                steering: false,
                queue: false,
                goals: false,
                tools: false,
            }
        }
        fn models(&self) -> Vec<String> {
            vec!["x".into()]
        }
        fn default_model(&self) -> String {
            "x".into()
        }
        fn efforts(&self) -> Vec<String> {
            vec![]
        }
        async fn send(&self, _req: SendRequest) -> SendResult {
            SendResult {
                session_id: None,
                ok: false,
                error: Some("unused".into()),
            }
        }
    }

    #[tokio::test]
    async fn structured_review_defaults_to_unsupported() {
        let provider = CapsOnly;
        assert!(!provider.structured_review());
        let err = provider
            .review(ReviewRequest {
                model: "x".into(),
                effort: "high".into(),
                dossier: "{}".into(),
            })
            .await
            .unwrap_err();
        assert_eq!(err, ReviewError::Unsupported);
    }

    #[test]
    fn atelier_mcp_uses_the_acp_env_variable_wire() {
        let launch = AtelierMcpLaunch {
            command: PathBuf::from("/Applications/Atelier.app/atelier-agent-mcp"),
            server_name: "atelier-sessions".into(),
            env: HashMap::from([
                ("ATELIER_THREAD_ID".into(), "thread-1".into()),
                ("ATELIER_AGENT_CAPABILITY".into(), "secret".into()),
            ]),
            linked: false,
        };

        assert_eq!(
            atelier_mcp_servers(Some(&launch)),
            json!([{
                "name": "atelier-sessions",
                "command": "/Applications/Atelier.app/atelier-agent-mcp",
                "args": [],
                "env": [
                    {"name": "ATELIER_AGENT_CAPABILITY", "value": "secret"},
                    {"name": "ATELIER_THREAD_ID", "value": "thread-1"},
                ],
            }])
        );
        assert_eq!(atelier_mcp_servers(None), json!([]));
    }

    /// L'empreinte doit distinguer deux déclarations différentes (un jeton qui
    /// change, par exemple) et confondre deux déclarations identiques — c'est
    /// tout ce que les voies rapides ACP ont besoin de savoir.
    #[test]
    fn lempreinte_ne_bouge_que_si_la_declaration_bouge() {
        let mk = |jeton: &str| {
            atelier_mcp_servers(Some(&AtelierMcpLaunch {
                command: PathBuf::from("/bin/atelier-agent-mcp"),
                server_name: "atelier-sessions".into(),
                env: HashMap::from([("ATELIER_MCP_CAPABILITY".into(), jeton.to_string())]),
                linked: false,
            }))
        };
        assert_eq!(
            atelier_mcp_fingerprint(&mk("stable")),
            atelier_mcp_fingerprint(&mk("stable")),
            "jeton stable ⇒ pas de réouverture de session"
        );
        assert_ne!(
            atelier_mcp_fingerprint(&mk("a")),
            atelier_mcp_fingerprint(&mk("b")),
            "jeton changé ⇒ la session doit être rouverte"
        );
        assert_ne!(
            atelier_mcp_fingerprint(&mk("a")),
            atelier_mcp_fingerprint(&atelier_mcp_servers(None))
        );
    }

    #[test]
    fn les_modes_de_recriture_portent_une_politique_systeme_explicitement() {
        let options = RewriteOptions {
            mode: Some("correct".into()),
            language: Some("en".into()),
            ..RewriteOptions::default()
        };
        let (system, user) = prompts_reformulation_with_options(
            "Name",
            "Description",
            "Fix this sentence.",
            Some(&options),
        );
        assert!(system.contains("Corrige uniquement"), "{system}");
        assert!(system.contains("Conserve la langue"), "{system}");
        assert!(!system.contains("Écris à l'impératif"), "{system}");
        assert!(user.contains("Fix this sentence."), "{user}");
    }

    #[test]
    fn le_mode_questions_change_de_sortie_apres_les_reponses() {
        let question_options = RewriteOptions {
            mode: Some("questions".into()),
            language: Some("en".into()),
            ..RewriteOptions::default()
        };
        let (question_system, question_user) = prompts_reformulation_with_options(
            "Name",
            "Description",
            "Current instruction",
            Some(&question_options),
        );
        assert!(
            question_system.contains("Ask at most five"),
            "{question_system}"
        );
        assert!(
            question_system.contains("only the questions"),
            "{question_system}"
        );
        assert!(!question_user.contains("Réponses de l'utilisateur"));

        let answer_options = RewriteOptions {
            questions: Some("1. Which files?".into()),
            answers: Some("Only source files.".into()),
            ..question_options
        };
        let (answer_system, answer_user) = prompts_reformulation_with_options(
            "Name",
            "Description",
            "Current instruction",
            Some(&answer_options),
        );
        assert!(
            answer_system.contains("Draft final instructions"),
            "{answer_system}"
        );
        assert!(
            answer_system.contains("Never invent numerical thresholds"),
            "{answer_system}"
        );
        assert!(
            answer_system.contains("leave unanswered points unspecified"),
            "{answer_system}"
        );
        assert!(answer_user.contains("Which files?"), "{answer_user}");
        assert!(answer_user.contains("Only source files."), "{answer_user}");
    }

    #[test]
    fn la_demande_custom_reste_dans_les_donnees_utilisateur() {
        let options = RewriteOptions {
            mode: Some("custom".into()),
            custom: Some("Preserve my tone".into()),
            ..RewriteOptions::default()
        };
        let (system, user) = prompts_reformulation_with_options(
            "Name",
            "Description",
            "Instruction",
            Some(&options),
        );
        assert!(!system.contains("Preserve my tone"), "{system}");
        assert!(user.contains("Ajustement personnalisé demandé"), "{user}");
        assert!(user.contains("Preserve my tone"), "{user}");
    }
}
