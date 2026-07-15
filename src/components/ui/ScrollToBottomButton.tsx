import { ArrowDownIcon } from "../icons";

export function ScrollToBottomButton({
  label,
  show,
  working = false,
  onClick,
}: {
  label: string;
  show: boolean;
  working?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`ui-scroll-to-bottom${show ? " is-visible" : ""}`}
      data-active={show}
      title={label}
      aria-label={label}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={show ? onClick : undefined}
    >
      {working ? (
        <span className="ui-scroll-working-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <ArrowDownIcon />
      )}
    </button>
  );
}
