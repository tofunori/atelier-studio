import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { t } from "../../lib/i18n";

export type LinkedProviderOption = {
  id: string;
  label: string;
  models: string[];
  defaultModel: string;
  efforts: string[];
  atelierSessionsMcp?: boolean;
};

type Props = {
  open: boolean;
  providers: LinkedProviderOption[];
  sourceTitle: string;
  onClose: () => void;
  onConfirm: (opts: {
    targetProvider: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    autoDeliveryLimit: number;
  }) => void;
};

export function LinkedAgentDialog({
  open,
  providers,
  sourceTitle,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const firstRef = useRef<HTMLSelectElement>(null);
  const mcpProviders = providers.filter((p) => p.atelierSessionsMcp !== false);
  const [provider, setProvider] = useState(mcpProviders[0]?.id ?? "codex");
  const selected = mcpProviders.find((p) => p.id === provider) ?? mcpProviders[0];
  const [model, setModel] = useState(selected?.defaultModel ?? "");
  const [effort, setEffort] = useState(selected?.efforts[1] ?? selected?.efforts[0] ?? "medium");
  const [budget, setBudget] = useState(8);

  useEffect(() => {
    if (!open) return;
    const p = mcpProviders[0];
    if (p) {
      setProvider(p.id);
      setModel(p.defaultModel);
      setEffort(p.efforts[1] ?? p.efforts[0] ?? "medium");
    }
    const tmr = setTimeout(() => firstRef.current?.focus(), 0);
    return () => clearTimeout(tmr);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="tw fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tw w-full max-w-md rounded-[10px] bg-[var(--bg-elevated)] p-5 shadow-[var(--elevation-overlay)]"
      >
        <h2 id={titleId} className="tw text-[15px] font-semibold tracking-[-0.01em] text-[var(--fg)]">
          {t("linkedAgent.dialogTitle")}
        </h2>
        <p className="tw mt-2 text-[12px] text-[var(--muted)]">
          {t("linkedAgent.dialogHint", { title: sourceTitle })}
        </p>
        <p className="tw mt-2 text-[12px] text-[var(--muted)]">
          {t("linkedAgent.rightsSummary")}
        </p>

        <label className="tw mt-4 block text-[11px] font-medium text-[var(--fg2)]">
          {t("linkedAgent.provider")}
          <select
            ref={firstRef}
            className="tw mt-1 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--fg)]"
            value={provider}
            onChange={(e) => {
              const id = e.target.value;
              setProvider(id);
              const p = mcpProviders.find((x) => x.id === id);
              if (p) {
                setModel(p.defaultModel);
                setEffort(p.efforts[1] ?? p.efforts[0] ?? "medium");
              }
            }}
          >
            {mcpProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="tw mt-3 block text-[11px] font-medium text-[var(--fg2)]">
          {t("linkedAgent.model")}
          <select
            className="tw mt-1 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--fg)]"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {(selected?.models ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="tw mt-3 block text-[11px] font-medium text-[var(--fg2)]">
          {t("linkedAgent.effort")}
          <select
            className="tw mt-1 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--fg)]"
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
          >
            {(selected?.efforts ?? []).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>

        <label className="tw mt-3 block text-[11px] font-medium text-[var(--fg2)]">
          {t("linkedAgent.budget")}
          <input
            type="number"
            min={1}
            max={20}
            value={budget}
            onChange={(e) => setBudget(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            className="tw mt-1 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] tabular-nums text-[var(--fg)]"
          />
        </label>
        <p className="tw mt-2 text-[11px] text-[var(--muted)]">{t("linkedAgent.costWarning")}</p>

        <div className="tw mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!provider || mcpProviders.length === 0}
            onClick={() =>
              onConfirm({
                targetProvider: provider,
                model: model || undefined,
                effort: effort || undefined,
                autoDeliveryLimit: budget,
              })
            }
          >
            {t("linkedAgent.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}
