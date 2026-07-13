import { CloseIcon } from "./icons";
import { t } from "../lib/i18n";
import { Button, IconButton } from "./ui";

export default function Banner(p: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}) {
  return (
    <div role="status" className="top-banner">
      <span className="top-banner-text">{p.text}</span>
      {p.actionLabel && p.onAction && (
        <Button variant="ghost" onClick={p.onAction}>
          {p.actionLabel}
        </Button>
      )}
      {p.onClose && (
        <IconButton className="ghost" label={t("action.close")} onClick={p.onClose}>
          <CloseIcon />
        </IconButton>
      )}
    </div>
  );
}
