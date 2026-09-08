import { ArrowUpIcon, SquareIcon, XIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import type { DictationPhase } from "./useComposerDictation";

/** Audio levels come from the native microphone tap; silence remains dots. */
export function ComposerDictationBar(p: {
  phase: DictationPhase;
  levels: number[];
  hasContent: boolean;
  disabled: boolean;
  onDiscard: () => void;
  onStop: () => void;
  sendLabel: string;
}) {
  const finishing = p.phase === "finishing";
  return (
    <div className="composer-recording-bar">
      <IconButton className="dictation-circle" label={t("dictation.cancel")} onClick={p.onDiscard}>
        <XIcon aria-hidden="true" />
      </IconButton>
      <div className="dictation-waveform" aria-hidden="true" data-phase={p.phase}>
        {p.levels.map((level, index) => <span key={index} style={{
          height: `${1.5 + Math.pow(level, 1.3) * 12.5}px`, opacity: .35 + level * .65,
        }} />)}
      </div>
      <span className="tw:sr-only" role="status">
        {t(p.phase === "starting" ? "dictation.starting" : finishing ? "dictation.finishing" : "dictation.listening")}
      </span>
      <IconButton className="dictation-circle" label={t("dictation.stop")} disabled={finishing} onClick={p.onStop}>
        <SquareIcon aria-hidden="true" fill="currentColor" />
      </IconButton>
      <Button type="submit" variant="secondary" className="send dictation-send"
        aria-label={p.sendLabel} title={p.sendLabel} disabled={p.disabled || !p.hasContent || finishing}>
        <ArrowUpIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
