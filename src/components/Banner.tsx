import { CloseIcon } from "./icons";

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
        <button type="button" className="ghost" onClick={p.onClose} aria-label="Fermer">
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
