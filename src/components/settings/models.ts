// Catalogue des modèles Claude (lot 1, correction de revue). General.tsx et
// Models.tsx en avaient chacun leur copie — CLAUDE_MODELS, MODEL_LABELS,
// modelLabel et providerModels — après l'éclatement de Settings.tsx (qui
// n'en avait qu'une). Déplacement pur : aucun changement de rendu.
import { t } from "../../lib/i18n";
import type { ProviderCatalogRow } from "./shared";

export const CLAUDE_MODELS = [
  { id: "claude-fable-5[1m]", label: "Fable 5 · 1M" },
  { id: "claude-opus-5[1m]", label: "Opus 5 · 1M" },
  { id: "claude-opus-4-8[1m]", label: "Opus 4.8 · 1M" },
  { id: "claude-sonnet-5[1m]", label: "Sonnet 5 · 1M" },
  { id: "claude-haiku-4-5-20251001[1m]", label: "Haiku 4.5 · 1M" },
];

export const MODEL_LABELS: Record<string, Record<string, string>> = {
  claude: Object.fromEntries(CLAUDE_MODELS.filter((m) => m.id).map((m) => [m.id, m.label ?? m.id])),
};

export function modelLabel(m: { label?: string; labelKey?: string }) {
  return m.labelKey === "common.default-cli" ? t("common.default-cli") : m.label ?? "";
}

// Signature élargie (provider, provs, defaultModel) plutôt que couplée à un
// composant : General.tsx et Models.tsx détiennent chacun leur propre état
// `provs` (deux abonnements WebSocket indépendants) et leur propre `s`, donc
// la fonction reçoit ce dont elle a besoin en paramètres.
export function providerModels(
  provider: "claude" | "codex",
  provs: ProviderCatalogRow[] | null,
  defaultModel: Record<string, string>,
) {
  if (provider === "claude") return CLAUDE_MODELS;
  const row = provs?.find((pr) => pr.id === provider);
  const ids = row?.models?.length ? row.models : [defaultModel[provider]].filter(Boolean);
  const labels = MODEL_LABELS[provider] ?? {};
  return ids.map((id) => ({ id, label: labels[id] ?? id }));
}
