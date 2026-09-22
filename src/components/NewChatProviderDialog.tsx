import type { ProviderInfo } from "../lib/providers";
import { LazyDialog } from "./ui/LazyDialog";
import { RowButton } from "./ui";
import { ProviderIcon } from "./icons";
import { t } from "../lib/i18n";

const NEW_CHAT_PROVIDERS = ["claude", "codex", "grok", "kimi", "opencode"];

/** Choix du fournisseur d'un nouveau chat indépendant ; un CLI non détecté
 * reste listé mais désactivé. */
export function NewChatProviderDialog({ providers, onCreate, onClose }: {
  providers: ProviderInfo[];
  onCreate: (provider: string) => void;
  onClose: () => void;
}) {
  return (
    <LazyDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("app.new-chat-title")}
      description={t("app.choose-provider")}
      closeLabel={t("action.close")}
      className="provider-new-dialog"
    >
      <div className="provider-new-grid">
        {NEW_CHAT_PROVIDERS.map((provider) => {
          const info = providers.find((item) => item.id === provider);
          const available = info?.ok !== false;
          return (
            <RowButton key={provider} className="provider-new-card" disabled={!available}
              onClick={() => onCreate(provider)}>
              <ProviderIcon provider={provider} size={18} />
              <span>{info?.label ?? provider[0].toUpperCase() + provider.slice(1)}</span>
              <small>{available ? t("app.independent-chat") : t("app.provider-unavailable")}</small>
            </RowButton>
          );
        })}
      </div>
    </LazyDialog>
  );
}
