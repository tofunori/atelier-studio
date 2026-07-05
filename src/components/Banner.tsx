import { CloseIcon } from "./icons";
import { t } from "../lib/i18n";

export default function Banner(p: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="top-banner">
      <span className="top-banner-text">{p.text}</span>
      {p.actionLabel && p.onAction && (
        <button type="button" onClick={p.onAction}>
          {p.actionLabel}
        </button>
      )}
      {p.onClose && (
        <button type="button" className="ghost" onClick={p.onClose} aria-label={t("action.close")}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
