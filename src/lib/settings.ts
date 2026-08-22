export type ProviderId = string;

// vue active du panneau latéral (barre d'activité) — "highlights" arrive
// fonctionnellement au lot 2, seul le placeholder existe pour l'instant
export type ViewId = "chats" | "highlights" | "automations";

/** Vue de la transcription — façon Claude Code desktop (sélecteur du header). */
export type TranscriptView = "normal" | "reflexion" | "detaille" | "resume";

export type Settings = {
  defaultProvider: ProviderId;
  defaultModel: Record<string, string>;
  defaultEffort: Record<string, string>;
  defaultPermissionMode: string;
  threadOrder: "recent" | "manual";
  chatFontSize: number;
  chatWidth: number;
  chatLineHeight: number;
  galleryPath: string;
  galleryExts: string; // extensions par défaut de la galerie ("" = liste intégrée)
  galleryExtsByProject: Record<string, string>; // racine projet -> extensions
  autoRefreshAtelier: boolean;
  enableAppSnap: boolean;
  appSnapPlaySound: boolean;
  autoReview: {
    enabled: boolean;
    provider: ProviderId;
    model: string;
    effort: string;
    trigger: "always" | "files-changed" | "manual";
    autofix: boolean;
  };
  language: "fr" | "en" | "system";
  theme: "dark" | "light" | "system";
  themePreset: string;
  accentColor: string;
  bgColor: string;
  fgColor: string;
  uiFont: string;
  codeFont: string;
  density: "compact" | "comfortable" | "spacious";
  baseFontSize: number;
  fontSmoothing: boolean;
  streamFade: boolean;
  timeFormat: "system" | "24h" | "12h";
  /** Héritée (2026-08-21) : remplacée par `transcriptView` — conservée pour que
   * les miroirs disque/localStorage existants restent valides, plus consommée. */
  thinkingCollapsed: boolean;
  /** Vue de la transcription (sélecteur du header de conversation) :
   * normal = pensée en fenêtre de 4 lignes, runs repliés ;
   * reflexion = pensée en flux complet ;
   * detaille = pensée complète + lignes d'outils dépliées d'office ;
   * resume = pensée masquée, bilans et réponses seulement. */
  transcriptView: TranscriptView;
  /** Horodatage début → fin sur les lignes durables du transcript (défaut off). */
  displayTimestamps: boolean;
  customModels: { provider: ProviderId; id: string }[];
  modelEfforts: Record<string, string>; // "provider:modelId" -> effort
  favoriteModels: Record<string, string[]>; // provider -> ids visibles dans le picker compact
  webSearch: boolean;
  additionalDirectories: string;
  providerOrder: ProviderId[]; // ordre du picker ([] = ordre du catalogue)
  hiddenProviders: ProviderId[]; // masqués du picker (le provider du thread actif reste visible)
  activeView: ViewId;
  railMoreOpen: boolean; // rail : section « Autres surfaces » dépliée (la surface active reste toujours visible)
};

export const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "claude",
  defaultModel: { claude: "claude-opus-5[1m]", codex: "gpt-5.6-sol" },
  defaultEffort: { claude: "xhigh", codex: "medium", grok: "high" },
  defaultPermissionMode: "acceptEdits",
  threadOrder: "recent",
  chatFontSize: 13.5,
  chatWidth: 760,
  chatLineHeight: 1.7,
  galleryPath: "", // vide = galerie embarquée (gallery/ du repo ou ressource bundlée)
  galleryExts: "",
  galleryExtsByProject: {},
  autoRefreshAtelier: true,
  enableAppSnap: false,
  appSnapPlaySound: true,
  autoReview: { enabled: false, provider: "codex", model: "gpt-5.5", effort: "high", trigger: "files-changed", autofix: false },
  language: "system",
  theme: "dark",
  themePreset: "atelier",
  accentColor: "",
  bgColor: "",
  fgColor: "",
  uiFont: "",
  codeFont: "",
  density: "comfortable",
  baseFontSize: 15,
  fontSmoothing: true,
  streamFade: true,
  timeFormat: "system",
  // Repliée par défaut (demande Thierry 2026-08-21) : fenêtre de 3 lignes,
  // le flux complet reste à un clic.
  thinkingCollapsed: true,
  transcriptView: "normal",
  displayTimestamps: false,
  customModels: [],
  modelEfforts: {},
  favoriteModels: {},
  webSearch: false,
  additionalDirectories: "",
  providerOrder: [],
  hiddenProviders: [],
  activeView: "chats",
  railMoreOpen: false,
};

