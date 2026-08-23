// Interrupteur de réglage : enveloppe le Switch shadcn. Extrait de
// Settings.tsx (lot 1) sans changement de rendu — utilisé par la quasi-
// totalité des sections de réglages.
import { Switch } from "../../shadcn/switch";

export function Toggle(p: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <Switch
      checked={p.checked}
      aria-label={p.label ?? "Toggle setting"}
      className={`switch ${p.checked ? "on" : ""}`}
      onCheckedChange={(checked) => p.onChange(checked)}
    />
  );
}
