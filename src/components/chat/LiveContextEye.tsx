// Œil du contexte vivant (2026-11-09, variante C) : dans la barre du bas du
// compositeur, à côté du livre et de la liste. Il remplace l'étiquette
// « regarde » qui occupait le dessus du champ.
//  - Survol : ce que le chat voit (ou qu'il ne voit rien).
//  - Clic : petit panneau qui montre ce qui part (chemin, position,
//    commentaires) avec un interrupteur pour partager ou non.
//  - Coupé : œil barré, gris éteint ; ça reste coupé (liveContext.ts).
//  - Rien d'ouvert : œil éteint, non barré.
import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import {
  liveContextDisplayPath, liveContextEyeLabel, liveContextSentence, type LiveContext,
} from "../../lib/liveContext";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/popover";
import { RowButton } from "../ui/RowButton";
import { Tooltip } from "../ui/Tooltip";

export type LiveContextBinding = {
  /** ce que l'onglet au premier plan montre, partagé ou non */
  context: LiveContext | null;
  on: boolean;
  onToggle: (on: boolean) => void;
  projectRoot?: string | null;
};

export function LiveContextEye(p: { binding: LiveContextBinding }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const { context, on, onToggle, projectRoot } = p.binding;
  const state = !on ? "off" : context ? "on" : "idle";
  const label = liveContextEyeLabel(p.binding);
  const sentence = context ? liveContextSentence(context) : "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip label={label} contentClassName={open ? "live-eye-tip is-hidden" : "live-eye-tip"}>
        <PopoverTrigger
          render={
            <RowButton
              className="consigne-trigger live-eye"
              data-state={state}
              data-open={open || undefined}
              aria-label={label}
            />
          }
        >
          {on
            ? <EyeIcon key="on" aria-hidden="true" />
            : <EyeOffIcon key="off" aria-hidden="true" />}
        </PopoverTrigger>
      </Tooltip>
      {open && (
        <PopoverContent plain side="top" align="start" sideOffset={8} className="composer-menu live-eye-pop">
          <div className="live-eye-head">
            <span className="live-eye-title" id={titleId}>{t("live-context.share")}</span>
            <RowButton
              role="switch"
              aria-checked={on}
              aria-labelledby={titleId}
              className="live-eye-switch"
              data-on={on || undefined}
              onClick={() => onToggle(!on)}
            />
          </div>
          {on && context ? (
            <div className="live-eye-body">
              <span className="live-eye-path">{liveContextDisplayPath(context.path, projectRoot)}</span>
              {sentence && <span className="live-eye-note">{sentence}</span>}
              {context.comments && context.comments.length > 0 && (
                <span className="live-eye-note">{t("live-context.comments", { n: context.comments.length })}</span>
              )}
            </div>
          ) : (
            <span className="live-eye-note">{t(on ? "live-context.idle-note" : "live-context.off-note")}</span>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}