const KEY = "atelier-studio.settings";
const LEGACY_FAVORITE_MODELS_KEY = "atelier-studio.favModels";
const CLAUDE_DEFAULTS_MIGRATION_KEY = "atelier-studio.defaults.claude-opus-5-1m";
const DEFAULT_MIGRATIONS_KEY = "atelier-studio.defaults.applied";

/** Promotions de défauts déjà appliquées à CE profil, par id. */
function appliedMigrations(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DEFAULT_MIGRATIONS_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Promotions de défauts — le seul mécanisme par lequel un défaut modifié dans
 * le code atteint un profil DÉJÀ enregistré.
 *
 * `loadSettings` fusionne `{...DEFAULT_SETTINGS, ...stored}` : `stored` gagne,
 * volontairement, sinon chaque mise à jour écraserait les choix de
 * l'utilisateur. Conséquence : changer `DEFAULT_SETTINGS` n'a AUCUN effet sur
 * une installation existante — c'est réservé aux profils neufs.
 *
 * Une promotion ne s'applique donc que si la valeur stockée vaut EXACTEMENT
 * l'ancien défaut : on remplace un héritage, jamais un choix explicite. Elle ne
 * tourne qu'une fois, son id étant retenu dans DEFAULT_MIGRATIONS_KEY.
 *
 * Ajouter un cas ici plutôt qu'un drapeau dédié (cf.
 * CLAUDE_DEFAULTS_MIGRATION_KEY, antérieur à ce mécanisme).
 */
const DEFAULT_MIGRATIONS: { id: string; promote: (stored: Partial<Settings>) => Partial<Settings> }[] = [
  {
    // 2026-08-13 : le défaut de taille du chat passe de 15 à 13.5 (cohérence
    // typographique). Sans cette promotion, un profil créé avant garde 15 pour
    // toujours et le nouveau défaut reste invisible.
    id: "2026-08-13.chat-font-13_5",
    promote: (stored) => (stored.chatFontSize === 15 ? { chatFontSize: 13.5 } : {}),
  },
  {
    // 2026-08-15 (plan 063, finding SEC-05) : le défaut de mode de permission
    // passe de bypassPermissions (aucune barrière) à acceptEdits. Un profil
    // dont la valeur stockée vaut encore l'ancien défaut ne l'a jamais changé
    // volontairement (le sélecteur n'offre pas d'autre moyen de revenir à
    // bypassPermissions que de le choisir explicitement après cette promotion) ;
    // on le fait suivre. Un choix explicite ultérieur de bypassPermissions
    // reste possible et sera respecté (promotion ponctuelle, jamais rejouée).
    id: "2026-08-15.default-permission-mode-accept-edits",
    promote: (stored) => (stored.defaultPermissionMode === "bypassPermissions" ? { defaultPermissionMode: "acceptEdits" } : {}),
  },
  {
    // 2026-08-21 : le raisonnement s'affiche replié par défaut (fenêtre de 6
    // lignes). Le réglage est né quelques heures plus tôt avec `false` : tout
    // profil ayant enregistré ses réglages entre les deux (changer de modèle
    // suffit — l'objet entier est réécrit) garde `false` pour toujours sans
    // cette promotion. Un profil qui a explicitement décoché la case APRÈS
    // cette promotion la conserve : elle ne tourne qu'une fois.
    // `-v3` : v1 s'est marquée appliquée sans écrire sa valeur (bug du
    // mécanisme) ; v2 a été consommée pendant un boot où le miroir disque
    // settings.json écrasait encore les promotions (corrigé par
    // bootPromotions). Chaque id grillé par une fenêtre de bug exige le
    // suivant, sinon les profils touchés gardent l'ancien défaut à vie.
    id: "2026-08-21.thinking-collapsed-by-default-v3",
    promote: (stored) => (stored.thinkingCollapsed === false ? { thinkingCollapsed: true } : {}),
  },
];

