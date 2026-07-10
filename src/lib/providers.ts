import { ProviderId, Settings } from "./settings";

/** Capacités annoncées par le sidecar (plan 025, step 9) — le composer ne
 *  montre que les contrôles réellement supportés. Tous les champs sont
 *  optionnels : un vieux sidecar sans `capabilities` reste toléré (le front
 *  retombe alors sur le comportement historique). */
export type ProviderCapabilities = {
  resume?: boolean;
  steering?: boolean;
  queue?: boolean;
  goals?: boolean;
  tools?: boolean;
  toolOutput?: boolean;
  permissions?: boolean;
  interactiveInput?: boolean;
  mcpElicitation?: boolean;
  durableHistory?: boolean;
  /** Modes de permission acceptés par le harnais ([] = pas de sélecteur). */
  permissionModes?: string[];
};

// Renvoyé par le sidecar (providerStatus) — catalogue + détection.
export type ProviderInfo = {
  id: ProviderId;
  label: string;
  kind: "cli" | "api";
  version: string | null;
  ok: boolean;
  keyMissing?: boolean;
  models: string[];
  modelReasoning?: Record<string, {
    supported_efforts?: string[] | null;
    default_effort?: string | null;
    default_enabled?: boolean;
    mandatory?: boolean;
    supports_max_tokens?: boolean;
  }>;
  defaultModel: string;
  efforts: string[];
  capabilities?: ProviderCapabilities;
};

/** Providers du picker : ordre des réglages, masqués filtrés — mais le
 *  provider du thread courant reste toujours visible (règle Synara). */
export function orderedVisibleProviders(
  list: ProviderInfo[],
  settings: Pick<Settings, "providerOrder" | "hiddenProviders">,
  currentProvider?: ProviderId | null,
): ProviderInfo[] {
  const order = settings.providerOrder ?? [];
  const hidden = new Set(settings.hiddenProviders ?? []);
  if (currentProvider) hidden.delete(currentProvider);
  const rank = (id: ProviderId) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length + list.findIndex((p) => p.id === id) : i;
  };
  return list
    .filter((p) => !hidden.has(p.id))
    .sort((a, b) => rank(a.id) - rank(b.id));
}
