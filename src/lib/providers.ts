import { ProviderId, Settings } from "./settings";

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