function promoteDefaults(stored: Partial<Settings>): Partial<Settings> {
  const applied = appliedMigrations();
  const pending = DEFAULT_MIGRATIONS.filter((migration) => !applied.has(migration.id));
  if (!pending.length) return {};
  let promoted: Partial<Settings> = {};
  for (const migration of pending) {
    promoted = { ...promoted, ...migration.promote({ ...stored, ...promoted }) };
    applied.add(migration.id);
  }
  // Le marquage vaut pour TOUTES les promotions examinées, y compris celles qui
  // n'ont rien changé : une valeur déjà personnalisée ne doit pas être
  // réexaminée au prochain démarrage. Un stockage en échec ne doit PAS faire
  // échouer le chargement (le catch de loadSettings retomberait sur les défauts
  // et effacerait tous les réglages) — au pire la promotion sera réexaminée.
  try {
    localStorage.setItem(DEFAULT_MIGRATIONS_KEY, JSON.stringify([...applied]));
  } catch {}
  return promoted;
}

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // GPT-5.5 était l'ancien défaut Codex. Le migrer vers le nouveau défaut
    // demandé; les autres choix explicites restent intacts.
    const storedDefaultModel = {
      ...stored.defaultModel,
      ...(stored.defaultModel?.codex === "gpt-5.5" ? { codex: DEFAULT_SETTINGS.defaultModel.codex } : {}),
    };
    const storedDefaultEffort = { ...stored.defaultEffort };
    // Migration ponctuelle : promouvoir l'ancien défaut Sonnet vers Opus 5
    // 1M, sans écraser un modèle Claude choisi explicitement auparavant.
    const hadDefaultClaude = stored.defaultModel?.claude;
    const isPreviousClaudeDefault = !hadDefaultClaude
      || hadDefaultClaude === "claude-sonnet-5"
      || hadDefaultClaude === "claude-sonnet-5[1m]";
    if (localStorage.getItem(CLAUDE_DEFAULTS_MIGRATION_KEY) !== "1" && isPreviousClaudeDefault) {
      storedDefaultModel.claude = DEFAULT_SETTINGS.defaultModel.claude;
      localStorage.setItem(CLAUDE_DEFAULTS_MIGRATION_KEY, "1");
    }
    // migration : ancienne clé de taille de police
    const legacyFs = localStorage.getItem("atelier-studio.chatFontSize");
    const legacyFavoriteModels: Record<string, string[]> = {};
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_FAVORITE_MODELS_KEY) ?? "[]");
      if (Array.isArray(legacy)) {
        for (const entry of legacy) {
          if (typeof entry !== "string") continue;
          const separator = entry.indexOf(":");
          if (separator <= 0 || separator === entry.length - 1) continue;
          const provider = entry.slice(0, separator);
          const model = entry.slice(separator + 1);
          legacyFavoriteModels[provider] = [...new Set([...(legacyFavoriteModels[provider] ?? []), model])];
        }
      }
    } catch {}
    // Une promotion se marque « appliquée » dès le premier chargement : si sa
    // VALEUR n'est pas réécrite dans le stockage, elle est perdue au
    // redémarrage suivant (le stocké, resté à l'ancien défaut, regagne) et la
    // migration ne se rejoue jamais. Vécu le 2026-08-21 sur
    // `thinkingCollapsed`, qui redevenait `false` à chaque relance.
    const promoted = promoteDefaults(stored);
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(legacyFs ? { chatFontSize: Number(legacyFs) } : {}),
      ...stored,
      // après `stored` : une promotion ne vaut que face à un ancien défaut hérité
      ...promoted,
      defaultModel: { ...DEFAULT_SETTINGS.defaultModel, ...storedDefaultModel },
      autoReview: { ...DEFAULT_SETTINGS.autoReview, ...(stored as any).autoReview },
      defaultEffort: { ...DEFAULT_SETTINGS.defaultEffort, ...storedDefaultEffort },
      customModels: stored.customModels ?? [],
      modelEfforts: stored.modelEfforts ?? {},
      favoriteModels: stored.favoriteModels && typeof stored.favoriteModels === "object"
        ? stored.favoriteModels
        : legacyFavoriteModels,
      // La vue latérale est un état de session : un démarrage à froid revient
      // toujours aux conversations, même si l'app a été quittée sur Highlights.
      activeView: "chats",
    };
    // La promotion n'a lieu qu'une fois : sa valeur doit donc être ÉCRITE tout
    // de suite, sinon le prochain démarrage relit l'ancien défaut sans que la
    // migration puisse se rejouer. Un échec d'écriture ne fait pas échouer le
    // chargement — au pire la valeur restera à promouvoir.
    if (Object.keys(promoted).length > 0) {
      lastBootPromotions = promoted;
      try {
        localStorage.setItem(KEY, JSON.stringify(settings));
      } catch {}
    }
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Clés promues au chargement de CE boot. Le miroir disque settings.json
 * arrive APRÈS, par WebSocket, et « fait foi » : sans cette trace, il écrase
 * la promotion avec l'ancienne valeur — déjà marquée appliquée, elle ne se
 * rejouerait jamais (vécu 2026-08-21 : thinkingCollapsed retombait à false à
 * chaque relance malgré deux correctifs). Le merge du boot doit la faire
 * gagner UNE fois ; le miroir se met ensuite à jour tout seul. */
let lastBootPromotions: Partial<Settings> = {};
export function bootPromotions(): Partial<Settings> {
  return lastBootPromotions;
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
